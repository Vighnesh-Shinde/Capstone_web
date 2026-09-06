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
import java.util.UUID;

/**
 * The feature vectors a session's models actually consumed.
 *
 * Kept so a training set can be assembled from real sessions without
 * re-processing archived video — which is also what allows the raw recording to
 * be deleted on a retention schedule without losing the ability to retrain.
 *
 * Vectors are stored as JSON arrays rather than as columns: nothing queries an
 * individual feature, and a retrained model with different widths must not
 * require a schema migration.
 */
@Entity
@Table(name = "session_features")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SessionFeatures {

    @Id
    @GeneratedValue
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false, unique = true)
    private Session session;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "text_features", columnDefinition = "jsonb")
    private double[] textFeatures;

    /**
     * Facial geometry over the session. Null when no face could be measured —
     * a recording with the participant off camera still has usable audio and
     * text, so this is a reason to store less, not to fail.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "video_features", columnDefinition = "jsonb")
    private double[] videoFeatures;

    @Column(name = "video_features_error", length = 500)
    private String videoFeaturesError;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "audio_features", columnDefinition = "jsonb")
    private double[] audioFeatures;

    /** Participant speech only, as the text model sees it. */
    @Column(name = "transcript_text", columnDefinition = "text")
    private String transcriptText;

    @Column(name = "text_feature_count")
    private Integer textFeatureCount;

    @Column(name = "audio_feature_count")
    private Integer audioFeatureCount;

    @Column(name = "extracted_at", nullable = false)
    private Instant extractedAt;

    @PrePersist
    public void prePersist() {
        if (extractedAt == null) {
            extractedAt = Instant.now();
        }
    }
}
