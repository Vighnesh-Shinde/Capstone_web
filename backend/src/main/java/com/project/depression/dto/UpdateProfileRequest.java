package com.project.depression.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @NotBlank @Size(max = 255) String name,

        // Nullable: counselors may have no username and keep signing in by email.
        // Constrained to identifier-safe characters so it can't be confused with
        // an email address at login-resolution time.
        @Size(min = 3, max = 50)
        @Pattern(regexp = "^[A-Za-z0-9._-]+$",
                message = "Username may only contain letters, numbers, dots, underscores and hyphens")
        String username
) {
}
