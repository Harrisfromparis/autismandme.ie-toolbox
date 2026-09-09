import type { AgentInput, AgentKey, AgentResult } from '../types/pipeline'

interface RuntimeEnv {
  readonly VITE_ILEARN_BACKEND_URL?: string
}

export interface PrivilegedAgentBackend {
  run<T = unknown>(agent: AgentKey, input: AgentInput): Promise<AgentResult<T>>
}

export interface PrivilegedBackendConfig {
  endpoint: string
}

export function readPrivilegedBackendConfig(
  env: RuntimeEnv = import.meta.env as RuntimeEnv,
): PrivilegedBackendConfig | null {
  const rawEndpoint = env.VITE_ILEARN_BACKEND_URL?.trim()
  if (!rawEndpoint) {
    return null
  }

  try {
    const url = new URL(rawEndpoint)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null
    }
    return { endpoint: url.toString() }
  } catch {
    return null
  }
}

/**
 * Client-side boundary:
 * - Never place model provider keys in browser code.
 * - This helper intentionally calls only a trusted backend URL.
 * - The backend implementation should hold credentials and private writes.
 */
export function createHttpPrivilegedBackend(
  config: PrivilegedBackendConfig,
): PrivilegedAgentBackend {
  return {
    async run<T = unknown>(agent: AgentKey, input: AgentInput): Promise<AgentResult<T>> {
      const response = await fetch(`${config.endpoint}/api/ilearn/agents/${agent}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Privileged backend call failed (${response.status}): ${detail}`)
      }

      return (await response.json()) as AgentResult<T>
    },
  }
}
