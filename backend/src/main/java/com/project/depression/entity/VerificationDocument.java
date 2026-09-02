package com.project.depression.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "verification_documents")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VerificationDocument {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "application_id", nullable = false)
    private CounselorApplication application;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "file_path", nullable = false)
    private String filePath;

    @Column(name = "content_type")
    private String contentType;

    @Enumerated(EnumType.STRING)
    @Column(name = "doc_type", nullable = false, length = 40)
    @Builder.Default
    private DocumentType docType = DocumentType.OTHER;

    @Column(name = "issuing_authority", length = 200)
    private String issuingAuthority;

    @Column(name = "document_number", length = 100)
    private String documentNumber;

    @Column(name = "issued_on")
    private LocalDate issuedOn;

    /**
     * When the document itself stops being valid. An expired licence
     * certificate is indistinguishable from a current one on screen, so the
     * date is captured rather than inferred from the file.
     */
    @Column(name = "expires_on")
    private LocalDate expiresOn;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "uploaded_at")
    private Instant uploadedAt;

    @PrePersist
    public void prePersist() {
        if (uploadedAt == null) {
            uploadedAt = Instant.now();
        }
    }

    public boolean isExpired() {
        return expiresOn != null && expiresOn.isBefore(LocalDate.now());
    }
}
