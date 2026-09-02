package com.project.depression.dto;

import java.util.List;

/** Snake_case to match the ML service's Pydantic model exactly. */
public record MlEnrollVoiceResponse(
        boolean ok,
        List<Double> embedding,
        Integer dimension,
        Double speech_seconds,
        /** Written for the person who recorded, so it is shown to them verbatim. */
        String error
) {
}
