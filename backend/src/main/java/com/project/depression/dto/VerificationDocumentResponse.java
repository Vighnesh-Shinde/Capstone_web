package com.project.depression.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record VerificationDocumentResponse(
        UUID id,
        String fileName,
        String contentType,
        String docType,
        String docTypeLabel,
        String issuingAuthority,
        String documentNumber,
        LocalDate issuedOn,
        LocalDate expiresOn,
        /** Server-computed, so an out-of-date certificate is visible at a glance. */
        boolean expired,
        Long fileSize,
        Instant uploadedAt
) {
}
