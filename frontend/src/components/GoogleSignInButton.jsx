import { useEffect, useRef, useState } from "react";

const GIS_SRC = "https://accounts.google.com/gsi/client";

/**
 * Google's own rendered sign-in button.
 *
 * Rendered by Google Identity Services rather than drawn by hand: Google's
 * branding terms require their button, and their script is what actually
 * produces the ID token. A look-alike button would still have to call the same
 * library, so building one buys nothing but a compliance problem.
 *
 * Renders nothing at all when the server has no client ID configured. The
 * parent asks the backend what is enabled (`/api/auth/config`) rather than the
 * frontend guessing — otherwise a counsellor would click a button that could
 * never work, and blame themselves for the error.
 */
export default function GoogleSignInButton({ clientId, onCredential, onError, disabled }) {
  const containerRef = useRef(null);
  const [scriptFailed, setScriptFailed] = useState(false);

  // Kept in a ref so the GIS callback — which is registered once and captured
  // by Google's library — always calls the CURRENT handler rather than the one
  // that existed on first render.
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    if (!clientId) return undefined;

    let cancelled = false;

    function render() {
      if (cancelled || !window.google?.accounts?.id || !containerRef.current) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response?.credential) {
            onCredentialRef.current(response.credential);
          } else {
            onError?.("Google did not return a sign-in credential. Please try again.");
          }
        },
      });

      window.google.accounts.id.renderButton(containerRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "pill",
        // Matches the form width rather than Google's default, so the button
        // sits in the layout instead of floating in the middle of it.
        width: containerRef.current.offsetWidth || 320,
      });
    }

    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      // Already loaded by an earlier mount (navigating back to /login).
      if (window.google?.accounts?.id) render();
      else existing.addEventListener("load", render);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", render);
      };
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = render;
    script.onerror = () => {
      if (!cancelled) setScriptFailed(true);
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [clientId, onError]);

  if (!clientId) return null;

  if (scriptFailed) {
    return (
      <p className="hint">
        Google sign-in could not load — you may be offline, or a browser extension may
        be blocking it. Please sign in with your email and password.
      </p>
    );
  }

  return (
    <div className="google-signin">
      <div className="auth-divider"><span>or</span></div>
      {/* Google's script replaces this node's contents entirely. */}
      <div ref={containerRef} className={disabled ? "google-signin-disabled" : undefined} />
    </div>
  );
}
