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
    private final GoogleAuthService googleAuthService;

    public AuthService(
            AuthenticationManager authenticationManager,
            UserRepository userRepository,
            CounselorApplicationRepository applicationRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            GoogleAuthService googleAuthService
    ) {
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
        this.applicationRepository = applicationRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.googleAuthService = googleAuthService;
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

        return issueToken(user);
    }

    /**
     * Sign in with Google, into an account an administrator already approved.
     *
     * The hard rule this method exists to enforce: Google proves WHO someone
     * is, never THAT they are an approved clinician. So a verified Google
     * identity with no matching account is turned away with an explanation —
     * it is never a reason to create one. Every approval, suspension and
     * application-status check that guards password sign-in is applied here
     * too, by calling the same code, so the two paths cannot drift apart.
     */
    @Transactional
    public LoginResponse loginWithGoogle(String idToken) {
        var payload = googleAuthService.verify(idToken);
        String email = payload.getEmail().trim();
        String googleSub = payload.getSubject();

        User user = userRepository.findByEmail(email).orElseThrow(() -> {
            // No account. If they have an application in flight, say where it
            // stands; otherwise point them at the request form. Both replies
            // reveal only what the person signing in already knows — they just
            // proved control of this address to Google.
            var application = applicationRepository.findByEmail(email);
            if (application.isPresent()) {
                return statusException(application.get());
            }
            return new AccountNotApprovedException(
                    "There is no approved counsellor account for " + email + ". "
                            + "Signing in with Google does not create one — please request "
                            + "counsellor access, and an administrator will review it.");
        });

        if (user.getGoogleSub() == null) {
            // First Google sign-in for an existing account: bind this Google
            // identity to it from now on.
            user.setGoogleSub(googleSub);
            user.setGoogleLinkedAt(Instant.now());
        } else if (!user.getGoogleSub().equals(googleSub)) {
            // Same address, different Google account. That is what a reassigned
            // Workspace address looks like, and it must not open the previous
            // holder's clinical records.
            throw new AccountNotApprovedException(
                    "This email is registered to a different Google account. Please sign in "
                            + "with your password, or ask an administrator for help.");
        }

        if (user.getStatus() == UserStatus.SUSPENDED) {
            throw new AccountNotApprovedException(
                    "This account has been suspended. Please contact an administrator.");
        }

        if (user.getRole() == Role.COUNSELOR) {
            checkCounselorApproved(user);
        }

        // Google only issues a token for a verified address (checked in
        // GoogleAuthService), so a successful sign-in is itself proof.
        if (!user.isEmailVerified()) {
            user.setEmailVerified(true);
            user.setEmailVerifiedAt(Instant.now());
        }

        return issueToken(user);
    }

    /**
     * Stamp the login and mint our own JWT.
     *
     * Shared by both sign-in paths so the session a Google user gets is
     * identical in every respect to a password user's — same claims, same
     * expiry, same authorities.
     */
    private LoginResponse issueToken(User user) {
        user.setLastLoginAt(Instant.now());
        userRepository.save(user);

        UserDetails userDetails = org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail())
                .password(user.getPasswordHash())
                .authorities("ROLE_" + user.getRole().name())
                .build();

        return new LoginResponse(
                jwtService.generateToken(userDetails),
                user.getEmail(), user.getUsername(), user.getName(), user.getRole().name());
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
