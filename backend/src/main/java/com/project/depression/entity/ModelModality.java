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
 *
 * EARLY_FUSION is the alternative shape: ONE model trained on the concatenated
 * features of every modality, so there are no per-modality probabilities to
 * combine. When one is active it REPLACES the text/audio/fusion set for that
 * language — that language is scorable on its strength alone, and the other
 * stages stay stored and versioned but produce nothing.
 */
public enum ModelModality {
    TEXT,
    AUDIO,
    FUSION,
    VIDEO,
    EARLY_FUSION;

    /** Key used in the ML service's active_manifest.json. */
    public String manifestKey() {
        return name().toLowerCase();
    }
}
