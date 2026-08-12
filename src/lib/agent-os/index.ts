export type AgentKey =
  | 'curriculum'
  | 'resource'
  | 'pathway'
  | 'accessibility'
  | 'motion'
  | 'quality'
  | 'approval'

export type RunStatus =
  | 'planned'
  | 'running'
  | 'blocked'
  | 'awaiting-approval'
  | 'approved'
  | 'changes-requested'
  | 'rejected'
  | 'completed'

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
  evidence?: Array<{ source: string; note?: string; url?: string }>
}

export interface AgentAdapter {
  run<T = unknown>(agent: AgentKey, input: AgentInput): Promise<AgentResult<T>>
}

export interface AgentStepState {
  agent: AgentKey
  status: 'pending' | 'running' | 'passed' | 'blocked' | 'skipped'
  startedAt?: string
  finishedAt?: string
  warnings: string[]
  blockingIssues: string[]
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
}

export const DEFAULT_AGENT_POLICIES: readonly AgentPolicy[] = [
  {
    key: 'curriculum',
    name: 'Curriculum Agent',
    order: 10,
    autoRun: true,
    approvalMode: 'automatic-precheck',
    blocking: true,
    role: 'Validate programme, subject, year group and curriculum constraints before anything else runs.',
  },
  {
    key: 'resource',
    name: 'Resource Agent',
    order: 20,
    autoRun: true,
    approvalMode: 'teacher-on-selection',
    requires: ['curriculum'],
    role: 'Find, rank and provenance-check resources against the validated curriculum scope.',
  },
  {
    key: 'pathway',
    name: 'Pathway Agent',
    order: 30,
    autoRun: true,
    approvalMode: 'teacher-before-publish',
    requires: ['curriculum', 'resource'],
    role: 'Assemble a coherent pre-learning journey rather than a pile of links or cards.',
  },
  {
    key: 'accessibility',
    name: 'Accessibility Agent',
    order: 40,
    autoRun: true,
    approvalMode: 'automatic-with-teacher-override',
    requires: ['pathway'],
    role: 'Create equivalent accessible representations while preserving the learning objective.',
  },
  {
    key: 'motion',
    name: 'Motion Agent',
    order: 50,
    autoRun: true,
    approvalMode: 'teacher-on-meaningful-motion',
    requires: ['pathway', 'accessibility'],
    role: 'Design meaningful controllable motion using the Oil Motion-inspired key-state and QA workflow.',
  },
  {
    key: 'quality',
    name: 'Quality Agent',
    order: 80,
    autoRun: true,
    approvalMode: 'automatic-blocking-gate',
    requires: ['curriculum', 'resource', 'pathway'],
    blocking: true,
    role: 'Block programme mismatch, unsupported claims, missing provenance and inaccessible mandatory interactions.',
  },
  {
    key: 'approval',
    name: 'Teacher Approval Gate',
    order: 90,
    autoRun: false,
    approvalMode: 'teacher-required',
    requires: ['quality'],
    role: 'Keep consequential learner-facing decisions with the teacher.',
  },
] as const

const now = () => new Date().toISOString()

function wantsMotion(request: AgentRequest): boolean {
  const modes = request.outputModes ?? []
  return modes.includes('interactive') || modes.includes('immersive')
}

export function buildAgentPlan(request: AgentRequest): AgentKey[] {
  const base: AgentKey[] = ['curriculum', 'resource', 'pathway', 'accessibility']
  if (wantsMotion(request)) base.push('motion')
  base.push('quality', 'approval')
  return base
}

export class AgentKernel {
  readonly policies: Map<AgentKey, AgentPolicy>

  constructor(policies: readonly AgentPolicy[] = DEFAULT_AGENT_POLICIES) {
    this.policies = new Map(policies.map((policy) => [policy.key, policy]))
  }

  createRun(request: AgentRequest): AgentRun {
    const plan = buildAgentPlan(request)
    return {
      runId: request.id,
      status: 'planned',
      request,
      plan,
      steps: plan.map((agent) => ({
        agent,
        status: agent === 'approval' ? 'pending' : 'pending',
        warnings: [],
        blockingIssues: [],
      })),
      outputs: {},
      evidence: [],
      approvalRequired: true,
    }
  }

  async execute(
    run: AgentRun,
    adapter: AgentAdapter,
    learner?: LearnerContext,
    onChange?: (run: AgentRun) => void | Promise<void>,
  ): Promise<AgentRun> {
    run.status = 'running'
    await onChange?.(run)

    for (const agent of run.plan) {
      const policy = this.policies.get(agent)
      const step = run.steps.find((item) => item.agent === agent)
      if (!policy || !step) continue

      if (agent === 'approval') {
        step.status = 'pending'
        run.status = 'awaiting-approval'
        await onChange?.(run)
        return run
      }

      const missingRequirement = policy.requires?.find(
        (required) => !run.outputs[required],
      )
      if (missingRequirement) {
        step.status = 'blocked'
        step.blockingIssues.push(`Missing required output from ${missingRequirement}`)
        run.status = 'blocked'
        await onChange?.(run)
        return run
      }

      step.status = 'running'
      step.startedAt = now()
      await onChange?.(run)

      const result = await adapter.run(agent, {
        request: run.request,
        learner,
        outputs: run.outputs,
      })

      step.finishedAt = now()
      step.warnings = result.warnings ?? []
      step.blockingIssues = result.blockingIssues ?? []

      for (const item of result.evidence ?? []) {
        run.evidence.push({ agent, ...item })
      }

      if (!result.ok || (policy.blocking && step.blockingIssues.length > 0)) {
        step.status = 'blocked'
        run.status = 'blocked'
        await onChange?.(run)
        return run
      }

      step.status = 'passed'
      run.outputs[agent] = result.output
      await onChange?.(run)
    }

    run.status = 'awaiting-approval'
    await onChange?.(run)
    return run
  }

  decide(
    run: AgentRun,
    decision: ApprovalDecision,
    options: { notes?: string; edits?: Record<string, unknown> } = {},
  ): AgentRun {
    run.approval = {
      decision,
      notes: options.notes,
      edits: options.edits,
      decidedAt: now(),
    }

    const approvalStep = run.steps.find((step) => step.agent === 'approval')
    if (approvalStep) {
      approvalStep.startedAt ??= now()
      approvalStep.finishedAt = now()
      approvalStep.status =
        decision === 'approve' || decision === 'approve-with-edits'
          ? 'passed'
          : decision === 'request-changes'
            ? 'pending'
            : 'blocked'
    }

    if (decision === 'approve' || decision === 'approve-with-edits') {
      run.status = 'approved'
    } else if (decision === 'request-changes') {
      run.status = 'changes-requested'
    } else {
      run.status = 'rejected'
    }

    return run
  }
}

export const ILEARN_COLLECTIONS = {
  agentRuns: 'iLearnAgentRuns',
  teacherApprovals: 'iLearnTeacherApprovals',
  learnerContext: 'iLearnLearnerContext',
  agentPolicies: 'iLearnAgentPolicies',
} as const
