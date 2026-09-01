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

    @Column(name = "consent_version")
    private String consentVersion;

    @Column(name = "consent_recorded_at")
    private Instant consentRecordedAt;

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
