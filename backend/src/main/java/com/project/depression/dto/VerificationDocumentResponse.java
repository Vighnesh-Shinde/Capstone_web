package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

public record VerificationDocumentResponse(
        UUID id,
        String fileName,
        String contentType,
        Instant uploadedAt
) {
}
