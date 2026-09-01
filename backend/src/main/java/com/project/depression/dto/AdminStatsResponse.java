package com.project.depression.dto;

public record AdminStatsResponse(
        long pendingApplications,
        long approvedCounselors,
        long totalSessions,
        long datasetAwaitingJudgment,
        long datasetUnderReview,
        long datasetApproved,
        long datasetRejected,
        long datasetExcludedNoConsent
) {
}
