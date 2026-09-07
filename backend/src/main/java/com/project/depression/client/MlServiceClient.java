package com.project.depression.client;

import com.project.depression.dto.MlEnrollVoiceRequest;
import com.project.depression.dto.MlEnrollVoiceResponse;
import com.project.depression.dto.MlProcessRequest;
import com.project.depression.dto.MlProcessResponse;
import com.project.depression.dto.MlValidateModelRequest;
import com.project.depression.dto.MlValidateModelResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;

@Component
public class MlServiceClient {

    /** Header the ML service checks on its /internal/* endpoints. */
    private static final String ADMIN_TOKEN_HEADER = "X-ML-Admin-Token";

    /** Short-lived calls: model validation, reloads, the language catalogue. */
    private final RestClient restClient;

    /**
     * Calls that run the media pipeline, which is minutes of CPU work.
     *
     * A SEPARATE client, not one generous timeout for everything. A hung
     * /internal call should fail in two minutes rather than tie a thread up
     * for an hour; a real session should not be abandoned at two minutes
     * because that number was chosen with model loading in mind.
     */
    private final RestClient pipelineClient;

    private final String adminToken;

    public MlServiceClient(
            @Value("${app.ml-service.base-url}") String baseUrl,
            @Value("${app.ml-service.admin-token:}") String adminToken,
            @Value("${app.ml-service.pipeline-timeout-minutes:60}") int pipelineTimeoutMinutes
    ) {
        SimpleClientHttpRequestFactory quick = new SimpleClientHttpRequestFactory();
        quick.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        // Model loading reads a large file from disk and unpickles it, which is
        // slower than a normal request but still far short of inference.
        quick.setReadTimeout((int) Duration.ofSeconds(120).toMillis());

        SimpleClientHttpRequestFactory pipeline = new SimpleClientHttpRequestFactory();
        pipeline.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        // Processing a session means ffmpeg, Whisper, diarization, sentence
        // embeddings and facial landmarks over the whole recording, on CPU.
        //
        // This was 120 seconds, chosen for model loading and then inherited by
        // /process. A three-minute test recording took about 108 seconds — just
        // under — so it passed here and FAILED on a slightly slower machine,
        // reported to the counsellor as "the recording could not be processed"
        // while the ML service quietly finished the job correctly. A real
        // 40-minute counselling session never stood a chance.
        pipeline.setReadTimeout((int) Duration.ofMinutes(pipelineTimeoutMinutes).toMillis());

        this.restClient = RestClient.builder().baseUrl(baseUrl).requestFactory(quick).build();
        this.pipelineClient = RestClient.builder().baseUrl(baseUrl).requestFactory(pipeline).build();
        this.adminToken = adminToken;
    }

    public MlProcessResponse process(
            String sessionId,
            String videoPath,
            String language,
            java.util.List<Double> counselorEmbedding,
            java.util.List<java.util.List<Double>> companionEmbeddings
    ) {
        MlProcessRequest request = new MlProcessRequest(
                sessionId, videoPath, language, counselorEmbedding, companionEmbeddings);
        return pipelineClient.post()
                .uri("/process")
                .body(request)
                .retrieve()
                .body(MlProcessResponse.class);
    }

    /**
     * The language catalog, read from the ML service rather than duplicated here.
     *
     * The ML service is the only component that can answer truthfully, because
     * "can this be scored" means "are the weights on disk", and the weights are
     * on its disk. Mirroring the list in Java would give two sources of truth
     * that disagree the moment an admin activates a new language.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> languages() {
        return restClient.get()
                .uri("/languages")
                .retrieve()
                .body(Map.class);
    }

    /**
     * Turn an enrollment recording into a voiceprint.
     *
     * Not on the token-gated /internal path: this runs on behalf of a
     * signed-in counselor during an ordinary action, and the backend has
     * already authenticated them. The endpoint reads an audio file and returns
     * a vector — unlike model upload, it does not execute what it is given.
     */
    public MlEnrollVoiceResponse enrollVoice(String audioPath) {
        // Enrollment runs the diarization pipeline over the recording too —
        // around half a minute for a one-minute clip, longer for an upload.
        return pipelineClient.post()
                .uri("/enroll-voice")
                .body(new MlEnrollVoiceRequest(audioPath))
                .retrieve()
                .body(MlEnrollVoiceResponse.class);
    }

    /**
     * Ask the ML service to load and describe an uploaded model file.
     *
     * Validation lives there because Java cannot read a scikit-learn joblib —
     * only the Python process can tell us whether the file is a usable model of
     * the right shape.
     */
    public MlValidateModelResponse validateModel(String absolutePath, String modality) {
        return restClient.post()
                .uri("/internal/validate-model")
                .header(ADMIN_TOKEN_HEADER, adminToken)
                .body(new MlValidateModelRequest(absolutePath, modality))
                .retrieve()
                .body(MlValidateModelResponse.class);
    }

    /** Swap the ML service over to whatever the manifest now marks active. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> reloadModels() {
        return restClient.post()
                .uri("/internal/reload-models")
                .header(ADMIN_TOKEN_HEADER, adminToken)
                .retrieve()
                .body(Map.class);
    }
}
