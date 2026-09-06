package com.project.depression.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateEnrollmentPassageRequest(
        @NotBlank String body,
        /** Why it changed — shown in the version history. */
        String notes
) {
}
