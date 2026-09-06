import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAuthConfig } from "../api/auth";
import { useCaptcha } from "../hooks/useCaptcha";
import AuthAside from "../components/AuthAside";
import GoogleSignInButton from "../components/GoogleSignInButton";
import PasswordInput from "../components/PasswordInput";

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // What this deployment actually supports. Fetched rather than assumed, so a
  // server with no Google client ID simply shows no Google button instead of
  // offering one that fails.
  const [config, setConfig] = useState(null);
  const { execute: executeCaptcha } = useCaptcha(config?.captchaEnabled ? config.captchaSiteKey : null);

  useEffect(() => {
    let cancelled = false;
    getAuthConfig()
      .then((c) => !cancelled && setConfig(c))
      // A failed config fetch must not block password sign-in, which needs
      // nothing from it. Google's button just stays hidden.
      .catch(() => !cancelled && setConfig({ googleEnabled: false, captchaEnabled: false }));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const captchaToken = await executeCaptcha("login");
      await login(identifier, password, captchaToken);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please check your credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleCredential(credential) {
    setError("");
    setSubmitting(true);
    try {
      const captchaToken = await executeCaptcha("google_login");
      await loginWithGoogle(credential, captchaToken);
      navigate("/");
    } catch (err) {
      // The backend's message is shown verbatim: "there is no approved
      // counsellor account for this address" is exactly what the person needs
      // to read, and replacing it with a generic failure would leave them
      // retrying a sign-in that can never succeed.
      setError(err.response?.data?.message || "Google sign-in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-split">
      <AuthAside />

      <div className="auth-panel">
        <form className="card auth-card" onSubmit={handleSubmit}>
          <h1>Welcome back</h1>
          <p className="muted">Sign in to review and upload participant interviews.</p>

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

          <label className="field-label" htmlFor="password">
            Password
          </label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && <div className="alert alert-error">{error}</div>}

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>

          {config?.googleEnabled && (
            <GoogleSignInButton
              clientId={config.googleClientId}
              onCredential={handleGoogleCredential}
              onError={setError}
              disabled={submitting}
            />
          )}

          <p className="hint">
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>
          <p className="hint">
            Not approved yet? <Link to="/request-access">Request counselor access</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
