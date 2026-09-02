package com.project.depression.controller;

import com.project.depression.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Liveness and readiness for load balancers, container healthchecks and uptime
 * monitoring.
 *
 * Hand-written rather than pulled in with spring-boot-starter-actuator. The
 * starter brings a whole management surface — env, beans, mappings, config
 * properties — and every one of those is something that has to be deliberately
 * locked down on a service holding clinical records. One endpoint that answers
 * one question is the smaller thing to secure.
 *
 * The database is actually touched rather than assumed. A process that is
 * running but cannot reach Postgres serves errors on every screen, and a health
 * check that reports "up" through that is worse than no health check at all —
 * it stops anyone being paged.
 */
@RestController
@RequestMapping("/api/health")
public class HealthController {

    private final UserRepository userRepository;

    public HealthController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> body = new LinkedHashMap<>();

        try {
            userRepository.count();
            body.put("status", "UP");
            body.put("database", "UP");
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            body.put("status", "DOWN");
            body.put("database", "DOWN");
            // The exception type, not its message: a connection failure's
            // message can carry the host, port and username, and this endpoint
            // is unauthenticated by design.
            body.put("error", e.getClass().getSimpleName());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }
    }
}
