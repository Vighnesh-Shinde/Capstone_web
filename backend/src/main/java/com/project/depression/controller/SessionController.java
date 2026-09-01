package com.project.depression.controller;

import com.project.depression.dto.PageResponse;
import com.project.depression.dto.ReportResponse;
import com.project.depression.dto.SessionResponse;
import com.project.depression.service.SessionService;
import jakarta.validation.constraints.NotBlank;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final SessionService sessionService;

    public SessionController(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<SessionResponse> createSession(
            Authentication authentication,
            @RequestParam("video") MultipartFile video,
            @RequestParam("participant_ref") @NotBlank String participantRef,
            @RequestParam(value = "consent_recording", defaultValue = "false") boolean consentRecording,
            @RequestParam(value = "consent_ai_analysis", defaultValue = "false") boolean consentAiAnalysis,
            @RequestParam(value = "consent_storage", defaultValue = "false") boolean consentStorage,
            @RequestParam(value = "consent_research_reuse", defaultValue = "false") boolean consentResearchReuse
    ) {
        SessionResponse response = sessionService.createSession(
                authentication.getName(), participantRef, video,
                consentRecording, consentAiAnalysis, consentStorage, consentResearchReuse
        );
        return ResponseEntity.status(201).body(response);
    }

    @GetMapping
    public ResponseEntity<PageResponse<SessionResponse>> listSessions(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        return ResponseEntity.ok(sessionService.listSessions(authentication.getName(), pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<SessionResponse> getSession(Authentication authentication, @PathVariable UUID id) {
        return ResponseEntity.ok(sessionService.getSession(authentication.getName(), id));
    }

    @GetMapping("/{id}/report")
    public ResponseEntity<ReportResponse> getReport(Authentication authentication, @PathVariable UUID id) {
        return ResponseEntity.ok(sessionService.getReport(authentication.getName(), id));
    }
}
