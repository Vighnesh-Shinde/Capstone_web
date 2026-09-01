package com.project.depression.service;

import com.project.depression.client.MlServiceClient;
import com.project.depression.dto.MlProcessResponse;
import com.project.depression.entity.ExplanationFactor;
import com.project.depression.entity.Prediction;
import com.project.depression.entity.Report;
import com.project.depression.entity.Session;
import com.project.depression.entity.SessionFeatures;
import com.project.depression.entity.SessionStatus;
import com.project.depression.repository.ReportRepository;
import com.project.depression.repository.SessionFeaturesRepository;
import com.project.depression.repository.SessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Separate bean (rather than a method on SessionService) so that Spring's
 * proxy-based @Async advice actually applies: calling this method via an
 * injected dependency goes through the proxy, whereas a self-invoked method
 * on SessionService would silently run synchronously.
 */
@Service
public class SessionProcessingService {

    private static final Logger log = LoggerFactory.getLogger(SessionProcessingService.class);

    private final SessionRepository sessionRepository;
    private final ReportRepository reportRepository;
    private final SessionFeaturesRepository sessionFeaturesRepository;
    private final MlServiceClient mlServiceClient;
    private final DatasetEligibilityService datasetEligibilityService;

    public SessionProcessingService(
            SessionRepository sessionRepository,
            ReportRepository reportRepository,
            SessionFeaturesRepository sessionFeaturesRepository,
            MlServiceClient mlServiceClient,
            DatasetEligibilityService datasetEligibilityService
    ) {
        this.sessionRepository = sessionRepository;
        this.reportRepository = reportRepository;
        this.sessionFeaturesRepository = sessionFeaturesRepository;
        this.mlServiceClient = mlServiceClient;
        this.datasetEligibilityService = datasetEligibilityService;
    }

    @Async("mlProcessingExecutor")
    @Transactional
    public void processSessionAsync(UUID sessionId) {
        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NoSuchElementException("Session not found: " + sessionId));

        try {
            session.setStatus(SessionStatus.PROCESSING);
            sessionRepository.save(session);

            MlProcessResponse mlResponse = mlServiceClient.process(sessionId.toString(), session.getVideoPath());
            Map<String, Double> modalityContributions = mlResponse.modality_contributions();

            Report report = Report.builder()
                    .session(session)
                    .prediction(Prediction.valueOf(mlResponse.prediction()))
                    .confidenceScore(mlResponse.confidence_score())
                    .audioContribution(modalityContributions == null ? null : modalityContributions.get("audio"))
                    .textContribution(modalityContributions == null ? null : modalityContributions.get("text"))
                    .videoContribution(modalityContributions == null ? null : modalityContributions.get("video"))
                    .build();

            List<ExplanationFactor> factors = mlResponse.explanation().stream()
                    .map(item -> ExplanationFactor.builder()
                            .report(report)
                            .featureName(item.feature_name())
                            .contributionScore(item.contribution_score())
                            .description(item.description())
                            .modality(item.modality())
                            .build())
                    .toList();
            report.setExplanationFactors(factors);

            reportRepository.save(report);
            persistFeatures(session, mlResponse);

            session.setStatus(SessionStatus.COMPLETED);
            sessionRepository.save(session);

            datasetEligibilityService.evaluate(session);
        } catch (Exception e) {
            log.error("ML processing failed for session {}", sessionId, e);
            session.setStatus(SessionStatus.FAILED);
            sessionRepository.save(session);
        }
    }

    /**
     * Store the vectors the models consumed, so this session can later join a
     * training set without its video being re-processed.
     *
     * The mock pipeline returns none, and a failure to store them must never
     * fail the session: the report is the clinical output and matters more than
     * the research artifact.
     */
    private void persistFeatures(Session session, MlProcessResponse mlResponse) {
        if (mlResponse.text_features() == null && mlResponse.audio_features() == null) {
            return;
        }

        try {
            double[] text = toArray(mlResponse.text_features());
            double[] audio = toArray(mlResponse.audio_features());

            sessionFeaturesRepository.save(SessionFeatures.builder()
                    .session(session)
                    .textFeatures(text)
                    .audioFeatures(audio)
                    .textFeatureCount(text == null ? null : text.length)
                    .audioFeatureCount(audio == null ? null : audio.length)
                    .transcriptText(mlResponse.transcript_text())
                    .build());

            log.info("Stored features for session {} ({} text, {} audio)",
                    session.getId(),
                    text == null ? 0 : text.length,
                    audio == null ? 0 : audio.length);
        } catch (Exception e) {
            log.error("Could not store features for session {} — the report is unaffected",
                    session.getId(), e);
        }
    }

    private static double[] toArray(List<Double> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        double[] out = new double[values.size()];
        for (int i = 0; i < values.size(); i++) {
            out[i] = values.get(i);
        }
        return out;
    }
}
