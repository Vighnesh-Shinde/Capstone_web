package com.project.depression.dto;

import java.util.List;
import java.util.Map;

public record MlProcessResponse(
        String prediction,
        Double confidence_score,
        List<MlExplanationItem> explanation,
        Map<String, Double> modality_contributions,
        // Null on the mock pipeline, which has no real features to report.
        List<Double> text_features,
        List<Double> audio_features,
        String transcript_text
) {
}
