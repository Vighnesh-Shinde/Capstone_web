package com.project.depression.repository;

import com.project.depression.entity.Participant;
import com.project.depression.entity.Session;
import com.project.depression.entity.SessionStatus;
import com.project.depression.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface SessionRepository extends JpaRepository<Session, UUID>, JpaSpecificationExecutor<Session> {

    Page<Session> findByCounselorOrderByCreatedAtDesc(User counselor, Pageable pageable);

    long countByParticipant(Participant participant);

    long countByCounselor(User counselor);

    long countByCounselorAndStatus(User counselor, SessionStatus status);

    long countByCounselorAndCreatedAtAfter(User counselor, Instant since);

    /** Oldest first — the participant timeline reads left to right. */
    List<Session> findByParticipantOrderByCreatedAtAsc(Participant participant);

    List<Session> findByParticipant(Participant participant);

    /**
     * Sessions past the retention window whose recording is still on disk.
     * videoDeletedAt IS NULL is what stops an already-purged session being
     * reconsidered on every subsequent sweep.
     */
    @Query("""
            SELECT s FROM Session s
            WHERE s.videoPath IS NOT NULL
              AND s.videoDeletedAt IS NULL
              AND s.createdAt < :cutoff
            """)
    List<Session> findVideosToPurge(@Param("cutoff") Instant cutoff);
}
