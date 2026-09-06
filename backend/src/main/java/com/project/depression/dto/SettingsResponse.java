package com.project.depression.dto;

import java.time.Instant;

/**
 * Everything the Settings screen needs beyond the profile itself.
 *
 * Deliberately excludes anything secret. `googleLinked` is a boolean rather
 * than the Google subject id, because the screen only needs to say whether the
 * account is linked — the identifier itself has no business leaving the server.
 */
public record SettingsResponse(
        String email,
        boolean emailVerified,
        /** Set while an address change is awaiting confirmation. */
        String pendingEmail,
        Instant pendingEmailRequestedAt,

        boolean googleLinked,
        Instant googleLinkedAt,
        /** False when the deployment has no Google client ID, so the UI can say why. */
        boolean googleAvailable,

        NotificationPreferences notifications
) {
    public record NotificationPreferences(
            boolean analysisComplete,
            boolean analysisFailed,
            boolean needsReview,
            boolean assessmentDiffers,
            boolean reportGenerated
    ) {
    }
}
