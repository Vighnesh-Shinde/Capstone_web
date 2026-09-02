package com.project.depression.controller;

import com.project.depression.dto.CountryOption;
import com.project.depression.dto.LanguageOption;
import com.project.depression.entity.DocumentType;
import com.project.depression.service.CountryCatalogService;
import com.project.depression.service.LanguageCatalogService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * Lists the frontend needs but must not hardcode: countries, dial codes,
 * session languages, and document types.
 *
 * Public rather than authenticated, because the counselor application form is
 * itself public and needs every one of them before anybody has an account. All
 * four are static reference data with nothing user-specific in them.
 */
@RestController
@RequestMapping("/api/reference")
public class ReferenceDataController {

    private final CountryCatalogService countryCatalog;
    private final LanguageCatalogService languageCatalog;

    public ReferenceDataController(
            CountryCatalogService countryCatalog,
            LanguageCatalogService languageCatalog
    ) {
        this.countryCatalog = countryCatalog;
        this.languageCatalog = languageCatalog;
    }

    @GetMapping("/countries")
    public List<CountryOption> countries() {
        return countryCatalog.catalog();
    }

    /**
     * Every known language, each flagged with whether it can be transcribed and
     * whether it can be scored. The full list is returned rather than only the
     * scorable ones so the New Session picker can show a Marathi option that is
     * visibly disabled with a reason — an absent option looks like an oversight,
     * a disabled one explains itself.
     */
    @GetMapping("/languages")
    public Map<String, Object> languages() {
        return Map.of("languages", languageCatalog.catalog());
    }

    @GetMapping("/document-types")
    public List<Map<String, String>> documentTypes() {
        return Arrays.stream(DocumentType.values())
                .map(t -> Map.of("value", t.name(), "label", t.label()))
                .toList();
    }
}
