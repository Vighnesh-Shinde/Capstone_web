package com.project.depression.dto;

public record LoginResponse(
        String token,
        String email,
        String username,
        String name,
        String role
) {
}
