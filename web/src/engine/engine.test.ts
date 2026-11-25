import { describe, expect, it } from 'vitest'
import {
  buildSubmission,
  collectPaths,
  evaluateCondition,
  findCycles,
  getAt,
  initialValues,
  mapServerErrors,
  resolveForm,
  restoreDraft,
  setAt,
  validate,
} from './index'
import type { FormValues, ResolvedNode } from './types'
import { complaintSchema, householdSchema, vaccinationSchema } from '../test/schemas'

const find = (nodes: ResolvedNode[], path: string): ResolvedNode | undefined => {
  for (const n of nodes) {
    if (n.path === path) return n
    const hit = find(n.children, path) ?? n.rows.map((r) => find(r, path)).find(Boolean)
    if (hit) return hit
  }
}

describe('evaluateCondition', () => {
  const lk = (m: Record<string, unknown>) => (n: string) => m[n]
  it('eq / neq with missing values', () => {
    expect(evaluateCondition({ field: 'a', value: 'x' }, lk({ a: 'x' }))).toBe(true)
    expect(evaluateCondition({ field: 'a', value: 'x' }, lk({}))).toBe(false)
    expect(evaluateCondition({ field: 'a', op: 'neq', value: true }, lk({}))).toBe(true)
  })
  it('in, contains, filled, all, any', () => {
    expect(evaluateCondition({ field: 'a', op: 'in', value: ['x', 'y'] }, lk({ a: 'y' }))).toBe(true)
    expect(evaluateCondition({ field: 'a', op: 'contains', value: 'x' }, lk({ a: ['x'] }))).toBe(true)
    expect(evaluateCondition({ field: 'a', op: 'filled' }, lk({ a: '' }))).toBe(false)
    expect(evaluateCondition({ field: 'a', op: 'filled' }, lk({ a: false }))).toBe(false)
    expect(evaluateCondition({ all: [{ field: 'a' , value: 1 }, { field: 'b', value: 2 }] }, lk({ a: 1, b: 2 }))).toBe(true)
    expect(evaluateCondition({ any: [{ field: 'a', value: 9 }, { field: 'b', value: 2 }] }, lk({ b: 2 }))).toBe(true)
  })
  it('numeric comparison, empty is never greater', () => {
    expect(evaluateCondition({ field: 'a', op: 'gt', value: 5 }, lk({ a: 10 }))).toBe(true)
    expect(evaluateCondition({ field: 'a', op: 'gt', value: 5 }, lk({}))).toBe(false)
  })
})

describe('paths', () => {
  it('get/set with array rows is immutable', () => {
    const v = { members: [{ name: 'a' }] }
    const next = setAt(v, 'members[1].name', 'b')
    expect(getAt(next, 'members[1].name')).toBe('b')
    expect(v.members).toHaveLength(1)
  })
})

describe('household schema', () => {
  it('shows rent only for rented dwelling and requires it then', () => {
    let values: FormValues = { ...initialValues(householdSchema), dwellingType: 'owned' }
    expect(find(resolveForm(householdSchema, values).nodes, 'monthlyRent')?.visible).toBe(false)
    values = { ...values, dwellingType: 'rented' }
    const rent = find(resolveForm(householdSchema, values).nodes, 'monthlyRent')
    expect(rent?.visible).toBe(true)
    expect(rent?.required).toBe(true)
    expect(validate(resolveForm(householdSchema, values)).monthlyRent).toMatch(/required/)
  })

  it('hidden value is kept in state, excluded from submit and validation, and restored on re-show', () => {
    let values: FormValues = { ...initialValues(householdSchema), dwellingType: 'rented', monthlyRent: -5 }
    expect(validate(resolveForm(householdSchema, values)).monthlyRent).toMatch(/at least 0/)
    values = { ...values, dwellingType: 'owned' }
    const hidden = resolveForm(householdSchema, values)
    expect(validate(hidden).monthlyRent).toBeUndefined()
    expect(buildSubmission(hidden)).not.toHaveProperty('monthlyRent')
    values = { ...values, dwellingType: 'rented' }
    expect(find(resolveForm(householdSchema, values).nodes, 'monthlyRent')?.value).toBe(-5)
  })

  it('validates regex, min/max and per-row conditional requiredness', () => {
    const values: FormValues = {
      ...initialValues(householdSchema),
      headName: 'Asha',
      mobile: '12345',
      address: 'x',
      dwellingType: 'owned',
      consent: true,
      members: [{ name: 'Asha', age: 200, relationship: 'self', isEarning: true }],
    }
    const errors = validate(resolveForm(householdSchema, values))
    expect(errors.mobile).toMatch(/valid 10-digit/)
    expect(errors['members[0].age']).toMatch(/at most 120/)
    expect(errors['members[0].occupation']).toMatch(/required/)
  })

  it('enforces repeat min and a checked required checkbox', () => {
    const values = { ...initialValues(householdSchema), members: [] }
    const errors = validate(resolveForm(householdSchema, values))
    expect(errors.members).toMatch(/at least 1/i)
    expect(errors.consent).toMatch(/required/)
  })
})

