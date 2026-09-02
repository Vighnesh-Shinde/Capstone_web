package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

public record ModelVersionResponse(
        UUID id,
        String modality,
        /** BCP-47 code these weights serve; 'en' for everything uploaded before languages existed. */
        String language,
        String languageName,
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
