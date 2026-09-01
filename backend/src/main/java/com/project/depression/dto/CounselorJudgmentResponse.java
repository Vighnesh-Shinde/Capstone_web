package com.project.depression.dto;

import java.time.Instant;

public record CounselorJudgmentResponse(
        String assessment,
        String observation,
        String agreement, // AGREE / DISAGREE, computed against the AI prediction
        Instant submittedAt
) {
}
