#!/usr/bin/env node
// Join existing iLEARN records with SEC link metadata. Never manufacture outcome mappings.
import { readFileSync, writeFileSync } from 'node:fs'

const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, args) => {
  if (arg.startsWith('--') && args[index + 1] && !args[index + 1].startsWith('--')) pairs.push([arg.slice(2), args[index + 1]])
  return pairs
}, []))
for (const name of ['outcomes', 'planning', 'resources', 'exams', 'output']) {
  if (!options[name]) throw new Error(`Missing --${name} FILE`)
}

const readArray = (path) => {
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(parsed)) throw new Error(`${path} must contain a JSON array`)
  return parsed
}
const normal = (value) => String(value ?? '').trim().toLowerCase()
const cycle = (value) => /junior|^jc$/.test(normal(value)) ? 'JC' : /leaving|senior|^lc$/.test(normal(value)) ? 'LC' : ''
const outcomes = readArray(options.outcomes)
const planning = readArray(options.planning)
const resources = readArray(options.resources)
const textbooks = options.textbooks ? readArray(options.textbooks) : []
const csv = readFileSync(options.exams, 'utf8').replace(/^\uFEFF/, '')

function rows(source) {
  const result = []; let field = '', row = [], quoted = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '"' && quoted && source[i + 1] === '"') { field += '"'; i++ }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(field); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i++
      row.push(field); if (row.some(Boolean)) result.push(row)
      row = []; field = ''
    } else field += char
  }
  if (field || row.length) { row.push(field); result.push(row) }
  const [head, ...body] = result
  return body.map((values) => Object.fromEntries(head.map((key, i) => [key, values[i] ?? ''])))
}

const exams = rows(csv).filter((entry) =>
  ['JC', 'LC'].includes(entry.Cycle) && ['Exam Paper', 'Marking Scheme'].includes(entry.Type) &&
  /^https:\/\/www\.examinations\.ie\/archive\/(exampapers|markingschemes)\/\d{4}\/[\w.-]+\.pdf$/i.test(entry.PDF_URL)
)
const bundle = outcomes.filter((item) => item.active === true && (item.outcomeId || item._id)).map((item) => {
  const id = String(item.outcomeId || item._id)
  const scope = cycle(item.cycle)
  const matches = (record) => cycle(record.cycle || record.programme) === scope && normal(record.subject) === normal(item.subject)
  return {
    outcome: item, // Keep the original official record, including source and revision fields.
    planning: planning.filter((record) => matches(record) && Array.isArray(record.outcomeIds) && record.outcomeIds.map(String).includes(id)),
    resources: resources.filter((record) => matches(record) && record.active === true && record.approved === true && record.reviewStatus === 'Verified' && Array.isArray(record.outcomeIds) && record.outcomeIds.map(String).includes(id)),
    textbookCandidates: textbooks.filter((record) => matches(record) && Array.isArray(record.outcomeIds) && record.outcomeIds.map(String).includes(id)).map((record) => ({
      resourceId: record.resourceId || '', title: record.title || '', chapter: record.chapter || '',
      sourceUrl: record.sourceUrl || '', publisher: record.publisher || '', licence: record.licence || '',
      cycle: scope, subject: item.subject, outcomeId: id,
      verified: false, approved: false
    })),
    examCandidates: exams.filter((record) => record.Cycle === scope && normal(record.Subject) === normal(item.subject)).map((record) => ({
      cycle: scope, subject: record.Subject, year: Number(record.Year), type: record.Type,
      details: record.Details, sourceUrl: record.PDF_URL,
      sourceOrganisation: 'State Examinations Commission',
      verified: false, approved: false, outcomeMapped: false
    }))
  }
})
writeFileSync(options.output, JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), bundles: bundle }, null, 2))
console.log(`Wrote ${bundle.length} outcome bundles to ${options.output}. Exam links remain candidates until a teacher verifies and maps them.`)
