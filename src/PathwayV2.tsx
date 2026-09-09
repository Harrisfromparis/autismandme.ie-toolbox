import { useState } from 'react'
import { motion } from 'framer-motion'
import './ilearn-v2.css'
import {
  DEFAULT_AGENT_POLICIES,
  type AgentKey,
  type ApprovalDecision,
} from './lib/agent-os'
import { usePipelineRun } from './hooks/usePipelineRun'

const agentCopy: Record<AgentKey, string> = {
  curriculum: 'Checks programme, level and official curriculum constraints.',
  resource: 'Finds and provenance-checks useful resources.',
  pathway: 'Assembles the learning journey rather than dumping links.',
  accessibility: 'Creates equivalent UDL representations.',
  motion: 'Plans meaningful controllable motion when the learning needs it.',
  quality: 'Blocks mismatches, unsupported claims and inaccessible dead ends.',
  approval: 'Stops here for teacher judgement before learner-facing publication.',
}

const card: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 18,
  padding: 18,
  background: 'rgba(255,255,255,.035)',
}

const statusStyles: Record<string, React.CSSProperties> = {
  idle: { color: '#8f97a3' },
  running: { color: '#d8b978' },
  success: { color: '#8fca95' },
  failure: { color: '#ef8d8d' },
  blocked: { color: '#e8b67a' },
}

function decisionLabel(decision: ApprovalDecision): string {
  switch (decision) {
    case 'approve':
      return 'Approve'
    case 'approve-with-edits':
      return 'Approve with edits'
    case 'request-changes':
      return 'Request changes'
    case 'reject':
      return 'Reject'
  }
}

