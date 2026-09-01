package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * One point on a participant's history timeline: what the AI said, what the
 * counselor concluded, and whether they agreed.
 */
public record ParticipantSessionResponse(
        UUID sessionId,
        String status,
        String prediction,
        Double confidenceScore,
        String counselorAssessment,
        String agreement,
        Instant createdAt
) {
}
