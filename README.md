# autismandme.ie-toolbox

A working iLEARN baseline with an interactive 7-stage pipeline UI and a CMS-ready architecture.

## What changed

- Connected stage cards/buttons to real orchestration logic.
- Added deterministic stage states: `idle`, `running`, `success`, `failure`, `blocked`.
- Enforced guardrails:
  - Curriculum + Quality remain mandatory gates.
  - Stage 7 (Teacher Approval Gate) never auto-completes.
  - Approval actions are disabled until Quality succeeds.
- Added CMS/data adapter interfaces and a local in-memory adapter for development.
- Added a backend boundary module for privileged operations (server endpoint only, no client secrets).

## Simplified architecture

```text
src/
  PathwayV2.tsx                 # learner-facing page/UI wiring
  hooks/
    usePipelineRun.ts           # UI orchestration hook
  lib/
    agent-os/
      orchestrator.ts           # pipeline state machine + guardrails
      policies.ts               # stage policies + plan builder
      index.ts                  # public exports
      prompts.ts                # prompt templates
      wix.ts                    # record shaping helpers
    adapters/
      cms.ts                    # typed CMS contracts + record mappers
      localCmsAdapter.ts        # dev-safe in-memory CMS adapter
      stageAdapter.ts           # stage executor (backend-aware + local fallback)
    backend/
      privileged.ts             # trusted-backend-only boundary + env validation
    types/
      pipeline.ts               # shared domain types
```

## Local development

```bash
npm install
npm run dev
```

Build and lint:

```bash
npm run build
npm run lint
```

## Environment / backend configuration

Create `.env.local` (optional for local fallback):

```bash
VITE_ILEARN_BACKEND_URL=http://localhost:8787
```

- If `VITE_ILEARN_BACKEND_URL` is set and valid, stage execution can call a trusted backend endpoint.
- If not set, the app uses deterministic local stub outputs for development.
- **Do not place model provider keys in client code.** Privileged model calls and private CMS writes must run server-side (Wix/Velo/backend layer).

## CMS integration points

Private collections expected by adapters:

- `iLearnAgentRuns`
- `iLearnTeacherApprovals`
- `iLearnLearnerContext`
- `iLearnAgentPolicies`

Current baseline ships with typed adapter contracts and local in-memory defaults so UI/orchestration remains fully runnable before production credentials are available.

## Pipeline behavior

1. Curriculum Agent
2. Resource Agent
3. Pathway Agent
4. Accessibility Agent
5. Motion Agent (included when interactive/immersive output is requested)
6. Quality Agent
7. Teacher Approval Gate

Interaction model:

- `Prepare governed workflow` creates a run.
- `Run pipeline to teacher gate` executes automated stages in order.
- Each stage card supports `Run stage` and `Retry` (where applicable).
- Teacher decisions (`Approve`, `Approve with edits`, `Request changes`, `Reject`) are explicit actions at Stage 7.
