import { isEmpty } from './conditions'
import type { FieldErrors, FormValues, ResolvedForm, ResolvedNode, ServerError } from './types'

/** Payload to send: visible fields only. Hidden values are excluded (but stay in state). */
export function buildSubmission(resolved: ResolvedForm): FormValues {
  const collect = (nodes: ResolvedNode[]): FormValues => {
    const out: FormValues = {}
    for (const n of nodes) {
      if (!n.visible) continue
      const { field } = n
      if (field.type === 'section') Object.assign(out, collect(n.children))
      else if (field.type === 'group') out[field.name] = n.rows.map(collect)
      else if (field.type === 'checkbox') out[field.name] = n.value === true
      else if (!isEmpty(n.value)) out[field.name] = n.value
    }
    return out
  }
  return collect(resolved.nodes)
}

/** Paths of every visible input node (leaf fields and groups). */
export function collectPaths(resolved: ResolvedForm): string[] {
  const out: string[] = []
  const walk = (nodes: ResolvedNode[]) => {
    for (const n of nodes) {
      if (!n.visible) continue
      if (n.field.type === 'section') walk(n.children)
      else {
        out.push(n.path)
        if (n.field.type === 'group') n.rows.forEach(walk)
      }
    }
  }
  walk(resolved.nodes)
  return out
}

/** Server paths may use `a.0.b` or `a[0].b`; normalise to brackets. */
function normalisePath(p: string): string {
  return p.replace(/\.(\d+)(?=\.|$)/g, '[$1]')
}

export function mapServerErrors(
  errors: ServerError[],
  resolved: ResolvedForm,
): { fieldErrors: FieldErrors; unmapped: ServerError[] } {
  const known = new Set(collectPaths(resolved))
  const fieldErrors: FieldErrors = {}
  const unmapped: ServerError[] = []
  for (const e of errors) {
    const path = normalisePath(e.field)
    if (known.has(path)) fieldErrors[path] = fieldErrors[path] ? `${fieldErrors[path]} ${e.message}` : e.message
    else unmapped.push(e)
  }
  return { fieldErrors, unmapped }
}
