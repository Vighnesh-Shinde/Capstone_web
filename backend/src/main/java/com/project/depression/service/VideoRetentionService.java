package com.project.depression.service;

import com.project.depression.entity.Session;
import com.project.depression.repository.SessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Deletes raw interview recordings once they pass the retention window.
 *
 * The recording is the most sensitive artifact the system holds — it contains a
 * real person's voice discussing their mental health — and it is also the least
 * necessary to keep. Everything with ongoing value (the report, the transcript,
 * the feature vectors) is stored separately and survives, so deleting the video
 * costs neither the clinical record nor the ability to retrain.
 *
 * Deliberately only touches files. Rows are never deleted here: a session whose
 * video is gone is still a session, and the UI shows why the recording is
 * unavailable rather than appearing broken.
 */
@Service
public class VideoRetentionService {

    private static final Logger log = LoggerFactory.getLogger(VideoRetentionService.class);

    private final SessionRepository sessionRepository;
    private final AuditLogService auditLogService;

    @Value("${app.video-retention.days:30}")
    private int retentionDays;

    @Value("${app.video-retention.enabled:true}")
    private boolean enabled;

    public VideoRetentionService(SessionRepository sessionRepository, AuditLogService auditLogService) {
        this.sessionRepository = sessionRepository;
        this.auditLogService = auditLogService;
    }

    /** Runs daily at 03:15 server time — off-peak, and after any nightly backup. */
    @Scheduled(cron = "${app.video-retention.cron:0 15 3 * * *}")
    public void scheduledSweep() {
        if (!enabled) {
            log.debug("Video retention sweep is disabled.");
            return;
        }
        sweep();
    }

    /**
     * @return how many recordings were deleted.
     */
    @Transactional
    public int sweep() {
        Instant cutoff = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
        List<Session> expired = sessionRepository.findVideosToPurge(cutoff);

        int deleted = 0;
        for (Session session : expired) {
            try {
                Path videoPath = Path.of(session.getVideoPath());
                boolean existed = Files.deleteIfExists(videoPath);

                // Stamp regardless: if the file was already gone, the session
                // should still stop being reconsidered on every sweep.
                session.setVideoDeletedAt(Instant.now());
                sessionRepository.save(session);

                if (existed) {
                    deleted++;
                    log.info("Retention: deleted recording for session {} (older than {} days)",
                            session.getId(), retentionDays);
                } else {
                    log.warn("Retention: recording for session {} was already missing at {}",
                            session.getId(), session.getVideoPath());
                }
            } catch (IOException e) {
                // One undeletable file (locked, permissions) must not stop the
                // rest of the sweep.
                log.error("Retention: could not delete recording for session {}", session.getId(), e);
            }
        }

        if (deleted > 0) {
            auditLogService.log(null, "VIDEO_RETENTION_SWEEP", "SESSION", null,
                    deleted + " recordings deleted (retention " + retentionDays + " days)");
        }
        return deleted;
    }
}
