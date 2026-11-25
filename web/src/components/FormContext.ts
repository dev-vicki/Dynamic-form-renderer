import { createContext, useContext } from 'react'
import type { FieldErrors, FieldSchema } from '../engine/types'

export interface FormCtx {
  /** errors currently allowed to be shown, keyed by path */
  errors: FieldErrors
  setValue: (path: string, value: unknown) => void
  blur: (path: string) => void
  addRow: (groupPath: string, fields: FieldSchema[]) => void
  removeRow: (groupPath: string, index: number) => void
}

export const FormContext = createContext<FormCtx | null>(null)

export function useFormCtx(): FormCtx {
  const ctx = useContext(FormContext)
  if (!ctx) throw new Error('useFormCtx must be used inside a FormContext provider')
  return ctx
}

/** DOM id for a field path: members[0].age -> f-members-0-age */
export function fieldId(path: string): string {
  return 'f-' + path.replace(/[[\].]+/g, '-').replace(/-$/, '')
}

/** Focus the control for a path (inputs, selects, first checkbox of a set, group "Add" button). */
export function focusField(path: string): void {
  const id = fieldId(path)
  const el = document.getElementById(id) ?? document.getElementById(`${id}-opt-0`)
  el?.focus()
}
