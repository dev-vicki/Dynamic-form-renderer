export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'section' // container; children values are stored flat in the same scope
  | 'group' // repeating group; value is an array of row objects

export type Op =
  | 'eq'
  | 'neq'
  | 'in'
  | 'notIn'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'filled'
  | 'empty'

export type Condition =
  | { field: string; op?: Op; value?: unknown }
  | { all: Condition[] }
  | { any: Condition[] }

export interface Validation {
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  patternMessage?: string
  // cross-field date rules: name of another field (row first, then form root)
  after?: string
  before?: string
  onOrAfter?: string
  onOrBefore?: string
  message?: string
}

export interface Option {
  value: string
  label: string
}

export interface FieldSchema {
  name: string
  label: string
  type: FieldType
  required?: boolean
  helpText?: string
  options?: Option[]
  visibleWhen?: Condition
  requiredWhen?: Condition
  validation?: Validation
  fields?: FieldSchema[]
  repeat?: { min?: number; max?: number }
  itemLabel?: string
}

export interface FormSchema {
  id: string
  title: string
  description?: string
  version: number
  fields: FieldSchema[]
}

export type FormValues = Record<string, unknown>
export type Lookup = (name: string) => unknown

export interface ResolvedNode {
  field: FieldSchema
  /** e.g. `headName`, `members[0].age` (sections do not appear in paths) */
  path: string
  visible: boolean
  required: boolean
  /** raw stored value (kept even while hidden so it can be restored) */
  value: unknown
  /** effective-value lookup in this node's scope (row first, then parents) */
  lookup: Lookup
  /** sections */
  children: ResolvedNode[]
  /** groups: one list of nodes per row */
  rows: ResolvedNode[][]
}

export interface ResolvedForm {
  nodes: ResolvedNode[]
  /** human-readable config problems, e.g. circular visibility */
  warnings: string[]
}

export type FieldErrors = Record<string, string>

export interface ServerError {
  field: string
  message: string
}
