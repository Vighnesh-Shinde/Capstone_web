package com.project.depression.service;

import com.project.depression.client.MlServiceClient;
import com.project.depression.dto.MlProcessResponse;
import com.project.depression.entity.ExplanationFactor;
import com.project.depression.entity.Prediction;
import com.project.depression.entity.Report;
import com.project.depression.entity.Session;
import com.project.depression.entity.SessionFeatures;
import com.project.depression.entity.SessionStatus;
import com.project.depression.entity.SpeakerAttribution;
import com.project.depression.repository.ReportRepository;
import com.project.depression.repository.SessionFeaturesRepository;
import com.project.depression.repository.SessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.HttpClientErrorException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
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
    private final VoiceprintService voiceprintService;

    public SessionProcessingService(
            SessionRepository sessionRepository,
            ReportRepository reportRepository,
            SessionFeaturesRepository sessionFeaturesRepository,
            MlServiceClient mlServiceClient,
            DatasetEligibilityService datasetEligibilityService,
            VoiceprintService voiceprintService
    ) {
        this.sessionRepository = sessionRepository;
        this.reportRepository = reportRepository;
        this.sessionFeaturesRepository = sessionFeaturesRepository;
        this.mlServiceClient = mlServiceClient;
        this.datasetEligibilityService = datasetEligibilityService;
        this.voiceprintService = voiceprintService;
    }

    @Async("mlProcessingExecutor")
    @Transactional
    public void processSessionAsync(UUID sessionId) {
        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NoSuchElementException("Session not found: " + sessionId));

        try {
            session.setStatus(SessionStatus.PROCESSING);
            sessionRepository.save(session);

            // The voiceprints are read here rather than passed in, because
            // this runs asynchronously long after the request thread is gone.
            List<Double> counselorEmbedding = voiceprintService
                    .requireCurrentVoiceprint(session.getCounselor())
                    .getEmbedding();
            List<List<Double>> companionEmbeddings = voiceprintService.companionEmbeddings(session);

            MlProcessResponse mlResponse = mlServiceClient.process(
                    sessionId.toString(), session.getVideoPath(), session.getLanguage(),
                    counselorEmbedding, companionEmbeddings);

            // Stored before the report: this is the decision that determined
            // whose speech was analysed, and it stays useful even if report
            // creation below then fails.
            session.setSpeakerSimilarities(mlResponse.speaker_similarities());
            session.setParticipantSpeaker(mlResponse.participant_speaker());
            session.setCounselorSpeaker(mlResponse.counselor_speaker());
            session.setSpeakerAttribution(SpeakerAttribution.VOICEPRINT);
            voiceprintService.recordCompanionLabels(session, mlResponse.companion_speakers());
            session.setFailureReason(null);
            storeDaicTranscript(session, mlResponse.daic_transcript());
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
        } catch (HttpClientErrorException.UnprocessableEntity e) {
            // The ML service refused to score rather than failing. Two distinct
            // refusals arrive this way and they are NOT the same thing: the
            // voices could not be resolved, or the session's language has no
            // trained models. Only the first is a speaker problem, so the code
            // is read from the response rather than guessed at from the prose.
            Refusal refusal = extractRefusal(e);
            log.warn("Session {} was not scored ({}): {}",
                    sessionId, refusal.code(), refusal.message());

            session.setStatus(
                    "SPEAKER_UNRESOLVED".equals(refusal.code())
                            ? SessionStatus.SPEAKER_UNVERIFIED
                            // A language with no models is not a speaker
                            // problem, and labelling it one would send the
                            // counselor looking for a third person in the room.
                            : SessionStatus.FAILED);
            session.setFailureReason(refusal.message());
            sessionRepository.save(session);
        } catch (Exception e) {
            log.error("ML processing failed for session {}", sessionId, e);
            session.setStatus(SessionStatus.FAILED);
            session.setFailureReason(
                    "The recording could not be processed. If this keeps happening, "
                            + "check the file plays correctly and contact your administrator.");
            sessionRepository.save(session);
        }
    }

    /** A refusal from the ML service: why, in a form code can branch on. */
    private record Refusal(String code, String message) {}

    /**
     * Pull the ML service's refusal out of its JSON error body.
     *
     * FastAPI wraps the detail as {"detail": {...}}, and the message inside was
     * written for the counselor to read. Older responses used a bare string
     * there, so both shapes are accepted; an unrecognised body degrades to the
     * raw text rather than a generic apology, because some information beats
     * none when something unexpected has happened.
     */
    private static Refusal extractRefusal(HttpClientErrorException e) {
        String raw = e.getResponseBodyAsString();
        try {
            JsonNode detail = new ObjectMapper().readTree(raw).get("detail");
            if (detail != null && detail.isObject()) {
                return new Refusal(
                        detail.path("code").asText("UNKNOWN"),
                        detail.path("message").asText("The session could not be scored."));
            }
            if (detail != null && detail.isTextual()) {
                return new Refusal("UNKNOWN", detail.asText());
            }
        } catch (Exception ignored) {
            // Fall through to the raw body below.
        }
        return new Refusal("UNKNOWN",
                raw == null || raw.isBlank() ? "The session could not be scored." : raw);
    }

    /**
     * Write the DAIC-WOZ-format transcript beside the session's video.
     *
     * Failing to write it must not fail the session: the report is the clinical
     * output and the transcript is a research artifact. A missing file is
     * recoverable by re-processing; a lost report is not.
     */
    private void storeDaicTranscript(Session session, String content) {
        if (content == null || content.isBlank()) {
            return;
        }
        try {
            Path videoPath = Path.of(session.getVideoPath());
            Path target = videoPath.getParent().resolve("TRANSCRIPT.csv");
            // ISO-8859-1 would mangle any non-ASCII the transcriber produced;
            // the corpus is ASCII but a Hindi session recorded here will not be.
            Files.writeString(target, content, StandardCharsets.UTF_8);
            session.setDaicTranscriptPath(target.toString());
        } catch (Exception e) {
            log.error("Could not write the DAIC-format transcript for session {}", session.getId(), e);
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
