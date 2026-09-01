package com.project.depression.service;

/** Thrown when an uploaded file fails content-type/extension/size validation. */
public class InvalidFileException extends RuntimeException {
    public InvalidFileException(String message) {
        super(message);
    }
}
