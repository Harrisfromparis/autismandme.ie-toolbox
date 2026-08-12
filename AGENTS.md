# iLEARN Agent Instructions

## Product rule

iLEARN is an educational operating system, not a generic AI dashboard. Content and pedagogy come first; technology is used only where it improves the learning experience.

## Human authority

Routine work may be automated. Consequential learner-facing publication may not.

AI may:
- validate curriculum scope;
- search and rank resources;
- transform and assemble pathways;
- generate equivalent accessibility supports;
- design interactive motion;
- run QA and block unsafe or mismatched output.

AI may not silently publish a learner-facing pathway. Final approval belongs to the teacher.

## Agent order

Use the Agent OS in `src/lib/agent-os/`:

1. Curriculum Agent
2. Resource Agent
3. Pathway Agent
4. Accessibility Agent
5. Motion Agent when interactive/immersive output is justified
6. Quality Agent
7. Teacher Approval Gate

Never bypass Curriculum or Quality. Never automate the Teacher Approval Gate.

## Curriculum integrity

- Enforce exact programme and year group filtering.
- Do not substitute Junior Cycle material for Leaving Certificate or vice versa.
- Official curriculum/prescribed-text constraints have priority.
- Surface uncertainty or coverage gaps instead of inventing curriculum rules.

## Resource policy

- Prefer official and open educational sources.
- Preserve provenance and citations.
- Do not fabricate resources when retrieval fails.
- Keep the teacher in control of final resource selection.

## Accessibility

Use UDL by default. Create equivalent ways to access and express learning without lowering the learning goal. Respect reduced-motion and sensory preferences. Do not infer diagnosis from observed behaviour.

## Oil Motion integration

Source inspiration: `oil-oil/oil-motion` (MIT). The iLEARN adaptation lives at `src/lib/motion/oilMotion.ts`.

Apply these rules when motion is requested or useful:

- define the interaction driver and parameter space first;
- define rest state and key states before producing continuous motion;
- distinguish semantic motion from geometric motion;
- do not use whole-image CSS transforms to fake structural/character motion that needs real articulation;
- keep input-to-progress mapping deterministic in the browser;
- budget for actual CSS size and device pixel ratio;
- provide loading, failure and `prefers-reduced-motion` fallbacks;
- test rapid reversal, mobile performance, frame continuity and visual identity/structure consistency;
- motion must communicate meaning, progress, feedback, state or atmosphere — not exist as decoration.

Do not couple iLEARN to Oil Motion's default video provider. Provider choice belongs behind the secure adapter layer.

## Security

The Wix CMS collections `iLearnAgentRuns`, `iLearnTeacherApprovals`, `iLearnLearnerContext` and `iLearnAgentPolicies` are private operating memory. Never expose provider keys or private learner records in client code.

Client-side code may shape and render records. Secure Wix/Velo/backend code must perform privileged data access and model-provider calls.

## Visual quality

Do not publish rough placeholders as if they are finished. For immersive worlds, translate the learning idea into space, light, sound, interaction and authored visual meaning. Avoid repetitive card-grid design when the world/experience itself should carry the content.
