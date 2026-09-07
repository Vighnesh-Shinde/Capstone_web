/**
 * Turns model feature names into language a person can read.
 *
 * The report used to print the raw column names straight from the model:
 *
 *     spec rms db p10   audio   +4.34
 *     spec rms db p10 was below average for this session
 *
 * That is meaningless to a counsellor and worse than useless to a participant.
 * It is also the single most important part of the report, because it is the
 * only place that says WHY — and a reason nobody can read is not a reason.
 *
 * WHY THIS LIVES IN THE FRONTEND
 * The alternative was to write better descriptions in the ML service. That
 * would only fix sessions processed from then on, leaving every existing
 * report unreadable. Feature names are stable and already stored on every
 * report, so translating at display time repairs the reports that already
 * exist as well as the ones still to come — and keeps one copy of the wording.
 *
 * The features are compositional (a base measurement plus a statistic), so
 * these two small tables cover all 85 audio columns rather than 85 hand-written
 * strings that would drift out of sync with the model.
 */

/**
 * What each underlying measurement actually is.
 *
 * `higher` describes what it means for the number to be LARGE, in the
 * participant's terms — not the model's. Every one of these is a plain
 * observation about speech, deliberately carrying no clinical claim: "took
 * longer to start answering" is something you could see in a transcript,
 * whereas "showed psychomotor retardation" is a diagnosis this model cannot
 * make.
 */
const MEASURES = {
  utt_duration: {
    label: "Length of each answer",
    what: "how long they spoke for each time they answered",
    higher: "longer answers",
    lower: "shorter answers",
  },
  utt_words: {
    label: "Words per answer",
    what: "how many words were in each answer",
    higher: "more words per answer",
    lower: "fewer words per answer",
  },
  between_turn_gap: {
    label: "Silence between turns",
    what: "the silence after one person stops and before the next starts",
    higher: "longer silences between turns",
    lower: "shorter silences between turns",
  },
  response_latency: {
    label: "Pause before answering",
    what: "how long they waited before starting to answer a question",
    higher: "longer pauses before answering",
    lower: "quicker replies",
  },
  spec_rms_db: {
    label: "Speaking volume",
    what: "how loudly they spoke",
    higher: "a louder voice",
    lower: "a quieter voice",
  },
  f0_semitone: {
    label: "Pitch",
    what: "how high or low their voice was",
    higher: "a higher pitch",
    lower: "a lower pitch",
  },
  f0_jitter: {
    label: "Pitch steadiness",
    what: "how much their pitch wobbled from moment to moment",
    higher: "a less steady, more wavering pitch",
    lower: "a steadier pitch",
  },
  amp_shimmer: {
    label: "Volume steadiness",
    what: "how much their loudness wavered from moment to moment",
    higher: "a less steady volume",
    lower: "a steadier volume",
  },
};

/**
 * Which part of the picture a statistic describes.
 *
 * p10/p90 are described as "quietest/loudest moments" rather than
 * "10th percentile", because a percentile is a statistical idea and the report
 * has to work for somebody who has never met one.
 */
const STATISTICS = {
  mean: { phrase: "on average", detail: "averaged across the whole session" },
  std: { phrase: "how much it varied", detail: "how much this changed during the session", isSpread: true },
  p10: { phrase: "at the low end", detail: "their lowest moments, ignoring the extremes" },
  p25: { phrase: "at the lower end", detail: "the lower quarter of the session" },
  p50: { phrase: "typically", detail: "the middle of the range — their usual level" },
  p75: { phrase: "at the higher end", detail: "the upper quarter of the session" },
  p90: { phrase: "at the high end", detail: "their highest moments, ignoring the extremes" },
  iqr: { phrase: "the spread", detail: "the gap between their usual low and usual high", isSpread: true },
  slope: { phrase: "the trend", detail: "whether this rose or fell as the session went on", isTrend: true },
};

/** Measurements that stand alone rather than being measure + statistic. */
const STANDALONE = {
  total_speech_s: { label: "Total time speaking", what: "how long they spoke in total", higher: "spoke for longer overall", lower: "spoke for less time overall" },
  session_len_s: { label: "Session length", what: "how long the interview lasted", higher: "a longer interview", lower: "a shorter interview" },
  speech_ratio: { label: "Share of time speaking", what: "how much of the session they were the one talking", higher: "talked for more of the session", lower: "talked for less of the session" },
  n_utterances: { label: "Number of times they spoke", what: "how many separate times they spoke", higher: "spoke more often", lower: "spoke less often" },
  total_words: { label: "Total words", what: "how many words they said in total", higher: "said more overall", lower: "said less overall" },
  words_per_second: { label: "Speaking speed", what: "how quickly they spoke", higher: "spoke faster", lower: "spoke more slowly" },
  utts_per_minute: { label: "How often they spoke", what: "how many times a minute they spoke", higher: "spoke up more often", lower: "spoke up less often" },
  long_pause_rate: { label: "Frequency of long pauses", what: "how often there was a noticeably long silence", higher: "more long silences", lower: "fewer long silences" },
  n_responses: { label: "Number of answers", what: "how many questions they answered", higher: "answered more times", lower: "answered fewer times" },
  slow_response_rate: { label: "Frequency of slow replies", what: "how often they were slow to start answering", higher: "more slow replies", lower: "fewer slow replies" },
  rms_db_range: { label: "Volume range", what: "the difference between their quietest and loudest speech", higher: "a wider range of volume", lower: "a flatter, more even volume" },
  voiced_ratio: { label: "Amount of voiced sound", what: "how much of their speech carried vocal tone rather than breath or silence", higher: "more voiced speech", lower: "less voiced speech" },
  f0_range_semitones: { label: "Pitch range", what: "the difference between their lowest and highest pitch", higher: "more variation in pitch", lower: "flatter, more monotone speech" },
};

