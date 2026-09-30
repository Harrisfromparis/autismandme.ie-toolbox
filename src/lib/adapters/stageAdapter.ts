import {
  createHttpPrivilegedBackend,
  readPrivilegedBackendConfig,
  type PrivilegedAgentBackend,
} from '../backend/privileged'
import type { AgentAdapter, AgentInput, AgentKey, AgentResult } from '../types/pipeline'

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function runLocalStage(agent: AgentKey, input: AgentInput): AgentResult {
  const topic = input.request.topic.trim()
  const subject = input.request.subject.trim()
  const teacherIntent = input.request.teacherIntent.trim()

  switch (agent) {
    case 'curriculum': {
      const blockingIssues: string[] = []
      if (!input.request.programme.trim()) blockingIssues.push('Programme is required.')
      if (!subject) blockingIssues.push('Subject is required.')
      if (!topic) blockingIssues.push('Topic is required.')
      if (!teacherIntent) {
        blockingIssues.push('Teacher intent is required before curriculum validation can pass.')
      }

      return {
        ok: blockingIssues.length === 0,
        blockingIssues,
        output: {
          curriculumScope: {
            programme: input.request.programme,
            subject,
            yearGroup: input.request.yearGroup ?? 'unspecified',
            topic,
          },
          constraints: ['Use only resources within the selected curriculum scope.'],
          requiredLearning: [teacherIntent],
          blockedMismatches: blockingIssues,
        },
        evidence: [
          {
            source: 'teacher-brief',
            note: 'Validated direct teacher inputs before progressing.',
          },
        ],
      }
    }

    case 'resource':
      return {
        ok: true,
        output: {
          rankedResources: [
            {
              title: `${subject} official guidance`,
              source: 'Curriculum authority',
              url: 'https://www.curriculumonline.ie/',
              whyRelevant: `Directly aligned with ${topic}.`,
              programme: input.request.programme,
              resourceType: 'syllabus',
              licenceNote: 'Public educational guidance',
            },
          ],
          coverageGaps: [],
        },
        evidence: [
          {
            source: 'stub-resource-index',
            note: 'Development-safe fallback until CMS content is connected.',
          },
        ],
      }

    case 'pathway':
      return {
        ok: true,
        output: {
          title: `${subject}: ${topic}`,
          learningIntent: teacherIntent,
          sequence: [
            {
              stage: 1,
              purpose: 'Anchor prior understanding',
              learnerAction: 'Summarise the key idea in one sentence.',
              content: topic,
              resourceRefs: [0],
              evidenceOfLearning: 'Learner explains the central concept accurately.',
            },
            {
              stage: 2,
              purpose: 'Apply in context',
              learnerAction: 'Use the concept in a guided short task.',
              content: teacherIntent,
              resourceRefs: [0],
              evidenceOfLearning: 'Learner uses evidence to support reasoning.',
            },
          ],
          teacherNotes: ['Replace fallback resources with approved CMS entries.'],
          questions: ['What should success look like by the end of this pathway?'],
        },
      }

    case 'accessibility':
      return {
        ok: true,
        output: {
          variants: ['text scaffold', 'visual organizer', 'spoken summary'],
          audioPlan: {
            enabled: true,
            notes: 'Offer narrated instructions and key vocabulary support.',
          },
          visualPlan: {
            enabled: true,
            notes: 'Provide chunked text and highlighted exemplars.',
          },
          languageSupports: ['keyword bank', 'sentence starters'],
          equivalenceCheck: ['All options preserve the same learning goal.'],
        },
      }

    case 'motion': {
      const immersive =
        input.request.outputModes?.includes('interactive') ||
        input.request.outputModes?.includes('immersive')
      return {
        ok: true,
        output: immersive
          ? {
              enabled: true,
              motionBrief: {
                subject: topic,
                purpose: 'Represent progress through the learning sequence.',
                driver: 'state',
                parameterSpace: 'discrete',
                reducedMotion: 'Static progress state cards.',
                loadingFallback: 'Skeleton card states.',
                failureFallback: 'Text-only pathway fallback.',
              },
            }
          : {
              enabled: false,
              reason: 'Interactive/immersive output was not requested.',
            },
      }
    }

    case 'quality': {
      const blockingIssues: string[] = []
      if (!input.outputs.curriculum) {
        blockingIssues.push('Curriculum output is missing.')
      }
      if (!input.outputs.resource) {
        blockingIssues.push('Resource output is missing.')
      }
      if (!input.outputs.pathway) {
        blockingIssues.push('Pathway output is missing.')
      }
      if (!input.outputs.accessibility) {
        blockingIssues.push('Accessibility output is missing.')
      }

      return {
        ok: blockingIssues.length === 0,
        blockingIssues,
        output: {
          qualityReport: {
            checks: [
              'curriculum-alignment',
              'resource-provenance',
              'pathway-coherence',
              'accessibility-equivalence',
            ],
            result: blockingIssues.length === 0 ? 'pass' : 'blocked',
          },
          publishRecommendation: 'ready-for-teacher-review',
        },
      }
    }

    case 'approval':
      return {
        ok: false,
        blockingIssues: ['Teacher decision required. Use explicit approval controls.'],
      }
  }
}

export class DevelopmentStageAdapter implements AgentAdapter {
  private readonly backend: PrivilegedAgentBackend | null

  constructor(backend: PrivilegedAgentBackend | null = null) {
    this.backend = backend
  }

  async run<T = unknown>(agent: AgentKey, input: AgentInput): Promise<AgentResult<T>> {
    await pause(350)

    if (this.backend) {
      return this.backend.run<T>(agent, input)
    }

    return runLocalStage(agent, input) as AgentResult<T>
  }
}

export function createDevelopmentStageAdapter(): DevelopmentStageAdapter {
  const config = readPrivilegedBackendConfig()
  const backend = config ? createHttpPrivilegedBackend(config) : null
  return new DevelopmentStageAdapter(backend)
}
