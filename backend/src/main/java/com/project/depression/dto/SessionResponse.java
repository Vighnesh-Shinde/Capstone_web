package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

public record SessionResponse(
        UUID id,
        UUID participantId,
        String participantRef,
        String status,
        // The language the interview was conducted in, and its display name.
        // Shown on the session and the report because a transcript in a
        // language the reader doesn't speak is otherwise unexplained.
        String language,
        String languageName,
        String prediction,
        Double confidenceScore,
        String notes,

        // Why this session produced no report. Previously a counselor saw
        // "Failed" and had no way to tell whether to re-upload, re-record, or
        // call somebody.
        String failureReason,

        // How the speakers were told apart, and the evidence for it. Shown on
        // the report because this decided whose speech the model read.
        String speakerAttribution,
        java.util.Map<String, java.util.Map<String, Double>> speakerSimilarities,
        java.util.List<SessionCompanionResponse> companions,
        // The consent record captured at upload. Surfaced so a counselor can
        // answer "what did they agree to?" without database access.
        boolean consentRecording,
        boolean consentAiAnalysis,
        boolean consentStorage,
        boolean consentResearchReuse,
        String consentVersion,
        Instant consentRecordedAt,
        Instant consentWithdrawnAt,
        Instant videoDeletedAt,
        Instant createdAt,
        Instant updatedAt
) {
}
