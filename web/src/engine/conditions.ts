import type { Condition, Lookup } from './types'

export function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (a === undefined || a === null || b === undefined || b === null) return false
  if (typeof a === typeof b) return a === b
  return String(a) === String(b)
}

function compare(a: unknown, b: unknown): number | null {
  if (isEmpty(a) || isEmpty(b)) return null
  const na = Number(a)
  const nb = Number(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  const sa = String(a)
  const sb = String(b)
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

export function evaluateCondition(cond: Condition, lookup: Lookup): boolean {
  if ('all' in cond) return cond.all.every((c) => evaluateCondition(c, lookup))
  if ('any' in cond) return cond.any.some((c) => evaluateCondition(c, lookup))

  const v = lookup(cond.field)
  const expected = cond.value
  switch (cond.op ?? 'eq') {
    case 'eq':
      return looseEqual(v, expected)
    case 'neq':
      return !looseEqual(v, expected)
    case 'in':
      return Array.isArray(expected) && expected.some((e) => looseEqual(v, e))
    case 'notIn':
      return !(Array.isArray(expected) && expected.some((e) => looseEqual(v, e)))
    case 'contains':
      return Array.isArray(v) && v.some((e) => looseEqual(e, expected))
    case 'gt':
      return (compare(v, expected) ?? NaN) > 0
    case 'gte':
      return (compare(v, expected) ?? NaN) >= 0
    case 'lt':
      return (compare(v, expected) ?? NaN) < 0
    case 'lte':
      return (compare(v, expected) ?? NaN) <= 0
    case 'filled':
      return !isEmpty(v) && v !== false
    case 'empty':
      return isEmpty(v) || v === false
    default:
      return false
  }
}

/** Field names a condition reads. */
export function conditionRefs(cond: Condition): string[] {
  if ('all' in cond) return cond.all.flatMap(conditionRefs)
  if ('any' in cond) return cond.any.flatMap(conditionRefs)
  return [cond.field]
}
