package com.project.depression.controller;

import com.project.depression.dto.ChangePasswordRequest;
import com.project.depression.dto.ProfileResponse;
import com.project.depression.dto.UpdateProfileRequest;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import com.project.depression.service.ProfileService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.NoSuchElementException;

/**
 * The signed-in user's own account. Every method operates on the caller
 * resolved from the JWT — there is no path parameter to tamper with, so one
 * user can never read or modify another's profile through this controller.
 */
@RestController
@RequestMapping("/api/me")
public class ProfileController {

    private final ProfileService profileService;
    private final UserRepository userRepository;

    public ProfileController(ProfileService profileService, UserRepository userRepository) {
        this.profileService = profileService;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<ProfileResponse> getProfile(Authentication authentication) {
        return ResponseEntity.ok(profileService.toResponse(currentUser(authentication)));
    }

    @PatchMapping
    public ResponseEntity<ProfileResponse> updateProfile(
            Authentication authentication, @Valid @RequestBody UpdateProfileRequest request
    ) {
        return ResponseEntity.ok(profileService.updateProfile(currentUser(authentication), request));
    }

    @PostMapping("/change-password")
    public ResponseEntity<Void> changePassword(
            Authentication authentication, @Valid @RequestBody ChangePasswordRequest request
    ) {
        profileService.changePassword(currentUser(authentication), request);
        return ResponseEntity.noContent().build();
    }

    private User currentUser(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new NoSuchElementException("User not found"));
    }
}
