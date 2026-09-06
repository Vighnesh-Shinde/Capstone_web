package com.project.depression.controller;

import com.project.depression.dto.EnrollmentPassageAdminResponse;
import com.project.depression.dto.UpdateEnrollmentPassageRequest;
import com.project.depression.entity.EnrollmentPassageEntity;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import com.project.depression.service.EnrollmentPassageService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;

/**
 * Lets an administrator change the passage everyone reads to enrol a voice.
 *
 * Under /api/admin, so the existing ADMIN role rule in SecurityConfig covers
 * it. Counsellors read the active passage through /api/me/voiceprint/passage
 * and cannot change it — the text has to be the same for every person whose
 * voiceprints get compared to each other.
 */
@RestController
@RequestMapping("/api/admin/enrollment-passage")
public class AdminEnrollmentPassageController {

    private final EnrollmentPassageService passageService;
    private final UserRepository userRepository;

    public AdminEnrollmentPassageController(
            EnrollmentPassageService passageService,
            UserRepository userRepository
    ) {
        this.passageService = passageService;
        this.userRepository = userRepository;
    }

    /** Every version, newest first. The live one is flagged. */
    @GetMapping
    public ResponseEntity<List<EnrollmentPassageAdminResponse>> history() {
        return ResponseEntity.ok(passageService.history().stream().map(this::toResponse).toList());
    }

    /**
     * Replace the live passage.
     *
     * Creates a new version rather than editing in place, so the text any
     * existing voiceprint was recorded against stays recoverable. Nobody has to
     * re-enrol: a voiceprint describes a voice, not a script.
     */
    @PutMapping
    public ResponseEntity<EnrollmentPassageAdminResponse> update(
            Authentication authentication,
            @Valid @RequestBody UpdateEnrollmentPassageRequest request
    ) {
        User admin = userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new NoSuchElementException("User not found"));
        return ResponseEntity.ok(
                toResponse(passageService.update(admin, request.body(), request.notes())));
    }

    private EnrollmentPassageAdminResponse toResponse(EnrollmentPassageEntity passage) {
        int words = passage.getBody().trim().split("\\s+").length;
        return new EnrollmentPassageAdminResponse(
                passage.getId(),
                passage.getVersion(),
                passage.getBody(),
                passage.isActive(),
                passage.getCreatedAt(),
                passage.getNotes(),
                words,
                Math.max(15, (int) Math.round(words / 150.0 * 60)));
    }
}
