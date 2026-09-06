package com.project.depression.service;

import com.project.depression.entity.CounselorApplication;
import com.project.depression.entity.EmailVerificationToken;
import com.project.depression.entity.User;
import com.project.depression.repository.CounselorApplicationRepository;
import com.project.depression.repository.EmailVerificationTokenRepository;
import com.project.depression.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * Proving an applicant controls the email address they applied with.
 *
 * WHAT THIS IS ACTUALLY FOR
 * -------------------------
 * It is not a login gate. Counsellor accounts are gated by an administrator
 * reading professional documents, which is a far stronger check than a mailbox
 * round-trip, and adding email verification as a second barrier to signing in
 * would lock people out for no security gain.
 *
 * The value is earlier than that: it tells the administrator, at review time,
 * whether the address on the application is real. Approving an application with
 * a typo'd address creates an account whose owner can never receive a password
 * reset — and nobody finds out until they are locked out.
 *
 * So verification is advisory, surfaced on the review screen, and deliberately
 * never blocks anyone from signing in.
 */
@Service
public class EmailVerificationService {

    private static final Logger log = LoggerFactory.getLogger(EmailVerificationService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final EmailVerificationTokenRepository tokenRepository;
    private final CounselorApplicationRepository applicationRepository;
    private final UserRepository userRepository;
    private final MailService mailService;

    @Value("${app.email-verification.token-ttl-hours:48}")
    private long tokenTtlHours;

    @Value("${app.frontend-base-url:http://localhost:5173}")
    private String frontendBaseUrl;

    public EmailVerificationService(
            EmailVerificationTokenRepository tokenRepository,
            CounselorApplicationRepository applicationRepository,
            UserRepository userRepository,
            MailService mailService
    ) {
        this.tokenRepository = tokenRepository;
        this.applicationRepository = applicationRepository;
        this.userRepository = userRepository;
        this.mailService = mailService;
    }

    /**
     * Send a verification link for a freshly submitted application.
     *
     * Failures are logged, never thrown. An application that was successfully
     * received must not be reported as failed because the mail server was
     * briefly unreachable — the applicant would submit again, and the admin
     * would review a duplicate.
     */
    @Transactional
    public void sendForApplication(CounselorApplication application) {
        try {
            String rawToken = generateToken();
            tokenRepository.save(EmailVerificationToken.builder()
                    .applicationId(application.getId())
                    .email(application.getEmail())
                    .tokenHash(hash(rawToken))
                    .expiresAt(Instant.now().plus(Duration.ofHours(tokenTtlHours)))
                    .build());

            mailService.send(
                    application.getEmail(),
                    "Confirm your email — Depression Detection Platform",
                    """
                    Hello %s,

                    Thanks for requesting counsellor access. Please confirm this email
                    address so the administrator reviewing your request knows they can
                    reach you here:

                    %s

                    This link expires in %d hours.

                    Confirming your address does not approve your account — an
                    administrator still reviews your professional documents, and you
                    will be able to sign in once they do.

                    If you did not request access, you can ignore this email.
                    """.formatted(
                            application.getFullName(),
                            frontendBaseUrl + "/verify-email?token=" + rawToken,
                            tokenTtlHours));
        } catch (Exception e) {
            log.error("Could not send the verification email for application {}",
                    application.getId(), e);
        }
    }

    /**
     * Consume a verification link.
     *
     * Deliberately vague on failure: "invalid or expired" covers a token that
     * never existed, one already used, and one past its expiry, so this cannot
     * be used to probe which tokens are real.
     */
    @Transactional
    public String verify(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No verification token was supplied.");
        }

        EmailVerificationToken token = tokenRepository.findByTokenHash(hash(rawToken))
                .filter(EmailVerificationToken::isUsable)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "This verification link is invalid or has expired. Request a new one, "
                                + "or contact your administrator."));

        token.setUsedAt(Instant.now());
        tokenRepository.save(token);

        if (token.getApplicationId() != null) {
            applicationRepository.findById(token.getApplicationId()).ifPresent(application -> {
                application.setEmailVerified(true);
                application.setEmailVerifiedAt(Instant.now());
                applicationRepository.save(application);
            });
        }

        // An application that was approved between the email being sent and the
        // link being clicked already has a user row — mark that too, so the
        // flag does not silently get lost in the gap.
        userRepository.findByEmail(token.getEmail()).ifPresent(user -> {
            if (!user.isEmailVerified()) {
                user.setEmailVerified(true);
                user.setEmailVerifiedAt(Instant.now());
                userRepository.save(user);
            }
        });

        if (token.getUserId() != null) {
            userRepository.findById(token.getUserId()).ifPresent(user -> {
                user.setEmailVerified(true);
                user.setEmailVerifiedAt(Instant.now());
                userRepository.save(user);
            });
        }

        return token.getEmail();
    }

    private static String generateToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String hash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return Base64.getEncoder().encodeToString(digest.digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
