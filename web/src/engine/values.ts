import type { FieldSchema, FormSchema, FormValues } from './types'

export type PathSegment = string | number

/** "members[1].name" -> ["members", 1, "name"] */
export function parsePath(path: string): PathSegment[] {
  const out: PathSegment[] = []
  for (const part of path.split('.')) {
    const m = /^([^[\]]+)((?:\[\d+\])*)$/.exec(part)
    if (!m) {
      out.push(part)
      continue
    }
    out.push(m[1])
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) out.push(Number(idx[1]))
  }
  return out
}

export function getAt(values: unknown, path: string): unknown {
  let cur: unknown = values
  for (const seg of parsePath(path)) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<PathSegment, unknown>)[seg]
  }
  return cur
}

/** Immutable set. Creates intermediate arrays/objects as needed. */
export function setAt<T>(root: T, path: string, value: unknown): T {
  const segs = parsePath(path)
  const rec = (node: unknown, i: number): unknown => {
    if (i === segs.length) return value
    const seg = segs[i]
    const child = node === null || typeof node !== 'object' ? undefined : (node as Record<PathSegment, unknown>)[seg]
    const next = rec(child, i + 1)
    if (typeof seg === 'number') {
      const arr = Array.isArray(node) ? [...node] : []
      arr[seg] = next
      return arr
    }
    return { ...(node as object | undefined), [seg]: next }
  }
  return rec(root, 0) as T
}

function initialFor(fields: FieldSchema[]): FormValues {
  const out: FormValues = {}
  for (const f of fields) {
    if (f.type === 'section') Object.assign(out, initialFor(f.fields ?? []))
    else if (f.type === 'group') {
      out[f.name] = Array.from({ length: f.repeat?.min ?? 0 }, () => initialFor(f.fields ?? []))
    } else if (f.type === 'checkbox') out[f.name] = false
    else if (f.type === 'multiselect') out[f.name] = []
  }
  return out
}

export function initialValues(schema: FormSchema): FormValues {
  return initialFor(schema.fields)
}

function sanitizeScalar(f: FieldSchema, v: unknown): unknown {
  switch (f.type) {
    case 'text':
    case 'date':
      return typeof v === 'string' ? v : undefined
    case 'number':
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined
    case 'checkbox':
      return typeof v === 'boolean' ? v : undefined
    case 'select':
      return typeof v === 'string' && (f.options ?? []).some((o) => o.value === v) ? v : undefined
    case 'multiselect': {
      if (!Array.isArray(v)) return undefined
      const allowed = new Set((f.options ?? []).map((o) => o.value))
      return v.filter((x): x is string => typeof x === 'string' && allowed.has(x))
    }
    default:
      return undefined
  }
}

function sanitizeScope(fields: FieldSchema[], raw: unknown): FormValues {
  const src = raw !== null && typeof raw === 'object' ? (raw as FormValues) : {}
  const out: FormValues = {}
  for (const f of fields) {
    if (f.type === 'section') {
      Object.assign(out, sanitizeScope(f.fields ?? [], src))
    } else if (f.type === 'group') {
      const rows = Array.isArray(src[f.name]) ? (src[f.name] as unknown[]) : []
      out[f.name] = rows.map((r) => sanitizeScope(f.fields ?? [], r))
    } else {
      const v = sanitizeScalar(f, src[f.name])
      if (v !== undefined) out[f.name] = v
    }
  }
  return out
}

/**
 * Merge a stored draft onto fresh initial values, dropping keys that are not in
 * the (possibly newer) schema and values whose type no longer fits.
 */
export function restoreDraft(schema: FormSchema, draft: unknown): FormValues {
  const base = initialValues(schema)
  const clean = sanitizeScope(schema.fields, draft)
  const merged: FormValues = { ...base, ...clean }
  // keep at least the minimum number of rows for groups
  const fix = (fields: FieldSchema[], scope: FormValues) => {
    for (const f of fields) {
      if (f.type === 'section') fix(f.fields ?? [], scope)
      else if (f.type === 'group') {
        const rows = (scope[f.name] as FormValues[]) ?? []
        const min = f.repeat?.min ?? 0
        while (rows.length < min) rows.push(initialFor(f.fields ?? []))
        scope[f.name] = rows
        rows.forEach((r) => fix(f.fields ?? [], r))
      }
    }
  }
  fix(schema.fields, merged)
  return merged
}
