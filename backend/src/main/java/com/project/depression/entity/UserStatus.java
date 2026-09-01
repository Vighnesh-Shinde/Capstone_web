package com.project.depression.entity;

/**
 * Whether an existing account may currently be used.
 *
 * Deliberately separate from {@link ApplicationStatus}: that governs whether a
 * counselor account should be created in the first place, this governs an
 * account that already exists. An ADMIN has no application, so this is the only
 * lever an operator has over one.
 */
public enum UserStatus {
    ACTIVE,
    SUSPENDED
}
