package com.project.depression.config;

import com.project.depression.entity.Role;
import com.project.depression.entity.User;
import com.project.depression.entity.UserStatus;
import com.project.depression.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Seeds the platform operator's ADMIN account on first startup.
 *
 * There is no self-service admin registration by design — an admin approves
 * counselors and manages model weights, so the account has to come from the
 * deployment's own configuration rather than from anything a web visitor can
 * reach. Credentials are read from env vars and BCrypt-hashed here; no
 * plaintext password ever appears in source or in the database.
 *
 * Distinct from {@link DemoDataSeeder}, which exists only for local demos and
 * is disabled in production via app.seed-demo-data.
 */
@Component
@Order(1)
public class AdminAccountSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminAccountSeeder.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.admin.username:}")
    private String adminUsername;

    @Value("${app.admin.email:}")
    private String adminEmail;

    @Value("${app.admin.password:}")
    private String adminPassword;

    @Value("${app.admin.name:Administrator}")
    private String adminName;

    public AdminAccountSeeder(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        if (isBlank(adminUsername) || isBlank(adminEmail) || isBlank(adminPassword)) {
            log.warn("Admin account not seeded: set ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD "
                    + "to provision the operator account.");
            return;
        }

        if (userRepository.existsByUsernameIgnoreCase(adminUsername) || userRepository.existsByEmail(adminEmail)) {
            log.info("Admin account '{}' already exists — leaving it untouched.", adminUsername);
            return;
        }

        User admin = User.builder()
                .name(adminName)
                .email(adminEmail)
                .username(adminUsername)
                .passwordHash(passwordEncoder.encode(adminPassword))
                .role(Role.ADMIN)
                .status(UserStatus.ACTIVE)
                .passwordChangedAt(Instant.now())
                .build();
        userRepository.save(admin);

        // The password is never logged — it came from the environment and the
        // operator already knows it.
        log.info("Seeded admin account -> username: {} (email: {})", adminUsername, adminEmail);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
