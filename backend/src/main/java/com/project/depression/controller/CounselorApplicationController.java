package com.project.depression.controller;

import com.project.depression.dto.ApplicationSubmitResponse;
import com.project.depression.dto.CounselorApplicationForm;
import com.project.depression.dto.DocumentMetadata;
import com.project.depression.service.CounselorApplicationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/counselor-applications")
@Validated
public class CounselorApplicationController {

    private final CounselorApplicationService applicationService;

    public CounselorApplicationController(CounselorApplicationService applicationService) {
        this.applicationService = applicationService;
    }

    /**
     * Document metadata arrives as parallel arrays aligned by index with the
     * uploaded files, which is the only way multipart can carry per-file fields
     * without a second round trip. Zipped here rather than in the service so
     * the transport quirk stays at the edge, and defensively: a metadata array
     * shorter than the file list must degrade to "OTHER, no details" rather
     * than throwing away the file or blowing up on an index.
     */
    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<ApplicationSubmitResponse> submit(
            @Valid @ModelAttribute CounselorApplicationForm form,
            @RequestParam(required = false) List<MultipartFile> documents,
            @RequestParam(required = false) List<String> documentTypes,
            @RequestParam(required = false) List<String> documentAuthorities,
            @RequestParam(required = false) List<String> documentNumbers,
            @RequestParam(required = false) List<String> documentExpiries
    ) {
        List<DocumentMetadata> metadata = zip(
                documents, documentTypes, documentAuthorities, documentNumbers, documentExpiries);

        ApplicationSubmitResponse response = applicationService.submit(form, metadata);
        return ResponseEntity.status(201).body(response);
    }

    private static List<DocumentMetadata> zip(
            List<MultipartFile> files,
            List<String> types,
            List<String> authorities,
            List<String> numbers,
            List<String> expiries
    ) {
        if (files == null) {
            return List.of();
        }
        List<DocumentMetadata> out = new ArrayList<>(files.size());
        for (int i = 0; i < files.size(); i++) {
            out.add(new DocumentMetadata(
                    files.get(i),
                    at(types, i),
                    at(authorities, i),
                    at(numbers, i),
                    parseDate(at(expiries, i))
            ));
        }
        return out;
    }

    private static String at(List<String> list, int index) {
        if (list == null || index >= list.size()) {
            return null;
        }
        String value = list.get(index);
        return value == null || value.isBlank() ? null : value.trim();
    }

    /**
     * An unparseable expiry becomes "no expiry recorded" rather than a 400.
     * The document itself is the thing worth keeping; losing an entire licence
     * upload over a malformed date field would be a bad trade.
     */
    private static LocalDate parseDate(String value) {
        if (value == null) {
            return null;
        }
        try {
            return LocalDate.parse(value);
        } catch (java.time.format.DateTimeParseException e) {
            return null;
        }
    }
}
