-- Which voice in the session audio each companion turned out to be.
--
-- Filled in after processing, from the labels the ML service returns. Without
-- it the report can say a companion was present but not which cluster they
-- were, so their row in the match-score table reads "Excluded" with nothing
-- saying what it was excluded as — which is precisely the question a counselor
-- checking an unexpected result would be asking.
ALTER TABLE session_companions ADD COLUMN diarized_label VARCHAR(50);
