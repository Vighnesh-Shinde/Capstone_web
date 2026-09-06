package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

/** One version of the enrolment passage, for the admin screen. */
public record EnrollmentPassageAdminResponse(
        UUID id,
        String version,
        String body,
        boolean active,
        Instant createdAt,
        String notes,
        int wordCount,
        /** Rough read-aloud time at 150 words per minute. */
        int approxSeconds
) {
}
