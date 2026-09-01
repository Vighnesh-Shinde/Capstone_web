import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api/auth";

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await forgotPassword(identifier);
      setSent(true);
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not start the reset. Please try again shortly."
      );
    } finally {
      setSubmitting(false);
    }
  }

  // The confirmation is deliberately identical whether or not the account
  // exists — the backend does the same, so this page can't be used to work out
  // which addresses are registered.
  if (sent) {
    return (
      <div className="centered-page">
        <div className="card auth-card">
          <h1>Check your email</h1>
          <p className="muted">
            If an account matches <strong>{identifier}</strong>, we&apos;ve sent a link to
            reset its password. The link expires in 30 minutes and can only be used once.
          </p>
          <p className="hint">
            Didn&apos;t get it? Check your spam folder, or{" "}
            <Link to="/forgot-password" onClick={() => setSent(false)}>
              try again
            </Link>
            .
          </p>
          <p className="hint">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="centered-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Reset your password</h1>
        <p className="muted">
          Enter your username or email and we&apos;ll send you a link to set a new password.
        </p>

        <label className="field-label" htmlFor="identifier">
          Username or email
        </label>
        <input
          id="identifier"
          type="text"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />

        {error && <div className="alert alert-error">{error}</div>}

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Sending..." : "Send reset link"}
        </button>

        <p className="hint">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
