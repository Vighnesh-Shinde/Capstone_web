/**
 * What a page shows while it is fetching.
 *
 * Every page previously wrote its own `<p className="muted">Loading…</p>`,
 * eighteen times over. Besides the duplication, a bare line of text collapses
 * the layout to nothing and then snaps it back when data lands, which reads as
 * a flicker rather than as progress.
 *
 * The skeleton variants hold roughly the shape of what is coming, so the page
 * does not jump when it arrives. `rows` is a hint, not a promise — matching the
 * real row count exactly would mean the loading state had to know how many
 * records the server was about to return.
 */
export default function LoadingState({ variant = "text", rows = 3, label = "Loading" }) {
  // One live region per page announces the wait once, rather than each
  // individual shimmer block being read out.
  const shell = (children) => (
    <div className="loading-state" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );

  if (variant === "cards") {
    return shell(
      <div className="skeleton-cards">
        {Array.from({ length: rows }).map((_, i) => (
          <div className="skeleton-card" key={i} aria-hidden="true">
            <span className="skeleton skeleton-line short" />
            <span className="skeleton skeleton-line tall" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return shell(
      <div className="skeleton-table" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div className="skeleton-row" key={i}>
            <span className="skeleton skeleton-line" style={{ width: "22%" }} />
            <span className="skeleton skeleton-line" style={{ width: "30%" }} />
            <span className="skeleton skeleton-line" style={{ width: "18%" }} />
            <span className="skeleton skeleton-line" style={{ width: "20%" }} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "panel") {
    return shell(
      <div className="skeleton-panel" aria-hidden="true">
        <span className="skeleton skeleton-line" style={{ width: "38%" }} />
        <span className="skeleton skeleton-line" style={{ width: "92%" }} />
        <span className="skeleton skeleton-line" style={{ width: "76%" }} />
      </div>
    );
  }

  // Plain text: for small inline waits where a skeleton would be heavier than
  // the thing it stands in for.
  return shell(<p className="muted loading-text">{label}…</p>);
}
