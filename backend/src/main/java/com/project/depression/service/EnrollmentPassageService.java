package com.project.depression.service;

import com.project.depression.entity.EnrollmentPassageEntity;
import com.project.depression.entity.User;
import com.project.depression.repository.EnrollmentPassageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.regex.Pattern;

/**
 * The passage everyone reads to enrol a voice, and the admin's ability to
 * change it.
 *
 * THE SAME TEXT FOR EVERYONE
 * --------------------------
 * A counsellor enrolling their own voice and a participant's companion
 * enrolling at the start of a session read the *same* active passage. That is
 * not a convenience — the voiceprints are compared against each other, and
 * comparing embeddings drawn from different material introduces a difference
 * that has nothing to do with whose voice it is.
 *
 * CHANGING IT IS SAFE
 * -------------------
 * A voiceprint describes how somebody sounds, not what they said, so editing
 * the passage does not invalidate existing enrolments and nobody has to
 * re-record. Superseded versions are kept, because each voiceprint records the
 * version its owner read and that reference must still resolve later.
 */
@Service
public class EnrollmentPassageService {

    private static final Logger log = LoggerFactory.getLogger(EnrollmentPassageService.class);

    /**
     * Enough speech to characterise a voice. The extractor rejects anything
     * under 12 seconds of detected speech, and a passage this short read at a
     * normal pace lands around 20 — so this is the floor below which an admin
     * would be setting their counsellors up to fail.
     */
    private static final int MIN_WORDS = 40;
    private static final int MAX_CHARS = 4000;

    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    private final EnrollmentPassageRepository repository;
    private final AuditLogService auditLogService;

    public EnrollmentPassageService(
            EnrollmentPassageRepository repository,
            AuditLogService auditLogService
    ) {
        this.repository = repository;
        this.auditLogService = auditLogService;
    }

    @Transactional(readOnly = true)
    public EnrollmentPassageEntity active() {
        return repository.findByActiveIsTrue().orElseThrow(() -> {
            // The migration seeds one and the unique index keeps exactly one
            // live, so this means somebody deactivated every row by hand.
            log.error("No active enrollment passage. Voice enrolment cannot proceed.");
            return new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "No voice-enrolment passage is configured. Please contact your administrator.");
        });
    }

    @Transactional(readOnly = true)
    public List<EnrollmentPassageEntity> history() {
        return repository.findAllByOrderByCreatedAtDesc();
    }

    /**
     * Replace the live passage with new text.
     *
     * Creates a new version rather than editing the current row in place, so
     * the text a given voiceprint was recorded against stays recoverable.
     */
    @Transactional
    public EnrollmentPassageEntity update(User admin, String body, String notes) {
        String cleaned = normalise(body);
        validate(cleaned);

        EnrollmentPassageEntity current = repository.findByActiveIsTrue().orElse(null);
        if (current != null && current.getBody().equals(cleaned)) {
            // Not an error, just nothing to do. Creating an identical version
            // would clutter the history and misreport when the text last
            // actually changed.
            return current;
        }

        if (current != null) {
            // Deactivated and flushed before the new row is inserted: the
            // partial unique index permits only one active passage, so both
            // cannot be live even momentarily.
            current.setActive(false);
            repository.saveAndFlush(current);
        }

        EnrollmentPassageEntity saved = repository.save(EnrollmentPassageEntity.builder()
                .version(nextVersion())
                .body(cleaned)
                .active(true)
                .createdBy(admin.getId())
                .notes(notes == null || notes.isBlank() ? null : notes.trim())
                .build());

        auditLogService.log(admin, "ENROLLMENT_PASSAGE_UPDATED", "ENROLLMENT_PASSAGE",
                saved.getId(), "now " + saved.getVersion());

        log.info("Enrollment passage updated to {} by {}", saved.getVersion(), admin.getEmail());
        return saved;
    }

    /**
     * Collapses runs of whitespace and trims.
     *
     * The passage is read aloud from a screen, so line breaks pasted in from a
     * word processor carry no meaning but do change the rendering. Normalising
     * on the way in means the stored text is what the reader actually sees.
     */
    private static String normalise(String body) {
        if (body == null) {
            return "";
        }
        return WHITESPACE.matcher(body).replaceAll(" ").trim();
    }

    private static void validate(String body) {
        if (body.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The passage cannot be empty.");
        }
        if (body.length() > MAX_CHARS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "The passage is too long (" + body.length() + " characters, maximum " + MAX_CHARS + ").");
        }

        int words = body.split(" ").length;
        if (words < MIN_WORDS) {
            // Rejected rather than warned about: an admin cannot see the
            // consequence of a short passage, but every counsellor who then
            // fails enrolment can.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "The passage is only " + words + " words. It needs at least " + MIN_WORDS
                            + " so that reading it aloud produces enough speech to recognise a "
                            + "voice — shorter passages will fail enrolment for everyone.");
        }
    }

    /** v1 -> v2 -> v3. Falls back to a timestamp if the sequence is ever broken. */
    private String nextVersion() {
        int highest = 0;
        for (EnrollmentPassageEntity passage : repository.findAll()) {
            String version = passage.getVersion();
            if (version != null && version.matches("v\\d+")) {
                highest = Math.max(highest, Integer.parseInt(version.substring(1)));
            }
        }
        return highest > 0 ? "v" + (highest + 1) : "v" + System.currentTimeMillis();
    }
}
