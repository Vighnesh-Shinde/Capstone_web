package com.project.depression.controller;

import com.project.depression.dto.CounselorStatsResponse;
import com.project.depression.dto.PageResponse;
import com.project.depression.dto.ReportResponse;
import com.project.depression.dto.SessionResponse;
import com.project.depression.dto.UpdateSessionNotesRequest;
import com.project.depression.entity.SessionStatus;
import com.project.depression.service.SessionService;
import jakarta.validation.Valid;
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
            @RequestParam(value = "language", defaultValue = "en") String language,
            @RequestParam(value = "consent_recording", defaultValue = "false") boolean consentRecording,
            @RequestParam(value = "consent_ai_analysis", defaultValue = "false") boolean consentAiAnalysis,
            @RequestParam(value = "consent_storage", defaultValue = "false") boolean consentStorage,
            @RequestParam(value = "consent_research_reuse", defaultValue = "false") boolean consentResearchReuse
    ) {
        SessionResponse response = sessionService.createSession(
                authentication.getName(), participantRef, video, language,
                consentRecording, consentAiAnalysis, consentStorage, consentResearchReuse
        );
        return ResponseEntity.status(201).body(response);
    }

    @GetMapping
    public ResponseEntity<PageResponse<SessionResponse>> listSessions(
            Authentication authentication,
            @RequestParam(required = false) SessionStatus status,
            @RequestParam(required = false) UUID participantId,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "createdAt") String sort,
            @RequestParam(defaultValue = "desc") String direction,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        // Whitelist sortable columns: this value reaches the SQL ORDER BY, so
        // it must never be caller-controlled free text.
        String sortField = switch (sort) {
            case "participantRef", "status", "updatedAt" -> sort;
            default -> "createdAt";
        };
        Sort.Direction sortDirection = "asc".equalsIgnoreCase(direction)
                ? Sort.Direction.ASC : Sort.Direction.DESC;

        Pageable pageable = PageRequest.of(page, Math.min(size, 100), Sort.by(sortDirection, sortField));
        return ResponseEntity.ok(sessionService.listSessions(
                authentication.getName(), status, participantId, search, pageable));
    }

    @GetMapping("/stats")
    public ResponseEntity<CounselorStatsResponse> getStats(Authentication authentication) {
        return ResponseEntity.ok(sessionService.getStats(authentication.getName()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<SessionResponse> getSession(Authentication authentication, @PathVariable UUID id) {
        return ResponseEntity.ok(sessionService.getSession(authentication.getName(), id));
    }

    @PatchMapping("/{id}/notes")
    public ResponseEntity<SessionResponse> updateNotes(
            Authentication authentication, @PathVariable UUID id,
            @Valid @RequestBody UpdateSessionNotesRequest request
    ) {
        return ResponseEntity.ok(sessionService.updateNotes(authentication.getName(), id, request.notes()));
    }

    @GetMapping("/{id}/report")
    public ResponseEntity<ReportResponse> getReport(Authentication authentication, @PathVariable UUID id) {
        return ResponseEntity.ok(sessionService.getReport(authentication.getName(), id));
    }
}
