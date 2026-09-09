import { useCallback, useMemo, useState } from 'react'
import {
  AgentKernel,
  LocalCmsAdapter,
  createDevelopmentStageAdapter,
  toAgentRunRecord,
  DEFAULT_AGENT_POLICIES,
  type AgentKey,
  type AgentRequest,
  type AgentRun,
  type ApprovalDecision,
} from '../lib/agent-os'

export function usePipelineRun() {
  const [run, setRun] = useState<AgentRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const kernel = useMemo(() => new AgentKernel(), [])
  const stageAdapter = useMemo(() => createDevelopmentStageAdapter(), [])
  const cms = useMemo(() => new LocalCmsAdapter(DEFAULT_AGENT_POLICIES), [])

  const apply = useCallback(
    async (work: (current: AgentRun) => Promise<AgentRun>) => {
      if (!run) return
      setBusy(true)
      setError(null)
      try {
        const next = await work(run)
        setRun(next)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Operation failed.')
      } finally {
        setBusy(false)
      }
    },
    [run],
  )

  const prepareRun = useCallback(
    async (request: AgentRequest) => {
      const next = kernel.createRun(request)
      await cms.createRun(toAgentRunRecord(next))
      setRun(next)
      setError(null)
    },
    [kernel, cms],
  )

  const runAllStages = useCallback(async () => {
    await apply((current) => kernel.runAll(current, stageAdapter, { repository: cms, onChange: setRun }))
  }, [apply, cms, kernel, stageAdapter])

  const runSingleStage = useCallback(
    async (agent: AgentKey) => {
      await apply((current) => kernel.runStage(current, agent, stageAdapter, { repository: cms, onChange: setRun }))
    },
    [apply, cms, kernel, stageAdapter],
  )

  const retryStage = useCallback(
    async (agent: AgentKey) => {
      await apply((current) => kernel.retryStage(current, agent, stageAdapter, { repository: cms, onChange: setRun }))
    },
    [apply, cms, kernel, stageAdapter],
  )

  const decide = useCallback(
    async (decision: ApprovalDecision, notes?: string) => {
      await apply((current) =>
        kernel.decide(current, decision, {
          notes,
          repository: cms,
          onChange: setRun,
        }),
      )
    },
    [apply, cms, kernel],
  )

  const canRun = useCallback(
    (agent: AgentKey) => {
      if (!run) {
        return { allowed: false, reason: 'Prepare a workflow first.' }
      }
      return kernel.getRunPermission(run, agent)
    },
    [kernel, run],
  )

  return {
    run,
    busy,
    error,
    prepareRun,
    runAllStages,
    runSingleStage,
    retryStage,
    decide,
    canRun,
  }
}
