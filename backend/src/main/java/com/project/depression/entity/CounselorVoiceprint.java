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
import java.util.UUID;

/**
 * A counselor's enrolled voice, as a vector.
 *
 * Deliberately holds no audio. Only the embedding survives enrollment: a
 * vector cannot be played back, a recording of a named clinician can, and
 * there is no feature that needs the latter.
 *
 * Rows are never deleted, only deactivated. A report from March should stay
 * traceable to the voiceprint that decided whose voice was analysed, and that
 * is exactly the question asked months later.
 */
@Entity
@Table(name = "counselor_voiceprints")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CounselorVoiceprint {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<Double> embedding;

    @Column(nullable = false)
    private Integer dimension;

    /** Seconds of speech the vector was derived from — context for a marginal match. */
    @Column(name = "speech_seconds")
    private Double speechSeconds;

    @Column(name = "passage_version", nullable = false, length = 20)
    @Builder.Default
    private String passageVersion = "v1";

    /**
     * The embedding model's identity. Vectors are only comparable within one
     * model's space, so a model upgrade invalidates every voiceprint enrolled
     * before it. Without this column that would present as every counselor
     * suddenly failing to match their own recordings, for no visible reason.
     */
    @Column(name = "model_id", nullable = false, length = 120)
    private String modelId;

    @Column(name = "enrolled_at", nullable = false)
    private Instant enrolledAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @PrePersist
    public void prePersist() {
        if (enrolledAt == null) {
            enrolledAt = Instant.now();
        }
    }

    public boolean isExpired() {
        return expiresAt != null && expiresAt.isBefore(Instant.now());
    }
}
