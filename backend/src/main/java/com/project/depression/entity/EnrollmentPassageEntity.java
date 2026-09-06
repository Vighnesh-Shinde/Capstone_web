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
 * A version of the passage people read aloud to enrol their voice.
 *
 * Superseded versions are kept rather than overwritten: a voiceprint records
 * which version its owner read, and that reference has to still resolve to
 * something months later.
 */
@Entity
@Table(name = "enrollment_passages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EnrollmentPassageEntity {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false, unique = true, length = 20)
    private String version;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(length = 500)
    private String notes;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
