package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

public record AuditLogResponse(
        UUID id,
        String actorName,
        String action,
        String targetType,
        UUID targetId,
        String metadata,
        Instant createdAt
) {
}
