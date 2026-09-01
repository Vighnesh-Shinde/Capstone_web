package com.project.depression.config;

import com.project.depression.entity.ApplicationStatus;
import com.project.depression.entity.CounselorApplication;
import com.project.depression.entity.Role;
import com.project.depression.entity.User;
import com.project.depression.repository.CounselorApplicationRepository;
import com.project.depression.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * The brief defines no self-service registration for a working demo account:
 * counselors go through the application/approval flow, and admins are
 * seeded directly. Seeds one of each on first startup — but only when
 * app.seed-demo-data=true (the default for local dev; set to false for any
 * real deployment). Passwords come from env vars, never from hardcoded
 * literals in source, so a real deployment can't accidentally inherit a
 * well-known credential from this repo.
 */
@Component
public class DemoDataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    private static final String DEMO_COUNSELOR_EMAIL = "counselor@demo.com";
    private static final String DEMO_ADMIN_EMAIL = "admin@demo.com";

    private final UserRepository userRepository;
    private final CounselorApplicationRepository applicationRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.seed-demo-data:true}")
    private boolean seedDemoData;

    @Value("${app.demo-counselor-password:#{null}}")
    private String demoCounselorPassword;

    @Value("${app.demo-admin-password:#{null}}")
    private String demoAdminPassword;

    public DemoDataSeeder(
            UserRepository userRepository,
            CounselorApplicationRepository applicationRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.userRepository = userRepository;
        this.applicationRepository = applicationRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        if (!seedDemoData) {
            log.info("app.seed-demo-data=false — skipping demo account seeding.");
            return;
        }
        seedDemoCounselor();
        seedDemoAdmin();
    }

    private void seedDemoCounselor() {
        if (userRepository.existsByEmail(DEMO_COUNSELOR_EMAIL)) {
            return;
        }

        String password = demoCounselorPassword != null ? demoCounselorPassword : randomPassword();
        String passwordHash = passwordEncoder.encode(password);

        // Seed a matching APPROVED application first, so AuthService's login
        // gate (which requires every COUNSELOR to have an approved
        // application) works uniformly with no special-casing for demo data.
        CounselorApplication application = CounselorApplication.builder()
                .fullName("Demo Counselor")
                .email(DEMO_COUNSELOR_EMAIL)
                .passwordHash(passwordHash)
                .organization("Demo Clinic")
                .professionalRole("Licensed Counselor")
                .qualification("M.A. Clinical Psychology")
                .status(ApplicationStatus.APPROVED)
                .reviewedAt(java.time.Instant.now())
                .build();
        application = applicationRepository.save(application);

        User demoUser = User.builder()
                .name("Demo Counselor")
                .email(DEMO_COUNSELOR_EMAIL)
                .username("demo-counselor")
                .passwordHash(passwordHash)
                .role(Role.COUNSELOR)
                .applicationId(application.getId())
                .build();
        demoUser = userRepository.save(demoUser);

        application.setCreatedUserId(demoUser.getId());
        applicationRepository.save(application);

        log.info("Seeded demo counselor account -> email: {}, password: {}", DEMO_COUNSELOR_EMAIL, password);
    }

    private void seedDemoAdmin() {
        if (userRepository.existsByEmail(DEMO_ADMIN_EMAIL)) {
            return;
        }

        String password = demoAdminPassword != null ? demoAdminPassword : randomPassword();

        User admin = User.builder()
                .name("Demo Admin")
                .email(DEMO_ADMIN_EMAIL)
                .username("demo-admin")
                .passwordHash(passwordEncoder.encode(password))
                .role(Role.ADMIN)
                .build();
        userRepository.save(admin);

        log.info("Seeded demo admin account -> email: {}, password: {}", DEMO_ADMIN_EMAIL, password);
    }

    /** Used only when no explicit demo password env var is set — never a fixed literal. */
    private String randomPassword() {
        return java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }
}
