package com.project.depression.dto;

import jakarta.validation.constraints.NotBlank;

public record ForgotPasswordRequest(
        @NotBlank String identifier,
        /** Only enforced when the server has a CAPTCHA secret configured. */
        String captchaToken
) {
}
