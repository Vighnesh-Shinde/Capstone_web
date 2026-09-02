package com.project.depression.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ProfileResponse(
        UUID id,
        String name,
        String email,
        String username,
        String role,
        String status,
        ProfessionalProfileDto profile,
        Instant verifiedAt,
        LocalDate verifiedUntil,
        /** Server-computed so the warning banner doesn't depend on client clocks. */
        boolean verificationExpired,
        Instant createdAt,
        Instant lastLoginAt,
        Instant passwordChangedAt
) {
}
