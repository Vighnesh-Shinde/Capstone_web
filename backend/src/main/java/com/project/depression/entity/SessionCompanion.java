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
 * Somebody else who was in the room for one session — an interpreter, a
 * parent, a spouse.
 *
 * Their voiceprint exists so their speech can be separated OUT, not analysed.
 * Without it their words and voice would land in the participant's feature
 * vectors and corrupt the measurement.
 *
 * Scoped to a single session and never reused. A companion has no account
 * here and did not agree to be recognised at anybody else's appointment; the
 * vector is purged when the session's video is deleted on the retention
 * schedule, because it has no purpose once the audio it segmented is gone.
 */
@Entity
@Table(name = "session_companions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SessionCompanion {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private Session session;

    /**
     * How they were described ("Interpreter", "Mother"). Not a name: this
     * record needs to tell voices apart, not identify a third party who never
     * consented to being on file.
     */
    @Column(name = "role_label", length = 100)
    private String roleLabel;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<Double> embedding;

    @Column(nullable = false)
    private Integer dimension;

    @Column(name = "speech_seconds")
    private Double speechSeconds;

    /** Their own agreement, separate from the participant's — a different person, a different thing. */
    @Column(name = "consent_given", nullable = false)
    @Builder.Default
    private boolean consentGiven = false;

    @Column(name = "consent_recorded_at")
    private Instant consentRecordedAt;

    /**
     * Which diarized cluster in the session audio turned out to be them.
     *
     * Filled in after processing. Without it the report can say a companion was
     * present but not which voice they were, so their row in the match-score
     * table would read "Excluded" with no explanation of what it was excluded as.
     */
    @Column(name = "diarized_label", length = 50)
    private String diarizedLabel;

    @Column(name = "enrolled_at", nullable = false)
    private Instant enrolledAt;

    @Column(name = "purged_at")
    private Instant purgedAt;

    @PrePersist
    public void prePersist() {
        if (enrolledAt == null) {
            enrolledAt = Instant.now();
        }
    }
}
