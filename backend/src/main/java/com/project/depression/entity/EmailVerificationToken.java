package com.project.depression.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Proof that someone controls the address they applied with.
 *
 * Stored hashed, exactly like a password-reset token: a database dump must not
 * hand out working verification links.
 *
 * Exactly one of applicationId / userId is set. A token issued during
 * application has no user row to point at yet — counsellor accounts are only
 * created on approval — while an email-change token belongs to an account that
 * already exists.
 */
@Entity
@Table(name = "email_verification_tokens")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmailVerificationToken {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "application_id")
    private UUID applicationId;

    @Column(name = "user_id")
    private UUID userId;

    /**
     * The address being proved, held separately from the application/user row.
     *
     * An email-change flow has to verify the NEW address before it replaces
     * the old one — writing it in first and verifying later would let a typo
     * lock someone out of their own account recovery.
     */
    @Column(nullable = false)
    private String email;

    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public boolean isUsable() {
        return usedAt == null && expiresAt.isAfter(Instant.now());
    }
}
