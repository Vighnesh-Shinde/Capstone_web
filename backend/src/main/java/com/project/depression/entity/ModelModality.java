package com.project.depression.entity;

/**
 * The pipeline stages that have swappable weights.
 *
 * TEXT, AUDIO and FUSION are required for a language to be scored. VIDEO is
 * optional: it only enters a prediction when the active FUSION model takes
 * three inputs, [p_text, p_audio, p_video]. With a two-input fusion model an
 * active VIDEO version is stored and versioned but changes no prediction.
 *
 * The fusion model's own input width selects the path, not a flag, so the two
 * can never disagree. ModelVersionService refuses to activate a three-input
 * fusion model without an active VIDEO model, and refuses to remove VIDEO while
 * one depends on it.
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
}
