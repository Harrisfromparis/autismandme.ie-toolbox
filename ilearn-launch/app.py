"""Protected iLEARN adapter combining SAG evidence with OpenTutor adaptation."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import sys
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, field_validator

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent
OPENTUTOR_API = Path(
    os.getenv("OPENTUTOR_API", WORKSPACE / "opentutor" / "apps" / "api")
)
CONTENT_FILE = Path(
    os.getenv(
        "ILEARN_CONTENT_FILE",
        WORKSPACE / "ilearn_opentutor_pilot" / "macbeth_act1_scene7_excerpt.md",
    )
)
SAG_DATA_DIR = Path(os.getenv("ILEARN_SAG_DATA_DIR", ROOT / ".data" / "sag"))

# OpenTutor's imported learning-science modules initialize their local settings.
# Keep that initialization inside this service directory in every environment.
os.environ.setdefault(
    "DATABASE_URL",
    f"sqlite+aiosqlite:///{ROOT / '.data' / 'opentutor-adapter.db'}",
)
os.environ.setdefault("AUTH_ENABLED", "true")
os.environ.setdefault(
    "JWT_SECRET_KEY", "ilearn-adapter-internal-settings-not-used-for-api-auth"
)

sys.path.insert(0, str(OPENTUTOR_API))

from services.agent.socratic_engine import SocraticEngine
from services.block_decision.rules import (
    rule_cognitive_adapt,
    rule_cognitive_overload,
)
from services.learning_science.difficulty_selector import (
    recommend_difficulty,
)
from services.spaced_repetition.fsrs import FSRSCard, review_card
from zleap.sag import DataEngine, EngineConfig
from zleap.sag.config import EmbeddingConfig, LLMConfig

PROGRAM = "LC_ENGLISH_2027"
COURSE_ID = "lc-english-2027-macbeth"
SOURCE_ID = "macbeth-act1-scene7"
DEFAULT_API_KEY = "local-launch-key"

QUESTIONS = {
    1: {
        "level": "foundation",
        "question": "Name two duties Macbeth says he owes Duncan.",
        "optionalHint": "Look at the words 'kinsman', 'subject' and 'host'.",
        "citationRanks": [0],
    },
    2: {
        "level": "application",
        "question": "How does the image of 'vaulting ambition' reveal Macbeth's inner conflict? Use evidence.",
        "optionalHint": "Think about a rider jumping too far and losing control.",
        "citationRanks": [2],
    },
    3: {
        "level": "challenge",
        "question": "Macbeth knows ambition is his only motive. Does that make him more morally responsible? Defend your view and address one counterargument.",
        "optionalHint": "Separate what Macbeth knows from what he later chooses to do.",
        "citationRanks": [1, 2],
    },
}


class DecisionRequest(BaseModel):
    learnerId: str = Field(min_length=1, max_length=128)
    program: str = PROGRAM
    courseId: str = COURSE_ID
    sourceNodeId: str = SOURCE_ID
    mastery: float = Field(ge=0, le=1)
    cognitiveLoad: float = Field(ge=0, le=1)
    knowledgeGap: float = Field(default=0.5, ge=0, le=1)
    gapType: Literal["fundamental_gap", "transfer_gap"] | None = None
    lastAnswer: str = Field(default="", max_length=5000)

    @field_validator("learnerId")
    @classmethod
    def clean_learner_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned or not re.fullmatch(r"[A-Za-z0-9._:@-]+", cleaned):
            raise ValueError("learnerId contains unsupported characters")
        return cleaned


class SearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    program: str = PROGRAM
    courseId: str = COURSE_ID
    topK: int = Field(default=3, ge=1, le=8)


class TeachBackRequest(DecisionRequest):
    explanation: str = Field(min_length=3, max_length=5000)


def _require_api_key(x_ilearn_api_key: Annotated[str | None, Header()] = None) -> None:
    expected = os.getenv("ILEARN_SERVICE_API_KEY", DEFAULT_API_KEY)
    if not x_ilearn_api_key or not hmac.compare_digest(x_ilearn_api_key, expected):
        raise HTTPException(status_code=401, detail="Invalid iLEARN service key")


def _validate_scope(
    program: str, course_id: str, source_node_id: str | None = None
) -> None:
    if program != PROGRAM or course_id != COURSE_ID:
        raise HTTPException(status_code=404, detail="Programme or course not available")
    if source_node_id is not None and source_node_id != SOURCE_ID:
        raise HTTPException(status_code=404, detail="Source node not available")


def _chunk_payload(chunk: dict) -> dict:
    content = chunk["content"]
    return {
        "sourceId": SOURCE_ID,
        "title": chunk["heading"],
        "rank": chunk["rank"],
        "excerpt": content[:500],
        "sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
        "sourceType": "public-domain-primary-text",
    }


def _gap_type(payload: DecisionRequest) -> str | None:
    if payload.gapType:
        return payload.gapType
    if payload.knowledgeGap >= 0.7:
        return "fundamental_gap"
    if payload.knowledgeGap >= 0.4:
        return "transfer_gap"
    return None


def _visible_blocks(cognitive_load: float) -> list[str]:
    full = [
        "chapter_list",
        "notes",
        "quiz",
        "flashcards",
        "progress",
        "plan",
        "knowledge_graph",
    ]
    if cognitive_load >= 0.7:
        return ["chapter_list", "notes", "quiz"]
    return full


async def _build_sag_chunks() -> list[dict]:
    config = EngineConfig(
        data_dir=str(SAG_DATA_DIR),
        language="en",
        llm=LLMConfig(
            api_key="not-used-for-chunking",
            model="not-used-for-chunking",
            base_url="http://127.0.0.1:1/v1",
        ),
        embedding=EmbeddingConfig(
            api_key="not-used-for-chunking",
            model="not-used-for-chunking",
            base_url="http://127.0.0.1:1/v1",
        ),
    )
    engine = DataEngine(config, health_check=False)
    result = await engine.chunk(CONTENT_FILE, max_tokens=100, chunk_mode="standard")
    return [chunk.model_dump() for chunk in result.chunks]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not CONTENT_FILE.exists():
        raise RuntimeError(f"Required content fixture is missing: {CONTENT_FILE}")
    app.state.sag_chunks = await _build_sag_chunks()
    yield


app = FastAPI(
    title="iLEARN Adaptive Evidence Service",
    version="1.0.0",
    description="SAG source evidence plus OpenTutor adaptive decisions for the protected Wix learner dashboard.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://www.autismandme.ie",
        "https://autismandme.ie",
        "http://localhost:3000",
        "http://127.0.0.1:8008",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-iLEARN-API-Key"],
)


@app.get("/health")
async def health() -> dict:
    api_key_is_default = (
        os.getenv("ILEARN_SERVICE_API_KEY", DEFAULT_API_KEY) == DEFAULT_API_KEY
    )
    return {
        "status": "ok",
        "service": "ilearn-adaptive-evidence",
        "programme": PROGRAM,
        "course": COURSE_ID,
        "sag": {
            "status": "ready",
            "chunks": len(app.state.sag_chunks),
            "version": "1.6.2",
        },
        "opentutor": {
            "status": "ready",
            "engines": ["socratic", "difficulty", "cognitive-load", "fsrs"],
        },
        "launchSafe": not api_key_is_default,
        "launchBlockers": ["default_api_key"] if api_key_is_default else [],
    }


@app.post("/api/v1/adaptive/decision", dependencies=[Depends(_require_api_key)])
async def adaptive_decision(payload: DecisionRequest) -> dict:
    _validate_scope(payload.program, payload.courseId, payload.sourceNodeId)
    gap = _gap_type(payload)
    difficulty = recommend_difficulty(payload.mastery, gap)
    question = QUESTIONS[difficulty.primary_layer]
    engine = SocraticEngine(
        mastery=payload.mastery,
        cognitive_load=payload.cognitiveLoad,
        error_type="procedural" if gap == "fundamental_gap" else None,
    )
    current_blocks = _visible_blocks(payload.cognitiveLoad)
    load = {
        "score": payload.cognitiveLoad,
        "consecutive_high": 3 if payload.cognitiveLoad >= 0.7 else 0,
        "signals": {"nlp_affect": 0.5 if payload.cognitiveLoad >= 0.7 else 0.1},
    }
    operations = rule_cognitive_overload(load, current_blocks)
    operations += rule_cognitive_adapt(load, current_blocks, "self_paced")
    now = datetime.now(timezone.utc)
    card, _ = review_card(FSRSCard(), rating=3, now=now)
    citations = [
        _chunk_payload(chunk)
        for chunk in app.state.sag_chunks
        if chunk["rank"] in question["citationRanks"]
    ]
    return {
        "learnerId": payload.learnerId,
        "program": PROGRAM,
        "courseId": COURSE_ID,
        "sourceNodeId": SOURCE_ID,
        "socraticState": engine.state.value,
        "difficultyLayer": difficulty.primary_layer,
        "difficulty": asdict(difficulty),
        "question": question["question"],
        "optionalHint": question["optionalHint"],
        "citations": citations,
        "visibleBlocks": _visible_blocks(payload.cognitiveLoad),
        "workspaceOperations": [asdict(operation) for operation in operations],
        "nextReviewAt": card.due.isoformat() if card.due else None,
        "generatedAt": now.isoformat(),
    }


@app.post("/api/v1/search", dependencies=[Depends(_require_api_key)])
async def search(payload: SearchRequest) -> dict:
    _validate_scope(payload.program, payload.courseId)
    terms = {
        term.lower()
        for term in re.findall(r"[A-Za-z']+", payload.query)
        if len(term) > 2
    }
    ranked = []
    for chunk in app.state.sag_chunks:
        haystack = chunk["content"].lower()
        score = sum(haystack.count(term) for term in terms)
        if score:
            ranked.append((score, chunk))
    ranked.sort(key=lambda item: (-item[0], item[1]["rank"]))
    return {
        "query": payload.query,
        "program": PROGRAM,
        "courseId": COURSE_ID,
        "results": [
            {**_chunk_payload(chunk), "score": score}
            for score, chunk in ranked[: payload.topK]
        ],
    }


@app.post("/api/v1/teach-back", dependencies=[Depends(_require_api_key)])
async def teach_back(payload: TeachBackRequest) -> dict:
    _validate_scope(payload.program, payload.courseId, payload.sourceNodeId)
    explanation = payload.explanation.lower()
    concepts = {
        "ambition": ["ambition", "vaulting"],
        "duty": ["duty", "kinsman", "subject", "host"],
        "moral responsibility": ["responsib", "choice", "knows", "aware"],
        "imagery": ["image", "rider", "spur", "o'erleaps", "overleaps"],
    }
    present = [
        name
        for name, terms in concepts.items()
        if any(term in explanation for term in terms)
    ]
    missing = [name for name in concepts if name not in present]
    coverage = round(len(present) / len(concepts), 2)
    follow_up = (
        f"Add one sentence explaining {missing[0]}. Use a phrase from the passage."
        if missing
        else "Now address a counterargument: could fear, not ambition, be Macbeth's main motive?"
    )
    return {
        "learnerId": payload.learnerId,
        "coverage": coverage,
        "presentConcepts": present,
        "missingConcepts": missing,
        "feedback": follow_up,
        "citation": _chunk_payload(app.state.sag_chunks[2]),
    }


@app.get("/demo", response_class=HTMLResponse)
async def demo() -> str:
    return DEMO_HTML


DEMO_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>iLEARN Adaptive Macbeth Pilot</title><style>
:root{font-family:Inter,system-ui,sans-serif;color:#17324d;background:#fff9ed}body{margin:0}.wrap{max-width:980px;margin:auto;padding:32px 20px 60px}
h1{font-size:clamp(2rem,6vw,4.5rem);line-height:.95;margin:.2em 0;color:#123a4a}.lead{font-size:1.15rem;max-width:720px}.panel{background:white;border:2px solid #17324d;border-radius:24px;padding:22px;box-shadow:8px 8px 0 #f7c85c;margin-top:24px}
.profiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.profiles button,.go{border:0;border-radius:14px;padding:14px;font-weight:800;background:#17324d;color:white;cursor:pointer}.profiles button:focus,.go:focus{outline:4px solid #f7c85c;outline-offset:2px}
label{font-weight:800;display:block;margin:14px 0 6px}input,textarea{width:100%;box-sizing:border-box;border:2px solid #9eb1bd;border-radius:12px;padding:12px;font:inherit}textarea{min-height:100px}.tag{display:inline-block;background:#dff4e4;border-radius:99px;padding:6px 10px;margin:3px;font-weight:700}.citation{border-left:5px solid #f7c85c;padding-left:12px;color:#425d6b}.small{font-size:.88rem;color:#58717e}pre{white-space:pre-wrap;background:#eef5f6;padding:14px;border-radius:12px}</style></head>
<body><main class="wrap"><p class="small">AUTISM &amp; ME · iLEARN</p><h1>Macbeth that adapts to the learner.</h1><p class="lead">Choose a learner profile. The lesson changes its question, support level and visible tools while keeping every answer linked to the original text.</p>
<section class="panel"><div class="profiles"><button data-m=".25" data-l=".82" data-g=".8">Supported start</button><button data-m=".55" data-l=".38" data-g=".5">Building confidence</button><button data-m=".82" data-l=".2" data-g=".2">Ready for challenge</button></div>
<label for="key">Local test key</label><input id="key" type="password" value="local-launch-key"><div id="result" aria-live="polite"><p>Select a profile to begin.</p></div></section>
<section class="panel"><h2>Teach it back</h2><label for="explain">Explain Macbeth's motive in your own words</label><textarea id="explain"></textarea><button class="go" id="check">Check my explanation</button><div id="feedback" aria-live="polite"></div></section></main>
<script>
let profile={mastery:.25,cognitiveLoad:.82,knowledgeGap:.8};const common={learnerId:'local-demo',program:'LC_ENGLISH_2027',courseId:'lc-english-2027-macbeth',sourceNodeId:'macbeth-act1-scene7'};
async function call(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-iLEARN-API-Key':document.querySelector('#key').value},body:JSON.stringify({...common,...body})});if(!r.ok)throw new Error((await r.json()).detail||'Request failed');return r.json()}
document.querySelectorAll('[data-m]').forEach(b=>b.onclick=async()=>{profile={mastery:+b.dataset.m,cognitiveLoad:+b.dataset.l,knowledgeGap:+b.dataset.g};document.querySelector('#result').innerHTML='<p>Loading…</p>';try{const d=await call('/api/v1/adaptive/decision',profile);document.querySelector('#result').innerHTML=`<h2>${d.question}</h2><p><span class="tag">${d.socraticState}</span><span class="tag">Layer ${d.difficultyLayer}</span></p><p><strong>Optional hint:</strong> ${d.optionalHint}</p><p><strong>Visible tools:</strong> ${d.visibleBlocks.join(', ')}</p><p class="citation"><strong>Source:</strong> ${d.citations.map(c=>c.excerpt).join(' … ')}</p>`}catch(e){document.querySelector('#result').textContent=e.message}});
document.querySelector('#check').onclick=async()=>{try{const d=await call('/api/v1/teach-back',{...profile,explanation:document.querySelector('#explain').value});document.querySelector('#feedback').innerHTML=`<p><strong>Concept coverage:</strong> ${Math.round(d.coverage*100)}%</p><p>${d.feedback}</p>`}catch(e){document.querySelector('#feedback').textContent=e.message}};
</script></body></html>"""
