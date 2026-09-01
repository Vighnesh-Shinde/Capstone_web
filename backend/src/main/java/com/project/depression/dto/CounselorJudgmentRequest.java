package com.project.depression.dto;

import jakarta.validation.constraints.NotBlank;

public record CounselorJudgmentRequest(
        @NotBlank String assessment, // "depressed" or "not_depressed"
        String observation
) {
}
