package com.project.depression.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.project.depression.dto.CountryOption;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Countries, their dial codes, and phone-number handling.
 *
 * Country codes and display names come from {@link Locale}, so that half needs
 * no maintenance at all. Dial codes and per-country number lengths come from
 * {@code resources/reference/dial-codes.json}, which was generated from
 * Google's libphonenumber metadata rather than typed out — a hand-written list
 * of 245 dialling codes is wrong the first time somebody transposes two digits,
 * and silently so.
 *
 * Validation here is length-and-prefix, not libphonenumber's full per-country
 * pattern matching: it catches a nine-digit Indian mobile or a stray letter,
 * but not a well-formed number whose operator prefix does not exist. Adding the
 * {@code com.googlecode.libphonenumber} dependency and delegating {@link
 * #toE164} to it would upgrade that in one method, if stricter checking ever
 * matters more than one fewer dependency.
 *
 * The flag emoji is computed arithmetically from the ISO code, so it is correct
 * for every country by construction and ships no image assets.
 */
@Service
public class CountryCatalogService {

    private static final Logger log = LoggerFactory.getLogger(CountryCatalogService.class);

    /** Regional-indicator symbols start here; 'A' maps to U+1F1E6. */
    private static final int REGIONAL_INDICATOR_BASE = 0x1F1E6;

    /** E.164 caps the whole number, country code included, at 15 digits. */
    private static final int E164_MAX_DIGITS = 15;

    private record DialInfo(String dial, Integer minLen, Integer maxLen) {}

    private final Map<String, DialInfo> dialInfo;
    private final List<CountryOption> countries;
    private final java.util.Set<String> validCodes;

    public CountryCatalogService(ObjectMapper objectMapper) {
        this.dialInfo = loadDialInfo(objectMapper);

        this.countries = Locale.getISOCountries(Locale.IsoCountryCode.PART1_ALPHA2).stream()
                .map(this::toOption)
                // Sorted by English display name so the picker reads
                // alphabetically; the frontend may re-sort for its own locale.
                .sorted(Comparator.comparing(CountryOption::name))
                .toList();

        this.validCodes = countries.stream().map(CountryOption::code).collect(Collectors.toSet());
    }

    public List<CountryOption> catalog() {
        return countries;
    }

    private static Map<String, DialInfo> loadDialInfo(ObjectMapper objectMapper) {
        try (InputStream in = new ClassPathResource("reference/dial-codes.json").getInputStream()) {
            Map<String, Map<String, Object>> raw =
                    objectMapper.readValue(in, new TypeReference<>() {});
            return raw.entrySet().stream().collect(Collectors.toMap(
                    Map.Entry::getKey,
                    e -> new DialInfo(
                            String.valueOf(e.getValue().get("dial")),
                            asInt(e.getValue().get("minLen")),
                            asInt(e.getValue().get("maxLen")))));
        } catch (IOException e) {
            // Degrades to "no dial codes" rather than refusing to start: an
            // unusable phone field is a smaller failure than a platform that
            // will not boot, and the log says exactly what is missing.
            log.error("Could not read reference/dial-codes.json; dial codes will be unavailable.", e);
            return Map.of();
        }
    }

    private static Integer asInt(Object value) {
        return value instanceof Number n ? n.intValue() : null;
    }

    private CountryOption toOption(String isoCode) {
        Locale locale = new Locale("", isoCode);
        DialInfo info = dialInfo.get(isoCode);
        // A few ISO territories (Antarctica, Bouvet Island) have no dial code.
        String dialCode = info == null ? null : "+" + info.dial();
        return new CountryOption(isoCode, locale.getDisplayCountry(Locale.ENGLISH), dialCode, flagEmoji(isoCode));
    }

    /**
     * "IN" becomes the two regional-indicator characters that render as a flag.
     * Two code points, no image assets; the viewer's font decides whether it
     * draws a flag or two letters, and two letters is a fine fallback.
     */
    private static String flagEmoji(String isoCode) {
        int first = REGIONAL_INDICATOR_BASE + (isoCode.charAt(0) - 'A');
        int second = REGIONAL_INDICATOR_BASE + (isoCode.charAt(1) - 'A');
        return new String(Character.toChars(first)) + new String(Character.toChars(second));
    }

    /** Uppercased ISO code, or null if blank. Rejects anything unrecognised. */
    public String requireValidCountry(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        String normalized = code.trim().toUpperCase(Locale.ROOT);
        if (!validCodes.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "'" + code + "' is not a recognised ISO country code.");
        }
        return normalized;
    }

    /**
     * Canonical +E.164 form of a dial code plus a national number.
     *
     * Returns null rather than throwing when either part is absent — the phone
     * number is optional. When both are present but do not make a plausible
     * number, that IS worth rejecting: silently storing an unreachable contact
     * number for a clinician defeats the point of collecting one.
     */
    public String toE164(String dialCode, String nationalNumber) {
        if (dialCode == null || dialCode.isBlank() || nationalNumber == null || nationalNumber.isBlank()) {
            return null;
        }

        String dial = dialCode.trim().replaceAll("[^0-9]", "");
        String national = nationalNumber.replaceAll("[^0-9]", "");

        if (dial.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "'" + dialCode + "' is not a valid international dialling code.");
        }
        if (national.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That phone number contains no digits.");
        }
        if (dial.length() + national.length() > E164_MAX_DIGITS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That phone number is too long — international numbers are at most "
                            + E164_MAX_DIGITS + " digits including the country code.");
        }

        checkLengthForDialCode(dial, national);
        return "+" + dial + national;
    }

    /**
     * Length check against the countries sharing this dialling code.
     *
     * Keyed by dial code rather than by the selected country because several
     * countries share one (+1 covers the US, Canada and much of the Caribbean;
     * +7 covers Russia and Kazakhstan). Accepting a length valid for any of
     * them is the correct looseness here — the alternative rejects real numbers
     * from real people over a distinction this field does not capture.
     */
    private void checkLengthForDialCode(String dial, String national) {
        List<DialInfo> matches = dialInfo.values().stream()
                .filter(i -> i.dial().equals(dial))
                .toList();

        if (matches.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "'+" + dial + "' is not a dialling code we recognise.");
        }

        boolean anyKnownLength = matches.stream().anyMatch(i -> i.minLen() != null && i.maxLen() != null);
        if (!anyKnownLength) {
            return;
        }

        boolean fits = matches.stream()
                .filter(i -> i.minLen() != null && i.maxLen() != null)
                .anyMatch(i -> national.length() >= i.minLen() && national.length() <= i.maxLen());

        if (!fits) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A +" + dial + " number of " + national.length()
                            + " digits is not a valid length. Check the number, and leave out the "
                            + "country code and any leading zero.");
        }
    }
}
