package com.project.depression.config;

import com.project.depression.service.RateLimitExceededException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Simple in-memory sliding-window rate limiter for unauthenticated,
 * abuse-prone endpoints (login, counselor-application submission). Per
 * client IP. Fine for a single-instance deployment; a multi-instance
 * deployment would move this state to Redis or a gateway instead.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final HandlerExceptionResolver exceptionResolver;

    @Value("${app.rate-limit.login.max-attempts:10}")
    private int loginMaxAttempts;

    @Value("${app.rate-limit.login.window-minutes:15}")
    private int loginWindowMinutes;

    @Value("${app.rate-limit.application-submit.max-attempts:5}")
    private int applicationMaxAttempts;

    @Value("${app.rate-limit.application-submit.window-minutes:15}")
    private int applicationWindowMinutes;

    @Value("${app.rate-limit.password-reset.max-attempts:5}")
    private int passwordResetMaxAttempts;

    @Value("${app.rate-limit.password-reset.window-minutes:15}")
    private int passwordResetWindowMinutes;

    private final ConcurrentHashMap<String, Deque<Long>> attempts = new ConcurrentHashMap<>();

    public RateLimitFilter(@Qualifier("handlerExceptionResolver") HandlerExceptionResolver exceptionResolver) {
        this.exceptionResolver = exceptionResolver;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        RuleMatch rule = matchRule(request);

        if (rule != null) {
            String key = rule.name + ":" + clientIp(request);
            if (isRateLimited(key, rule.maxAttempts, rule.window)) {
                exceptionResolver.resolveException(
                        request, response, null,
                        new RateLimitExceededException("Too many requests. Please try again later.")
                );
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean isRateLimited(String key, int maxAttempts, Duration window) {
        long now = System.currentTimeMillis();
        long windowStart = now - window.toMillis();

        Deque<Long> timestamps = attempts.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (timestamps) {
            while (!timestamps.isEmpty() && timestamps.peekFirst() < windowStart) {
                timestamps.pollFirst();
            }
            if (timestamps.size() >= maxAttempts) {
                return true;
            }
            timestamps.addLast(now);
            return false;
        }
    }

    private RuleMatch matchRule(HttpServletRequest request) {
        String method = request.getMethod();
        String path = request.getRequestURI();

        if ("POST".equals(method) && path.endsWith("/api/auth/login")) {
            return new RuleMatch("login", loginMaxAttempts, Duration.ofMinutes(loginWindowMinutes));
        }
        if ("POST".equals(method) && path.endsWith("/api/counselor-applications")) {
            return new RuleMatch("application-submit", applicationMaxAttempts, Duration.ofMinutes(applicationWindowMinutes));
        }
        // Both halves of the reset flow: limiting only the request side would
        // still leave the token-submission endpoint open to brute forcing.
        if ("POST".equals(method)
                && (path.endsWith("/api/auth/forgot-password") || path.endsWith("/api/auth/reset-password"))) {
            return new RuleMatch("password-reset", passwordResetMaxAttempts, Duration.ofMinutes(passwordResetWindowMinutes));
        }
        return null;
    }

    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private record RuleMatch(String name, int maxAttempts, Duration window) {
    }
}
