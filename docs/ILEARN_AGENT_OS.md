# iLEARN Agent OS

## Operating principle

Routine work should run automatically; professional judgement stays with the teacher.

AI may search, check, transform, assemble, adapt and audit. It may not silently publish consequential learner-facing material.

## Pipeline

1. Curriculum Agent validates programme, subject, year group and official constraints.
2. Resource Agent finds and provenance-checks relevant resources.
3. Pathway Agent assembles a coherent pre-learning journey.
4. Accessibility Agent creates equivalent UDL representations.
5. Motion Agent creates meaningful interactive motion only when the output mode requires it.
6. Quality Agent blocks programme mismatch, unsupported claims, missing provenance and inaccessible mandatory interactions.
7. Teacher Approval Gate presents the draft, evidence and QA findings for approve / amend / request changes / reject.

## Persistent Wix memory

The live Wix site contains four private/admin-only CMS collections:

- `iLearnAgentRuns`
- `iLearnTeacherApprovals`
- `iLearnLearnerContext`
- `iLearnAgentPolicies`

The policy registry is seeded with the seven operating policies above. Learner context is private by default.

## Provider boundary

`src/lib/agent-os/index.ts` is provider-neutral. An `AgentAdapter` is injected by the trusted server layer. Provider keys must never be placed in browser code.

This lets iLEARN route different tasks to different model providers while preserving the same policy and approval model.

## Oil Motion integration

Source inspiration: `oil-oil/oil-motion` (MIT).

The iLEARN Motion Agent adopts the workflow principles without coupling iLEARN to Oil Motion's default video provider:

- define the interaction driver and parameter space first;
- define key states before producing continuous motion;
- distinguish semantic motion from geometric motion;
- use deterministic runtime mapping for scroll/pointer/drag/touch/state;
- budget assets for actual display size and DPR;
- always provide loading, failure and reduced-motion fallbacks;
- QA fast reversal, mobile performance, identity/structure consistency and frame continuity.

The runtime contract lives in `src/lib/motion/oilMotion.ts`.

## Security and teacher authority

- CMS memory collections are admin-only.
- Browser code only shapes/display data; it does not hold provider keys.
- The Quality Agent may block a draft but cannot approve it.
- The Teacher Approval Gate is deliberately non-automatic.
- Approval records retain proposed output, decision, edits/change requests and evidence for auditability.

## Next secure binding

The Wix/Velo backend should implement the `AgentAdapter`, persist `AgentRun` transitions with `toAgentRunRecord()`, and write teacher decisions with `toApprovalRecord()`.

The frontend should surface only the moments that require human attention: blocked QA, ambiguous resource choice, major adaptation or motion choice, and final publication approval.
