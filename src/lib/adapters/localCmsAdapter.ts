import type { AgentPolicy } from '../types/pipeline'
import { DEFAULT_AGENT_POLICIES } from '../agent-os/policies'
import type {
  AgentPoliciesRecord,
  AgentRunRecord,
  IlearnCmsAdapter,
  LearnerContextRecord,
  TeacherApprovalRecord,
} from './cms'

export class LocalCmsAdapter implements IlearnCmsAdapter {
  private readonly runs = new Map<string, AgentRunRecord>()
  private readonly approvals = new Map<string, TeacherApprovalRecord>()
  private readonly learnerContext = new Map<string, LearnerContextRecord>()
  private readonly policies: readonly AgentPolicy[]

  constructor(policies: readonly AgentPolicy[] = DEFAULT_AGENT_POLICIES) {
    this.policies = policies
  }

  async createRun(record: AgentRunRecord): Promise<void> {
    this.runs.set(record.runId, record)
  }

  async updateRun(record: AgentRunRecord): Promise<void> {
    this.runs.set(record.runId, record)
  }

  async createApproval(record: TeacherApprovalRecord): Promise<void> {
    this.approvals.set(record.runId, record)
  }

  async getLearnerContext(learnerId: string): Promise<LearnerContextRecord | null> {
    return this.learnerContext.get(learnerId) ?? null
  }

  async getPolicies(): Promise<AgentPoliciesRecord> {
    return {
      updatedAt: new Date().toISOString(),
      policies: this.policies,
    }
  }
}
