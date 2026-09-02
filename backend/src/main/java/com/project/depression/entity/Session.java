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
@Table(name = "sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Session {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "counselor_id", nullable = false)
    private User counselor;

    @Column(name = "participant_ref", nullable = false)
    private String participantRef;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "participant_id", nullable = false)
    private Participant participant;

    /**
     * BCP-47 code the interview was conducted in, chosen by the counselor.
     *
     * Recorded on the session rather than detected at analysis time: Whisper's
     * auto-detect reads the first ~30 seconds, which in a counselling session
     * is small talk, and it is unreliable on code-switched speech — so the same
     * recording could transcribe two different ways on two runs. It also
     * decides whether the session can be scored at all; see the ML service's
     * languages.py.
     */
    @Column(nullable = false, length = 10)
    @Builder.Default
    private String language = "en";

    @Column(name = "video_path")
    private String videoPath;

    @Column(name = "transcript_path")
    private String transcriptPath;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private SessionStatus status = SessionStatus.UPLOADED;

    @Column(name = "consent_recording", nullable = false)
    @Builder.Default
    private boolean consentRecording = false;

    @Column(name = "consent_ai_analysis", nullable = false)
    @Builder.Default
    private boolean consentAiAnalysis = false;

    @Column(name = "consent_storage", nullable = false)
    @Builder.Default
    private boolean consentStorage = false;

    // Separate from the other consent flags: only this one gates research
    // dataset eligibility. The other three do not block AI processing either
    // way, but capturing them mirrors what participants actually agreed to.
    @Column(name = "consent_research_reuse", nullable = false)
    @Builder.Default
    private boolean consentResearchReuse = false;

    // The counselor's own editable working notes. Distinct from
    // CounselorJudgment.observation, which is the formal assessment that feeds
    // the research dataset and is written once.
    @Column(name = "notes", length = 4000)
    private String notes;

    @Column(name = "consent_version")
    private String consentVersion;

    /**
     * Which diarized cluster was judged to be whom, and the cosine similarity
     * behind each judgement, keyed by diarized label.
     *
     * Persisted because this is the decision that determined whose mental
     * health was scored. The audio is deleted on a retention schedule; the
     * reasoning that pointed the model at one person rather than another has
     * to outlive it, or a report becomes unauditable.
     */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "speaker_similarities", columnDefinition = "jsonb")
    private java.util.Map<String, java.util.Map<String, Double>> speakerSimilarities;

    @Column(name = "participant_speaker", length = 50)
    private String participantSpeaker;

    @Column(name = "counselor_speaker", length = 50)
    private String counselorSpeaker;

    /** The conversation in DAIC-WOZ format, for the research export. */
    @Column(name = "daic_transcript_path", length = 500)
    private String daicTranscriptPath;

    /**
     * Why this session produced no report.
     *
     * Previously a failure left a status and a line in the server log, so a
     * counselor saw "Failed" with no way to tell whether to re-upload,
     * re-record, or call somebody. Most failures here are recoverable by the
     * counselor, and only if they are told what happened.
     */
    @Column(name = "failure_reason", length = 1000)
    private String failureReason;

    @Enumerated(EnumType.STRING)
    @Column(name = "speaker_attribution", nullable = false, length = 30)
    @Builder.Default
    private SpeakerAttribution speakerAttribution = SpeakerAttribution.VOICEPRINT;

    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private java.util.List<SessionCompanion> companions = new java.util.ArrayList<>();

    @Column(name = "consent_recorded_at")
    private Instant consentRecordedAt;

    // Set when a participant withdraws consent after the fact. Excludes the
    // session from the research dataset without destroying the clinical record.
    @Column(name = "consent_withdrawn_at")
    private Instant consentWithdrawnAt;

    // Set when the retention sweep removes the raw recording. The report,
    // transcript and feature vectors deliberately outlive it.
    @Column(name = "video_deleted_at")
    private Instant videoDeletedAt;

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
