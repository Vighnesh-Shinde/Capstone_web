package com.project.depression.dto;

public record UpdateNotificationsRequest(
        boolean analysisComplete,
        boolean analysisFailed,
        boolean needsReview,
        boolean assessmentDiffers,
        boolean reportGenerated
) {
}
