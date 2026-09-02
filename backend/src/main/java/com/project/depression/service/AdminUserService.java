package com.project.depression.service;

import com.project.depression.dto.AdminUserResponse;
import com.project.depression.dto.SetVerificationRequest;
import com.project.depression.dto.PageResponse;
import com.project.depression.entity.Role;
import com.project.depression.entity.User;
import com.project.depression.entity.UserStatus;
import com.project.depression.repository.SessionRepository;
import com.project.depression.repository.UserRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Operator-facing user administration: who exists, who can currently sign in,
 * and password-reset help for counselors who can't self-serve.
 *
 * Deliberately cannot delete users. Sessions, reports and audit entries all
 * reference a counselor; removing the row would either orphan clinical records
 * or cascade them away. Suspension revokes access while keeping the record
 * intact, which is the right behaviour for a system holding health data.
 */
@Service
public class AdminUserService {

    private final UserRepository userRepository;
    private final SessionRepository sessionRepository;
    private final PasswordResetService passwordResetService;
    private final AuditLogService auditLogService;

    public AdminUserService(
            UserRepository userRepository,
            SessionRepository sessionRepository,
            PasswordResetService passwordResetService,
            AuditLogService auditLogService
    ) {
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
        this.passwordResetService = passwordResetService;
        this.auditLogService = auditLogService;
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminUserResponse> list(Role role, String search, Pageable pageable) {
        return PageResponse.from(
                userRepository.findAll(matching(role, search), pageable).map(this::toResponse));
    }

    /** Only the filters actually supplied become predicates — no null binds reach SQL. */
    private static Specification<User> matching(Role role, String search) {
        return (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();

            if (role != null) {
                predicates.add(cb.equal(root.get("role"), role));
            }

            if (search != null && !search.isBlank()) {
                String pattern = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("email")), pattern),
                        // username is nullable — coalesce so a null doesn't drop the row
                        cb.like(cb.lower(cb.coalesce(root.get("username"), "")), pattern)
                ));
            }

            return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }

    /**
     * Record that an administrator has (re-)confirmed a counselor's credentials.
     *
     * Restricted to counselors: an admin account is seeded, holds no licence,
     * and has nothing to verify — offering the action there would only invite
     * a meaningless date onto a record.
     */
    @Transactional
    public AdminUserResponse setVerification(UUID userId, SetVerificationRequest request, User admin) {
        User user = find(userId);
        if (user.getRole() != Role.COUNSELOR) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only counselor accounts carry a credential verification date.");
        }

        user.setVerifiedUntil(request.verifiedUntil());
        user.setVerifiedAt(java.time.Instant.now());
        user.setVerifiedBy(admin.getId());
        User saved = userRepository.save(user);

        auditLogService.log(admin, "USER_VERIFICATION_SET", "USER", userId,
                (request.verifiedUntil() == null
                        ? "no review date"
                        : "verified until " + request.verifiedUntil())
                        + (request.note() == null || request.note().isBlank() ? "" : " — " + request.note()));
        return toResponse(saved);
    }

    @Transactional
    public AdminUserResponse suspend(UUID userId, User admin) {
        User user = find(userId);
        if (user.getId().equals(admin.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "You cannot suspend your own account — it would lock you out of the platform.");
        }
        user.setStatus(UserStatus.SUSPENDED);
        User saved = userRepository.save(user);
        auditLogService.log(admin, "USER_SUSPENDED", "USER", userId, null);
        return toResponse(saved);
    }

    @Transactional
    public AdminUserResponse reactivate(UUID userId, User admin) {
        User user = find(userId);
        user.setStatus(UserStatus.ACTIVE);
        User saved = userRepository.save(user);
        auditLogService.log(admin, "USER_REACTIVATED", "USER", userId, null);
        return toResponse(saved);
    }

    @Transactional
    public void issuePasswordReset(UUID userId, User admin) {
        passwordResetService.issueResetForUser(find(userId), admin);
    }

    private User find(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + userId));
    }

    private AdminUserResponse toResponse(User user) {
        return new AdminUserResponse(
                user.getId(), user.getName(), user.getEmail(), user.getUsername(),
                user.getRole().name(), user.getStatus().name(),
                com.project.depression.dto.ProfessionalProfileDto.from(user.getProfile()),
                user.getVerifiedAt(), user.getVerifiedUntil(), user.isVerificationExpired(),
                user.getCreatedAt(), user.getLastLoginAt(),
                sessionRepository.countByCounselor(user)
        );
    }
}
