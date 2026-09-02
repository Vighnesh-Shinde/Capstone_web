package com.project.depression.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record AdminUserResponse(
        UUID id,
        String name,
        String email,
        String username,
        String role,
        String status,
        ProfessionalProfileDto profile,
        Instant verifiedAt,
        LocalDate verifiedUntil,
        /**
         * Computed server-side. An admin scanning forty counselors will not
         * compare forty dates against today; a flag is what actually gets seen.
         */
        boolean verificationExpired,
        Instant createdAt,
        Instant lastLoginAt,
        long sessionCount
) {
}
