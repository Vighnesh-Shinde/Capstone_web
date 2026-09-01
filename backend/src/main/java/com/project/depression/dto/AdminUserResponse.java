package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

public record AdminUserResponse(
        UUID id,
        String name,
        String email,
        String username,
        String role,
        String status,
        Instant createdAt,
        Instant lastLoginAt,
        long sessionCount
) {
}
