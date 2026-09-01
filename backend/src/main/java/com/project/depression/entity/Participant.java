package com.project.depression.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * A counselor's own record of a participant, used to group repeat sessions
 * with the same person (DAIC-WOZ-style) and to organize storage by
 * participant rather than by isolated session. Scoped per-counselor — see
 * SessionService/ParticipantService for why (matches the existing rule that
 * counselors never see each other's data).
 */
@Entity
@Table(name = "participants")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Participant {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "counselor_id", nullable = false)
    private User counselor;

    @Column(name = "participant_ref", nullable = false)
    private String participantRef;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "last_session_at")
    private Instant lastSessionAt;

    @PrePersist
    public void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (lastSessionAt == null) {
            lastSessionAt = now;
        }
    }
}
