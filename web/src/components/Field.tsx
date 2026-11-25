import { useEffect, useRef } from 'react'
import type { ResolvedNode } from '../engine/types'
import { fieldId, useFormCtx } from './FormContext'

export function FieldNode({ node }: { node: ResolvedNode }) {
  if (!node.visible) return null // hidden fields are removed from the DOM, tab order and a11y tree
  const { field } = node
  if (field.type === 'section') {
    return (
      <fieldset className="section">
        <legend>{field.label}</legend>
        {node.children.map((c) => (
          <FieldNode key={c.path} node={c} />
        ))}
      </fieldset>
    )
  }
  if (field.type === 'group') return <RepeatingGroup node={node} />
  return <Control node={node} />
}

function Control({ node }: { node: ResolvedNode }) {
  const { errors, setValue, blur } = useFormCtx()
  const { field, path, required, value } = node
  const id = fieldId(path)
  const error = errors[path]
  const helpId = field.helpText ? `${id}-help` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined

  const label = (
    <>
      {field.label}
      {required && (
        <span aria-hidden="true" className="req">
          {' '}
          *
        </span>
      )}
    </>
  )
  const help = helpId && (
    <p id={helpId} className="help">
      {field.helpText}
    </p>
  )
  // role="alert" makes screen readers announce the message when it appears
  const err = error && (
    <p id={errorId} className="error" role="alert">
      {error}
    </p>
  )

  if (field.type === 'checkbox') {
    return (
      <div className="field field-check">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => setValue(path, e.target.checked)}
          onBlur={() => blur(path)}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <label htmlFor={id}>{label}</label>
        {help}
        {err}
      </div>
    )
  }

  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? (value as string[]) : []
    return (
      <fieldset
        className="field"
        aria-describedby={describedBy}
        aria-required={required || undefined}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) blur(path)
        }}
      >
        <legend>{label}</legend>
        {help}
        {(field.options ?? []).map((o, i) => (
          <div key={o.value} className="field-check">
            <input
              id={`${id}-opt-${i}`}
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={(e) =>
                setValue(path, e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))
              }
            />
            <label htmlFor={`${id}-opt-${i}`}>{o.label}</label>
          </div>
        ))}
        {err}
      </fieldset>
    )
  }

  const common = {
    id,
    onBlur: () => blur(path),
    'aria-required': required || undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  } as const

  let control
  if (field.type === 'select') {
    control = (
      <select {...common} value={typeof value === 'string' ? value : ''} onChange={(e) => setValue(path, e.target.value || undefined)}>
        <option value="">Select…</option>
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  } else if (field.type === 'number') {
    control = (
      <input
        {...common}
        type="number"
        value={typeof value === 'number' ? value : ''}
        onChange={(e) => setValue(path, e.target.value === '' ? undefined : Number(e.target.value))}
      />
    )
  } else {
    control = (
      <input
        {...common}
        type={field.type === 'date' ? 'date' : 'text'}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => setValue(path, e.target.value)}
      />
    )
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {help}
      {control}
      {err}
    </div>
  )
}

function RepeatingGroup({ node }: { node: ResolvedNode }) {
  const { errors, addRow, removeRow } = useFormCtx()
  const { field, path } = node
  const id = fieldId(path)
  const error = errors[path]
  const item = field.itemLabel ?? 'Item'
  const count = node.rows.length
  const max = field.repeat?.max
  const addRef = useRef<HTMLButtonElement>(null)
  // After add/remove, move focus somewhere sensible instead of dropping it to <body>.
  const pending = useRef<'add' | 'remove' | null>(null)
  const prevCount = useRef(count)

  useEffect(() => {
    if (count !== prevCount.current) {
      if (pending.current === 'add') {
        const rows = document.querySelectorAll<HTMLElement>(`[data-group="${path}"] > .row`)
        rows[rows.length - 1]?.querySelector<HTMLElement>('input, select, button')?.focus()
      } else if (pending.current === 'remove') {
        addRef.current?.focus()
      }
      pending.current = null
      prevCount.current = count
    }
  }, [count, path])

  return (
    <fieldset className="section group" data-group={path} aria-describedby={error ? `${id}-error` : undefined}>
      <legend>{field.label}</legend>
      {node.rows.map((row, i) => (
        <fieldset key={`${path}[${i}]`} className="row">
          <legend>
            {item} {i + 1}
          </legend>
          {row.map((c) => (
            <FieldNode key={c.path} node={c} />
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              pending.current = 'remove'
              removeRow(path, i)
            }}
            aria-label={`Remove ${item} ${i + 1}`}
          >
            Remove {item.toLowerCase()}
          </button>
        </fieldset>
      ))}
      {error && (
        <p id={`${id}-error`} className="error" role="alert">
          {error}
        </p>
      )}
      <button
        ref={addRef}
        id={id}
        type="button"
        onClick={() => {
          pending.current = 'add'
          addRow(path, field.fields ?? [])
        }}
        disabled={max !== undefined && count >= max}
      >
        Add {item.toLowerCase()}
      </button>
    </fieldset>
  )
}
