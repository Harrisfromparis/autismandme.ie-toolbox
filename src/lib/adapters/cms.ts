import type {
  AgentPolicy,
  AgentRun,
  LearnerContext,
} from '../types/pipeline'

export const ILEARN_COLLECTIONS = {
  agentRuns: 'iLearnAgentRuns',
  teacherApprovals: 'iLearnTeacherApprovals',
  learnerContext: 'iLearnLearnerContext',
  agentPolicies: 'iLearnAgentPolicies',
} as const

export interface AgentRunRecord {
  runId: string
  status: AgentRun['status']
  programme: string
  subject: string
  yearGroup: string
  request: AgentRun['request']
  agents: AgentRun['plan']
  outputs: AgentRun['outputs']
  quality: unknown
  approvalRequired: boolean
  approvalStatus: string
  updatedAt: string
}

export interface TeacherApprovalRecord {
  approvalId: string
  runId: string
  status: AgentRun['status']
  decision: string
  notes: string
  decidedIso: string
  approvedOutput: Record<string, unknown>
  proposedOutput: Record<string, unknown>
}

export interface LearnerContextRecord {
  learnerId: string
  profile: Record<string, unknown>
  accessibilityPrefs: Record<string, unknown>
  curriculumContext: Record<string, unknown>
  recentQuestions: string[]
  strengths: string[]
  frictionPoints: string[]
  pathwayHistory: Record<string, unknown>
  consentStatus: string
}

export interface AgentPoliciesRecord {
  updatedAt: string
  policies: readonly AgentPolicy[]
}

export interface IlearnCmsAdapter {
  createRun(record: AgentRunRecord): Promise<void>
  updateRun(record: AgentRunRecord): Promise<void>
  createApproval(record: TeacherApprovalRecord): Promise<void>
  getLearnerContext(learnerId: string): Promise<LearnerContextRecord | null>
  getPolicies(): Promise<AgentPoliciesRecord>
}

export function toAgentRunRecord(run: AgentRun): AgentRunRecord {
  return {
    runId: run.runId,
    status: run.status,
    programme: run.request.programme,
    subject: run.request.subject,
    yearGroup: run.request.yearGroup ?? '',
    request: run.request,
    agents: run.plan,
    outputs: run.outputs,
    quality: run.outputs.quality ?? {},
    approvalRequired: run.approvalRequired,
    approvalStatus: run.approval?.decision ?? 'pending',
    updatedAt: new Date().toISOString(),
  }
}

export function toApprovalRecord(run: AgentRun): TeacherApprovalRecord {
  return {
    approvalId: `approval:${run.runId}`,
    runId: run.runId,
    status: run.status,
    decision: run.approval?.decision ?? '',
    notes: run.approval?.notes ?? '',
    decidedIso: run.approval?.decidedAt ?? '',
    proposedOutput: {
      pathway: run.outputs.pathway ?? null,
      accessibility: run.outputs.accessibility ?? null,
      motion: run.outputs.motion ?? null,
      quality: run.outputs.quality ?? null,
      evidence: run.evidence,
    },
    approvedOutput:
      run.approval?.decision === 'approve-with-edits'
        ? run.approval.edits ?? {}
        : run.approval?.decision === 'approve'
          ? (run.outputs.pathway as Record<string, unknown>) ?? {}
          : {},
  }
}

export function toLearnerContextRecord(context: LearnerContext): LearnerContextRecord {
  return {
    learnerId: context.learnerId,
    profile: context.profile ?? {},
    accessibilityPrefs: context.accessibilityPrefs ?? {},
    curriculumContext: context.curriculumContext ?? {},
    recentQuestions: context.recentQuestions ?? [],
    strengths: context.strengths ?? [],
    frictionPoints: context.frictionPoints ?? [],
    pathwayHistory: context.pathwayHistory ?? {},
    consentStatus: context.consentStatus ?? 'unknown',
  }
}
