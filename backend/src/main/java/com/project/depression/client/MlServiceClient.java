package com.project.depression.client;

import com.project.depression.dto.MlProcessRequest;
import com.project.depression.dto.MlProcessResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Component
public class MlServiceClient {

    private final RestClient restClient;

    public MlServiceClient(@Value("${app.ml-service.base-url}") String baseUrl) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        requestFactory.setReadTimeout((int) Duration.ofSeconds(60).toMillis());

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
    }

    public MlProcessResponse process(String sessionId, String videoPath) {
        MlProcessRequest request = new MlProcessRequest(sessionId, videoPath);
        return restClient.post()
                .uri("/process")
                .body(request)
                .retrieve()
                .body(MlProcessResponse.class);
    }
}
