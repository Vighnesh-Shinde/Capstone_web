package com.project.depression.dto;

import java.util.List;
import java.util.Map;

public record MlProcessResponse(
        String prediction,
        Double confidence_score,
        List<MlExplanationItem> explanation,
        Map<String, Double> modality_contributions,
        // Null on the mock pipeline, which has no real features to report.
        List<Double> text_features,
        List<Double> audio_features,
        List<Double> video_features,
        String video_features_error,
        String transcript_text,

        // The conversation in DAIC-WOZ format, ready to append to a training
        // set built from the corpus.
        String daic_transcript,
        String participant_transcript,

        // Who was judged to be whom, and the cosine similarity behind each
        // judgement. Persisted because this decided whose speech was scored,
        // and it must stay checkable once the audio is deleted.
        Map<String, Map<String, Double>> speaker_similarities,
        String participant_speaker,
        String counselor_speaker,
        List<String> companion_speakers
) {
}
