package com.project.depression.service;

/** Thrown at login when a COUNSELOR account's linked application isn't APPROVED. */
public class AccountNotApprovedException extends RuntimeException {
    public AccountNotApprovedException(String message) {
        super(message);
    }
}
