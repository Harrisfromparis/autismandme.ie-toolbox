export type MotionDriver =
  | 'scroll'
  | 'pointer'
  | 'drag'
  | 'touch'
  | 'orientation'
  | 'audio'
  | 'data'
  | 'state'

export type MotionParameterSpace = 'linear' | 'circular' | '2d' | 'discrete'
export type MotionDelivery = 'alpha-atlas' | 'chroma-video' | 'runtime-only'

export interface MotionKeyState {
  id: string
  at: number
  description: string
  required?: boolean
}

export interface MotionBrief {
  subject: string
  purpose: string
  driver: MotionDriver
  parameterSpace: MotionParameterSpace
  response: string
  meaning: string
  semanticMotion: string[]
  geometricMotion: string[]
  restState: string
  keyStates: MotionKeyState[]
  destination: {
    cssWidth: number
    cssHeight: number
    dpr: number
    mobile: boolean
  }
  reducedMotion: string
  loadingFallback: string
  failureFallback: string
  delivery?: MotionDelivery
  qualityTarget?: {
    maxMegabytes?: number
    targetFps?: number
  }
}

export interface MotionValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/**
 * iLEARN adaptation of the MIT-licensed oil-oil/oil-motion workflow.
 *
 * We adopt the design rules, not its video-provider lock-in:
 * - define interaction + key states before producing motion
 * - distinguish semantic motion from geometric motion
 * - keep deterministic input-to-progress mapping in the browser
 * - ship mobile/reduced-motion/failure fallbacks
 * - QA the result at its actual display size
 */
export function validateMotionBrief(brief: MotionBrief): MotionValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (!brief.subject.trim()) errors.push('Motion subject is required.')
  if (!brief.purpose.trim()) errors.push('Motion must have a learning or interaction purpose.')
  if (!brief.response.trim()) errors.push('Continuous visual response must be defined.')
  if (!brief.meaning.trim()) errors.push('Motion must state what it communicates to the learner.')
  if (!brief.restState.trim()) errors.push('Rest state is required.')
  if (!brief.reducedMotion.trim()) errors.push('Reduced-motion alternative is required.')
  if (!brief.loadingFallback.trim()) errors.push('Loading fallback is required.')
  if (!brief.failureFallback.trim()) errors.push('Failure fallback is required.')

  if (brief.keyStates.length < 2 && brief.parameterSpace !== 'discrete') {
    errors.push('Continuous motion needs at least a start and end key state.')
  }

  if (brief.parameterSpace === '2d' && brief.driver === 'scroll') {
    warnings.push('A one-dimensional scroll driver rarely justifies a 2D motion parameter space.')
  }

  if (
    brief.semanticMotion.length > 0 &&
    brief.semanticMotion.every((item) => /translate|scale|rotate|opacity/i.test(item))
  ) {
    warnings.push(
      'Semantic motion appears to contain only geometric transforms. Check that meaningful structural motion is not being faked.',
    )
  }

  if (brief.destination.cssWidth <= 0 || brief.destination.cssHeight <= 0) {
    errors.push('Actual CSS display dimensions must be known before asset budgeting.')
  }

  if (brief.destination.dpr <= 0) errors.push('Device pixel ratio must be positive.')

  const sorted = [...brief.keyStates].sort((a, b) => a.at - b.at)
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].at === sorted[i - 1].at) {
      errors.push(`Key states ${sorted[i - 1].id} and ${sorted[i].id} occupy the same progress value.`)
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function progressToFrame(progress: number, frameCount: number): number {
  if (!Number.isFinite(frameCount) || frameCount <= 1) return 0
  return Math.round(clamp01(progress) * (frameCount - 1))
}

export function circularProgress(angleRadians: number): number {
  const tau = Math.PI * 2
  return ((angleRadians % tau) + tau) % tau / tau
}

export function pointerProgress(
  x: number,
  y: number,
  bounds: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0.5, y: 0.5 }
  return {
    x: clamp01((x - bounds.left) / bounds.width),
    y: clamp01((y - bounds.top) / bounds.height),
  }
}

export function damp(current: number, target: number, deltaSeconds: number, response = 12): number {
  const factor = 1 - Math.exp(-Math.max(0, deltaSeconds) * Math.max(0.01, response))
  return current + (target - current) * factor
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function chooseDelivery(brief: MotionBrief, estimatedFrames: number): MotionDelivery {
  const pixelArea =
    brief.destination.cssWidth *
    brief.destination.cssHeight *
    Math.max(1, brief.destination.dpr) ** 2

  // Runtime-only is preferred when the meaning can be expressed with deterministic geometry.
  if (brief.semanticMotion.length === 0) return 'runtime-only'

  // Long, large, one-dimensional sequences are usually safer as compressed chroma video.
  if (
    brief.parameterSpace === 'linear' &&
    (estimatedFrames > 180 || pixelArea > 1_800_000)
  ) {
    return 'chroma-video'
  }

  return 'alpha-atlas'
}

export function createMotionManifest(
  brief: MotionBrief,
  estimatedFrames: number,
): MotionBrief & { delivery: MotionDelivery; validation: MotionValidation } {
  const delivery = brief.delivery ?? chooseDelivery(brief, estimatedFrames)
  const result = { ...brief, delivery }
  return { ...result, validation: validateMotionBrief(result) }
}
