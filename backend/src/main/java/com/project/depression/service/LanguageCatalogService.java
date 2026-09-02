package com.project.depression.service;

import com.project.depression.client.MlServiceClient;
import com.project.depression.dto.LanguageOption;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The list of languages a session may be conducted in, and which of them can be
 * scored.
 *
 * The answer lives in the ML service — "scorable" means "the weights are on
 * disk", and they are on its disk — so this is a caching proxy rather than a
 * second source of truth. Mirroring the list in Java would produce two answers
 * that disagree the moment an administrator activates a new language's models.
 *
 * The cache exists because the catalog is read on every New Session page load
 * and changes only when an admin activates weights. The last good response is
 * kept indefinitely and served if the ML service later goes down: a counselor
 * uploading a session should not be blocked by an inference service being
 * restarted, since processing is asynchronous anyway and will simply queue.
 */
@Service
public class LanguageCatalogService {

    private static final Logger log = LoggerFactory.getLogger(LanguageCatalogService.class);

    private static final Duration TTL = Duration.ofMinutes(2);

    public static final String DEFAULT_LANGUAGE = "en";

    /**
     * Served only on a cold start with the ML service already unreachable.
     * English alone, because English is the only language whose weights ship
     * with the project — anything else here would be a guess presented as fact.
     */
    private static final List<LanguageOption> COLD_FALLBACK =
            List.of(new LanguageOption("en", "English", "English", true, true));

    private record Snapshot(List<LanguageOption> languages, Instant fetchedAt, boolean fromMlService) {
        boolean isFresh() {
            return fromMlService && Duration.between(fetchedAt, Instant.now()).compareTo(TTL) < 0;
        }
    }

    private final MlServiceClient mlServiceClient;
    private final AtomicReference<Snapshot> cache = new AtomicReference<>(null);

    public LanguageCatalogService(MlServiceClient mlServiceClient) {
        this.mlServiceClient = mlServiceClient;
    }

    public List<LanguageOption> catalog() {
        Snapshot current = cache.get();
        if (current != null && current.isFresh()) {
            return current.languages();
        }

        try {
            List<LanguageOption> fetched = fetchFromMlService();
            cache.set(new Snapshot(fetched, Instant.now(), true));
            return fetched;
        } catch (Exception e) {
            // Stale data beats no data: the catalog changes only on an admin
            // action, so a two-minute-old copy is almost certainly still right.
            if (current != null) {
                log.warn("Could not refresh the language catalog ({}); serving the cached copy.",
                        e.getMessage());
                return current.languages();
            }
            log.warn("Could not reach the ML service for the language catalog ({}); "
                    + "falling back to English only.", e.getMessage());
            cache.set(new Snapshot(COLD_FALLBACK, Instant.now(), false));
            return COLD_FALLBACK;
        }
    }

    /** Languages a session may currently be created in — scorable ones only. */
    public List<LanguageOption> scorable() {
        return catalog().stream().filter(LanguageOption::scoring).toList();
    }

    public Optional<LanguageOption> find(String code) {
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        String normalized = normalize(code);
        return catalog().stream().filter(l -> l.code().equals(normalized)).findFirst();
    }

    /**
     * Validate a requested session language, or explain precisely why not.
     *
     * The two failure messages are deliberately different. "Not recognised" is
     * a client bug; "recognised but not scorable" is a true statement about
     * this deployment that a counselor needs to understand, because the fix is
     * for an administrator to install models, not for them to try again.
     */
    public String requireScorable(String code) {
        String normalized = code == null || code.isBlank() ? DEFAULT_LANGUAGE : normalize(code);

        LanguageOption option = find(normalized).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "'" + normalized + "' is not a language this platform recognises."));

        if (!option.scoring()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    option.name() + " sessions cannot be analysed on this deployment yet: no "
                            + option.name() + " model has been trained and activated. The English "
                            + "models cannot stand in — their word features and sentence encoder are "
                            + "English-only, so they would return a confident but meaningless result. "
                            + "Ask your administrator to activate " + option.name() + " models.");
        }
        return normalized;
    }

    /** "EN", "en-IN" and "en" all mean the same language here. */
    public static String normalize(String code) {
        String trimmed = code.trim().toLowerCase();
        int dash = trimmed.indexOf('-');
        return dash > 0 ? trimmed.substring(0, dash) : trimmed;
    }

    @SuppressWarnings("unchecked")
    private List<LanguageOption> fetchFromMlService() {
        Map<String, Object> body = mlServiceClient.languages();
        Object raw = body == null ? null : body.get("languages");
        if (!(raw instanceof List<?> list)) {
            throw new IllegalStateException("ML service returned no 'languages' array.");
        }

        return list.stream()
                .filter(Map.class::isInstance)
                .map(item -> (Map<String, Object>) item)
                .map(m -> new LanguageOption(
                        String.valueOf(m.get("code")),
                        String.valueOf(m.get("name")),
                        String.valueOf(m.get("native_name")),
                        Boolean.TRUE.equals(m.get("transcription")),
                        Boolean.TRUE.equals(m.get("scoring"))))
                .toList();
    }
}
