package com.project.depression.service;

import com.project.depression.entity.*;
import com.project.depression.repository.CounselorJudgmentRepository;
import com.project.depression.repository.DatasetSampleRepository;
import com.project.depression.repository.ReportRepository;
import com.project.depression.repository.SessionFeaturesRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Exports the approved research dataset as a ZIP that can be fed straight into
 * a training script.
 *
 * What makes a session exportable is deliberately narrow, and all three
 * conditions must hold:
 *
 *   1. The participant consented to research reuse, and has not withdrawn it.
 *   2. An administrator reviewed and approved the sample.
 *   3. A counselor recorded their own assessment — that judgment is the
 *      ground-truth label. A session the model scored but no human ever
 *      assessed has nothing to learn from.
 *
 * The label is the counselor's assessment, never the model's own prediction.
 * Training on the model's output would just teach a new model to imitate the
 * old one's mistakes.
 */
@Service
public class DatasetExportService {

    private static final Logger log = LoggerFactory.getLogger(DatasetExportService.class);

    private final DatasetSampleRepository datasetSampleRepository;
    private final ReportRepository reportRepository;
    private final CounselorJudgmentRepository judgmentRepository;
    private final SessionFeaturesRepository sessionFeaturesRepository;
    private final AuditLogService auditLogService;

    public DatasetExportService(
            DatasetSampleRepository datasetSampleRepository,
            ReportRepository reportRepository,
            CounselorJudgmentRepository judgmentRepository,
            SessionFeaturesRepository sessionFeaturesRepository,
            AuditLogService auditLogService
    ) {
        this.datasetSampleRepository = datasetSampleRepository;
        this.reportRepository = reportRepository;
        this.judgmentRepository = judgmentRepository;
        this.sessionFeaturesRepository = sessionFeaturesRepository;
        this.auditLogService = auditLogService;
    }

