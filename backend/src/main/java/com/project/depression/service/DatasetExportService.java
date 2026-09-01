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
import java.time.Instant;
import java.util.List;
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
                    writeFeatureHeader(featuresCsv,
                            features.getTextFeatures().length, features.getAudioFeatures().length);
                    headerWritten = true;
                }
                writeFeatureRow(featuresCsv, session, judgment, features);

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

                exported++;
            }

            if (!headerWritten) {
                featuresCsv.write("# No exportable samples — see README.txt\n");
            }
            featuresCsv.flush();
            zip.closeEntry();

            writeEntry(zip, "metadata.csv", metadata.toString());
            writeEntry(zip, "README.txt", readme(
                    exported, approved.size(), skippedNoFeatures, skippedNoJudgment, skippedWithdrawn));
        }

        auditLogService.log(admin, "DATASET_EXPORTED", "DATASET", null,
                exported + " samples exported of " + approved.size() + " approved");
        log.info("Dataset export by {}: {} rows ({} approved, {} without features, "
                        + "{} without judgment, {} withdrawn)",
                admin.getEmail(), exported, approved.size(),
                skippedNoFeatures, skippedNoJudgment, skippedWithdrawn);
    }

    private void writeFeatureHeader(Writer writer, int textWidth, int audioWidth) throws IOException {
        StringBuilder header = new StringBuilder("session_id,label");
        for (int i = 0; i < textWidth; i++) {
            header.append(",text_").append(i);
        }
        for (int i = 0; i < audioWidth; i++) {
            header.append(",audio_").append(i);
        }
        writer.write(header.append('\n').toString());
    }

    private void writeFeatureRow(
            Writer writer, Session session, CounselorJudgment judgment, SessionFeatures features
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
        writer.write(row.append('\n').toString());
    }

    private void writeEntry(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private String readme(int exported, int approved, int noFeatures, int noJudgment, int withdrawn) {
        return """
                Depression screening — research dataset export
                ==============================================
                Exported: %s

                CONTENTS
                --------
                features.csv   One row per session.
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
                """.formatted(Instant.now(), exported, approved, noFeatures, noJudgment, withdrawn);
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
