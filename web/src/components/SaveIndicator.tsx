import { formatTime, type SaveStatus } from '../hooks/useDraft'

function describeStatus(s: SaveStatus): string {
  switch (s.state) {
    case 'saving':
      return 'Saving draft…'
    case 'saved':
      return `Draft saved at ${formatTime(s.at)}`
    case 'restored':
      return `Draft restored (last saved at ${formatTime(s.at)})`
    case 'error':
      return 'Could not save draft in this browser'
    default:
      return 'Changes are saved automatically as a draft'
  }
}

export function SaveIndicator({ status, onDiscard }: { status: SaveStatus; onDiscard: () => void }) {
  return (
    <div className="save-bar">
      {/* polite live region: announces "Draft saved" without stealing focus */}
      <p role="status" aria-live="polite" className={`save save-${status.state}`} data-testid="save-indicator">
        {describeStatus(status)}
      </p>
      <button type="button" className="link" onClick={onDiscard}>
        Discard draft and start over
      </button>
    </div>
  )
}
