package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

public record DatasetSampleResponse(
        UUID id,
        UUID sessionId,
        String participantRef,
        String aiPrediction,
        Double aiConfidence,
        String counselorAssessment, // null if no judgment yet
        String agreement, // null if no judgment yet
        String eligibilityStatus,
        Instant createdAt
) {
}
