import type { FormSchema, ServerError } from '../engine/types'

const BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export interface FormSummary {
  id: string
  title: string
}

export type SubmitResult =
  | { kind: 'ok'; id: string }
  | { kind: 'invalid'; message: string; errors: ServerError[] }

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

export async function listForms(signal?: AbortSignal): Promise<FormSummary[]> {
  const res = await fetch(`${BASE}/forms`, { signal })
  if (!res.ok) throw new Error(`Could not load forms (${res.status})`)
  return json<FormSummary[]>(res)
}

export async function getForm(id: string, signal?: AbortSignal): Promise<FormSchema> {
  const res = await fetch(`${BASE}/forms/${encodeURIComponent(id)}`, { signal })
  if (!res.ok) throw new Error(`Could not load form "${id}" (${res.status})`)
  return json<FormSchema>(res)
}

/** 201 -> ok, 422 -> invalid with field errors, anything else throws. */
export async function submitForm(id: string, data: unknown): Promise<SubmitResult> {
  const res = await fetch(`${BASE}/forms/${encodeURIComponent(id)}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (res.status === 422) {
    const body = await json<{ message?: string; errors?: ServerError[] }>(res)
    return { kind: 'invalid', message: body.message ?? 'Validation failed', errors: body.errors ?? [] }
  }
  if (!res.ok) throw new Error(`Submission failed (${res.status})`)
  const body = await json<{ id: string }>(res)
  return { kind: 'ok', id: body.id }
}
