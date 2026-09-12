package com.project.depression.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "reports")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Report {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private Session session;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Prediction prediction;

    @Column(name = "confidence_score", nullable = false)
    private Double confidenceScore;

    @Column(name = "audio_contribution")
    private Double audioContribution;

    @Column(name = "text_contribution")
    private Double textContribution;

    @Column(name = "video_contribution")
    private Double videoContribution;

    /**
     * How the verdict was reached — cut-off, per-modality scores and cut-offs,
     * fusion weights, out-of-range warnings — as the ML service reported it.
     * Null for reports created before V15 and for the mock pipeline.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "scoring_details", columnDefinition = "jsonb")
    private Map<String, Object> scoringDetails;

    @Column(name = "created_at")
    private Instant createdAt;

    @OneToMany(mappedBy = "report", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private List<ExplanationFactor> explanationFactors = new java.util.ArrayList<>();

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
