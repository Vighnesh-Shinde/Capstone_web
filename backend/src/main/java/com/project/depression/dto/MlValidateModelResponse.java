package com.project.depression.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** Mirrors ml-service/app/internal_admin.py's ValidateModelResponse. */
public record MlValidateModelResponse(
        boolean ok,
        @JsonProperty("feature_count") Integer featureCount,
        @JsonProperty("expected_feature_count") Integer expectedFeatureCount,
        Double threshold,
        @JsonProperty("has_cols") boolean hasCols,
        @JsonProperty("n_cols") Integer nCols,
        @JsonProperty("model_repr") String modelRepr,
        String error
) {
}
