package com.project.depression.repository;

import com.project.depression.entity.PasswordResetToken;
import com.project.depression.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, UUID> {

    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    /**
     * Issuing a new reset invalidates any outstanding ones, so a user who clicks
     * "forgot password" twice can't end up with two live links.
     */
    @Modifying
    @Query("UPDATE PasswordResetToken t SET t.usedAt = :now WHERE t.user = :user AND t.usedAt IS NULL")
    void invalidateAllForUser(@Param("user") User user, @Param("now") Instant now);
}
