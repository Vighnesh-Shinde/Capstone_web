package com.project.depression.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ReportResponse(
        UUID sessionId,
        String prediction,
        Double confidenceScore,
        ModalityContributionsResponse modalityContributions,
        List<ExplanationFactorResponse> explanationFactors,
        CounselorJudgmentResponse judgment, // null if the counselor hasn't submitted one yet
        Instant createdAt
) {
}
