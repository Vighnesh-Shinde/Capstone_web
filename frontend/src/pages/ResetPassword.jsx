import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PasswordInput from "../components/PasswordInput";
import { resetPassword } from "../api/auth";

const MIN_LENGTH = 10;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      navigate("/login", {
        state: { notice: "Your password has been reset. Sign in with your new password." },
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "This reset link is invalid or has expired. Request a new one."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="centered-page">
        <div className="card auth-card">
          <h1>Link incomplete</h1>
          <p className="muted">
            This reset link is missing its token. Use the full link from your email, or
            request a new one.
          </p>
          <p className="hint">
            <Link to="/forgot-password">Request a new reset link</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="centered-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Choose a new password</h1>
        <p className="muted">Must be at least {MIN_LENGTH} characters.</p>

        <label className="field-label" htmlFor="password">
          New password
        </label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={MIN_LENGTH}
          required
        />
        {tooShort && <p className="field-error">At least {MIN_LENGTH} characters.</p>}

        <label className="field-label" htmlFor="confirm">
          Confirm new password
        </label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {mismatch && <p className="field-error">Passwords don&apos;t match.</p>}

        {error && <div className="alert alert-error">{error}</div>}

        <button
          className="btn-primary"
          type="submit"
          disabled={submitting || tooShort || mismatch || !password}
        >
          {submitting ? "Saving..." : "Set new password"}
        </button>

        <p className="hint">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
