package com.project.depression.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * reCAPTCHA v3 verification for the unauthenticated endpoints.
 *
 * v3 rather than the "click the traffic lights" version: it returns a score
 * instead of a puzzle, so a counsellor signing in never has to solve anything.
 * That matters here — the people using this are clinicians between
 * appointments, and a puzzle on every sign-in is friction they would rightly
 * resent.
 *
 * ENABLED / DISABLED, AND WHY DISABLED IS SAFE HERE
 * -------------------------------------------------
 * With no secret configured this is off, and every check passes. That is a
 * deliberate difference from {@link GoogleAuthService}, which fails closed,
 * and the distinction matters:
 *
 *   - Google sign-in is AUTHENTICATION. Failing open there would let anyone in,
 *     so an unconfigured verifier must refuse.
 *   - CAPTCHA is RATE-LIMITING against bots. It is defence in depth on top of
 *     password checks and the existing per-IP rate limiter, not a gate that
 *     stands alone. Failing closed would lock every user out of a correctly
 *     working login the moment a key expired.
 *
 * When it IS configured, verification is mandatory and a failure rejects the
 * request — there is no "the token looked wrong so we let it through anyway".
 */
@Service
public class CaptchaService {

    private static final Logger log = LoggerFactory.getLogger(CaptchaService.class);
    private static final String VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

    private final String secret;
    private final double minimumScore;
    private final RestClient restClient;

    public CaptchaService(
            @Value("${app.captcha.secret:}") String secret,
            // 0.5 is Google's own documented starting point. Lower it if real
            // users get rejected; raise it if bots get through. It is not a
            // probability of being a bot, just a relative score.
            @Value("${app.captcha.minimum-score:0.5}") double minimumScore
    ) {
        this.secret = secret == null ? "" : secret.trim();
        this.minimumScore = minimumScore;
        this.restClient = RestClient.create();

        if (this.secret.isEmpty()) {
            log.info("CAPTCHA is DISABLED (app.captcha.secret is not set). "
                    + "Set it, plus VITE_RECAPTCHA_SITE_KEY in the frontend, to turn it on.");
        } else {
            log.info("CAPTCHA is ENABLED (minimum score {}).", minimumScore);
        }
    }

    public boolean isEnabled() {
        return !secret.isEmpty();
    }

    /**
     * Throws unless the token is a genuine, recent, high-enough-scoring
     * assessment for the action named.
     *
     * @param token  the response token the browser's grecaptcha.execute() produced
     * @param action the action the frontend claimed — checked, not trusted
     */
    public void verify(String token, String action) {
        if (!isEnabled()) {
            return;
        }

        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bot check missing. Please reload the page and try again.");
        }

        Map<?, ?> body;
        try {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("secret", secret);
            form.add("response", token);

            body = restClient.post()
                    .uri(VERIFY_URL)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(Map.class);
        } catch (Exception e) {
            // Google unreachable. Rejecting here would take the whole login
            // page down for an outage in somebody else's service, so this
            // degrades to "allowed, loudly logged" — the password check and
            // rate limiter are both still in force behind it.
            log.error("Could not reach reCAPTCHA; allowing the request and relying on "
                    + "password and rate-limit checks.", e);
            return;
        }

        if (body == null || !Boolean.TRUE.equals(body.get("success"))) {
            log.warn("CAPTCHA rejected: {}", body == null ? "no response" : body.get("error-codes"));
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bot check failed. Please reload the page and try again.");
        }

        // The action is echoed back by Google from the token itself, so
        // comparing it stops a token harvested from a low-value page (say a
        // public contact form) being replayed against login.
        Object returnedAction = body.get("action");
        if (action != null && returnedAction != null && !action.equals(returnedAction)) {
            log.warn("CAPTCHA action mismatch: expected {}, got {}", action, returnedAction);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bot check failed. Please reload the page and try again.");
        }

        Object scoreValue = body.get("score");
        double score = scoreValue instanceof Number n ? n.doubleValue() : 0.0;
        if (score < minimumScore) {
            log.warn("CAPTCHA score {} below minimum {}", score, minimumScore);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This request looked automated and was blocked. If you are a real "
                            + "person, please try again or contact your administrator.");
        }
    }
}
