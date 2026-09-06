package com.project.depression.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collections;

/**
 * Verifies Google ID tokens.
 *
 * This class does one thing and refuses to do anything else: given a token the
 * browser says came from Google, decide whether it really did, and whose it
 * is. It deliberately knows nothing about counsellors, approval, or accounts —
 * that judgement lives in {@link AuthService}, so there is exactly one place
 * where "should this person be allowed in" is decided, whichever way they
 * signed in.
 *
 * WHY THE OFFICIAL VERIFIER
 * -------------------------
 * A Google ID token is a JWT signed with a rotating RS256 key. Verifying one
 * correctly means fetching Google's current public keys, selecting the right
 * one by `kid`, rejecting tokens that ask to be verified with `alg: none` or
 * an HMAC algorithm (the classic algorithm-confusion attack, where an attacker
 * signs a forged token with the *public* key as an HMAC secret), and checking
 * `iss`, `aud` and `exp` with a sane clock skew.
 *
 * Getting any one of those wrong means anyone can mint a token for any email
 * and log in as that person. GoogleIdTokenVerifier is written and maintained
 * by the party that issues the tokens, and it caches and rotates the keys
 * itself.
 *
 * DISABLED BY DEFAULT
 * -------------------
 * With no client ID configured, this refuses every request rather than
 * accepting them. An unconfigured verifier that waves tokens through would be
 * a total authentication bypass, so the failure mode is "Google sign-in is
 * off", never "Google sign-in trusts everyone".
 */
@Service
public class GoogleAuthService {

    private static final Logger log = LoggerFactory.getLogger(GoogleAuthService.class);

    private final String clientId;
    private final GoogleIdTokenVerifier verifier;

    public GoogleAuthService(@Value("${app.google.client-id:}") String clientId) {
        this.clientId = clientId == null ? "" : clientId.trim();

        if (this.clientId.isEmpty()) {
            this.verifier = null;
            log.info("Google sign-in is DISABLED (app.google.client-id is not set). "
                    + "Password sign-in is unaffected.");
        } else {
            this.verifier = new GoogleIdTokenVerifier.Builder(
                    new NetHttpTransport(), GsonFactory.getDefaultInstance())
                    // Audience is pinned to our own client ID. Without this, a
                    // token minted for any *other* Google application would
                    // verify here — it is a genuine Google signature, just not
                    // one issued for us. Anyone running any Google app could
                    // then log in as their users.
                    .setAudience(Collections.singletonList(this.clientId))
                    .build();
            log.info("Google sign-in is ENABLED for client ID ending ...{}",
                    this.clientId.length() > 8
                            ? this.clientId.substring(this.clientId.length() - 8)
                            : "(short)");
        }
    }

    public boolean isEnabled() {
        return verifier != null;
    }

    /**
     * The verified payload, or a thrown error. Never returns unverified data.
     *
     * @param idToken the raw JWT the browser received from Google Identity Services
     */
    public GoogleIdToken.Payload verify(String idToken) {
        if (verifier == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Google sign-in is not configured on this server. Please sign in with "
                            + "your email and password.");
        }
        if (idToken == null || idToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No Google credential was supplied.");
        }

        GoogleIdToken token;
        try {
            token = verifier.verify(idToken);
        } catch (Exception e) {
            // Network failure reaching Google's key endpoint, or a malformed
            // token. Logged with the exception but reported without detail —
            // an attacker probing this endpoint learns nothing from the reply.
            log.warn("Google ID token verification failed", e);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Your Google sign-in could not be verified. Please try again.");
        }

        if (token == null) {
            // verify() returns null for a token that is well-formed but does
            // not check out: wrong audience, wrong issuer, expired, or a bad
            // signature. Deliberately not distinguished in the response.
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Your Google sign-in could not be verified. Please try again.");
        }

        GoogleIdToken.Payload payload = token.getPayload();

        // Google will happily issue a token for an address the user has not
        // confirmed. Treating an unconfirmed address as proof of identity
        // would let someone claim a colleague's account by adding their
        // address and never verifying it.
        if (!Boolean.TRUE.equals(payload.getEmailVerified())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "This Google account's email address is not verified with Google. "
                            + "Verify it with Google first, or sign in with your password.");
        }

        if (payload.getEmail() == null || payload.getEmail().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "This Google account did not supply an email address.");
        }

        return payload;
    }
}
