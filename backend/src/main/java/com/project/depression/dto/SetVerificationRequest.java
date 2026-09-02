package com.project.depression.dto;

import java.time.LocalDate;

/**
 * Renew or clear an administrator's verification of a counselor.
 *
 * A null {@code verifiedUntil} clears the review date rather than meaning
 * "unchanged" — an admin who has decided a counselor needs no scheduled
 * re-check has to be able to say so, and a field that can only ever be set is
 * a trap.
 */
public record SetVerificationRequest(LocalDate verifiedUntil, String note) {
}
