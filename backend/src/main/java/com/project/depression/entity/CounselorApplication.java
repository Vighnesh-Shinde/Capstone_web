package com.project.depression.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "counselor_applications")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CounselorApplication {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    /**
     * The single free-text phone field from before phone numbers were split
     * into a dial code and a national number. Kept so applications submitted
     * under the old form still display what they actually said, rather than
     * appearing to have no contact number at all.
     */
    private String phone;

    private String experience;

    @Column(name = "additional_info")
    private String additionalInfo;

    /**
     * What the applicant submitted, frozen at submission. The approved
     * counselor's live, editable copy lives on {@link User}.
     */
    @Embedded
    @Builder.Default
    private ProfessionalProfile profile = new ProfessionalProfile();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private ApplicationStatus status = ApplicationStatus.PENDING;

    @Column(name = "rejection_reason")
    private String rejectionReason;

    /**
     * Whether the applicant clicked the link sent to this address.
     *
     * Advisory, shown to the reviewing administrator. Approving an application
     * with an unreachable address creates an account that can never recover its
     * own password, and nobody discovers that until they are locked out.
     */
    @Column(name = "email_verified", nullable = false)
    @Builder.Default
    private boolean emailVerified = false;

    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by")
    private User reviewedBy;

    @Column(name = "created_user_id")
    private UUID createdUserId;

    @OneToMany(mappedBy = "application", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private List<VerificationDocument> documents = new java.util.ArrayList<>();

    @PrePersist
    public void prePersist() {
        if (submittedAt == null) {
            submittedAt = Instant.now();
        }
    }

    /** See {@link User#profileOrEmpty()} — Hibernate nulls an all-null embeddable. */
    public ProfessionalProfile profileOrEmpty() {
        return profile != null ? profile : new ProfessionalProfile();
    }
}
