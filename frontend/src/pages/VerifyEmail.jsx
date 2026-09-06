import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import apiClient from "../api/client";

/**
 * Lands here from the link in the verification email.
 *
 * The token is posted, not sent as a GET: mail clients and corporate security
 * scanners pre-fetch links, and a single-use token consumed by a scanner would
 * be dead before the applicant ever clicked it.
 */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState("working"); // working | done | failed
  const [message, setMessage] = useState("");

  // React 18's StrictMode mounts effects twice in development. Without this
  // guard the second run posts the same single-use token again and reports a
  // failure for a verification that actually succeeded.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setState("failed");
      setMessage("This link is missing its verification token.");
      return;
    }

    apiClient
      .post(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(({ data }) => {
        setState("done");
        setMessage(data?.email || "");
      })
      .catch((err) => {
        setState("failed");
        setMessage(
          err.response?.data?.message ||
            "This verification link is invalid or has expired."
        );
      });
  }, [token]);

  return (
    <div className="centered-page">
      <div className="card auth-card">
        {state === "working" && (
          <>
            <h1>Confirming your email…</h1>
            <p className="muted">One moment.</p>
          </>
        )}

        {state === "done" && (
          <>
            <h1>Email confirmed</h1>
            <p>
              Thanks — {message ? <strong>{message}</strong> : "your address"} is
              confirmed.
            </p>
            <p className="muted">
              This does not approve your account. An administrator still reviews your
              professional documents, and you&apos;ll be able to sign in once they do.
            </p>
            <Link to="/login" className="btn-primary">Back to sign in</Link>
          </>
        )}

        {state === "failed" && (
          <>
            <h1>Link didn&apos;t work</h1>
            <div className="alert alert-error">{message}</div>
            <p className="muted">
              If your request is still pending, an administrator can confirm your
              address for you.
            </p>
            <Link to="/login" className="btn-secondary">Back to sign in</Link>
          </>
        )}
      </div>
    </div>
  );
}
