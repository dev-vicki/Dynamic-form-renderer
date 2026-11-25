import { isEmpty } from './conditions'
import type { FieldErrors, ResolvedForm, ResolvedNode } from './types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function validateLeaf(node: ResolvedNode): string | null {
  const { field, value, required, lookup } = node
  const v = field.validation ?? {}
  const label = field.label

  if (isEmpty(value) || (field.type === 'checkbox' && value === false)) {
    return required ? `${label} is required.` : null
  }

  switch (field.type) {
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) return `${label} must be a number.`
      if (v.min !== undefined && value < v.min) return `${label} must be at least ${v.min}.`
      if (v.max !== undefined && value > v.max) return `${label} must be at most ${v.max}.`
      return null
    }
    case 'text': {
      const s = String(value)
      if (v.minLength !== undefined && s.length < v.minLength) return `${label} must be at least ${v.minLength} characters.`
      if (v.maxLength !== undefined && s.length > v.maxLength) return `${label} must be at most ${v.maxLength} characters.`
      if (v.pattern) {
        try {
          if (!new RegExp(v.pattern).test(s)) return v.patternMessage ?? `${label} is not in the expected format.`
        } catch {
          return null // invalid pattern in schema: do not block the user
        }
      }
      return null
    }
    case 'select':
      return (field.options ?? []).some((o) => o.value === value) ? null : `Select a valid option for ${label}.`
    case 'multiselect': {
      const allowed = new Set((field.options ?? []).map((o) => o.value))
      return Array.isArray(value) && value.every((x) => allowed.has(String(x)))
        ? null
        : `Select valid options for ${label}.`
    }
    case 'date': {
      const s = String(value)
      if (!DATE_RE.test(s)) return `Enter a valid date for ${label}.`
      const rules: [string | undefined, (a: string, b: string) => boolean][] = [
        [v.after, (a, b) => a > b],
        [v.before, (a, b) => a < b],
        [v.onOrAfter, (a, b) => a >= b],
        [v.onOrBefore, (a, b) => a <= b],
      ]
      for (const [ref, ok] of rules) {
        if (!ref) continue
        const other = lookup(ref)
        if (typeof other !== 'string' || !DATE_RE.test(other)) continue // other side missing: nothing to compare
        if (!ok(s, other)) return v.message ?? `${label} is not valid relative to ${ref}.`
      }
      return null
    }
    default:
      return null
  }
}

function walk(nodes: ResolvedNode[], errors: FieldErrors) {
  for (const node of nodes) {
    if (!node.visible) continue // hidden fields are never validated
    const { field } = node
    if (field.type === 'section') {
      walk(node.children, errors)
    } else if (field.type === 'group') {
      const count = node.rows.length
      const { min, max } = field.repeat ?? {}
      const noun = (field.itemLabel ?? 'item').toLowerCase()
      if (min !== undefined && count < min) errors[node.path] = `Add at least ${min} ${noun}${min > 1 ? 's' : ''}.`
      else if (max !== undefined && count > max) errors[node.path] = `No more than ${max} ${noun}s allowed.`
      node.rows.forEach((row) => walk(row, errors))
    } else {
      const msg = validateLeaf(node)
      if (msg) errors[node.path] = msg
    }
  }
}

export function validate(resolved: ResolvedForm): FieldErrors {
  const errors: FieldErrors = {}
  walk(resolved.nodes, errors)
  return errors
}

/** Validate a single node (used for on-blur validation). */
export function validateNode(node: ResolvedNode): string | null {
  if (!node.visible || node.field.type === 'section' || node.field.type === 'group') return null
  return validateLeaf(node)
}