describe('vaccination-visit schema', () => {
  const base: FormValues = {
    ...initialValues(vaccinationSchema),
    patientName: 'P',
    dateOfBirth: '2000-01-01',
    visitDate: '2026-05-10',
    vaccine: 'mmr',
    doseType: 'followup',
  }

  it('cross-field date rules', () => {
    const errors = validate(
      resolveForm(vaccinationSchema, { ...base, previousDoseDate: '2026-06-01', dateOfBirth: '2027-01-01' }),
    )
    expect(errors.previousDoseDate).toMatch(/before this visit/)
    expect(errors.dateOfBirth).toMatch(/before the visit date/)
  })

  it('group nested in a conditional section: hidden until checkbox, then validated per row', () => {
    expect(collectPaths(resolveForm(vaccinationSchema, base))).not.toContain('reactions')
    const values = {
      ...base,
      hadReaction: true,
      reactions: [{ symptom: 'other', severity: 'mild', onsetDate: '2026-05-01' }],
    }
    const resolved = resolveForm(vaccinationSchema, values)
    expect(collectPaths(resolved)).toContain('reactions[0].onsetDate')
    const errors = validate(resolved)
    expect(errors['reactions[0].symptomOther']).toMatch(/required/)
    expect(errors['reactions[0].onsetDate']).toMatch(/before the visit/)
  })

  it('rows of a hidden section are not submitted or validated', () => {
    const values = { ...base, hadReaction: false, reactions: [{ symptom: 'x' }] }
    const resolved = resolveForm(vaccinationSchema, values)
    expect(buildSubmission(resolved)).not.toHaveProperty('reactions')
    expect(Object.keys(validate(resolved)).some((k) => k.startsWith('reactions'))).toBe(false)
  })
})

describe('complaint schema: circular visibility', () => {
  it('detects the cycle and fails safe by showing both fields', () => {
    const { cycles } = findCycles(complaintSchema)
    expect(cycles).toHaveLength(1)
    expect(cycles[0].sort()).toEqual(['escalate', 'escalationReason'])
    const resolved = resolveForm(complaintSchema, initialValues(complaintSchema))
    expect(resolved.warnings[0]).toMatch(/Circular/)
    expect(find(resolved.nodes, 'escalate')?.visible).toBe(true)
    expect(find(resolved.nodes, 'escalationReason')?.visible).toBe(true)
  })

  it('other schemas have no cycles', () => {
    expect(findCycles(householdSchema).cycles).toHaveLength(0)
    expect(findCycles(vaccinationSchema).cycles).toHaveLength(0)
  })

  it('anonymous hides and un-requires name/email; end date must be after start', () => {
    const values: FormValues = {
      ...initialValues(complaintSchema),
      anonymous: true,
      category: 'water',
      severity: 'high',
      incidentDate: '2026-05-10',
      resolvedDate: '2026-05-10',
      description: 'Water not coming for days',
    }
    const errors = validate(resolveForm(complaintSchema, values))
    expect(errors.complainantName).toBeUndefined()
    expect(errors.urgentReason).toMatch(/required/)
    expect(errors.resolvedDate).toMatch(/after the start date/)
  })
})

describe('server errors and drafts', () => {
  it('maps 422 field errors, including array rows and dotted indexes; reports unknown ones', () => {
    const values = { ...initialValues(householdSchema), members: [{ name: 'a' }, { name: 'a' }] }
    const resolved = resolveForm(householdSchema, values)
    const { fieldErrors, unmapped } = mapServerErrors(
      [
        { field: 'mobile', message: 'taken' },
        { field: 'members.1.name', message: 'dup' },
        { field: 'nope', message: 'x' },
      ],
      resolved,
    )
    expect(fieldErrors).toEqual({ mobile: 'taken', 'members[1].name': 'dup' })
    expect(unmapped).toEqual([{ field: 'nope', message: 'x' }])
  })

  it('restoreDraft drops unknown keys and mistyped values, keeps minimum rows', () => {
    const draft = { headName: 'Asha', gone: 1, mobile: 5, dwellingType: 'castle', members: [] }
    const restored = restoreDraft(householdSchema, draft)
    expect(restored.headName).toBe('Asha')
    expect(restored).not.toHaveProperty('gone')
    expect(restored.mobile).toBeUndefined()
    expect(restored.dwellingType).toBeUndefined()
    expect(restored.members).toHaveLength(1)
  })
})
