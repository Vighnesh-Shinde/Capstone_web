package com.project.depression.dto;

/**
 * What sign-in methods this deployment actually has configured.
 *
 * Served publicly so the login page can render only what will work. Without
 * it the frontend would show a Google button on a server with no client ID,
 * and the counsellor would get an error after committing to a flow that was
 * never going to succeed.
 *
 * Carries no secrets: a client ID and a CAPTCHA site key are both designed to
 * be visible in page source.
 */
public record AuthConfigResponse(
        boolean googleEnabled,
        String googleClientId,
        boolean captchaEnabled,
        String captchaSiteKey
) {
}