    @Transactional(readOnly = true)
    public void writeExport(OutputStream out, User admin) throws IOException {
        List<DatasetSample> approved = datasetSampleRepository
                .findByEligibilityStatus(DatasetEligibilityStatus.APPROVED);

        int exported = 0;
        int skippedNoFeatures = 0;
        int skippedNoJudgment = 0;
        int skippedWithdrawn = 0;

        try (ZipOutputStream zip = new ZipOutputStream(out, StandardCharsets.UTF_8)) {
            // A ZipOutputStream is one stream: each entry must be written start
            // to finish before the next is opened. features.csv is streamed row
            // by row (it is by far the largest), while metadata is accumulated
            // in memory and written afterwards.
            // participantRef -> transcript path on disk, written after
            // features.csv is closed.
            Map<String, String> transcriptsToExport = new LinkedHashMap<>();
            Map<String, String> participantTranscriptsToExport = new LinkedHashMap<>();
            int videoWidth = 0;

            zip.putNextEntry(new ZipEntry("features.csv"));
            Writer featuresCsv = new OutputStreamWriter(zip, StandardCharsets.UTF_8);

            StringBuilder metadata = new StringBuilder(
                    "session_id,participant_ref,label,label_source,model_prediction,"
                            + "model_confidence,agreement,counselor_observation,session_date\n");

            boolean headerWritten = false;
            for (DatasetSample sample : approved) {
                Session session = sample.getSession();

                if (session.getConsentWithdrawnAt() != null) {
                    skippedWithdrawn++;
                    continue;
                }

                Optional<Report> reportOpt = reportRepository.findBySessionId(session.getId());
                if (reportOpt.isEmpty()) {
                    skippedNoJudgment++;
                    continue;
                }
                Report report = reportOpt.get();

                Optional<CounselorJudgment> judgmentOpt = judgmentRepository.findByReportId(report.getId());
                if (judgmentOpt.isEmpty()) {
                    skippedNoJudgment++;
                    continue;
                }
                CounselorJudgment judgment = judgmentOpt.get();

                Optional<SessionFeatures> featuresOpt =
                        sessionFeaturesRepository.findBySessionId(session.getId());
                if (featuresOpt.isEmpty()
                        || featuresOpt.get().getTextFeatures() == null
                        || featuresOpt.get().getAudioFeatures() == null) {
                    // Sessions processed before feature storage existed, or by
                    // the mock pipeline. Counted and reported rather than
                    // silently dropped.
                    skippedNoFeatures++;
                    continue;
                }
                SessionFeatures features = featuresOpt.get();

                if (!headerWritten) {
                    videoWidth = features.getVideoFeatures() == null
                            ? 0 : features.getVideoFeatures().length;
                    writeFeatureHeader(featuresCsv,
                            features.getTextFeatures().length, features.getAudioFeatures().length,
                            videoWidth);
                    headerWritten = true;
                }
                writeFeatureRow(featuresCsv, session, judgment, features, videoWidth);

                metadata.append(csv(session.getId().toString())).append(',')
                        .append(csv(session.getParticipantRef())).append(',')
                        .append(csv(judgment.getAssessment().name())).append(',')
                        .append("counselor_judgment,")
                        .append(csv(report.getPrediction().name())).append(',')
                        .append(report.getConfidenceScore()).append(',')
                        .append(judgment.getAssessment() == report.getPrediction() ? "AGREE" : "DISAGREE").append(',')
                        .append(csv(judgment.getObservation())).append(',')
                        .append(csv(String.valueOf(session.getCreatedAt())))
                        .append('\n');

                // Collected, not written yet: features.csv is a single open ZIP
                // entry being streamed, and opening a second entry before it is
                // closed corrupts the archive.
                if (session.getDaicTranscriptPath() != null) {
                    transcriptsToExport.put(session.getParticipantRef(), session.getDaicTranscriptPath());
                }
                if (session.getParticipantTranscriptPath() != null) {
                    participantTranscriptsToExport.put(
                            session.getParticipantRef(), session.getParticipantTranscriptPath());
                }

                exported++;
            }

            if (!headerWritten) {
                featuresCsv.write("# No exportable samples — see README.txt\n");
            }
            featuresCsv.flush();
            zip.closeEntry();

            // One TRANSCRIPT.csv per session, in the corpus's own format and
            // naming, so a script that reads DAIC-WOZ reads these unmodified.
            int transcriptsWritten = 0;
            for (Map.Entry<String, String> entry : transcriptsToExport.entrySet()) {
                try {
                    String content = Files.readString(Path.of(entry.getValue()), StandardCharsets.UTF_8);
                    // Sanitised because it becomes a path inside the archive: a
                    // participant reference containing "../" would otherwise
                    // write outside the extraction directory on unzip.
                    String safeRef = entry.getKey().replaceAll("[^A-Za-z0-9._-]", "_");
                    writeEntry(zip, "transcripts/" + safeRef + "_TRANSCRIPT.csv", content);
                    transcriptsWritten++;
                } catch (IOException e) {
                    // A missing transcript must not fail the whole export; the
                    // features are the dataset, the transcripts are context.
                    log.warn("Dataset export: could not read transcript {}", entry.getValue(), e);
                }
            }

            for (Map.Entry<String, String> entry : participantTranscriptsToExport.entrySet()) {
                try {
                    String content = Files.readString(Path.of(entry.getValue()), StandardCharsets.UTF_8);
                    String safeRef = entry.getKey().replaceAll("[^A-Za-z0-9._-]", "_");
                    writeEntry(zip, "transcripts_participant_only/" + safeRef
                            + "_PARTICIPANT_TRANSCRIPT.csv", content);
                } catch (IOException e) {
                    log.warn("Dataset export: could not read participant transcript {}",
                            entry.getValue(), e);
                }
            }

            writeEntry(zip, "metadata.csv", metadata.toString());
            writeEntry(zip, "README.txt", readme(
                    exported, approved.size(), skippedNoFeatures, skippedNoJudgment,
                    skippedWithdrawn, transcriptsWritten));
        }

        auditLogService.log(admin, "DATASET_EXPORTED", "DATASET", null,
                exported + " samples exported of " + approved.size() + " approved");
        log.info("Dataset export by {}: {} rows ({} approved, {} without features, "
                        + "{} without judgment, {} withdrawn)",
                admin.getEmail(), exported, approved.size(),
                skippedNoFeatures, skippedNoJudgment, skippedWithdrawn);
    }

    private void writeFeatureHeader(Writer writer, int textWidth, int audioWidth, int videoWidth)
            throws IOException {
        StringBuilder header = new StringBuilder("session_id,label");
        for (int i = 0; i < textWidth; i++) {
            header.append(",text_").append(i);
        }
        for (int i = 0; i < audioWidth; i++) {
            header.append(",audio_").append(i);
        }
        // Video columns are emitted only when the FIRST exported row had them,
        // fixing the width for the whole file. A CSV cannot have a ragged
        // header, and sessions differ: a participant who sat off camera has no
        // video features while the next one does. Rows without them are padded
        // with empty cells, which every training loader reads as missing.
        for (int i = 0; i < videoWidth; i++) {
            header.append(",video_").append(i);
        }
        writer.write(header.append('\n').toString());
    }

