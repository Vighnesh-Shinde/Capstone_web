package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

public record ApplicationSubmitResponse(
        UUID id,
        String status,
        Instant submittedAt
) {
}
