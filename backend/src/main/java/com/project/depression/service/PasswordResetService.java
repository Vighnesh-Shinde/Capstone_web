package com.project.depression.service;

import com.project.depression.entity.PasswordResetToken;
import com.project.depression.entity.User;
import com.project.depression.entity.UserStatus;
import com.project.depression.repository.PasswordResetTokenRepository;
import com.project.depression.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
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
import java.util.Optional;

/**
 * Self-service password reset.
 *
 * Two security properties this deliberately maintains:
 *
 *  1. **No account enumeration.** requestReset() returns normally whether or
 *     not the address exists, so the endpoint can't be used to discover which
 *     emails have accounts.
 *  2. **Tokens are stored hashed.** Only the SHA-256 of the token is persisted;
 *     the raw value exists solely in the email. A database dump yields no
 *     usable reset links.
 */
@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final MailService mailService;
    private final AuditLogService auditLogService;

    @Value("${app.password-reset.token-ttl-minutes:30}")
    private long tokenTtlMinutes;

    @Value("${app.frontend-base-url:http://localhost:5173}")
    private String frontendBaseUrl;

    public PasswordResetService(
            UserRepository userRepository,
            PasswordResetTokenRepository tokenRepository,
            PasswordEncoder passwordEncoder,
            MailService mailService,
            AuditLogService auditLogService
    ) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.mailService = mailService;
        this.auditLogService = auditLogService;
    }

    /** Always succeeds from the caller's point of view — see class docs. */
    @Transactional
    public void requestReset(String identifier) {
        Optional<User> userOpt = userRepository.findByEmailOrUsername(identifier.trim());
        if (userOpt.isEmpty()) {
            log.info("Password reset requested for unknown identifier — responding normally to avoid enumeration.");
            return;
        }

        User user = userOpt.get();
        if (user.getStatus() == UserStatus.SUSPENDED) {
            log.info("Password reset requested for suspended account {} — ignored.", user.getId());
            return;
        }

        issueAndSend(user, "You requested a password reset");
    }

    /** Admin-triggered reset for a counselor who can't get the email themselves. */
    @Transactional
    public void issueResetForUser(User user, User admin) {
        issueAndSend(user, "An administrator started a password reset for your account");
        auditLogService.log(admin, "PASSWORD_RESET_ISSUED", "USER", user.getId(), null);
    }

    private void issueAndSend(User user, String reason) {
        tokenRepository.invalidateAllForUser(user, Instant.now());

        String rawToken = generateToken();
        PasswordResetToken token = PasswordResetToken.builder()
                .user(user)
                .tokenHash(hash(rawToken))
                .expiresAt(Instant.now().plus(Duration.ofMinutes(tokenTtlMinutes)))
                .build();
        tokenRepository.save(token);

        String link = frontendBaseUrl + "/reset-password?token=" + rawToken;
        mailService.send(
                user.getEmail(),
                "Reset your Depression Detection Platform password",
                """
                Hello %s,

                %s.

                Use the link below to choose a new password. It expires in %d minutes
                and can only be used once:

                %s

                If you did not request this, you can safely ignore this email — your
                current password will keep working.
                """.formatted(user.getName(), reason, tokenTtlMinutes, link)
        );
    }

    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        PasswordResetToken token = tokenRepository.findByTokenHash(hash(rawToken))
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "This reset link is invalid or has already been used."));

        if (!token.isUsable(Instant.now())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "This reset link has expired or has already been used.");
        }

        User user = token.getUser();
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPasswordChangedAt(Instant.now());
        userRepository.save(user);

        token.setUsedAt(Instant.now());
        tokenRepository.save(token);

        auditLogService.log(user, "PASSWORD_RESET_COMPLETED", "USER", user.getId(), null);
        log.info("Password reset completed for user {}", user.getId());
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
