package com.project.depression.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    // Optional alternate login identifier. Admins sign in with this;
    // counselors normally keep using the email their application was keyed on.
    @Column(unique = true)
    private String username;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private Role role = Role.COUNSELOR;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private UserStatus status = UserStatus.ACTIVE;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "password_changed_at")
    private Instant passwordChangedAt;

    // Links a COUNSELOR's login row back to the application that was approved
    // to create it. Null for ADMIN accounts (seeded directly, no application).
    @Column(name = "application_id")
    private UUID applicationId;

    /**
     * Contact and professional details. Empty for ADMIN accounts, which are
     * seeded rather than applied for and hold no clinical role.
     */
    @Embedded
    @Builder.Default
    private ProfessionalProfile profile = new ProfessionalProfile();

    /** When an administrator last confirmed this counselor's credentials. */
    @Column(name = "verified_at")
    private Instant verifiedAt;

    /**
     * When that confirmation lapses. Credentials expire; an account approved
     * against a licence that has since lapsed is not a verified account, and
     * nothing in the system could previously notice that.
     */
    @Column(name = "verified_until")
    private java.time.LocalDate verifiedUntil;

    @Column(name = "verified_by")
    private UUID verifiedBy;

    @Column(name = "created_at")
    private Instant createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    /**
     * Null-safe accessor. An @Embeddable whose columns are all null is loaded
     * back as null by Hibernate, so every read site would otherwise need its
     * own guard — including the ones written after this comment.
     */
    public ProfessionalProfile profileOrEmpty() {
        return profile != null ? profile : new ProfessionalProfile();
    }

    /** True once an administrator's verification has lapsed. */
    public boolean isVerificationExpired() {
        return verifiedUntil != null && verifiedUntil.isBefore(java.time.LocalDate.now());
    }
}
