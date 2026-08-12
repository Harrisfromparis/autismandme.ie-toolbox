import type { AgentRun, LearnerContext } from './index'

export const AGENT_OS_COLLECTIONS = {
  runs: 'iLearnAgentRuns',
  approvals: 'iLearnTeacherApprovals',
  learnerContext: 'iLearnLearnerContext',
  policies: 'iLearnAgentPolicies',
} as const

export function toAgentRunRecord(run: AgentRun) {
  return {
    runId: run.runId,
    status: run.status,
    requestType: run.request.outputModes?.join(',') || 'pathway',
    subject: run.request.subject,
    programme: run.request.programme,
    yearGroup: run.request.yearGroup || '',
    teacherId: String(run.request.teacherPreferences?.teacherId || ''),
    learnerId: run.request.learnerId || '',
    request: run.request,
    agents: run.plan,
    outputs: run.outputs,
    quality: run.outputs.quality || {},
    approvalRequired: run.approvalRequired,
    approvalStatus: run.approval?.decision || 'pending',
  }
}

export function toApprovalRecord(run: AgentRun) {
  return {
    approvalId: `approval:${run.runId}`,
    runId: run.runId,
    teacherId: String(run.request.teacherPreferences?.teacherId || ''),
    status: run.status,
    decision: run.approval?.decision || '',
    notes: run.approval?.notes || '',
    proposedOutput: {
      pathway: run.outputs.pathway,
      accessibility: run.outputs.accessibility,
      motion: run.outputs.motion,
      quality: run.outputs.quality,
      evidence: run.evidence,
    },
    approvedOutput:
      run.approval?.decision === 'approve-with-edits'
        ? run.approval.edits || {}
        : run.approval?.decision === 'approve'
          ? run.outputs.pathway || {}
          : {},
    requestedChanges:
      run.approval?.decision === 'request-changes' && run.approval.notes
        ? [run.approval.notes]
        : [],
    decidedIso: run.approval?.decidedAt || '',
  }
}

export function toLearnerContextRecord(context: LearnerContext) {
  return {
    learnerId: context.learnerId,
    profile: context.profile || {},
    accessibilityPrefs: context.accessibilityPrefs || {},
    curriculumContext: context.curriculumContext || {},
    recentQuestions: context.recentQuestions || [],
    strengths: context.strengths || [],
    frictionPoints: context.frictionPoints || [],
    pathwayHistory: context.pathwayHistory || {},
    consentStatus: context.consentStatus || 'unknown',
  }
}

/**
 * Security boundary:
 * These functions only shape records. They intentionally do NOT call Wix Data APIs
 * from the browser. Reads/writes must be performed by a trusted Velo/backend layer
 * so provider secrets and private learner data never cross into public client code.
 */
