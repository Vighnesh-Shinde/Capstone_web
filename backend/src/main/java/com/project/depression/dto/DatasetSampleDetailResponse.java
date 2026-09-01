package com.project.depression.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record DatasetSampleDetailResponse(
        UUID id,
        UUID sessionId,
        String participantRef,
        String counselorName,
        String counselorEmail,
        String aiPrediction,
        Double aiConfidence,
        ModalityContributionsResponse modalityContributions,
        List<ExplanationFactorResponse> explanationFactors,
        CounselorJudgmentResponse judgment,
        boolean consentRecording,
        boolean consentAiAnalysis,
        boolean consentStorage,
        boolean consentResearchReuse,
        String eligibilityStatus,
        String adminNotes,
        String adminReviewedByName,
        Instant adminReviewedAt,
        Instant sessionCreatedAt,
        Instant createdAt
) {
}
