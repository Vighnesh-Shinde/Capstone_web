package com.project.depression.service;

import com.project.depression.dto.ChangeEmailRequest;
import com.project.depression.dto.SettingsResponse;
import com.project.depression.dto.UpdateNotificationsRequest;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;

/**
 * The counsellor's own account settings.
 *
 * Everything here acts on the signed-in user and nobody else — there is no
 * endpoint that takes a user id, so no amount of parameter-tampering reaches
 * another account.
 */
@Service
public class SettingsService {

    private static final Logger log = LoggerFactory.getLogger(SettingsService.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailVerificationService emailVerificationService;
    private final GoogleAuthService googleAuthService;
    private final AuditLogService auditLogService;

    public SettingsService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            EmailVerificationService emailVerificationService,
            GoogleAuthService googleAuthService,
            AuditLogService auditLogService
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailVerificationService = emailVerificationService;
        this.googleAuthService = googleAuthService;
        this.auditLogService = auditLogService;
    }

    @Transactional(readOnly = true)
    public SettingsResponse get(User user) {
        return new SettingsResponse(
                user.getEmail(),
                user.isEmailVerified(),
                user.getPendingEmail(),
                user.getPendingEmailRequestedAt(),
                user.getGoogleSub() != null,
                user.getGoogleLinkedAt(),
                googleAuthService.isEnabled(),
                new SettingsResponse.NotificationPreferences(
                        user.isNotifyAnalysisComplete(),
                        user.isNotifyAnalysisFailed(),
                        user.isNotifyNeedsReview(),
                        user.isNotifyAssessmentDiffers(),
                        user.isNotifyReportGenerated()));
    }

    @Transactional
    public SettingsResponse updateNotifications(User user, UpdateNotificationsRequest request) {
        user.setNotifyAnalysisComplete(request.analysisComplete());
        user.setNotifyAnalysisFailed(request.analysisFailed());
        user.setNotifyNeedsReview(request.needsReview());
        user.setNotifyAssessmentDiffers(request.assessmentDiffers());
        user.setNotifyReportGenerated(request.reportGenerated());
        return get(userRepository.save(user));
    }

    /**
     * Begin moving the account to a new address.
     *
     * The change does not take effect here. The new address is parked and a
     * confirmation link is sent to it; `email` only moves once somebody proves
     * they can read mail there. A typo therefore costs a re-request rather
     * than the account's entire recovery route.
     */
    @Transactional
    public SettingsResponse requestEmailChange(User user, ChangeEmailRequest request) {
        // Re-authentication, not paranoia: an email address is the account's
        // recovery route, so an unattended unlocked laptop would otherwise be
        // enough to take the account permanently.
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your password is incorrect.");
        }

        String newEmail = request.newEmail().trim().toLowerCase();

        if (newEmail.equalsIgnoreCase(user.getEmail())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That is already your email address.");
        }
        if (userRepository.existsByEmail(newEmail)) {
            // Reveals that an address is registered — but only to somebody who
            // has just proved they own this account with a password, so it
            // tells an attacker nothing they could not learn by signing up.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Another account already uses that email address.");
        }

        user.setPendingEmail(newEmail);
        user.setPendingEmailRequestedAt(Instant.now());
        userRepository.save(user);

        emailVerificationService.sendForEmailChange(user, newEmail);
        auditLogService.log(user, "EMAIL_CHANGE_REQUESTED", "USER", user.getId(), newEmail);

        return get(user);
    }

    @Transactional
    public SettingsResponse cancelEmailChange(User user) {
        user.setPendingEmail(null);
        user.setPendingEmailRequestedAt(null);
        return get(userRepository.save(user));
    }

    /**
     * Disconnect Google sign-in from this account.
     *
     * Refused when the account has no usable password, which would leave the
     * owner with no way in at all. That cannot happen today — every account is
     * created with a password — but it is checked rather than assumed, because
     * the day it stops being true this becomes a lockout with no recovery.
     */
    @Transactional
    public SettingsResponse unlinkGoogle(User user) {
        if (user.getGoogleSub() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This account is not linked to Google.");
        }
        if (user.getPasswordHash() == null || user.getPasswordHash().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Set a password before disconnecting Google, or you will not be able "
                            + "to sign in.");
        }

        user.setGoogleSub(null);
        user.setGoogleLinkedAt(null);
        userRepository.save(user);

        auditLogService.log(user, "GOOGLE_UNLINKED", "USER", user.getId(), null);
        log.info("Google sign-in unlinked from {}", user.getEmail());

        return get(user);
    }
}
