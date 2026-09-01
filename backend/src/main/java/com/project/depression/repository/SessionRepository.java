package com.project.depression.repository;

import com.project.depression.entity.Participant;
import com.project.depression.entity.Session;
import com.project.depression.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface SessionRepository extends JpaRepository<Session, UUID> {
    Page<Session> findByCounselorOrderByCreatedAtDesc(User counselor, Pageable pageable);
    long countByParticipant(Participant participant);
    long countByCounselor(User counselor);
}
