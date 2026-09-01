package com.project.depression.dto;

public record MlExplanationItem(
        String feature_name,
        Double contribution_score,
        String description,
        String modality
) {
}
