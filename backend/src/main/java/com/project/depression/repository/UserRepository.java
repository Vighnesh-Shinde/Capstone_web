package com.project.depression.repository;

import com.project.depression.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/**
 * Extends JpaSpecificationExecutor so the admin user search can compose its
 * optional role/search filters as a Specification. A JPQL query with
 * `:param IS NULL OR ...` guards looks simpler but breaks on PostgreSQL: an
 * untyped null bind is inferred as bytea, and LOWER(bytea) does not exist.
 */
public interface UserRepository extends JpaRepository<User, UUID>, JpaSpecificationExecutor<User> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    boolean existsByUsernameIgnoreCase(String username);

    Optional<User> findByUsernameIgnoreCase(String username);

    /**
     * Login accepts either identifier. Email is matched case-insensitively too,
     * so a counselor typing "Name@Clinic.com" isn't turned away.
     */
    @Query("SELECT u FROM User u WHERE LOWER(u.email) = LOWER(:identifier) OR LOWER(u.username) = LOWER(:identifier)")
    Optional<User> findByEmailOrUsername(@Param("identifier") String identifier);
}
