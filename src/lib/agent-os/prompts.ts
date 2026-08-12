import type { AgentInput, AgentKey } from './index'

const JSON_ONLY = 'Return a single JSON object. Do not wrap it in markdown.'

export function agentInstruction(agent: AgentKey, input: AgentInput): string {
  const request = input.request
  const context = JSON.stringify(
    {
      programme: request.programme,
      subject: request.subject,
      yearGroup: request.yearGroup,
      topic: request.topic,
      teacherIntent: request.teacherIntent,
      outputModes: request.outputModes,
      learner: input.learner,
      priorOutputs: input.outputs,
    },
    null,
    2,
  )

  const common = `You are an iLEARN educational agent. Content and pedagogy come first. Never silently change programme or year level. State gaps instead of inventing evidence. ${JSON_ONLY}\n\nCONTEXT:\n${context}`

  switch (agent) {
    case 'curriculum':
      return `${common}\n\nTASK: Validate the exact curriculum scope before anything else. Identify programme, subject, year group, prescribed-text or syllabus constraints, required learning and any mismatch. Block the run when the request conflicts with official scope. Output: {"curriculumScope":{},"constraints":[],"requiredLearning":[],"blockedMismatches":[],"blockingIssues":[],"warnings":[]}.`

    case 'resource':
      return `${common}\n\nTASK: Find and rank resources only inside the validated curriculum scope. Preserve source provenance, licence/paywall notes and direct relevance. Prefer official/open educational sources. Do not fabricate a resource when retrieval fails. Output: {"rankedResources":[{"title":"","source":"","url":"","whyRelevant":"","programme":"","resourceType":"","licenceNote":""}],"coverageGaps":[],"warnings":[]}.`

    case 'pathway':
      return `${common}\n\nTASK: Assemble the smallest coherent pre-learning journey that achieves the teacher's learning intent. Sequence understanding; do not dump resources or create decorative dashboard cards. Every activity must have a learning purpose. Output: {"title":"","learningIntent":"","sequence":[{"stage":1,"purpose":"","learnerAction":"","content":"","resourceRefs":[],"evidenceOfLearning":""}],"teacherNotes":[],"questions":[]}.`

    case 'accessibility':
      return `${common}\n\nTASK: Produce equivalent UDL representations while preserving the learning objective. Include useful choices across text/audio/visual/interaction only where they are equivalent, and respect explicit accessibility or reduced-motion preferences. Do not infer diagnosis. Output: {"variants":[],"audioPlan":{},"visualPlan":{},"languageSupports":[],"equivalenceCheck":[]}.`

    case 'motion':
      return `${common}\n\nTASK: Use the iLEARN Oil Motion-inspired workflow. Motion must communicate meaning, state, progress, feedback or atmosphere. Define driver, parameter space, rest state and key states first. Separate semantic motion from geometric motion. Require reduced-motion/loading/failure fallbacks. Do not fake articulated or structural motion with whole-image transforms. Output: {"motionBrief":{"subject":"","purpose":"","driver":"state","parameterSpace":"discrete","response":"","meaning":"","semanticMotion":[],"geometricMotion":[],"restState":"","keyStates":[],"reducedMotion":"","loadingFallback":"","failureFallback":""},"motionQA":[]}.`

    case 'quality':
      return `${common}\n\nTASK: Audit the whole proposed output. Block programme mismatch, unsupported claims presented as fact, missing provenance for external resources, inaccessible mandatory interactions and learning activities that do not serve the intent. You may block publication but may not approve it. Output: {"qualityReport":{},"blockingIssues":[],"warnings":[],"publishRecommendation":"ready-for-teacher-review"}.`

    case 'approval':
      return `${common}\n\nTASK: Do not make an approval decision. This stage belongs to the teacher. Return only {"blockingIssues":["Teacher decision required"]}.`
  }
}
