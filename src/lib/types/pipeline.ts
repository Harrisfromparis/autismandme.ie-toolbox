export type AgentKey =
  | 'curriculum'
  | 'resource'
  | 'pathway'
  | 'accessibility'
  | 'motion'
  | 'quality'
  | 'approval'

export type StageStatus = 'idle' | 'running' | 'success' | 'failure' | 'blocked'

export type RunStatus =
  | 'idle'
  | 'running'
  | 'awaiting-approval'
  | 'completed'
  | 'failed'

export type ApprovalDecision =
  | 'approve'
  | 'approve-with-edits'
  | 'request-changes'
  | 'reject'

export interface AgentPolicy {
  key: AgentKey
  name: string
  order: number
  autoRun: boolean
  approvalMode:
    | 'automatic-precheck'
    | 'teacher-on-selection'
    | 'teacher-before-publish'
    | 'automatic-with-teacher-override'
    | 'teacher-on-meaningful-motion'
    | 'automatic-blocking-gate'
    | 'teacher-required'
  requires?: AgentKey[]
  blocking?: boolean
  role: string
}

export interface AgentRequest {
  id: string
  programme: string
  subject: string
  yearGroup?: string
  topic: string
  teacherIntent: string
  learnerId?: string
  outputModes?: Array<'text' | 'audio' | 'visual' | 'interactive' | 'immersive'>
  resourceFilters?: string[]
  teacherPreferences?: Record<string, unknown>
}

export interface LearnerContext {
  learnerId: string
  profile?: Record<string, unknown>
  accessibilityPrefs?: Record<string, unknown>
  curriculumContext?: Record<string, unknown>
  recentQuestions?: string[]
  strengths?: string[]
  frictionPoints?: string[]
  pathwayHistory?: Record<string, unknown>
  consentStatus?: string
}

export interface AgentInput {
  request: AgentRequest
  learner?: LearnerContext
  outputs: Partial<Record<AgentKey, unknown>>
}

export interface AgentResult<T = unknown> {
  ok: boolean
  output?: T
  warnings?: string[]
  blockingIssues?: string[]
  message?: string
  evidence?: Array<{ source: string; note?: string; url?: string }>
}

export interface AgentAdapter {
  run<T = unknown>(agent: AgentKey, input: AgentInput): Promise<AgentResult<T>>
}

export interface AgentStepState {
  agent: AgentKey
  status: StageStatus
  startedAt?: string
  finishedAt?: string
  warnings: string[]
  blockingIssues: string[]
  message?: string
  attempts: number
}

export interface AgentRun {
  runId: string
  status: RunStatus
  request: AgentRequest
  plan: AgentKey[]
  steps: AgentStepState[]
  outputs: Partial<Record<AgentKey, unknown>>
  evidence: Array<{ agent: AgentKey; source: string; note?: string; url?: string }>
  approvalRequired: boolean
  approval?: {
    decision?: ApprovalDecision
    notes?: string
    decidedAt?: string
    edits?: Record<string, unknown>
  }
  lastError?: string
}

export interface RunPermission {
  allowed: boolean
  reason?: string
}
