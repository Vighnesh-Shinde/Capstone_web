package com.project.depression.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CounselorApplicationResponse(
        UUID id,
        String fullName,
        String email,
        String phone,
        String organization,
        String professionalRole,
        String qualification,
        String experience,
        String registrationNumber,
        String additionalInfo,
        String status,
        String rejectionReason,
        Instant submittedAt,
        Instant reviewedAt,
        String reviewedByName,
        List<VerificationDocumentResponse> documents
) {
}