    private void writeFeatureRow(
            Writer writer, Session session, CounselorJudgment judgment, SessionFeatures features,
            int videoWidth
    ) throws IOException {
        StringBuilder row = new StringBuilder(session.getId().toString())
                .append(',')
                // 1 = depressed, matching the PHQ8_Binary convention the models
                // were originally trained against.
                .append(judgment.getAssessment() == Prediction.depressed ? 1 : 0);

        for (double v : features.getTextFeatures()) {
            row.append(',').append(v);
        }
        for (double v : features.getAudioFeatures()) {
            row.append(',').append(v);
        }
        for (int i = 0; i < videoWidth; i++) {
            row.append(',');
            double[] video = features.getVideoFeatures();
            if (video != null && i < video.length) {
                row.append(video[i]);
            }
            // else: left empty, which is how a loader learns this session had
            // no measurable face rather than a face measuring exactly zero.
        }
        writer.write(row.append('\n').toString());
    }

    private void writeEntry(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private String readme(int exported, int approved, int noFeatures, int noJudgment,
                          int withdrawn, int transcripts) {
        return """
                Depression screening — research dataset export
                ==============================================
                Exported: %s

                CONTENTS
                --------
                transcripts_participant_only/
                               The same conversations filtered to the participant's turns
                                 only — exactly what the text model consumes. Provided as
                                 its own file so a training script does not have to
                                 re-implement the speaker filter, and risk implementing it
                                 differently from the pipeline that produced the features.

                transcripts/   One <participant>_TRANSCRIPT.csv per session, in the
                                 DAIC-WOZ corpus format: tab-separated, CRLF, with the
                                 columns start_time, stop_time, speaker, value, and text
                                 lowercased with punctuation stripped. A script that
                                 reads the original corpus reads these unmodified.

                                 One difference: the interviewer is labelled "Counselor",
                                 not "Ellie". Ellie is the virtual agent used to collect
                                 DAIC-WOZ and was never in these rooms. Training code
                                 that keeps only speaker == "Participant" — which is how
                                 the text model is defined — is unaffected. Anyone else
                                 present is "Companion 1", "Companion 2", and so on;
                                 their speech is recorded but was excluded from analysis.

                features.csv   One row per session. Columns: session_id, label, then
                                 text_0.., audio_0.., and video_0.. where available.
                                 Video columns are blank for sessions where no face could
                                 be measured (participant off camera, or a dark room) —
                                 blank rather than zero, so a loader can tell "not
                                 measured" from "measured as zero".
                                 session_id  — matches metadata.csv
                                 label       — 1 = depressed, 0 = not depressed
                                 text_0..N   — text model input vector, in model column order
                                 audio_0..N  — audio model input vector, in model column order
                metadata.csv   Human-readable context for each row, including what the
                               model predicted and whether the counselor agreed.

                THE LABEL
                ---------
                The label is the COUNSELOR'S OWN ASSESSMENT, not the model's prediction.
                Training on the model's output would only teach a new model to reproduce
                the current one's mistakes. The rows where the counselor DISAGREED with
                the model (see metadata.csv) are the most informative in this file.

                WHAT IS INCLUDED
                ----------------
                A session appears here only if all of the following are true:
                  - the participant consented to research reuse, and has not withdrawn it
                  - an administrator reviewed and approved the sample
                  - a counselor recorded their own assessment

                THIS EXPORT
                -----------
                  %d rows exported, from %d approved samples.
                  %d skipped — no stored feature vectors (processed before feature storage
                     existed, or by the mock pipeline; these cannot be recovered without
                     the original recording).
                  %d skipped — no counselor assessment recorded, so no ground-truth label.
                  %d skipped — consent withdrawn after approval.
                  %d DAIC-format transcripts included (sessions processed before speaker
                    identification existed have none).

                FEATURE ORDER
                -------------
                Column order matches the active models' expected input exactly. It is NOT
                re-derived here — the vectors are stored as the models consumed them. If
                you retrain with a different feature extractor, these columns will not
                correspond to your new features.

                HANDLING
                --------
                These are derived measurements from real clinical interviews with real
                people, exported under a specific consent basis. They are not anonymous —
                a participant reference links back to an identifiable person in the
                originating service. Treat this file as confidential health data: do not
                redistribute it, and delete it when the work it was exported for is done.
                """.formatted(Instant.now(), exported, approved, noFeatures, noJudgment,
                        withdrawn, transcripts);
    }

    /** Minimal RFC4180 quoting — observations are free text and will contain commas. */
    private static String csv(String value) {
        if (value == null) {
            return "";
        }
        String escaped = value.replace("\"", "\"\"");
        return "\"" + escaped.replace("\n", " ").replace("\r", " ") + "\"";
    }
}
