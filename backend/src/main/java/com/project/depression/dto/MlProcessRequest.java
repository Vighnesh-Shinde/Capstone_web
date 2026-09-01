package com.project.depression.dto;

public record MlProcessRequest(
        String session_id,
        String video_path
) {
}
