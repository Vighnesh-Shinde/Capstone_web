import { useCallback, useEffect, useState } from "react";

/**
 * reCAPTCHA v3, loaded only when the server says it is configured.
 *
 * v3 has no puzzle — it scores the interaction in the background and hands
 * back a token per action. So this hook has no UI: a form calls `execute()`
 * just before submitting and sends the token along.
 *
 * When CAPTCHA is off, `execute()` resolves to null and the backend skips the
 * check. That keeps every caller free of `if (captchaEnabled)` branches — a
 * form submits the same way either way.
 */
export function useCaptcha(siteKey) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!siteKey) return undefined;

    const src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (window.grecaptcha) setReady(true);
      else existing.addEventListener("load", () => setReady(true));
      return undefined;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => setReady(true);
    // A failed load leaves ready=false, so execute() returns null and the
    // request proceeds without a token. The server treats a missing token as
    // a failure only when it has a secret configured, which is the correct
    // place for that decision — not here.
    script.onerror = () => setReady(false);
    document.head.appendChild(script);

    return undefined;
  }, [siteKey]);

  const execute = useCallback(
    async (action) => {
      if (!siteKey || !ready || !window.grecaptcha) return null;
      try {
        return await window.grecaptcha.execute(siteKey, { action });
      } catch {
        // Never block a real person from signing in because a bot check
        // misbehaved in their browser.
        return null;
      }
    },
    [siteKey, ready]
  );

  return { execute, ready };
}
