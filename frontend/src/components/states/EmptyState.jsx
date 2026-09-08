import { Link } from "react-router-dom";

/**
 * Shown when a list or panel has nothing in it.
 *
 * An empty screen has to answer "is this broken, or have I just not done
 * anything yet?" — and then say what to do next. A bare "No results" answers
 * neither, which is what most of these screens showed before.
 *
 * The icon is decorative and hidden from assistive technology; the heading and
 * body carry the meaning.
 */
export default function EmptyState({ icon, title, children, action, headingLevel = 2 }) {
  // Configurable, defaulting to h2. These panels usually replace a page's
  // whole content area, sitting directly under its h1 — a hardcoded h3 skipped
  // a level there, which is exactly the kind of thing a screen-reader user
  // navigating by heading notices and a sighted reviewer never does. Callers
  // nested inside a section that already has an h2 pass headingLevel={3}.
  const Heading = `h${headingLevel}`;

  return (
    <div className="empty-state">
      {icon && <span className="empty-state-icon" aria-hidden="true">{icon}</span>}
      <Heading className="empty-state-title">{title}</Heading>
      {children && <div className="empty-state-body">{children}</div>}

      {action &&
        (action.to ? (
          <Link className="btn-primary" to={action.to}>{action.label}</Link>
        ) : (
          <button type="button" className="btn-primary" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