export default function PathwayV2() {
  const [programme, setProgramme] = useState('Junior Cycle')
  const [subject, setSubject] = useState('English')
  const [yearGroup, setYearGroup] = useState('')
  const [topic, setTopic] = useState('')
  const [teacherIntent, setTeacherIntent] = useState('')
  const [teacherNotes, setTeacherNotes] = useState('')
  const [immersive, setImmersive] = useState(false)

  const {
    run,
    busy,
    error,
    prepareRun,
    runAllStages,
    runSingleStage,
    retryStage,
    decide,
    canRun,
  } = usePipelineRun()

  async function prepare() {
    const cleanTopic = topic.trim()
    const cleanIntent = teacherIntent.trim()
    if (!cleanTopic || !cleanIntent) return

    await prepareRun({
      id: `run-${Date.now()}`,
      programme,
      subject,
      yearGroup: yearGroup.trim() || undefined,
      topic: cleanTopic,
      teacherIntent: cleanIntent,
      outputModes: immersive
        ? ['text', 'visual', 'interactive', 'immersive']
        : ['text', 'visual'],
    })
  }

  const pipeline = run?.plan ?? DEFAULT_AGENT_POLICIES.map((policy) => policy.key)

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#080b10',
        color: '#f5f1e7',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 'clamp(18px,4vw,48px)',
      }}
    >
      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#d8b978', fontSize: 11, letterSpacing: '.18em', fontWeight: 800 }}>
          iLEARN · TEACHER OPERATING SYSTEM
        </p>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(42px,7vw,76px)', lineHeight: 0.96, margin: '8px 0 14px' }}>
          AI does the routine work. You make the call.
        </h1>
        <p style={{ maxWidth: 780, color: '#bdb7ac', lineHeight: 1.65, fontSize: 17 }}>
          Curriculum checking, resource hunting, pathway assembly, accessibility adaptation, motion planning and QA run as one governed workflow. Learner-facing publication stops at teacher approval.
        </p>

        <section style={{ ...card, marginTop: 28 }} aria-label="Pathway brief">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
            <label>
              <span style={{ display: 'block', color: '#999', fontSize: 12, marginBottom: 6 }}>Programme</span>
              <select value={programme} onChange={(e) => setProgramme(e.target.value)} style={{ width: '100%', padding: 12, borderRadius: 12 }}>
                <option>Junior Cycle</option>
                <option>Leaving Certificate</option>
                <option>Leaving Certificate Applied</option>
              </select>
            </label>
            <label>
              <span style={{ display: 'block', color: '#999', fontSize: 12, marginBottom: 6 }}>Subject</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', padding: 12, borderRadius: 12 }} />
            </label>
            <label>
              <span style={{ display: 'block', color: '#999', fontSize: 12, marginBottom: 6 }}>Year group</span>
              <input value={yearGroup} onChange={(e) => setYearGroup(e.target.value)} placeholder="Optional" style={{ width: '100%', padding: 12, borderRadius: 12 }} />
            </label>
          </div>

          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <label>
              <span style={{ display: 'block', color: '#999', fontSize: 12, marginBottom: 6 }}>Topic / text / concept</span>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Jekyll & Hyde — duality and responsibility" style={{ width: '100%', padding: 12, borderRadius: 12 }} />
            </label>
            <label>
              <span style={{ display: 'block', color: '#999', fontSize: 12, marginBottom: 6 }}>What should the learner understand or be ready to do?</span>
              <textarea value={teacherIntent} onChange={(e) => setTeacherIntent(e.target.value)} rows={3} style={{ width: '100%', padding: 12, borderRadius: 12, resize: 'vertical' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={immersive} onChange={(e) => setImmersive(e.target.checked)} />
              Include interactive / immersive treatment when it improves the learning
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
            <button onClick={prepare} disabled={busy} style={{ border: 0, borderRadius: 999, padding: '13px 20px', fontWeight: 800, background: '#d8b978', color: '#111' }}>
              Prepare governed workflow
            </button>
            <button onClick={runAllStages} disabled={!run || busy} style={{ border: '1px solid rgba(216,185,120,.45)', borderRadius: 999, padding: '13px 20px', fontWeight: 700, background: 'transparent', color: '#efd69a' }}>
              Run pipeline to teacher gate
            </button>
          </div>

          {run && (
            <p style={{ marginTop: 12, color: '#aaa', fontSize: 13 }}>
              Run status: <strong style={{ color: '#f5f1e7' }}>{run.status}</strong>
            </p>
          )}
          {error && <p style={{ marginTop: 8, color: '#ef8d8d', fontSize: 13 }}>{error}</p>}
        </section>

        <section style={{ marginTop: 28 }} aria-label="Agent pipeline">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', marginBottom: 12 }}>
            <div>
              <p style={{ color: '#d8b978', fontSize: 10, letterSpacing: '.15em', margin: 0 }}>OPERATING PIPELINE</p>
              <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 30, margin: '5px 0 0' }}>Only surface the moments that need a human.</h2>
            </div>
            <span style={{ color: '#888', fontSize: 12 }}>{run ? `${run.plan.length} governed stages` : 'Waiting for a brief'}</span>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {pipeline.map((key, index) => {
              const policy = DEFAULT_AGENT_POLICIES.find((item) => item.key === key)
              if (!policy) return null
              const step = run?.steps.find((item) => item.agent === key)
              const permission = run ? canRun(key) : { allowed: false, reason: 'Prepare a workflow first.' }
              const isTeacherGate = key === 'approval'

              return (
                <motion.article
                  key={key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.035 }}
                  style={{
                    ...card,
                    display: 'grid',
                    gridTemplateColumns: '44px minmax(0,1fr) auto',
                    gap: 14,
                    alignItems: 'center',
                    borderColor: isTeacherGate ? 'rgba(216,185,120,.45)' : 'rgba(255,255,255,.1)',
                    background: isTeacherGate ? 'rgba(216,185,120,.07)' : 'rgba(255,255,255,.035)',
                  }}
                >
                  <span style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(216,185,120,.12)', color: '#efd69a', fontWeight: 800, fontSize: 12 }}>
                    {index + 1}
                  </span>
                  <div>
                    <strong>{policy.name}</strong>
                    <p style={{ color: '#aaa', margin: '5px 0 0', lineHeight: 1.45, fontSize: 13 }}>{agentCopy[key]}</p>
                    <p style={{ ...statusStyles[step?.status ?? 'idle'], margin: '6px 0 0', fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase' }}>
                      {step?.status ?? 'idle'}
                    </p>
                    {!!step?.message && <p style={{ color: '#9ca3af', margin: '4px 0 0', fontSize: 12 }}>{step.message}</p>}
                    {!!step?.blockingIssues.length && (
                      <p style={{ color: '#efb081', margin: '4px 0 0', fontSize: 12 }}>{step.blockingIssues[0]}</p>
                    )}
                  </div>
                  <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
                    <span style={{ color: isTeacherGate ? '#efd69a' : '#829487', fontSize: 10, letterSpacing: '.1em' }}>
                      {isTeacherGate ? 'TEACHER REQUIRED' : policy.autoRun ? 'AUTOMATED' : 'CONTROLLED'}
                    </span>

                    {!isTeacherGate && (
                      <>
                        <button
                          onClick={() => runSingleStage(key)}
                          disabled={!run || busy || !permission.allowed}
                          style={{ border: '1px solid rgba(255,255,255,.25)', borderRadius: 999, padding: '6px 12px', background: 'transparent', color: '#f5f1e7', fontSize: 12 }}
                        >
                          Run stage
                        </button>
                        <button
                          onClick={() => retryStage(key)}
                          disabled={!run || busy || !step || (step.status !== 'failure' && step.status !== 'blocked')}
                          style={{ border: '1px solid rgba(216,185,120,.35)', borderRadius: 999, padding: '6px 12px', background: 'transparent', color: '#efd69a', fontSize: 12 }}
                        >
                          Retry
                        </button>
                      </>
                    )}
                  </div>
                </motion.article>
              )
            })}
          </div>
        </section>

        {run && run.plan.includes('approval') && (
          <section style={{ ...card, marginTop: 20 }} aria-label="Teacher approval gate">
            <h3 style={{ marginTop: 0 }}>Teacher Approval Gate</h3>
            <p style={{ color: '#aaa', marginTop: 6, fontSize: 14 }}>
              Stage 7 is always manual. Quality must pass before these actions are enabled.
            </p>
            <textarea
              value={teacherNotes}
              onChange={(event) => setTeacherNotes(event.target.value)}
              rows={2}
              placeholder="Optional approval/review notes"
              style={{ width: '100%', padding: 12, borderRadius: 12, resize: 'vertical', marginTop: 8 }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
              {(['approve', 'approve-with-edits', 'request-changes', 'reject'] as const).map((decision) => {
                const qualityStep = run.steps.find((step) => step.agent === 'quality')
                const disabled = busy || qualityStep?.status !== 'success'
                return (
                  <button
                    key={decision}
                    onClick={() => decide(decision, teacherNotes.trim() || undefined)}
                    disabled={disabled}
                    style={{
                      border: '1px solid rgba(216,185,120,.45)',
                      borderRadius: 999,
                      padding: '8px 12px',
                      background: disabled ? 'rgba(255,255,255,.04)' : 'transparent',
                      color: disabled ? '#999' : '#efd69a',
                      fontSize: 12,
                    }}
                  >
                    {decisionLabel(decision)}
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </section>
    </main>
  )
}
