package com.project.depression.client;

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

    private final RestClient restClient;
    private final String adminToken;

    public MlServiceClient(
            @Value("${app.ml-service.base-url}") String baseUrl,
            @Value("${app.ml-service.admin-token:}") String adminToken
    ) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        // Model loading reads a large file from disk and unpickles it, which is
        // slower than a normal request but still far short of inference.
        requestFactory.setReadTimeout((int) Duration.ofSeconds(120).toMillis());

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
        this.adminToken = adminToken;
    }

    public MlProcessResponse process(String sessionId, String videoPath) {
        MlProcessRequest request = new MlProcessRequest(sessionId, videoPath);
        return restClient.post()
                .uri("/process")
                .body(request)
                .retrieve()
                .body(MlProcessResponse.class);
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
