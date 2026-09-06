package com.project.depression.repository;

import com.project.depression.entity.EmailVerificationToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface EmailVerificationTokenRepository extends JpaRepository<EmailVerificationToken, UUID> {

    /** Looked up by hash — the plaintext token exists only in the emailed link. */
    Optional<EmailVerificationToken> findByTokenHash(String tokenHash);
}
