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
@Table(name = "dataset_samples")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DatasetSample {

    @Id
    @GeneratedValue
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false, unique = true)
    private Session session;

    @Enumerated(EnumType.STRING)
    @Column(name = "eligibility_status", nullable = false)
    @Builder.Default
    private DatasetEligibilityStatus eligibilityStatus = DatasetEligibilityStatus.AWAITING_JUDGMENT;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "admin_reviewed_by")
    private User adminReviewedBy;

    @Column(name = "admin_reviewed_at")
    private Instant adminReviewedAt;

    @Column(name = "admin_notes")
    private String adminNotes;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @PrePersist
    public void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = Instant.now();
    }
}
