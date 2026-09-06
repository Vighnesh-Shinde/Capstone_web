package com.project.depression.service;

import com.project.depression.client.MlServiceClient;
import com.project.depression.dto.MlEnrollVoiceResponse;
import com.project.depression.dto.VoiceprintStatusResponse;
import com.project.depression.entity.CounselorVoiceprint;
import com.project.depression.entity.Session;
import com.project.depression.entity.SessionCompanion;
import com.project.depression.entity.User;
import com.project.depression.repository.CounselorVoiceprintRepository;
import com.project.depression.repository.SessionCompanionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Enrolling and checking the voices this platform can recognise.
 *
 * The audio model was trained on participant speech only, so which diarized
 * speaker is treated as the participant decides whose mental health gets
 * scored. That used to be a guess — whoever talked most — which inverts in a
 * real counselling room where a withdrawn client says little and the counselor
 * carries the conversation. Voiceprints replace the guess with a positive
 * match; this service is where they are created and kept.
 *
 * PRIVACY POSTURE
 * ---------------
 * A voiceprint is biometric data about an identifiable person, and a companion
 * is a third party with no account here. Two rules follow, and both are
 * enforced rather than documented:
 *
 *   1. The recording is deleted the moment the vector is extracted. A vector
 *      cannot be played back; a recording of a named clinician can, and no
 *      feature needs one.
 *   2. A companion's vector belongs to one session and is purged with that
 *      session's video. They agreed to be told apart at one appointment, not
 *      to be recognisable at every future one.
 */
@Service
public class VoiceprintService {

    private static final Logger log = LoggerFactory.getLogger(VoiceprintService.class);

    private final CounselorVoiceprintRepository voiceprintRepository;
    private final SessionCompanionRepository companionRepository;
    private final FileStorageService fileStorageService;
    private final MlServiceClient mlServiceClient;
    private final AuditLogService auditLogService;
    private final EnrollmentPassageService passageService;

    /**
     * How long an enrolment stays valid. Voices drift, microphones change, and
     * a reference recorded a year ago matches worse than one from last week.
     */
    @Value("${app.voiceprint.validity-days:30}")
    private int validityDays;

    /**
     * Which embedding model the vectors belong to. Recorded on every row
     * because embeddings are only comparable within one model's space: change
     * the diarization model and every existing voiceprint silently stops
     * matching its owner. Stored, this becomes a diagnosable event instead of
     * a mystery.
     */
    @Value("${app.voiceprint.model-id:pyannote/speaker-diarization-community-1}")
    private String modelId;

    public VoiceprintService(
            CounselorVoiceprintRepository voiceprintRepository,
            SessionCompanionRepository companionRepository,
            FileStorageService fileStorageService,
            MlServiceClient mlServiceClient,
            AuditLogService auditLogService,
            EnrollmentPassageService passageService
    ) {
        this.voiceprintRepository = voiceprintRepository;
        this.companionRepository = companionRepository;
        this.fileStorageService = fileStorageService;
        this.mlServiceClient = mlServiceClient;
        this.auditLogService = auditLogService;
        this.passageService = passageService;
    }

    // ------------------------------------------------------------------
    // Counselor enrolment
    // ------------------------------------------------------------------

