# iLEARN Agent OS — Wix Deployment Manifest

## What is already live in Wix

The following infrastructure is already created on the Autism And Me Wix site:

### Private operating-memory collections
- `iLearnAgentRuns`
- `iLearnTeacherApprovals`
- `iLearnLearnerContext`
- `iLearnAgentPolicies`

All four are admin/CMS-editor only.

### Agent policies
The live policy registry contains:
- Curriculum Agent
- Resource Agent
- Pathway Agent
- Accessibility Agent
- Motion Agent
- Quality Agent
- Teacher Approval Gate

### Workflow/tool registry
- Active workflow: `ilearn-agent-os-pathway-v1`
- Existing immersive workflow updated to use `oil-motion`
- Active tool: `oil-motion`

### Live custom embed
- `iLEARN Teacher Approval Bar`
- Wix embed ID: `f0ac1cec-b0fa-4dd5-b067-9a192cf8b9e9`
- It appears only on `/pathway-preview` when both `pathwayId` and `runId` are present.
- No extra editor buttons are required.

## Source files to deploy through Wix Git Integration

### 1. Backend web module
Source:
`wix-backend/iLearn-AgentOS-Pathway.web.js`

Deploy as the site's backend web module named:
`iLearn-AgentOS-Pathway.web.js`

Exports:
- `getGovernedPreLearningUsage()`
- `createGovernedPreLearningPathway(details)`
- `getGovernedPathwayRun(runId)`
- `listPendingPathwayApprovals()`
- `decideGovernedPathway(runId, decision, payload)`

This module keeps the existing provider and commercial behavior:
- 20 successful free generations for signed-in members
- monthly/annual unlimited plan recognition
- Ollama Cloud primary
- Hugging Face Router fallback
- reliable curriculum builder final fallback

New behavior:
- curriculum outcome validation happens on the server
- resource hunting happens on the server
- only active + approved + Verified resources are eligible
- outcome-resource mappings must be active + verified
- resource IDs are allowlisted before learner-facing output
- QA can block a draft
- successful generation creates a `draft`, never auto-publishes
- teacher decision publishes, returns for changes, or rejects

Secrets remain in Wix Secrets Manager:
- `OLLAMA_API_KEY`
- `HUGGING_FACE_TOKEN`

## Lesson planning and SEC link integration

The backend now accepts optional `planningNotes` and `udl` choices in the teacher brief. It keeps the official outcome lookup and verified resource gate in place. Only resources already approved, marked `Verified`, and mapped to selected outcomes can appear in a learner draft. SEC paper and marking-scheme links use resource types `ExamPaper` and `MarkingScheme`; the generator may link them as optional practice and may not invent questions from a PDF it has not read.

To prepare a reviewable data bundle, run:

```bash
node scripts/build-ilearn-data.mjs \
  --outcomes official-outcomes.json \
  --planning planning-content.json \
  --resources approved-resources.json \
  --textbooks digital-textbook-chapters.json \
  --exams SEC_exam_papers_and_marking_schemes_2010-2025.csv \
  --output ilearn-data-bundle.json
```

The three JSON inputs must be arrays exported from the existing collections. Planning and resource records need explicit `outcomeIds` for joining. The script preserves official outcomes, attaches explicitly mapped planning and verified resources, and marks subject-level exam links as **unverified, unapproved, and unmapped candidates**. Review their level, language, PDF link, relevance and usage terms before adding individual exam links to `iLearnResources` and `iLearnOutcomeResourceMap`. Do not publish the generated bundle or the source PDFs to learners as a substitute for the approval workflow.

The optional `--textbooks` file is a JSON array of chapter metadata: `resourceId`, `title`, `chapter`, `sourceUrl`, `publisher`, `licence`, `cycle`, `subject`, and explicit `outcomeIds`. The bundle marks these as review candidates. Link them only when access and reuse rights are clear. Approved textbook records can use resource type `DigitalTextbook` in `iLearnResources`; their chapter links then reach the generator through the existing verified outcome-resource mapping.

The page code reads an optional `#planningNotesInput`. If that element is not present, generation still works. Add it in Wix Editor to let teachers supply planning notes. This GitHub repository is a deployment source; changing it does not by itself update the live Wix site until the site Git integration deploys the backend and page files.

### 2. Create Pathway page code
Source:
`wix-pages/create-pathway-agent-os.js`

Replace the current `/create-pathway` page code with this version.

It retains the existing element IDs and wizard UI, but removes browser-side:
- resource selection as an authority
- creation of `LearningPathways`
- creation of `PathwayBlocks`
- direct publication state changes

It sends the teacher brief and selected outcome IDs to the secure backend and redirects to:
`/pathway-preview?pathwayId=...&runId=...`

### 3. Pathway Preview page code
Use the final version:
`wix-pages/pathway-preview-agent-os-v2.js`

It retains the existing preview header IDs:
- `previewTitleText`
- `previewProgrammeText`
- `previewYearGroupText`
- `previewAimText`
- `previewStatusText`
- `previewBackButton`

It also understands common legacy/current repeater IDs without requiring them to exist.

The live Approval Bar writes decisions into the URL query:
- `decision=approve`
- `decision=request-changes&notes=...`
- `decision=reject`

The signed-in preview page code consumes that decision and calls the secure backend. The bar then disappears after a completed decision.

## One-time Wix Git Integration requirement

Wix does not expose a REST API for writing site Velo source files. The supported path is Wix Git Integration / Wix CLI.

For this site, the one-time GitHub authorization has not yet been completed, because no Wix-generated site repository exists in the connected GitHub account.

In the Wix Editor:
1. Open **Code**.
2. Open **GitHub / Git Integration**.
3. Choose **Connect to GitHub**.
4. Authorize Wix.
5. Wix creates the site's repository and initial commit.

After that repository exists, copy the three source files above into the corresponding backend/page code locations in the Wix-generated repo, preview with Wix CLI, and publish.

## Acceptance test after deployment

1. Sign in as a teacher.
2. Open `/create-pathway`.
3. Choose programme, year, level, learning aim, objectives, outcomes and formats.
4. Generate.
5. Confirm a new `iLearnAgentRuns` item exists.
6. Confirm the pathway is created with status `draft`, not `published`.
7. Confirm selected resources are active, approved and `reviewStatus = Verified`.
8. Confirm preview URL contains both `pathwayId` and `runId`.
9. Confirm the Teacher Approval Bar appears.
10. Test **Request changes**: pathway remains unpublished.
11. Test **Reject** on a separate draft: pathway becomes archived.
12. Test **Approve & publish**: pathway status becomes `published` and approval/run records update.
13. Confirm a learner-facing route only receives the published version.
14. Test the 20-free usage counter and unlimited pricing-plan bypass.
15. Test provider failure: Ollama → Hugging Face → reliable curriculum builder.
16. Test strict programme mismatch: it must block rather than silently substitute another programme.

## Oil Motion acceptance rules

When an interactive/immersive pathway requests motion:
- define driver and parameter space first
- define rest state and key states first
- distinguish semantic from geometric motion
- use deterministic browser mapping
- preserve a complete first frame
- provide failure fallback
- provide `prefers-reduced-motion` fallback
- budget against actual display size / DPR
- do not fake articulated character motion with whole-image transforms
- teacher remains the publication authority
