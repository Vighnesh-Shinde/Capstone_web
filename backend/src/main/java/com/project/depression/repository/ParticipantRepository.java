package com.project.depression.repository;

import com.project.depression.entity.Participant;
import com.project.depression.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ParticipantRepository extends JpaRepository<Participant, UUID> {
    Optional<Participant> findByCounselorAndParticipantRef(User counselor, String participantRef);
    List<Participant> findByCounselorOrderByLastSessionAtDesc(User counselor);
}
