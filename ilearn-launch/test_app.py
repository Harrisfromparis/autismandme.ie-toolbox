import os

os.environ["ILEARN_SERVICE_API_KEY"] = "test-key"

from app import COURSE_ID, PROGRAM, SOURCE_ID, app
from fastapi.testclient import TestClient

BASE = {
    "learnerId": "wix-member-123",
    "program": PROGRAM,
    "courseId": COURSE_ID,
    "sourceNodeId": SOURCE_ID,
}
HEADERS = {"X-iLEARN-API-Key": "test-key"}


def test_health_and_demo():
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["sag"]["chunks"] == 3
        assert health.json()["launchSafe"] is True
        assert "Macbeth that adapts" in client.get("/demo").text


def test_authentication_is_required():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/adaptive/decision",
            json={**BASE, "mastery": 0.25, "cognitiveLoad": 0.82, "knowledgeGap": 0.8},
        )
        assert response.status_code == 401


def test_supported_start_is_scaffolded_and_reduced():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/adaptive/decision",
            headers=HEADERS,
            json={**BASE, "mastery": 0.25, "cognitiveLoad": 0.82, "knowledgeGap": 0.8},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["difficultyLayer"] == 1
        assert body["socraticState"] == "scaffold"
        assert body["visibleBlocks"] == ["chapter_list", "notes", "quiz"]
        assert body["citations"] and len(body["citations"][0]["sha256"]) == 64


def test_challenge_route_and_strict_programme_filter():
    with TestClient(app) as client:
        challenge = client.post(
            "/api/v1/adaptive/decision",
            headers=HEADERS,
            json={**BASE, "mastery": 0.82, "cognitiveLoad": 0.2, "knowledgeGap": 0.2},
        )
        assert challenge.status_code == 200
        assert challenge.json()["difficultyLayer"] == 3
        wrong_programme = client.post(
            "/api/v1/adaptive/decision",
            headers=HEADERS,
            json={
                **BASE,
                "program": "JC_ENGLISH",
                "mastery": 0.82,
                "cognitiveLoad": 0.2,
                "knowledgeGap": 0.2,
            },
        )
        assert wrong_programme.status_code == 404


def test_sag_search_and_teach_back():
    with TestClient(app) as client:
        search = client.post(
            "/api/v1/search",
            headers=HEADERS,
            json={
                "query": "vaulting ambition",
                "program": PROGRAM,
                "courseId": COURSE_ID,
            },
        )
        assert search.status_code == 200
        assert search.json()["results"][0]["rank"] == 2
        teach = client.post(
            "/api/v1/teach-back",
            headers=HEADERS,
            json={
                **BASE,
                "mastery": 0.55,
                "cognitiveLoad": 0.38,
                "knowledgeGap": 0.5,
                "explanation": "Macbeth knows his vaulting ambition drives his choice, so he is responsible.",
            },
        )
        assert teach.status_code == 200
        assert teach.json()["coverage"] >= 0.5
        assert "duty" in teach.json()["missingConcepts"]