    @Transactional
    public VoiceprintStatusResponse enroll(User counselor, MultipartFile audio) {
        MlEnrollVoiceResponse result = extractEmbedding(audio);

        // Deactivate first: the partial unique index permits one active
        // voiceprint per counselor, so both cannot be live even momentarily.
        // Old rows are kept, not deleted — a report from three months ago
        // should stay traceable to the voiceprint that decided whose voice was
        // analysed, and that question is asked long after the fact.
        voiceprintRepository.findByUserAndActiveIsTrue(counselor).ifPresent(previous -> {
            previous.setActive(false);
            voiceprintRepository.saveAndFlush(previous);
        });

        CounselorVoiceprint voiceprint = voiceprintRepository.save(CounselorVoiceprint.builder()
                .user(counselor)
                .embedding(result.embedding())
                .dimension(result.dimension())
                .speechSeconds(result.speech_seconds())
                .passageVersion(passageService.active().getVersion())
                .modelId(modelId)
                .enrolledAt(Instant.now())
                .expiresAt(Instant.now().plus(Duration.ofDays(validityDays)))
                .active(true)
                .build());

        auditLogService.log(counselor, "VOICEPRINT_ENROLLED", "USER", counselor.getId(),
                String.format("%.0fs of speech, valid until %s",
                        result.speech_seconds() == null ? 0.0 : result.speech_seconds(),
                        voiceprint.getExpiresAt()));

        return status(counselor);
    }

    @Transactional(readOnly = true)
    public VoiceprintStatusResponse status(User counselor) {
        return voiceprintRepository.findByUserAndActiveIsTrue(counselor)
                .map(v -> new VoiceprintStatusResponse(
                        true,
                        !v.isExpired(),
                        v.getEnrolledAt(),
                        v.getExpiresAt(),
                        v.getSpeechSeconds(),
                        daysUntil(v.getExpiresAt()),
                        v.getPassageVersion()))
                .orElseGet(() -> new VoiceprintStatusResponse(
                        false, false, null, null, null, null, passageService.active().getVersion()));
    }

