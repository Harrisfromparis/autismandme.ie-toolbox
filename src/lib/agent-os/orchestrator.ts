import {
  toAgentRunRecord,
  toApprovalRecord,
  type IlearnCmsAdapter,
} from '../adapters/cms'
import { buildAgentPlan, DEFAULT_AGENT_POLICIES } from './policies'
import type {
  AgentAdapter,
  AgentKey,
  AgentPolicy,
  AgentRequest,
  AgentRun,
  AgentStepState,
  ApprovalDecision,
  LearnerContext,
  RunPermission,
} from '../types/pipeline'

const now = () => new Date().toISOString()

function cloneRun(run: AgentRun): AgentRun {
  return {
    ...run,
    request: { ...run.request },
    plan: [...run.plan],
    steps: run.steps.map((step) => ({
      ...step,
      warnings: [...step.warnings],
      blockingIssues: [...step.blockingIssues],
    })),
    outputs: { ...run.outputs },
    evidence: run.evidence.map((item) => ({ ...item })),
    approval: run.approval ? { ...run.approval } : undefined,
  }
}

function failedStatus(run: AgentRun): AgentRun['status'] {
  return run.steps.some(
    (step) => step.agent !== 'approval' && (step.status === 'failure' || step.status === 'blocked'),
  )
    ? 'failed'
    : run.status
}

interface RunOptions {
  learner?: LearnerContext
  repository?: IlearnCmsAdapter
  onChange?: (run: AgentRun) => void | Promise<void>
}

export class AgentKernel {
  readonly policies: Map<AgentKey, AgentPolicy>

  constructor(policies: readonly AgentPolicy[] = DEFAULT_AGENT_POLICIES) {
    this.policies = new Map(policies.map((policy) => [policy.key, policy]))
  }

  createRun(request: AgentRequest): AgentRun {
    const plan = buildAgentPlan(request)
    const steps: AgentStepState[] = plan.map((agent) => ({
      agent,
      status: 'idle',
      warnings: [],
      blockingIssues: [],
      attempts: 0,
    }))

    return {
      runId: request.id,
      status: 'idle',
      request,
      plan,
      steps,
      outputs: {},
      evidence: [],
      approvalRequired: true,
    }
  }

  getRunPermission(run: AgentRun, agent: AgentKey): RunPermission {
    const policy = this.policies.get(agent)
    const step = run.steps.find((item) => item.agent === agent)
    if (!policy || !step) {
      return { allowed: false, reason: 'Unknown stage.' }
    }

    if (step.status === 'running') {
      return { allowed: false, reason: 'Stage is already running.' }
    }

    if (step.status === 'success' && agent !== 'approval') {
      return { allowed: false, reason: 'Stage already succeeded.' }
    }

    if (agent === 'approval') {
      const quality = run.steps.find((item) => item.agent === 'quality')
      if (!quality || quality.status !== 'success') {
        return { allowed: false, reason: 'Quality must pass before teacher approval.' }
      }

      if (run.status === 'completed') {
        return { allowed: false, reason: 'Run has already been approved or finalized.' }
      }

      return { allowed: false, reason: 'Use explicit teacher approval actions.' }
    }

    const unmet = (policy.requires ?? []).find((requiredAgent) => {
      const requiredStep = run.steps.find((stepItem) => stepItem.agent === requiredAgent)
      return requiredStep?.status !== 'success'
    })

    if (unmet) {
      return { allowed: false, reason: `Blocked until ${unmet} succeeds.` }
    }

    return { allowed: true }
  }

  async runStage(
    sourceRun: AgentRun,
    agent: AgentKey,
    adapter: AgentAdapter,
    options: RunOptions = {},
  ): Promise<AgentRun> {
    const run = cloneRun(sourceRun)
    const permission = this.getRunPermission(run, agent)
    const step = run.steps.find((item) => item.agent === agent)

    if (!step) {
      return run
    }

    if (!permission.allowed) {
      step.status = 'blocked'
      step.message = permission.reason
      step.blockingIssues = permission.reason ? [permission.reason] : []
      run.lastError = permission.reason
      run.status = failedStatus(run)
      await this.persist(run, options)
      return run
    }

    step.status = 'running'
    step.message = 'Running…'
    step.attempts += 1
    step.startedAt = now()
    step.finishedAt = undefined
    step.warnings = []
    step.blockingIssues = []
    run.status = 'running'
    run.lastError = undefined
    await this.persist(run, options)

    try {
      const result = await adapter.run(agent, {
        request: run.request,
        learner: options.learner,
        outputs: run.outputs,
      })

      step.finishedAt = now()
      step.warnings = result.warnings ?? []
      step.blockingIssues = result.blockingIssues ?? []
      step.message = result.message ?? (result.ok ? 'Completed.' : 'Stage failed.')

      for (const item of result.evidence ?? []) {
        run.evidence.push({ agent, ...item })
      }

      if (!result.ok) {
        step.status = 'failure'
        run.status = 'failed'
        run.lastError = step.blockingIssues[0] ?? step.message
        await this.persist(run, options)
        return run
      }

      if (step.blockingIssues.length > 0) {
        step.status = 'blocked'
        run.status = 'failed'
        run.lastError = step.blockingIssues[0]
        await this.persist(run, options)
        return run
      }

      step.status = 'success'
      step.message = result.message ?? 'Completed successfully.'
      run.outputs[agent] = result.output

      if (agent === 'quality') {
        const approval = run.steps.find((item) => item.agent === 'approval')
        if (approval) {
          approval.status = 'blocked'
          approval.message = 'Awaiting explicit teacher decision.'
          approval.blockingIssues = ['Teacher decision required before publication.']
        }
        run.status = 'awaiting-approval'
      } else {
        run.status = 'running'
      }

      await this.persist(run, options)
      return run
    } catch (error) {
      step.finishedAt = now()
      step.status = 'failure'
      step.message = error instanceof Error ? error.message : 'Unknown stage failure.'
      step.blockingIssues = [step.message]
      run.status = 'failed'
      run.lastError = step.message
      await this.persist(run, options)
      return run
    }
  }

