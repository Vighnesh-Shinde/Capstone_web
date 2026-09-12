package com.project.depression.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record ReportResponse(
        UUID sessionId,
        String prediction,
        Double confidenceScore,
        ModalityContributionsResponse modalityContributions,
        List<ExplanationFactorResponse> explanationFactors,
        CounselorJudgmentResponse judgment, // null if the counselor hasn't submitted one yet
        Instant createdAt,
        Map<String, Object> scoringDetails // null for reports created before V15
) {
}
