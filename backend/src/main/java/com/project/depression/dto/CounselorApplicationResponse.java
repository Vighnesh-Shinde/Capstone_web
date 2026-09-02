package com.project.depression.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * An application as an administrator reviews it.
 *
 * The professional and contact fields are nested in {@code profile} rather than
 * flattened into another twenty components here: the same block is rendered on
 * the counselor's own profile screen, and one shared shape means the review
 * screen and the profile screen cannot disagree about what a counselor is.
 */
public record CounselorApplicationResponse(
        UUID id,
        String fullName,
        String email,
        /** Legacy free-text phone from applications predating structured numbers. */
        String legacyPhone,
        String experience,
        String additionalInfo,
        ProfessionalProfileDto profile,
        String status,
        String rejectionReason,
        Instant submittedAt,
        Instant reviewedAt,
        String reviewedByName,
        List<VerificationDocumentResponse> documents
) {
}
