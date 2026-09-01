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
        Instant createdAt,
        Instant updatedAt
) {
}
