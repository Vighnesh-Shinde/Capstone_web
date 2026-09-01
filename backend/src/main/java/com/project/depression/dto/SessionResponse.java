package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

public record SessionResponse(
        UUID id,
        String participantRef,
        String status,
        String prediction,
        Double confidenceScore,
        Instant createdAt,
        Instant updatedAt
) {
}