  async runAll(
    sourceRun: AgentRun,
    adapter: AgentAdapter,
    options: RunOptions = {},
  ): Promise<AgentRun> {
    let run = cloneRun(sourceRun)
    for (const agent of run.plan) {
      if (agent === 'approval') {
        const quality = run.steps.find((item) => item.agent === 'quality')
        if (quality?.status === 'success') {
          const approvalStep = run.steps.find((item) => item.agent === 'approval')
          if (approvalStep) {
            approvalStep.status = 'blocked'
            approvalStep.message = 'Awaiting explicit teacher decision.'
            approvalStep.blockingIssues = ['Teacher decision required before publication.']
          }
          run.status = 'awaiting-approval'
          await this.persist(run, options)
        }
        return run
      }

      const current = run.steps.find((item) => item.agent === agent)
      if (current?.status === 'success') {
        continue
      }

      run = await this.runStage(run, agent, adapter, options)
      if (run.status === 'failed') {
        return run
      }
    }

    return run
  }

  async retryStage(
    sourceRun: AgentRun,
    agent: AgentKey,
    adapter: AgentAdapter,
    options: RunOptions = {},
  ): Promise<AgentRun> {
    const run = cloneRun(sourceRun)
    const step = run.steps.find((item) => item.agent === agent)
    if (!step) return run

    step.status = 'idle'
    step.message = undefined
    step.blockingIssues = []
    step.finishedAt = undefined
    run.lastError = undefined

    return this.runStage(run, agent, adapter, options)
  }

  async decide(
    sourceRun: AgentRun,
    decision: ApprovalDecision,
    options: {
      notes?: string
      edits?: Record<string, unknown>
      repository?: IlearnCmsAdapter
      onChange?: (run: AgentRun) => void | Promise<void>
    } = {},
  ): Promise<AgentRun> {
    const run = cloneRun(sourceRun)
    const quality = run.steps.find((step) => step.agent === 'quality')
    const approvalStep = run.steps.find((step) => step.agent === 'approval')

    if (!quality || quality.status !== 'success' || !approvalStep) {
      throw new Error('Teacher approval is blocked until quality checks pass.')
    }

    approvalStep.status = 'running'
    approvalStep.startedAt ??= now()
    approvalStep.blockingIssues = []
    approvalStep.message = 'Recording teacher decision…'
    run.status = 'awaiting-approval'
    await this.persist(run, options)

    run.approval = {
      decision,
      notes: options.notes,
      edits: options.edits,
      decidedAt: now(),
    }

    approvalStep.finishedAt = now()
    if (decision === 'approve' || decision === 'approve-with-edits') {
      approvalStep.status = 'success'
      approvalStep.message = 'Teacher approved this pathway.'
      run.status = 'completed'
      run.lastError = undefined
    } else {
      approvalStep.status = 'failure'
      approvalStep.message =
        decision === 'request-changes'
          ? 'Teacher requested changes.'
          : 'Teacher rejected this pathway.'
      approvalStep.blockingIssues = [approvalStep.message]
      run.status = 'failed'
      run.lastError = approvalStep.message
    }

    await this.persist(run, options)

    if (options.repository) {
      await options.repository.createApproval(toApprovalRecord(run))
    }

    return run
  }

  private async persist(
    run: AgentRun,
    options: {
      repository?: IlearnCmsAdapter
      onChange?: (run: AgentRun) => void | Promise<void>
    },
  ): Promise<void> {
    await options.onChange?.(cloneRun(run))
    if (options.repository) {
      await options.repository.updateRun(toAgentRunRecord(run))
    }
  }
}
