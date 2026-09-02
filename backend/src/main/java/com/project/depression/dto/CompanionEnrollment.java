package com.project.depression.dto;

import org.springframework.web.multipart.MultipartFile;

/**
 * One person accompanying the participant, and their recording of the passage.
 *
 * `consentGiven` is carried explicitly rather than inferred from the presence
 * of audio. Somebody can hand over a recording without having understood what
 * it is for, and this is a third party's biometric data — the agreement has to
 * be a separate, recorded act.
 */
public record CompanionEnrollment(
        MultipartFile audio,
        String roleLabel,
        boolean consentGiven
) {
}
