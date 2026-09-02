package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

public record SessionResponse(
        UUID id,
        UUID participantId,
        String participantRef,
        String status,
        // The language the interview was conducted in, and its display name.
        // Shown on the session and the report because a transcript in a
        // language the reader doesn't speak is otherwise unexplained.
        String language,
        String languageName,
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
