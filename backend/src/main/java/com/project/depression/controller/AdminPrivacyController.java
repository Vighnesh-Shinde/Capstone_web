package com.project.depression.controller;

import com.project.depression.dto.AdminParticipantResponse;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import com.project.depression.service.DataErasureService;
import com.project.depression.service.VideoRetentionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Privacy operations an administrator performs on request: consent withdrawal,
 * erasure, and a manual trigger for the retention sweep.
 *
 * Admin-only rather than counselor-facing. Erasure is irreversible and crosses
 * the ownership boundary a counselor is otherwise confined to, so it belongs
 * with the operator who is accountable for the deployment.
 */
@RestController
@RequestMapping("/api/admin/privacy")
public class AdminPrivacyController {

    private final DataErasureService dataErasureService;
    private final VideoRetentionService videoRetentionService;
    private final UserRepository userRepository;

    public AdminPrivacyController(
            DataErasureService dataErasureService,
            VideoRetentionService videoRetentionService,
            UserRepository userRepository
    ) {
        this.dataErasureService = dataErasureService;
        this.videoRetentionService = videoRetentionService;
        this.userRepository = userRepository;
    }

    @GetMapping("/participants")
    public ResponseEntity<List<AdminParticipantResponse>> searchParticipants(
            @RequestParam(required = false) String search
    ) {
        return ResponseEntity.ok(dataErasureService.searchParticipants(search));
    }

    @PostMapping("/sessions/{id}/withdraw-consent")
    public ResponseEntity<Void> withdrawConsent(@PathVariable UUID id, Authentication authentication) {
        dataErasureService.withdrawConsent(id, currentAdmin(authentication));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/participants/{id}")
    public ResponseEntity<Map<String, String>> eraseParticipant(
            @PathVariable UUID id, Authentication authentication
    ) {
        String summary = dataErasureService.eraseParticipant(id, currentAdmin(authentication));
        return ResponseEntity.ok(Map.of("erased", summary));
    }

    /** Manual trigger, so retention can be demonstrated without waiting for the cron. */
    @PostMapping("/retention-sweep")
    public ResponseEntity<Map<String, Integer>> runRetentionSweep(Authentication authentication) {
        currentAdmin(authentication);
        return ResponseEntity.ok(Map.of("deleted", videoRetentionService.sweep()));
    }

    private User currentAdmin(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new NoSuchElementException("Admin user not found"));
    }
}
