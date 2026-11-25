import { forwardRef } from 'react'
import { focusField } from './FormContext'

export interface SummaryItem {
  /** field path, or null for server errors that match no visible field */
  path: string | null
  text: string
}

/** Focused after a failed submit so screen readers read it and users can jump to each field. */
export const ErrorSummary = forwardRef<HTMLDivElement, { items: SummaryItem[] }>(function ErrorSummary({ items }, ref) {
  if (items.length === 0) return null
  return (
    <div ref={ref} className="summary" tabIndex={-1} role="group" aria-labelledby="error-summary-title">
      <h3 id="error-summary-title">
        {items.length === 1 ? 'There is 1 problem with your submission' : `There are ${items.length} problems with your submission`}
      </h3>
      <ul>
        {items.map((it, i) => (
          <li key={`${it.path ?? 'form'}-${i}`}>
            {it.path ? (
              <a
                href={`#${it.path}`}
                onClick={(e) => {
                  e.preventDefault()
                  focusField(it.path!)
                }}
              >
                {it.text}
              </a>
            ) : (
              it.text
            )}
          </li>
        ))}
      </ul>
    </div>
  )
})
