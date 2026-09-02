package com.project.depression.dto;

import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;

/** One uploaded verification file, paired with what it is meant to prove. */
public record DocumentMetadata(
        MultipartFile file,
        String docType,
        String issuingAuthority,
        String documentNumber,
        LocalDate expiresOn
) {
}
