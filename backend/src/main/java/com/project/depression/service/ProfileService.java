package com.project.depression.service;

import com.project.depression.dto.ChangePasswordRequest;
import com.project.depression.dto.ProfileResponse;
import com.project.depression.dto.UpdateProfileRequest;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;

@Service
public class ProfileService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogService auditLogService;

    public ProfileService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuditLogService auditLogService
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditLogService = auditLogService;
    }

    public ProfileResponse toResponse(User user) {
        return new ProfileResponse(
                user.getId(), user.getName(), user.getEmail(), user.getUsername(),
                user.getRole().name(), user.getStatus().name(),
                user.getCreatedAt(), user.getLastLoginAt(), user.getPasswordChangedAt()
        );
    }

    @Transactional
    public ProfileResponse updateProfile(User user, UpdateProfileRequest request) {
        String username = normalizeUsername(request.username());

        if (username != null
                && !username.equalsIgnoreCase(user.getUsername())
                && userRepository.existsByUsernameIgnoreCase(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That username is already taken.");
        }

        user.setName(request.name().trim());
        user.setUsername(username);
        User saved = userRepository.save(user);

        auditLogService.log(user, "PROFILE_UPDATED", "USER", user.getId(), null);
        return toResponse(saved);
    }

    @Transactional
    public void changePassword(User user, ChangePasswordRequest request) {
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your current password is incorrect.");
        }
        if (passwordEncoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Your new password must be different from your current one.");
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setPasswordChangedAt(Instant.now());
        userRepository.save(user);

        auditLogService.log(user, "PASSWORD_CHANGED", "USER", user.getId(), null);
    }

    private static String normalizeUsername(String username) {
        if (username == null || username.isBlank()) {
            return null;
        }
        return username.trim();
    }
}
