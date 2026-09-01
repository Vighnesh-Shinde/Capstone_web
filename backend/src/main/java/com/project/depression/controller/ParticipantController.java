package com.project.depression.controller;

import com.project.depression.dto.ParticipantResponse;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import com.project.depression.service.ParticipantService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.NoSuchElementException;

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
        User counselor = userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new NoSuchElementException("Counselor not found"));
        return ResponseEntity.ok(participantService.listForCounselor(counselor));
    }
}
