import { useEffect, useState } from 'react'
import { getForm, listForms, type FormSummary } from './api/client'
import { FormRenderer } from './components/FormRenderer'
import type { FormSchema } from './engine/types'

function useHashId(): string {
  const read = () => window.location.hash.replace(/^#\/?/, '')
  const [id, setId] = useState(read)
  useEffect(() => {
    const onChange = () => setId(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return id
}

export default function App() {
  const hashId = useHashId()
  const [forms, setForms] = useState<FormSummary[] | null>(null)
  const [schema, setSchema] = useState<FormSchema | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    listForms(ctrl.signal)
      .then(setForms)
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load forms')
      })
    return () => ctrl.abort()
  }, [])

  const selected = hashId || forms?.[0]?.id || ''

  useEffect(() => {
    if (!selected) return
    const ctrl = new AbortController()
    setSchema(null)
    setError(null)
    getForm(selected, ctrl.signal)
      .then((s) => {
        setSchema(s)
        document.title = `${s.title} – Dynamic Form Renderer`
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load form')
      })
    return () => ctrl.abort()
  }, [selected])

  return (
    <>
      <a className="skip" href="#main">
        Skip to form
      </a>
      <header className="site-header">
        <div className="header-inner">
          <div>
            <h1>Dynamic Form Renderer</h1>
            <p className="tagline">Forms driven by JSON configuration</p>
          </div>
        </div>
        <nav aria-label="Forms">
          <ul>
            {(forms ?? []).map((f) => (
              <li key={f.id}>
                <a href={`#/${f.id}`} aria-current={f.id === selected ? 'page' : undefined}>
                  {f.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {error && (
          <p className="error" role="alert">
            {error}. Is the mock API running?
          </p>
        )}
        {!error && !schema && <p role="status">Loading form…</p>}
        {schema && <FormRenderer key={schema.id} schema={schema} />}
      </main>
    </>
  )
}
