package com.project.depression.dto;

import jakarta.validation.constraints.Size;

public record UpdateSessionNotesRequest(
        @Size(max = 4000, message = "Notes are limited to 4000 characters") String notes
) {
}
