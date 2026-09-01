package com.project.depression.entity;

/**
 * The three stages of the prediction pipeline that have swappable weights.
 *
 * VIDEO is deliberately absent: the research project measured that adding the
 * video model made the fused result worse, so it is not in the production path
 * and there is nothing to version.
 */
public enum ModelModality {
    TEXT,
    AUDIO,
    FUSION;

    /** Key used in the ML service's active_manifest.json. */
    public String manifestKey() {
        return name().toLowerCase();
    }
}
