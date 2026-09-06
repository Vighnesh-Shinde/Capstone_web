package com.project.depression.entity;

/**
 * The pipeline stages that have swappable weights.
 *
 * TEXT, AUDIO and FUSION are the production path: a prediction is text and
 * audio probabilities combined by fusion.
 *
 * VIDEO is versionable but NOT in that path. The research project measured
 * that adding video made the fused result worse, so the pipeline reports it as
 * 0% and the report shows "Not used". It is uploadable anyway so that an
 * operator retraining on this platform's own data can store and version a
 * video model while answering whether that finding still holds here — a
 * different population and a different feature set from the original result.
 *
 * Activating a VIDEO version therefore changes no prediction today. Making it
 * count would require retraining FUSION to take three inputs, which is a
 * deliberate decision to be made on evidence, not a side effect of an upload.
 */
public enum ModelModality {
    TEXT,
    AUDIO,
    FUSION,
    VIDEO;

    /** Key used in the ML service's active_manifest.json. */
    public String manifestKey() {
        return name().toLowerCase();
    }

    /** Whether activating this stage affects predictions today. */
    public boolean inPredictionPath() {
        return this != VIDEO;
    }
}
