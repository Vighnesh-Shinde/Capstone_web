package com.project.depression.dto;

public record EnrollmentPassageResponse(
        String version,
        String text,
        int approxSeconds,
        int minSpeechSeconds
) {
}
