package com.project.depression.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * The ID token Google Identity Services handed the browser.
 *
 * `captchaToken` is optional at the type level because CAPTCHA is only
 * enforced when the server has a secret configured — see CaptchaService for
 * why that is the safe default here.
 */
public record GoogleLoginRequest(
        @NotBlank String credential,
        String captchaToken
) {
}
