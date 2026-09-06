import { useState } from "react";

/**
 * A password field with a show/hide toggle.
 *
 * One component rather than the toggle repeated on each form, so every place
 * someone types a password behaves the same way — and so the accessibility
 * details below are written once instead of three times, imperfectly.
 *
 * The toggle defaults to hidden and never persists being shown. Counsellors
 * work in rooms with participants in them, and a password left visible after
 * the user moved on is a small, avoidable exposure.
 */
export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete = "current-password",
  required = false,
  minLength,
  placeholder,
  disabled = false,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        // The control is an icon, so it needs its own name for screen readers.
        // aria-pressed communicates the current state rather than relying on
        // the icon, which a screen reader cannot see.
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        // Skipped in tab order: someone tabbing through a login form wants to
        // land on the submit button next, not on a visibility toggle. It stays
        // fully reachable by click and by screen-reader navigation.
        tabIndex={-1}
      >
        {visible ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-2.4 3.4M6.2 6.2A18.3 18.3 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 5.3-1.4" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
