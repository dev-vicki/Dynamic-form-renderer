import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { submitForm } from '../api/client'
import {
  buildSubmission,
  getAt,
  initialRow,
  initialValues,
  mapServerErrors,
  resolveForm,
  setAt,
  validate,
} from '../engine'
import type { FieldErrors, FieldSchema, FormSchema, FormValues, ResolvedNode, ServerError } from '../engine/types'
import { clearDraft, loadDraft, useAutosave } from '../hooks/useDraft'
import { ErrorSummary, type SummaryItem } from './ErrorSummary'
import { FieldNode } from './Field'
import { FormContext, type FormCtx } from './FormContext'
import { SaveIndicator } from './SaveIndicator'

type Phase =
  | { kind: 'editing' }
  | { kind: 'submitting' }
  | { kind: 'done'; id: string }
  | { kind: 'failed'; message: string }

export function FormRenderer({ schema }: { schema: FormSchema }) {
  // Remounting the body is the simplest correct "reset".
  const [instance, setInstance] = useState(0)
  return <FormBody key={`${schema.id}-${instance}`} schema={schema} reset={() => setInstance((i) => i + 1)} />
}

/** path -> label for summary messages ("Member 2: Age ...") */
function collectMeta(nodes: ResolvedNode[], rowPrefix = '', out: Record<string, { label: string; prefix: string }> = {}) {
  for (const n of nodes) {
    if (!n.visible) continue
    out[n.path] = { label: n.field.label, prefix: rowPrefix }
    if (n.field.type === 'section') collectMeta(n.children, rowPrefix, out)
    if (n.field.type === 'group') {
      n.rows.forEach((row, i) => collectMeta(row, `${n.field.itemLabel ?? 'Item'} ${i + 1}`, out))
    }
  }
  return out
}

function FormBody({ schema, reset }: { schema: FormSchema; reset: () => void }) {
  const [draft] = useState(() => loadDraft(schema))
  const [values, setValues] = useState<FormValues>(() => draft?.values ?? initialValues(schema))
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [unmapped, setUnmapped] = useState<ServerError[]>([])
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' })
  const [summaryFocus, setSummaryFocus] = useState(0)
  const summaryRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<HTMLHeadingElement>(null)

  const resolved = useMemo(() => resolveForm(schema, values), [schema, values])
  const clientErrors = useMemo(() => validate(resolved), [resolved])
  const meta = useMemo(() => collectMeta(resolved.nodes), [resolved])

  const status = useAutosave(schema, values, phase.kind !== 'done', draft?.savedAt)

  // Errors visible to the user: client errors once touched/submitted, plus server errors.
  const errors = useMemo(() => {
    const out: FieldErrors = {}
    for (const [p, m] of Object.entries(clientErrors)) if (submitted || touched.has(p)) out[p] = m
    for (const [p, m] of Object.entries(serverErrors)) if (!(p in out)) out[p] = m
    return out
  }, [clientErrors, touched, submitted, serverErrors])

  const summaryItems: SummaryItem[] = useMemo(() => {
    if (!submitted) return []
    const items: SummaryItem[] = Object.entries(errors).map(([path, message]) => {
      const m = meta[path]
      const isServer = path in serverErrors && !(path in clientErrors)
      const text = m?.prefix ? `${m.prefix}: ${message}` : isServer && m ? `${m.label}: ${message}` : message
      return { path, text }
    })
    for (const u of unmapped) items.push({ path: null, text: `${u.field}: ${u.message}` })
    return items
  }, [submitted, errors, meta, serverErrors, clientErrors, unmapped])

  useEffect(() => {
    if (summaryFocus > 0) summaryRef.current?.focus()
  }, [summaryFocus])
  useEffect(() => {
    if (phase.kind === 'done') doneRef.current?.focus()
  }, [phase.kind])

  const dropServerError = (path: string) =>
    setServerErrors((prev) => {
      if (!(path in prev)) return prev
      const { [path]: _removed, ...rest } = prev
      return rest
    })

  const ctx: FormCtx = {
    errors,
    setValue: (path, value) => {
      setValues((v) => setAt(v, path, value))
      dropServerError(path)
    },
    blur: (path) => setTouched((t) => (t.has(path) ? t : new Set(t).add(path))),
    addRow: (groupPath: string, fields: FieldSchema[]) => {
      setValues((v) => {
        const rows = (getAt(v, groupPath) as FormValues[] | undefined) ?? []
        return setAt(v, groupPath, [...rows, initialRow(fields)])
      })
    },
    removeRow: (groupPath, index) => {
      setValues((v) => {
        const rows = (getAt(v, groupPath) as FormValues[] | undefined) ?? []
        return setAt(v, groupPath, rows.filter((_, i) => i !== index))
      })
      // row indexes shift, so per-row touched/server state would point at the wrong rows
      setTouched((t) => new Set([...t].filter((p) => !p.startsWith(`${groupPath}[`))))
      setServerErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([p]) => !p.startsWith(`${groupPath}[`))))
    },
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (phase.kind === 'submitting') return
    setSubmitted(true)
    setUnmapped([])
    if (Object.keys(clientErrors).length > 0) {
      setServerErrors({})
      setSummaryFocus((n) => n + 1)
      return
    }
    setPhase({ kind: 'submitting' })
    try {
      const result = await submitForm(schema.id, buildSubmission(resolved))
      if (result.kind === 'ok') {
        clearDraft(schema.id)
        setPhase({ kind: 'done', id: result.id })
        return
      }
      const { fieldErrors, unmapped: rest } = mapServerErrors(result.errors, resolved)
      setServerErrors(fieldErrors)
      setUnmapped(rest)
      setPhase({ kind: 'editing' })
      setSummaryFocus((n) => n + 1)
    } catch (err) {
      setPhase({ kind: 'failed', message: err instanceof Error ? err.message : 'Could not reach the server.' })
    }
  }

  if (phase.kind === 'done') {
    return (
      <section role="status" className="done">
        <h2 ref={doneRef} tabIndex={-1}>
          Submitted
        </h2>
        <p>
          Your {schema.title.toLowerCase()} was received. Reference: <code>{phase.id}</code>
        </p>
        <button type="button" onClick={reset}>
          Submit another response
        </button>
      </section>
    )
  }

  return (
    <FormContext.Provider value={ctx}>
      <form noValidate onSubmit={handleSubmit} aria-labelledby="form-title">
        <h2 id="form-title">{schema.title}</h2>
        {schema.description && <p className="description">{schema.description}</p>}
        {resolved.warnings.map((w) => (
          <p key={w} className="warning" role="note">
            Form configuration warning: {w}
          </p>
        ))}
        <SaveIndicator
          status={status}
          onDiscard={() => {
            clearDraft(schema.id)
            reset()
          }}
        />
        <ErrorSummary ref={summaryRef} items={summaryItems} />
        {resolved.nodes.map((n) => (
          <FieldNode key={n.path} node={n} />
        ))}
        {phase.kind === 'failed' && (
          <p className="error" role="alert">
            {phase.message} Your draft is saved; try again.
          </p>
        )}
        <button type="submit" disabled={phase.kind === 'submitting'}>
          {phase.kind === 'submitting' ? 'Submitting…' : 'Submit'}
        </button>
      </form>
    </FormContext.Provider>
  )
}
