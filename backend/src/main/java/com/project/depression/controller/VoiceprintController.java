package com.project.depression.controller;

import com.project.depression.dto.EnrollmentPassageResponse;
import com.project.depression.dto.VoiceprintStatusResponse;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import com.project.depression.service.EnrollmentPassageService;
import com.project.depression.service.VoiceprintService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.NoSuchElementException;

/**
 * A counselor recording their own voice, so sessions can tell it apart from
 * the participant's.
 *
 * Under /api/me, because a voiceprint is part of the signed-in counselor's own
 * account and nobody else's business: there is deliberately no endpoint for
 * enrolling somebody else's voice, or for reading a voiceprint back out. The
 * vector goes to the ML service and nowhere else.
 */
@RestController
@RequestMapping("/api/me/voiceprint")
public class VoiceprintController {

    private final VoiceprintService voiceprintService;
    private final UserRepository userRepository;
    private final EnrollmentPassageService passageService;

    public VoiceprintController(
            VoiceprintService voiceprintService,
            UserRepository userRepository,
            EnrollmentPassageService passageService
    ) {
        this.voiceprintService = voiceprintService;
        this.userRepository = userRepository;
        this.passageService = passageService;
    }

    /** Whether this counselor can start a session, and when they must record again. */
    @GetMapping
    public ResponseEntity<VoiceprintStatusResponse> status(Authentication authentication) {
        return ResponseEntity.ok(voiceprintService.status(currentUser(authentication)));
    }

    /**
     * The passage to read aloud.
     *
     * Served from the backend rather than hardcoded in the frontend so that
     * the version stored on every enrollment row always matches the text the
     * person actually read.
     */
    @GetMapping("/passage")
    public ResponseEntity<EnrollmentPassageResponse> passage() {
        var passage = passageService.active();
        return ResponseEntity.ok(new EnrollmentPassageResponse(
                passage.getVersion(),
                passage.getBody(),
                // Estimated from the text rather than hardcoded, so the guidance
                // stays honest after an admin edits the passage.
                estimateSeconds(passage.getBody()),
                12
        ));
    }

    /** Roughly 150 words a minute, the usual pace for reading aloud. */
    private static int estimateSeconds(String body) {
        int words = body.trim().split("\\s+").length;
        return Math.max(15, (int) Math.round(words / 150.0 * 60));
    }

    /**
     * Submit a recording of the passage.
     *
     * Replaces any previous enrollment. The audio is deleted as soon as the
     * vector is extracted — see VoiceprintService.
     */
    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<VoiceprintStatusResponse> enroll(
            Authentication authentication,
            @RequestParam("audio") MultipartFile audio
    ) {
        return ResponseEntity.ok(voiceprintService.enroll(currentUser(authentication), audio));
    }

    private User currentUser(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new NoSuchElementException("User not found"));
    }
}
