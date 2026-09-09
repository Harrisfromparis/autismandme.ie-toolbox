import type { AgentKey, AgentPolicy, AgentRequest } from '../types/pipeline'

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
    requires: ['curriculum', 'resource', 'pathway', 'accessibility'],
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

function wantsMotion(request: AgentRequest): boolean {
  const modes = request.outputModes ?? []
  return modes.includes('interactive') || modes.includes('immersive')
}

export function buildAgentPlan(request: AgentRequest): AgentKey[] {
  const plan: AgentKey[] = ['curriculum', 'resource', 'pathway', 'accessibility']
  if (wantsMotion(request)) {
    plan.push('motion')
  }
  plan.push('quality', 'approval')
  return plan
}