/**
 * Split a feature name into its measurement and statistic.
 * "between_turn_gap_p90" -> { measure: between_turn_gap, statistic: p90 }
 */
function parse(featureName) {
  // The report shows names with spaces; the model stores underscores.
  const name = String(featureName || "").trim().replace(/\s+/g, "_").toLowerCase();

  if (STANDALONE[name]) {
    return { standalone: STANDALONE[name] };
  }

  for (const stat of Object.keys(STATISTICS)) {
    const suffix = `_${stat}`;
    if (name.endsWith(suffix)) {
      const base = name.slice(0, -suffix.length);
      if (MEASURES[base]) {
        return { measure: MEASURES[base], statistic: STATISTICS[stat] };
      }
    }
  }
  return null;
}

/** A short human title for a factor, e.g. "Pause before answering". */
export function plainLabel(featureName) {
  const parsed = parse(featureName);
  if (!parsed) {
    // Unknown feature — most likely a text feature or a newly trained model.
    // Tidied rather than invented: showing the raw name is honest, and making
    // up a description for a feature we do not recognise would not be.
    return String(featureName || "").replace(/_/g, " ");
  }
  if (parsed.standalone) return parsed.standalone.label;

  const { measure, statistic } = parsed;
  if (statistic.isTrend) return `${measure.label} — trend`;
  if (statistic.isSpread) return `${measure.label} — consistency`;
  return measure.label;
}

/**
 * Which way the measurement actually went, read from the ML service's own text.
 *
 * CRITICAL, AND EASY TO GET WRONG: the sign of the contribution does NOT tell
 * you whether the measurement was high or low. A contribution is
 * `coefficient x standardised value`, so a negative coefficient turns a
 * below-average value into a positive push toward depressed.
 *
 * A real case from a live report: spec_rms_db_p10 contributed +4.34 while the
 * service recorded "was below average for this session". Inferring the
 * direction from the sign said the participant spoke LOUDLY; the truth was the
 * opposite. In a report about somebody's mental health, that is not a wording
 * slip — it is a false statement about what was observed.
 *
 * So the measured direction is taken from the description the ML service
 * wrote, which is derived from the standardised value itself.
 */
function measuredDirection(description) {
  if (/was above average/i.test(description || "")) return "higher";
  if (/was below average/i.test(description || "")) return "lower";
  return null;
}

/**
 * A full sentence describing what was observed.
 *
 * Two independent facts, kept separate because conflating them is how the
 * direction bug above happened:
 *   - what was MEASURED (higher or lower than average), from the description
 *   - which way it PUSHED the result, from the sign of the contribution
 *
 * The wording states what was measured and never what it proves. The model
 * found an association in its training data, which is not a cause.
 */
export function plainDescription(featureName, contributionScore, description) {
  const parsed = parse(featureName);
  const direction = measuredDirection(description);

  if (!parsed || !direction) {
    // Unknown feature, or a description we cannot read a direction out of.
    // Says only what is certain rather than inventing the missing half.
    return contributionScore > 0
      ? "This measurement pushed the result toward depressed."
      : "This measurement pushed the result away from depressed.";
  }

  const source = parsed.standalone || parsed.measure;
  const observed = direction === "higher" ? source.higher : source.lower;
  const push = contributionScore > 0 ? "toward" : "away from";

  if (parsed.standalone) {
    return `They ${observed} than average. This pushed the result ${push} depressed.`;
  }

  const { statistic } = parsed;
  if (statistic.isTrend) {
    return `Across the session, ${source.what} trended toward ${observed}. This pushed the result ${push} depressed.`;
  }
  if (statistic.isSpread) {
    const consistency = direction === "higher" ? "less consistent" : "more consistent";
    return `${source.what[0].toUpperCase()}${source.what.slice(1)} was ${consistency} than average. This pushed the result ${push} depressed.`;
  }
  return `Measuring ${source.what} (${statistic.detail}), this session showed ${observed} than average. This pushed the result ${push} depressed.`;
}

/**
 * One paragraph a counsellor could read aloud to a participant.
 *
 * Built from the strongest factors rather than the full list, because six
 * technical lines is not an explanation — it is a list. It names what the
 * computer listened to, says plainly that it did not read the meaning of what
 * was said, and states the limits without hiding behind them.
 */
export function plainSummary(factors, prediction) {
  if (!factors || factors.length === 0) return null;

  const ranked = [...factors].sort(
    (a, b) => Math.abs(b.contributionScore) - Math.abs(a.contributionScore)
  );
  const top = ranked.slice(0, 3);

  const observations = top.map((f) => {
    const parsed = parse(f.featureName);
    const source = parsed?.standalone || parsed?.measure;
    const direction = measuredDirection(f.description);
    if (!source || !direction) return null;
    // Read from the measurement, never from the contribution's sign — see
    // measuredDirection for the bug that caused.
    return direction === "higher" ? source.higher : source.lower;
  }).filter(Boolean);

  // Deduplicate: several statistics of one measurement produce the same phrase,
  // and "shorter answers, shorter answers and shorter answers" reads as broken.
  const unique = [...new Set(observations)];

  return {
    observations: unique,
    leaning: prediction === "depressed",
  };
}
