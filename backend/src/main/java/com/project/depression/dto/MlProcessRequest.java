package com.project.depression.dto;

/**
 * Snake_case field names match the ML service's Pydantic model exactly, so no
 * naming strategy has to be configured on either side.
 */
public record MlProcessRequest(
        String session_id,
        String video_path,
        String language
) {
}
