package com.project.depression.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Shared multipart-file-to-disk storage, used by both session video uploads
 * (uploads/{participantId}/{sessionId}/video.ext — grouped by participant,
 * DAIC-WOZ-style, so repeat sessions with the same person live together) and
 * counselor application document uploads (uploads/applications/{applicationId}/{name}.ext).
 *
 * Every stored filename's extension comes from a fixed allowlist below, never
 * directly from the client-supplied original filename — closes off a path-
 * traversal vector (a crafted "name.mp4/../../evil.sh") as well as arbitrary
 * file-type uploads.
 */
@Service
public class FileStorageService {

    private static final Set<String> VIDEO_EXTENSIONS = Set.of(".mp4", ".webm", ".mov", ".avi");
    private static final Set<String> VIDEO_CONTENT_TYPES = Set.of(
            "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo");

    // Voice enrollment recordings. MediaRecorder in the browser produces webm
    // or ogg depending on the engine, so both have to be accepted; wav and m4a
    // are here for a counselor uploading a file recorded elsewhere.
    private static final Set<String> AUDIO_EXTENSIONS = Set.of(".webm", ".ogg", ".wav", ".mp3", ".m4a", ".mp4");
    private static final Set<String> AUDIO_CONTENT_TYPES = Set.of(
            "audio/webm", "video/webm", "audio/ogg", "audio/wav", "audio/x-wav",
            "audio/wave", "audio/mpeg", "audio/mp4", "audio/m4a", "video/mp4");

    private static final Set<String> DOCUMENT_EXTENSIONS = Set.of(".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx");
    private static final Set<String> DOCUMENT_CONTENT_TYPES = Set.of(
            "application/pdf", "image/jpeg", "image/png",
            "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    @Value("${app.uploads.dir}")
    private String uploadsDir;

    @Value("${app.uploads.video-max-bytes}")
    private long videoMaxBytes;

    @Value("${app.uploads.document-max-bytes}")
    private long documentMaxBytes;

    // A minute of browser-encoded speech is well under a megabyte; 25MB is
    // generous headroom for an uncompressed wav recorded elsewhere.
    @Value("${app.uploads.audio-max-bytes:26214400}")
    private long audioMaxBytes;

    public String storeSessionVideo(UUID participantId, UUID sessionId, MultipartFile video) {
        String extension = validate(video, VIDEO_EXTENSIONS, VIDEO_CONTENT_TYPES, videoMaxBytes, "video");
        Path dir = Path.of(uploadsDir, participantId.toString(), sessionId.toString());
        return copyToDisk(dir, video, "video" + extension);
    }

    /**
     * Hold a voice enrollment recording just long enough to extract a vector.
     *
     * Written under a scratch directory rather than beside session data,
     * because it is not meant to survive: the caller deletes it as soon as the
     * embedding is out. See VoiceprintService.
     */
    public String storeVoiceEnrollment(MultipartFile audio) {
        String extension = validate(audio, AUDIO_EXTENSIONS, AUDIO_CONTENT_TYPES, audioMaxBytes, "audio");
        Path dir = Path.of(uploadsDir, "voice-enrollment");
        return copyToDisk(dir, audio, "enroll-" + UUID.randomUUID() + extension);
    }

    /**
     * Best-effort delete of a file this service wrote.
     *
     * Returns whether it is gone rather than throwing. Callers use it to clean
     * up enrollment audio, and failing to delete a temporary file must not
     * fail the enrollment the counselor just completed — but it does need to
     * be logged loudly, which is the caller's job.
     */
    public boolean deleteFile(String path) {
        if (path == null || path.isBlank()) {
            return true;
        }
        try {
            return Files.deleteIfExists(Path.of(path));
        } catch (IOException e) {
            return false;
        }
    }

    public String storeApplicationDocument(UUID applicationId, MultipartFile document) {
        String extension = validate(document, DOCUMENT_EXTENSIONS, DOCUMENT_CONTENT_TYPES, documentMaxBytes, "document");
        Path dir = Path.of(uploadsDir, "applications", applicationId.toString());
        return copyToDisk(dir, document, "doc-" + UUID.randomUUID() + extension);
    }

    private String validate(MultipartFile file, Set<String> allowedExtensions, Set<String> allowedContentTypes, long maxBytes, String label) {
        if (file == null || file.isEmpty()) {
            throw new InvalidFileException("No " + label + " file was provided");
        }
        if (file.getSize() > maxBytes) {
            throw new InvalidFileException(
                    "The " + label + " file is too large (max " + (maxBytes / (1024 * 1024)) + "MB)");
        }

        String originalFilename = file.getOriginalFilename();
        String extension = (originalFilename != null && originalFilename.contains("."))
                ? originalFilename.substring(originalFilename.lastIndexOf('.')).toLowerCase(Locale.ROOT)
                : "";
        if (!allowedExtensions.contains(extension)) {
            throw new InvalidFileException(
                    "Unsupported " + label + " file type. Allowed: " + String.join(", ", allowedExtensions));
        }

        String contentType = file.getContentType();
        // Compared on the MIME type alone, with any ";codecs=..." or
        // ";charset=..." parameter stripped. A browser's MediaRecorder reports
        // back a codecs-qualified type ("audio/webm;codecs=opus") even when
        // asked for the bare one, and that qualifier is genuinely part of a
        // valid audio/webm — matching against the allowlist verbatim rejected
        // every browser-recorded clip while accepting the exact same format
        // uploaded from a file picker, which reports the bare type.
        String mimeType = contentType == null ? null : contentType.split(";", 2)[0].trim();
        boolean contentTypeOk = mimeType == null
                || mimeType.isBlank()
                || "application/octet-stream".equalsIgnoreCase(mimeType)
                || allowedContentTypes.contains(mimeType.toLowerCase(Locale.ROOT));
        if (!contentTypeOk) {
            throw new InvalidFileException("Unsupported " + label + " content type: " + contentType);
        }

        return extension;
    }

    private String copyToDisk(Path dir, MultipartFile file, String filename) {
        try {
            Files.createDirectories(dir);
            Path destination = dir.resolve(filename);

            try (InputStream in = file.getInputStream()) {
                Files.copy(in, destination, StandardCopyOption.REPLACE_EXISTING);
            }

            return destination.toString();
        } catch (IOException e) {
            throw new RuntimeException("Failed to store uploaded file", e);
        }
    }
}
