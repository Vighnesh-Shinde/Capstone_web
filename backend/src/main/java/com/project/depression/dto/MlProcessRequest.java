package com.project.depression.dto;

import java.util.List;

/**
 * Snake_case field names match the ML service's Pydantic model exactly, so no
 * naming strategy has to be configured on either side.
 */
public record MlProcessRequest(
        String session_id,
        String video_path,
        String language,
        /** The counselor's enrolled voice, so their speech can be excluded. */
        List<Double> counselor_embedding,
        /** One per other person in the room, for the same reason. */
        List<List<Double>> companion_embeddings
) {
}
