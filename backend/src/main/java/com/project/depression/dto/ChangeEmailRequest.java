package com.project.depression.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * The current password is required, not optional.
 *
 * An email address is the account's recovery route. Someone who walks up to an
 * unlocked laptop and changes it owns the account permanently, so this asks
 * for something only the real owner knows.
 */
public record ChangeEmailRequest(
        @NotBlank @Email String newEmail,
        @NotBlank String currentPassword
) {
}
