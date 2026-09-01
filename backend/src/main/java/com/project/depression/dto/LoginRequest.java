package com.project.depression.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * `identifier` is a username OR an email — deliberately not @Email-validated,
 * since admins sign in with a username. Which one it is gets resolved in
 * AuthService.login.
 */
public record LoginRequest(
        @NotBlank String identifier,
        @NotBlank String password
) {
}
