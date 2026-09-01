package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

public record SessionResponse(
        UUID id,
        UUID participantId,
        String participantRef,
        String status,
        String prediction,
        Double confidenceScore,
        String notes,
        // The consent record captured at upload. Surfaced so a counselor can
        // answer "what did they agree to?" without database access.
        boolean consentRecording,
        boolean consentAiAnalysis,
        boolean consentStorage,
        boolean consentResearchReuse,
        String consentVersion,
        Instant consentRecordedAt,
        Instant consentWithdrawnAt,
        Instant videoDeletedAt,
        Instant createdAt,
        Instant updatedAt
) {
}
