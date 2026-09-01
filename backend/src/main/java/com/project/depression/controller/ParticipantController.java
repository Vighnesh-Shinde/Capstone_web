package com.project.depression.controller;

import com.project.depression.dto.ParticipantDetailResponse;
import com.project.depression.dto.ParticipantResponse;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import com.project.depression.service.ParticipantService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/participants")
public class ParticipantController {

    private final ParticipantService participantService;
    private final UserRepository userRepository;

    public ParticipantController(ParticipantService participantService, UserRepository userRepository) {
        this.participantService = participantService;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<List<ParticipantResponse>> list(Authentication authentication) {
        return ResponseEntity.ok(participantService.listForCounselor(currentCounselor(authentication)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ParticipantDetailResponse> getDetail(
            Authentication authentication, @PathVariable UUID id
    ) {
        return ResponseEntity.ok(participantService.getDetail(currentCounselor(authentication), id));
    }

    private User currentCounselor(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new NoSuchElementException("Counselor not found"));
    }
}
