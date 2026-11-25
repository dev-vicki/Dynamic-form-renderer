import { useEffect, useRef, useState } from 'react'
import { restoreDraft } from '../engine'
import type { FormSchema, FormValues } from '../engine/types'

export const DEBOUNCE_MS = 500
const keyFor = (formId: string) => `form-draft:${formId}`

export interface LoadedDraft {
  values: FormValues
  savedAt: number
}

export function loadDraft(schema: FormSchema): LoadedDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(schema.id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt?: number; values?: unknown }
    return { values: restoreDraft(schema, parsed.values), savedAt: parsed.savedAt ?? Date.now() }
  } catch {
    return null // corrupt or unavailable storage: start fresh
  }
}

export function clearDraft(formId: string): void {
  try {
    localStorage.removeItem(keyFor(formId))
  } catch {
    /* storage unavailable */
  }
}

export type SaveStatus =
  | { state: 'idle' }
  | { state: 'restored'; at: number }
  | { state: 'saving' }
  | { state: 'saved'; at: number }
  | { state: 'error' }

/** Debounced autosave of `values`. Does nothing until values actually change. */
export function useAutosave(schema: FormSchema, values: FormValues, enabled: boolean, restoredAt?: number): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>(restoredAt ? { state: 'restored', at: restoredAt } : { state: 'idle' })
  const baseline = useRef(values)

  useEffect(() => {
    if (!enabled || values === baseline.current) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus({ state: 'saving' })
    const timer = setTimeout(() => {
      const at = Date.now()
      try {
        localStorage.setItem(keyFor(schema.id), JSON.stringify({ version: schema.version, savedAt: at, values }))
        setStatus({ state: 'saved', at })
      } catch {
        setStatus({ state: 'error' })
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [values, enabled, schema.id, schema.version])

  return status
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
