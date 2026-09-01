package com.project.depression.dto;

public record ExplanationFactorResponse(
        String featureName,
        Double contributionScore,
        String description,
        String modality
) {
}
