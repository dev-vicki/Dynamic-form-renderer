import { conditionRefs, evaluateCondition } from './conditions'
import type { FieldSchema, FormSchema, FormValues, Lookup, ResolvedForm, ResolvedNode } from './types'

interface ScopeShape {
  key: string
  names: Set<string>
  parent: ScopeShape | null
}

function namesOf(fields: FieldSchema[]): Set<string> {
  const out = new Set<string>()
  for (const f of fields) {
    out.add(f.name)
    if (f.type === 'section') for (const n of namesOf(f.fields ?? [])) out.add(n)
  }
  return out
}

function resolveRef(scope: ScopeShape, name: string): string | null {
  for (let s: ScopeShape | null = scope; s; s = s.parent) {
    if (s.names.has(name)) return `${s.key}:${name}`
  }
  return null
}

export interface CycleInfo {
  /** node keys ("scopeKey:fieldName") that sit on a cycle */
  cyclic: Set<string>
  /** each cycle as a list of field names */
  cycles: string[][]
}

/**
 * Static check of visibleWhen dependencies (plus child -> containing section).
 * A field on a cycle can never be resolved from values alone, so callers show it.
 */
export function findCycles(schema: FormSchema): CycleInfo {
  const graph = new Map<string, string[]>()
  const walk = (fields: FieldSchema[], scope: ScopeShape, parentKey: string | null) => {
    for (const f of fields) {
      const key = `${scope.key}:${f.name}`
      const deps: string[] = []
      if (parentKey) deps.push(parentKey)
      if (f.visibleWhen) {
        for (const ref of conditionRefs(f.visibleWhen)) {
          const k = resolveRef(scope, ref)
          if (k) deps.push(k)
        }
      }
      graph.set(key, deps)
      if (f.type === 'section') walk(f.fields ?? [], scope, key)
      if (f.type === 'group') {
        walk(f.fields ?? [], { key: `${scope.key}/${f.name}`, names: namesOf(f.fields ?? []), parent: scope }, key)
      }
    }
  }
  walk(schema.fields, { key: '', names: namesOf(schema.fields), parent: null }, null)

  // Tarjan SCC
  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const cyclic = new Set<string>()
  const cycles: string[][] = []
  const strong = (v: string) => {
    index.set(v, counter)
    low.set(v, counter)
    counter++
    stack.push(v)
    onStack.add(v)
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        strong(w)
        low.set(v, Math.min(low.get(v)!, low.get(w)!))
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!))
      }
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = []
      let w: string
      do {
        w = stack.pop()!
        onStack.delete(w)
        comp.push(w)
      } while (w !== v)
      if (comp.length > 1 || (graph.get(v) ?? []).includes(v)) {
        comp.forEach((c) => cyclic.add(c))
        cycles.push(comp.map((c) => c.slice(c.indexOf(':') + 1)).reverse())
      }
    }
  }
  for (const v of graph.keys()) if (!index.has(v)) strong(v)
  return { cyclic, cycles }
}

export function resolveForm(schema: FormSchema, values: FormValues): ResolvedForm {
  const { cyclic, cycles } = findCycles(schema)
  const warnings = cycles.map(
    (c) => `Circular visibility dependency between ${c.join(', ')}; these fields are always shown.`,
  )
  const nodes = resolveScope(schema.fields, values, null, '', '', cyclic)
  return { nodes, warnings }
}

function resolveScope(
  fields: FieldSchema[],
  values: FormValues,
  parentLookup: Lookup | null,
  pathPrefix: string,
  scopeKey: string,
  cyclic: Set<string>,
): ResolvedNode[] {
  const index = new Map<string, { field: FieldSchema; parent: string | null }>()
  const indexFields = (fs: FieldSchema[], parent: string | null) => {
    for (const f of fs) {
      index.set(f.name, { field: f, parent })
      if (f.type === 'section') indexFields(f.fields ?? [], f.name)
    }
  }
  indexFields(fields, null)

  const memo = new Map<string, boolean>()
  const visiting = new Set<string>()

  const lookup: Lookup = (name) => {
    const entry = index.get(name)
    if (entry) return vis(name) ? values[name] : undefined // hidden => behaves as empty
    return parentLookup ? parentLookup(name) : undefined
  }

  function vis(name: string): boolean {
    const cached = memo.get(name)
    if (cached !== undefined) return cached
    if (visiting.has(name)) return true // defensive; static cycle check should prevent this
    visiting.add(name)
    const { field, parent } = index.get(name)!
    let v = true
    if (field.visibleWhen && !cyclic.has(`${scopeKey}:${name}`)) {
      v = evaluateCondition(field.visibleWhen, lookup)
    }
    if (v && parent) v = vis(parent)
    visiting.delete(name)
    memo.set(name, v)
    return v
  }

  const build = (fs: FieldSchema[]): ResolvedNode[] =>
    fs.map((f) => {
      const visible = vis(f.name)
      const path = pathPrefix + f.name
      const required =
        visible && (f.required === true || (f.requiredWhen ? evaluateCondition(f.requiredWhen, lookup) : false))
      const node: ResolvedNode = {
        field: f,
        path,
        visible,
        required,
        value: values[f.name],
        lookup,
        children: [],
        rows: [],
      }
      if (f.type === 'section') node.children = build(f.fields ?? [])
      if (f.type === 'group' && visible) {
        const rows = Array.isArray(values[f.name]) ? (values[f.name] as FormValues[]) : []
        node.rows = rows.map((row, i) =>
          resolveScope(f.fields ?? [], row ?? {}, lookup, `${path}[${i}].`, `${scopeKey}/${f.name}`, cyclic),
        )
      }
      return node
    })

  return build(fields)
}
