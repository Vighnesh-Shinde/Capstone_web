package com.project.depression.controller;

import com.project.depression.dto.CounselorJudgmentRequest;
import com.project.depression.dto.CounselorJudgmentResponse;
import com.project.depression.service.CounselorJudgmentService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/sessions/{id}/judgment")
public class CounselorJudgmentController {

    private final CounselorJudgmentService judgmentService;

    public CounselorJudgmentController(CounselorJudgmentService judgmentService) {
        this.judgmentService = judgmentService;
    }

    @PostMapping
    public ResponseEntity<CounselorJudgmentResponse> submit(
            @PathVariable UUID id, @Valid @RequestBody CounselorJudgmentRequest request, Authentication authentication
    ) {
        return ResponseEntity.ok(judgmentService.submit(authentication.getName(), id, request));
    }

    @GetMapping
    public ResponseEntity<CounselorJudgmentResponse> get(@PathVariable UUID id, Authentication authentication) {
        CounselorJudgmentResponse response = judgmentService.get(authentication.getName(), id);
        return response == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(response);
    }
}
