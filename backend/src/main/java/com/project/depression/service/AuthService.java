package com.project.depression.service;

import com.project.depression.dto.LoginRequest;
import com.project.depression.dto.LoginResponse;
import com.project.depression.config.JwtService;
import com.project.depression.entity.CounselorApplication;
import com.project.depression.entity.Role;
import com.project.depression.entity.User;
import com.project.depression.entity.UserStatus;
import com.project.depression.repository.CounselorApplicationRepository;
import com.project.depression.repository.UserRepository;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Service
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final CounselorApplicationRepository applicationRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(
            AuthenticationManager authenticationManager,
            UserRepository userRepository,
            CounselorApplicationRepository applicationRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService
    ) {
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
        this.applicationRepository = applicationRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public LoginResponse login(LoginRequest request) {
        String identifier = request.identifier().trim();
        Optional<User> userOpt = userRepository.findByEmailOrUsername(identifier);

        // A PENDING/REJECTED/SUSPENDED counselor has no `users` row at all
        // (accounts are only created on approval), so Spring Security's
        // authenticationManager would just report "bad credentials" with no
        // way to explain why. Check for that case first, so we can surface
        // the actual application status instead of a misleading auth error.
        if (userOpt.isEmpty()) {
            applicationRepository.findByEmail(identifier).ifPresent(application -> {
                if (passwordEncoder.matches(request.password(), application.getPasswordHash())) {
                    throw statusException(application);
                }
            });
            throw new BadCredentialsException("Invalid credentials");
        }

        User user = userOpt.get();

        // Authenticate against the canonical principal (email), whichever
        // identifier was actually typed.
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(user.getEmail(), request.password())
        );

        if (user.getStatus() == UserStatus.SUSPENDED) {
            throw new AccountNotApprovedException(
                    "This account has been suspended. Please contact an administrator.");
        }

        if (user.getRole() == Role.COUNSELOR) {
            checkCounselorApproved(user);
        }

        user.setLastLoginAt(Instant.now());
        userRepository.save(user);

        UserDetails userDetails = org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail())
                .password(user.getPasswordHash())
                .authorities("ROLE_" + user.getRole().name())
                .build();

        String token = jwtService.generateToken(userDetails);

        return new LoginResponse(
                token, user.getEmail(), user.getUsername(), user.getName(), user.getRole().name());
    }

    private void checkCounselorApproved(User user) {
        if (user.getApplicationId() == null) {
            // Should not happen for counselor accounts created via the approval
            // flow, but fail closed rather than silently allowing access.
            throw new AccountNotApprovedException("Your account is not linked to an approved application.");
        }

        CounselorApplication application = applicationRepository.findById(user.getApplicationId())
                .orElseThrow(() -> new AccountNotApprovedException("Your application could not be found."));

        if (application.getStatus() != com.project.depression.entity.ApplicationStatus.APPROVED) {
            throw statusException(application);
        }
    }

    private AccountNotApprovedException statusException(CounselorApplication application) {
        return switch (application.getStatus()) {
            case PENDING -> new AccountNotApprovedException("Your counselor access request is still pending review.");
            case REJECTED -> new AccountNotApprovedException(
                    "Your counselor access request was rejected"
                            + (application.getRejectionReason() != null ? ": " + application.getRejectionReason() : "."));
            case SUSPENDED -> new AccountNotApprovedException("Your counselor account has been suspended. Contact an administrator.");
            case APPROVED -> new AccountNotApprovedException("Your account is not currently approved.");
        };
    }
}
