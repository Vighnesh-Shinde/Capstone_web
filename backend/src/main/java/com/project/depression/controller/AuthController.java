package com.project.depression.controller;

import com.project.depression.dto.AuthConfigResponse;
import com.project.depression.dto.ForgotPasswordRequest;
import com.project.depression.dto.GoogleLoginRequest;
import com.project.depression.dto.LoginRequest;
import com.project.depression.dto.LoginResponse;
import com.project.depression.dto.ResetPasswordRequest;
import com.project.depression.service.AuthService;
import com.project.depression.service.CaptchaService;
import com.project.depression.service.EmailVerificationService;
import com.project.depression.service.GoogleAuthService;
import com.project.depression.service.PasswordResetService;
import org.springframework.beans.factory.annotation.Value;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordResetService;
    private final GoogleAuthService googleAuthService;
    private final CaptchaService captchaService;
    private final EmailVerificationService emailVerificationService;

    @Value("${app.google.client-id:}")
    private String googleClientId;

    @Value("${app.captcha.site-key:}")
    private String captchaSiteKey;

    public AuthController(
            AuthService authService,
            PasswordResetService passwordResetService,
            GoogleAuthService googleAuthService,
            CaptchaService captchaService,
            EmailVerificationService emailVerificationService
    ) {
        this.authService = authService;
        this.passwordResetService = passwordResetService;
        this.googleAuthService = googleAuthService;
        this.captchaService = captchaService;
        this.emailVerificationService = emailVerificationService;
    }

    /**
     * Consume an email verification link.
     *
     * POST rather than GET, despite arriving from a clicked link: mail clients
     * and security scanners routinely pre-fetch GET URLs, which would burn a
     * single-use token before the applicant ever opened it. The frontend page
     * reads the token from the query string and posts it.
     */
    @PostMapping("/verify-email")
    public ResponseEntity<java.util.Map<String, String>> verifyEmail(
            @RequestParam("token") String token) {
        String email = emailVerificationService.verify(token);
        return ResponseEntity.ok(java.util.Map.of("email", email));
    }

    /**
     * Which sign-in methods are configured. Public, and free of secrets — the
     * login page needs it before anyone has authenticated.
     */
    @GetMapping("/config")
    public ResponseEntity<AuthConfigResponse> config() {
        return ResponseEntity.ok(new AuthConfigResponse(
                googleAuthService.isEnabled(), googleClientId,
                captchaService.isEnabled(), captchaSiteKey));
    }

    /**
     * Sign in with Google, into an already-approved account.
     *
     * Deliberately not a registration endpoint: see AuthService.loginWithGoogle.
     */
    @PostMapping("/google")
    public ResponseEntity<LoginResponse> googleLogin(@Valid @RequestBody GoogleLoginRequest request) {
        captchaService.verify(request.captchaToken(), "google_login");
        return ResponseEntity.ok(authService.loginWithGoogle(request.credential()));
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        captchaService.verify(request.captchaToken(), "login");
        return ResponseEntity.ok(authService.login(request));
    }

    /**
     * Always returns 204, whether or not the account exists — otherwise this
     * endpoint would double as a way to discover which emails are registered.
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        // Checked before the reset is issued: this endpoint sends email to an
        // address the caller names, so it is the most attractive one on the
        // site to automate.
        captchaService.verify(request.captchaToken(), "forgot_password");
        passwordResetService.requestReset(request.identifier());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        passwordResetService.resetPassword(request.token(), request.newPassword());
        return ResponseEntity.noContent().build();
    }
}
