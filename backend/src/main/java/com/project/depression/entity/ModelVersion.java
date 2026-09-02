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
@Table(name = "model_versions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ModelVersion {

    @Id
    @GeneratedValue
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ModelModality modality;

    /**
     * Which language's pipeline these weights belong to.
     *
     * Training a Marathi model set is the same act as retraining the English
     * one, so it goes through the same upload-and-activate door — that is what
     * makes a new language a data problem rather than a release.
     */
    @Column(nullable = false, length = 10)
    @Builder.Default
    private String language = "en";

    @Column(name = "version_label", nullable = false)
    private String versionLabel;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "file_path", nullable = false)
    private String filePath;

    /** Lets an operator confirm the deployed file is byte-identical to what they trained. */
    @Column(nullable = false, length = 64)
    private String sha256;

    @Column(name = "feature_count")
    private Integer featureCount;

    private Double threshold;

    @Column(name = "model_summary", length = 2000)
    private String modelSummary;

    @Column(length = 2000)
    private String notes;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "uploaded_by")
    private User uploadedBy;

    @Column(name = "uploaded_at", nullable = false)
    private Instant uploadedAt;

    @Column(name = "activated_at")
    private Instant activatedAt;

    @PrePersist
    public void prePersist() {
        if (uploadedAt == null) {
            uploadedAt = Instant.now();
        }
    }
}
