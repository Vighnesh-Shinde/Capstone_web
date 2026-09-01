package com.project.depression.service;

import com.project.depression.dto.ParticipantResponse;
import com.project.depression.entity.Participant;
import com.project.depression.entity.User;
import com.project.depression.repository.ParticipantRepository;
import com.project.depression.repository.SessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class ParticipantService {

    private final ParticipantRepository participantRepository;
    private final SessionRepository sessionRepository;

    public ParticipantService(ParticipantRepository participantRepository, SessionRepository sessionRepository) {
        this.participantRepository = participantRepository;
        this.sessionRepository = sessionRepository;
    }

    /**
     * Resolves the participant for a new session: reuses the counselor's
     * existing participant with this exact ref if one exists (the "returning
     * participant" case), otherwise creates one. Either way, touches
     * last_session_at so the picker can sort by recency.
     */
    @Transactional
    public Participant findOrCreate(User counselor, String participantRef) {
        Participant participant = participantRepository.findByCounselorAndParticipantRef(counselor, participantRef)
                .orElseGet(() -> Participant.builder()
                        .counselor(counselor)
                        .participantRef(participantRef)
                        .build());
        participant.setLastSessionAt(Instant.now());
        return participantRepository.save(participant);
    }

    @Transactional(readOnly = true)
    public List<ParticipantResponse> listForCounselor(User counselor) {
        return participantRepository.findByCounselorOrderByLastSessionAtDesc(counselor).stream()
                .map(p -> new ParticipantResponse(
                        p.getId(),
                        p.getParticipantRef(),
                        sessionRepository.countByParticipant(p),
                        p.getCreatedAt(),
                        p.getLastSessionAt()
                ))
                .toList();
    }
}
