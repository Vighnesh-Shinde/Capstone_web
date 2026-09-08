/**
 * Shown when a request failed.
 *
 * Deliberately separate from EmptyState: "there is nothing here" and "we could
 * not find out what is here" look identical to a user if both render as grey
 * text, and only one of them is worth retrying.
 *
 * `role="alert"` so a screen reader announces a failure that appears after the
 * page has already settled, rather than leaving it silent.
 */
export default function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  // Defaults to h2 for the same reason as EmptyState: these usually stand in
  // for a page's main content, directly beneath its h1.
  headingLevel = 2,
}) {
  const Heading = `h${headingLevel}`;

  return (
    <div className="error-state" role="alert">
      <span className="error-state-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
             strokeWidth="1.9" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5M12 16.2v.4" />
        </svg>
      </span>
      <div>
        <Heading className="error-state-title">{title}</Heading>
        {/* The caller passes a message already written for a person. Raw
            exception text never reaches here — it tells the user nothing and
            leaks how the server is built. */}
        {message && <p className="muted">{message}</p>}
        {onRetry && (
          <button type="button" className="btn-secondary" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