    /**
     * The voiceprint to analyse a session with, or a refusal explaining what to
     * do about it.
     *
     * Called before a session is accepted, not during processing. Uploading an
     * hour of interview and only then being told your voice enrolment lapsed
     * wastes the counselor's time and the participant's — and the participant
     * cannot easily be asked back.
     */
    @Transactional(readOnly = true)
    public CounselorVoiceprint requireCurrentVoiceprint(User counselor) {
        CounselorVoiceprint voiceprint = voiceprintRepository.findByUserAndActiveIsTrue(counselor)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED,
                        "Record your voice before starting a session. The analysis needs to know "
                                + "which voice in the recording is yours so it can be excluded — "
                                + "without that, it cannot tell your speech from the participant's."));

        if (voiceprint.isExpired()) {
            throw new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED,
                    "Your voice recording expired on "
                            + voiceprint.getExpiresAt().toString().substring(0, 10)
                            + ". Please read the passage again — it takes about a minute — so "
                            + "sessions keep identifying your voice correctly.");
        }

        // A voiceprint from a superseded model is worse than none: it will not
        // match, and the session would fail with a message about the wrong
        // counselor being in the room rather than about a model upgrade.
        if (!modelId.equals(voiceprint.getModelId())) {
            throw new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED,
                    "The speech models were updated since you last recorded your voice, so your "
                            + "old recording can no longer be matched. Please read the passage "
                            + "again before starting a session.");
        }

        return voiceprint;
    }

    // ------------------------------------------------------------------
    // Companions present at one session
    // ------------------------------------------------------------------

    /**
     * Enrol somebody who is in the room but is not the participant.
     *
     * Without this their speech lands in the participant's feature vectors and
     * corrupts the measurement — and with three unidentified voices the
     * pipeline would refuse to score the session at all.
     */
    @Transactional
    public SessionCompanion enrollCompanion(
            Session session, String roleLabel, boolean consentGiven, MultipartFile audio
    ) {
        if (!consentGiven) {
            // Not a checkbox to be defaulted true. Recording a third party's
            // voice in order to recognise it is biometric processing, and the
            // person it belongs to is not the one who booked the appointment.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "The person accompanying the participant must agree to their voice being "
                            + "recorded before it can be used to tell them apart in the interview.");
        }

        MlEnrollVoiceResponse result = extractEmbedding(audio);

        SessionCompanion companion = companionRepository.save(SessionCompanion.builder()
                .session(session)
                .roleLabel(roleLabel == null || roleLabel.isBlank() ? "Companion" : roleLabel.trim())
                .embedding(result.embedding())
                .dimension(result.dimension())
                .speechSeconds(result.speech_seconds())
                .consentGiven(true)
                .consentRecordedAt(Instant.now())
                .build());

        auditLogService.log(session.getCounselor(), "COMPANION_VOICE_ENROLLED", "SESSION",
                session.getId(), companion.getRoleLabel());

        return companion;
    }

    @Transactional(readOnly = true)
    public List<List<Double>> companionEmbeddings(Session session) {
        return companionRepository.findBySessionAndPurgedAtIsNullOrderByEnrolledAt(session).stream()
                .map(SessionCompanion::getEmbedding)
                .toList();
    }

    /**
     * Record which diarized cluster each companion turned out to be.
     *
     * The ML service returns these in the same order the embeddings were sent,
     * which is why that fetch is explicitly ordered. A shorter list than
     * expected is tolerated rather than fatal — the report degrades to "present
     * but unmatched", which is worse than complete but far better than losing a
     * finished analysis over a labelling detail.
     */
    @Transactional
    public void recordCompanionLabels(Session session, List<String> diarizedLabels) {
        if (diarizedLabels == null || diarizedLabels.isEmpty()) {
            return;
        }
        List<SessionCompanion> companions =
                companionRepository.findBySessionAndPurgedAtIsNullOrderByEnrolledAt(session);
        for (int i = 0; i < companions.size() && i < diarizedLabels.size(); i++) {
            companions.get(i).setDiarizedLabel(diarizedLabels.get(i));
        }
        companionRepository.saveAll(companions);
    }

    /**
     * Drop companions' vectors once the session's video is gone.
     *
     * Called from the retention sweep. Keeping a third party's biometric longer
     * than the recording it was used to segment has no purpose and no defence;
     * the row survives so the report can still say a companion was present.
     */
    @Transactional
    public int purgeCompanionEmbeddings(Session session) {
        List<SessionCompanion> live =
                companionRepository.findBySessionAndPurgedAtIsNullOrderByEnrolledAt(session);
        for (SessionCompanion companion : live) {
            companion.setEmbedding(List.of());
            companion.setPurgedAt(Instant.now());
        }
        companionRepository.saveAll(live);
        return live.size();
    }

    // ------------------------------------------------------------------

    /**
     * Store the upload, have the ML service turn it into a vector, then delete
     * the audio — in a finally block, so the recording does not survive a
     * failure. An enrollment that errors halfway is exactly the case where a
     * stray voice recording would be left on disk unnoticed.
     */
    private MlEnrollVoiceResponse extractEmbedding(MultipartFile audio) {
        String path = fileStorageService.storeVoiceEnrollment(audio);
        try {
            MlEnrollVoiceResponse result;
            try {
                result = mlServiceClient.enrollVoice(path);
            } catch (Exception e) {
                log.error("Voice enrollment call to the ML service failed", e);
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "The analysis service could not be reached, so your recording was not "
                                + "processed. Nothing was saved — please try again in a moment.");
            }

            if (result == null || !result.ok()) {
                // The ML service writes these messages for the person who just
                // recorded, so they are passed through rather than replaced:
                // "two voices were detected" is actionable, "enrollment failed"
                // is not.
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        result == null ? "The recording could not be processed." : result.error());
            }
            if (result.embedding() == null || result.embedding().isEmpty()) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "The recording produced an empty voice profile. Please record again.");
            }
            return result;
        } finally {
            if (!fileStorageService.deleteFile(path)) {
                // Loud, because the whole privacy argument for this feature is
                // that the audio does not persist. A leftover file is a
                // commitment quietly broken.
                log.error("Could not delete voice enrollment recording at {} — delete it manually.", path);
            }
        }
    }

    private static Long daysUntil(Instant expiry) {
        if (expiry == null) {
            return null;
        }
        return Duration.between(Instant.now(), expiry).toDays();
    }
}
