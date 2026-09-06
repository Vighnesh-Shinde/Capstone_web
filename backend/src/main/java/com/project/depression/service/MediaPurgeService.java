package com.project.depression.service;

import com.project.depression.entity.Session;
import com.project.depression.entity.SessionFeatures;
import com.project.depression.repository.SessionFeaturesRepository;
import com.project.depression.repository.SessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Deletes the original recording once everything derived from it is stored.
 *
 * THE ORDER OF OPERATIONS IS THE WHOLE POINT
 * ------------------------------------------
 * The recording is the most sensitive artifact this platform holds and the
 * least necessary to keep. It is also the ONLY source of the features — once
 * deleted, anything not already extracted is gone permanently. Those two facts
 * pull in opposite directions, and the resolution is strict ordering: extract
 * everything, verify it landed, then delete.
 *
 * So this service never deletes on a schedule or on request. It deletes only
 * when it can confirm, artifact by artifact, that the derived data exists. A
 * session whose extraction failed keeps its recording and is reported as
 * blocked — losing research data to a privacy rule would be a bad trade, and a
 * silent one worse still.
 *
 * WHAT SURVIVES
 * -------------
 * Transcripts, feature vectors, the report and the counsellor's assessment.
 * None of them can reconstruct a face or a voice, and together they are enough
 * to retrain every model. That is what makes deleting the recording possible
 * rather than merely desirable.
 */
@Service
public class MediaPurgeService {

    private static final Logger log = LoggerFactory.getLogger(MediaPurgeService.class);

    private final SessionRepository sessionRepository;
    private final SessionFeaturesRepository featuresRepository;
    private final AuditLogService auditLogService;
    private final VoiceprintService voiceprintService;

    /**
     * Deleting immediately after processing is the privacy-preserving default.
     * Turn it off only to keep recordings for debugging a pipeline problem —
     * and remember that every session processed meanwhile keeps its video.
     */
    @Value("${app.media-purge.enabled:true}")
    private boolean enabled;

    public MediaPurgeService(
            SessionRepository sessionRepository,
            SessionFeaturesRepository featuresRepository,
            AuditLogService auditLogService,
            VoiceprintService voiceprintService
    ) {
        this.sessionRepository = sessionRepository;
        this.featuresRepository = featuresRepository;
        this.auditLogService = auditLogService;
        this.voiceprintService = voiceprintService;
    }

    /**
     * Everything that must exist before the recording may be destroyed.
     *
     * Video features are deliberately NOT required. A participant sitting off
     * camera, or a room too dark to track a face, is a normal occurrence — and
     * requiring them would keep those recordings forever, which is the worse
     * outcome for exactly the participants whose data is hardest to anonymise.
     * The reason for their absence is recorded instead.
     *
     * @return the reasons it cannot be deleted; empty means it can
     */
    public List<String> blockers(Session session, SessionFeatures features) {
        List<String> blockers = new ArrayList<>();

        if (features == null) {
            blockers.add("no feature vectors were stored");
            // Everything below reads from features; without it there is
            // nothing further to say.
            return blockers;
        }
        if (features.getTextFeatures() == null || features.getTextFeatures().length == 0) {
            blockers.add("text features are missing");
        }
        if (features.getAudioFeatures() == null || features.getAudioFeatures().length == 0) {
            blockers.add("audio features are missing");
        }
        if (isBlank(session.getDaicTranscriptPath()) || !fileExists(session.getDaicTranscriptPath())) {
            blockers.add("the full transcript was not written");
        }
        if (isBlank(session.getParticipantTranscriptPath())
                || !fileExists(session.getParticipantTranscriptPath())) {
            blockers.add("the participant-only transcript was not written");
        }
        return blockers;
    }

    /**
     * Delete this session's recording if — and only if — its derived data is
     * complete.
     *
     * Called at the end of processing. Never throws: a session that produced a
     * valid report must not be reported as failed because a file could not be
     * unlinked.
     */
    @Transactional
    public void purgeIfComplete(java.util.UUID sessionId) {
        Optional<Session> found = sessionRepository.findById(sessionId);
        if (found.isEmpty()) {
            return;
        }
        Session session = found.get();

        try {
            SessionFeatures features = featuresRepository.findBySessionId(sessionId).orElse(null);
            List<String> blockers = blockers(session, features);

            session.setDerivedDataComplete(blockers.isEmpty());

            if (!blockers.isEmpty()) {
                String reason = String.join("; ", blockers);
                session.setPurgeBlockedReason(reason);
                sessionRepository.save(session);
                // Warned, not silent: a recording still on disk after
                // processing is a privacy commitment not yet honoured, and
                // somebody has to be able to find out why.
                log.warn("Keeping the recording for session {}: {}", sessionId, reason);
                return;
            }

            session.setPurgeBlockedReason(null);

            if (!enabled) {
                log.info("Media purge is disabled; keeping the recording for session {}.", sessionId);
                sessionRepository.save(session);
                return;
            }

            deleteMedia(session);
            sessionRepository.save(session);
        } catch (Exception e) {
            log.error("Media purge failed for session {}", sessionId, e);
        }
    }

    /**
     * Remove the recording and anything else derived from it that still
     * contains raw voice or image.
     */
    private void deleteMedia(Session session) {
        boolean deleted = false;

        if (!isBlank(session.getVideoPath())) {
            try {
                deleted = Files.deleteIfExists(Path.of(session.getVideoPath()));
            } catch (IOException e) {
                // The exception's message carries the absolute path on disk.
                // That belongs in the log, which only an operator reads, not in
                // a database column that an admin screen may one day render.
                log.error("Could not delete the recording for session {}", session.getId(), e);
                session.setPurgeBlockedReason(
                        "the recording could not be deleted (" + e.getClass().getSimpleName()
                                + ") — see the server log");
                return;
            }
        }

        // Stamped whether or not a file was actually removed: if it was
        // already gone, the session should stop being reconsidered.
        session.setVideoDeletedAt(Instant.now());

        // A companion's voiceprint exists only to separate their voice out of
        // this recording. With the recording gone it has no purpose, and it
        // belongs to a third party who agreed to one appointment.
        int purgedCompanions = voiceprintService.purgeCompanionEmbeddings(session);

        auditLogService.log(null, "SESSION_MEDIA_PURGED", "SESSION", session.getId(),
                deleted
                        ? "recording deleted after successful feature extraction"
                        : "recording already absent; session marked purged");

        log.info("Purged media for session {} ({} companion voiceprint(s) cleared).",
                session.getId(), purgedCompanions);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean fileExists(String path) {
        try {
            return Files.exists(Path.of(path));
        } catch (Exception e) {
            return false;
        }
    }
}
