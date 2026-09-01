package com.project.depression.dto;

import java.util.List;
import java.util.Map;

public record MlProcessResponse(
        String prediction,
        Double confidence_score,
        List<MlExplanationItem> explanation,
        Map<String, Double> modality_contributions
) {
}
