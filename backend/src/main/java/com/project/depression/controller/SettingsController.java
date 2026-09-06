package com.project.depression.controller;

import com.project.depression.dto.ChangeEmailRequest;
import com.project.depression.dto.SettingsResponse;
import com.project.depression.dto.UpdateNotificationsRequest;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import com.project.depression.service.SettingsService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.NoSuchElementException;

/**
 * The signed-in user's own settings.
 *
 * Under /api/me, and every method resolves the user from the authenticated
 * principal. No endpoint here takes a user id, so there is no parameter to
 * tamper with in order to reach somebody else's account.
 */
@RestController
@RequestMapping("/api/me/settings")
public class SettingsController {

    private final SettingsService settingsService;
    private final UserRepository userRepository;

    public SettingsController(SettingsService settingsService, UserRepository userRepository) {
        this.settingsService = settingsService;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<SettingsResponse> get(Authentication authentication) {
        return ResponseEntity.ok(settingsService.get(currentUser(authentication)));
    }

    @PutMapping("/notifications")
    public ResponseEntity<SettingsResponse> updateNotifications(
            Authentication authentication,
            @Valid @RequestBody UpdateNotificationsRequest request
    ) {
        return ResponseEntity.ok(
                settingsService.updateNotifications(currentUser(authentication), request));
    }

    /**
     * Start an email change. The address does not move until the new mailbox
     * confirms — see SettingsService.
     */
    @PostMapping("/email")
    public ResponseEntity<SettingsResponse> requestEmailChange(
            Authentication authentication,
            @Valid @RequestBody ChangeEmailRequest request
    ) {
        return ResponseEntity.ok(
                settingsService.requestEmailChange(currentUser(authentication), request));
    }

    @DeleteMapping("/email")
    public ResponseEntity<SettingsResponse> cancelEmailChange(Authentication authentication) {
        return ResponseEntity.ok(settingsService.cancelEmailChange(currentUser(authentication)));
    }

    @DeleteMapping("/google")
    public ResponseEntity<SettingsResponse> unlinkGoogle(Authentication authentication) {
        return ResponseEntity.ok(settingsService.unlinkGoogle(currentUser(authentication)));
    }

    private User currentUser(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new NoSuchElementException("User not found"));
    }
}
