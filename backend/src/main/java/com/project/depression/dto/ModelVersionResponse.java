package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

public record ModelVersionResponse(
        UUID id,
        String modality,
        String versionLabel,
        String fileName,
        String sha256,
        Integer featureCount,
        Double threshold,
        String modelSummary,
        String notes,
        boolean active,
        String uploadedByName,
        Instant uploadedAt,
        Instant activatedAt
) {
}
