package com.project.depression.entity;

/**
 * What a verification document is meant to prove.
 *
 * Previously an application carried an unlabelled pile of files, so an admin
 * opening "scan_2.pdf" had to work out what it was for, and an expired licence
 * looked identical to a current one. Typing the upload is what turns "some
 * documents were attached" into a decision someone could defend later.
 */
public enum DocumentType {

    /** Practising licence or professional registration certificate. */
    LICENCE("Professional licence / registration"),

    /** Degree, diploma, or other qualification certificate. */
    DEGREE("Qualification certificate"),

    /** Government photo ID, to tie the licence to the person holding it. */
    PHOTO_ID("Government photo ID"),

    /** Professional indemnity / malpractice insurance. */
    INSURANCE("Professional indemnity insurance"),

    /** Letter from an employing clinic, hospital, or university. */
    EMPLOYMENT("Employment or affiliation letter"),

    OTHER("Other supporting document");

    private final String label;

    DocumentType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** Lenient parse — an unrecognised value becomes OTHER rather than a 500. */
    public static DocumentType parse(String value) {
        if (value == null || value.isBlank()) {
            return OTHER;
        }
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return OTHER;
        }
    }
}
