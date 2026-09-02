package com.project.depression.repository;

import com.project.depression.entity.CounselorVoiceprint;
import com.project.depression.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CounselorVoiceprintRepository extends JpaRepository<CounselorVoiceprint, UUID> {

    Optional<CounselorVoiceprint> findByUserAndActiveIsTrue(User user);

    List<CounselorVoiceprint> findByUserOrderByEnrolledAtDesc(User user);
}
