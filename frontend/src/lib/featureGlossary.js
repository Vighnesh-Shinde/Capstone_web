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

  // Facial action units (OpenFace). Each is one muscle movement, described as
  // what you would see — never as the emotion it is often associated with,
  // because a lowered brow can be concentration as easily as distress.
  au01_r: { label: "Inner eyebrow raise", what: "how much they raised the inner ends of their eyebrows", higher: "more raising of the inner eyebrows", lower: "less raising of the inner eyebrows" },
  au02_r: { label: "Outer eyebrow raise", what: "how much they raised the outer ends of their eyebrows", higher: "more raising of the outer eyebrows", lower: "less raising of the outer eyebrows" },
  au04_r: { label: "Brow lowering (frowning)", what: "how much they drew their eyebrows down and together", higher: "more frowning", lower: "less frowning" },
  au05_r: { label: "Eye widening", what: "how much they raised their upper eyelids", higher: "wider-open eyes", lower: "less widening of the eyes" },
  au06_r: { label: "Cheek raise", what: "how much their cheeks lifted, as in a full smile", higher: "more cheek raising", lower: "less cheek raising" },
  au09_r: { label: "Nose wrinkle", what: "how much they wrinkled their nose", higher: "more nose wrinkling", lower: "less nose wrinkling" },
  au10_r: { label: "Upper lip raise", what: "how much they raised their upper lip", higher: "more upper-lip raising", lower: "less upper-lip raising" },
  au12_r: { label: "Smiling", what: "how much they pulled the corners of their mouth up", higher: "more smiling", lower: "less smiling" },
  au14_r: { label: "Mouth-corner tightening", what: "how much they tightened the corners of their mouth", higher: "more mouth-corner tightening", lower: "less mouth-corner tightening" },
  au15_r: { label: "Mouth corners turned down", what: "how much the corners of their mouth turned down", higher: "mouth corners turned down more", lower: "mouth corners turned down less" },
  au17_r: { label: "Chin raise", what: "how much they pushed their chin and lower lip upward", higher: "more chin raising", lower: "less chin raising" },
  au20_r: { label: "Lip stretch", what: "how much they stretched their lips sideways", higher: "more lip stretching", lower: "less lip stretching" },
  au25_r: { label: "Lips parting", what: "how far their lips parted", higher: "lips parted more", lower: "lips parted less" },
  au26_r: { label: "Jaw drop", what: "how far their jaw dropped open", higher: "more jaw opening", lower: "less jaw opening" },
  au_total: { label: "Overall facial movement", what: "how active their facial muscles were overall", higher: "a more expressive face", lower: "a stiller, less expressive face" },
  au04_c: { label: "How often they frowned", what: "how often a frown was present", higher: "more frequent frowning", lower: "less frequent frowning" },
  au12_c: { label: "How often they smiled", what: "how often a smile was present", higher: "more frequent smiling", lower: "less frequent smiling" },
  au15_c: { label: "How often mouth corners turned down", what: "how often the corners of their mouth were turned down", higher: "mouth corners turned down more often", lower: "mouth corners turned down less often" },
  au23_c: { label: "How often lips tightened", what: "how often they pressed their lips tight", higher: "more frequent lip tightening", lower: "less frequent lip tightening" },
  au28_c: { label: "How often lips were drawn in", what: "how often they sucked their lips inward", higher: "lips drawn in more often", lower: "lips drawn in less often" },
  au45_c: { label: "Blinking", what: "how often they blinked", higher: "more frequent blinking", lower: "less frequent blinking" },

  // Gaze (OpenFace). Axes follow the camera: x is across the picture, y is
  // up-down with larger meaning lower, z is toward or away from the lens.
  gz_x_0: { label: "Eye direction, side to side", what: "where their eyes pointed across the picture", higher: "eyes turned further toward the right of the picture", lower: "eyes turned further toward the left of the picture" },
  gz_x_1: { label: "Eye direction, side to side", what: "where their eyes pointed across the picture", higher: "eyes turned further toward the right of the picture", lower: "eyes turned further toward the left of the picture" },
  gz_y_0: { label: "Eye direction, up and down", what: "how far up or down their eyes pointed", higher: "eyes pointed further down", lower: "eyes pointed further up" },
  gz_y_1: { label: "Eye direction, up and down", what: "how far up or down their eyes pointed", higher: "eyes pointed further down", lower: "eyes pointed further up" },
  gz_z_0: { label: "Looking at the camera", what: "how directly their eyes pointed at the camera", higher: "eyes pointed less directly at the camera", lower: "eyes pointed more directly at the camera" },
  gz_z_1: { label: "Looking at the camera", what: "how directly their eyes pointed at the camera", higher: "eyes pointed less directly at the camera", lower: "eyes pointed more directly at the camera" },
  gz_x_h0: { label: "Eyes relative to head, side to side", what: "where their eyes pointed compared with where their head faced", higher: "eyes turned further to one side of where their head faced", lower: "eyes turned further to the other side of where their head faced" },
  gz_x_h1: { label: "Eyes relative to head, side to side", what: "where their eyes pointed compared with where their head faced", higher: "eyes turned further to one side of where their head faced", lower: "eyes turned further to the other side of where their head faced" },
  gz_y_h0: { label: "Eyes relative to head, up and down", what: "how far up or down their eyes pointed compared with their head", higher: "eyes lowered more relative to their head", lower: "eyes raised more relative to their head" },
  gz_y_h1: { label: "Eyes relative to head, up and down", what: "how far up or down their eyes pointed compared with their head", higher: "eyes lowered more relative to their head", lower: "eyes raised more relative to their head" },
  gz_z_h0: { label: "Eyes relative to head, depth", what: "how far their eyes turned away from straight ahead of their head", higher: "eyes turned further from straight ahead", lower: "eyes closer to straight ahead" },
  gz_z_h1: { label: "Eyes relative to head, depth", what: "how far their eyes turned away from straight ahead of their head", higher: "eyes turned further from straight ahead", lower: "eyes closer to straight ahead" },
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
  max: { phrase: "at its peak", detail: "the most it reached at any point" },
  // Video statistics: how much a measurement changed from one video frame to
  // the next, i.e. movement rather than position.
  d_mean: { phrase: "how much it moved", detail: "how much it changed from moment to moment", isMovement: true },
  d_std: { phrase: "how unevenly it moved", detail: "how uneven its moment-to-moment changes were", isMovement: true },
  rate: { phrase: "how often", detail: "the share of the session it was present" },
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

  // Timing measured from the participant's own turns only (DAIC-WOZ models).
  session_len_s_pt: { label: "Time from first to last answer", what: "how long it was from their first answer to their last", higher: "spoke across a longer stretch of time", lower: "spoke across a shorter stretch of time" },
  speech_ratio_pt: { label: "Share of their time spent speaking", what: "how much of that stretch they spent actually speaking", higher: "spent more of that time speaking", lower: "spent less of that time speaking" },
  utts_per_minute_pt: { label: "How often they spoke", what: "how many times a minute they spoke", higher: "spoke up more often", lower: "spoke up less often" },

  // Word habits (text model). Counts of kinds of words, never a judgement of
  // what the words were about.
  lex_n_words: { label: "Total words said", what: "how many words they said", higher: "said more words", lower: "said fewer words" },
  lex_n_utts: { label: "Number of answers", what: "how many separate answers they gave", higher: "gave more separate answers", lower: "gave fewer separate answers" },
  lex_words_per_utt: { label: "Words per answer", what: "how many words each answer had", higher: "used more words per answer", lower: "used fewer words per answer" },
  lex_words_per_utt_std: { label: "Variation in answer length", what: "how much the length of their answers varied", higher: "varied their answer length more", lower: "kept their answers a more similar length" },
  lex_median_utt_len: { label: "Typical answer length", what: "the length of a typical answer", higher: "gave longer typical answers", lower: "gave shorter typical answers" },
  lex_type_token_ratio: { label: "Variety of words", what: "how many different words they used", higher: "used a wider variety of words", lower: "repeated the same words more" },
  lex_root_ttr: { label: "Vocabulary richness", what: "how varied their vocabulary was, allowing for how much they said", higher: "used a richer vocabulary", lower: "used a narrower vocabulary" },
  lex_mean_word_len: { label: "Word length", what: "how long their words were", higher: "used longer words", lower: "used shorter words" },
  lex_first_singular: { label: "Saying \"I\", \"me\", \"my\"", what: "how often they said \"I\", \"me\" or \"my\"", higher: "said \"I\", \"me\" and \"my\" more often", lower: "said \"I\", \"me\" and \"my\" less often" },
  lex_first_plural: { label: "Saying \"we\", \"us\", \"our\"", what: "how often they said \"we\", \"us\" or \"our\"", higher: "said \"we\" and \"us\" more often", lower: "said \"we\" and \"us\" less often" },
  lex_second_person: { label: "Saying \"you\"", what: "how often they said \"you\"", higher: "said \"you\" more often", lower: "said \"you\" less often" },
  lex_third_person: { label: "Talking about other people", what: "how often they said \"he\", \"she\" or \"they\"", higher: "mentioned other people more often", lower: "mentioned other people less often" },
  lex_absolutist: { label: "Absolute words", what: "how often they used words like \"always\", \"never\" and \"nothing\"", higher: "used absolute words like \"always\" and \"never\" more often", lower: "used absolute words like \"always\" and \"never\" less often" },
  lex_negative: { label: "Negative words", what: "how often they used words like \"sad\", \"tired\" or \"stress\"", higher: "used negative words more often", lower: "used negative words less often" },
  lex_positive: { label: "Positive words", what: "how often they used words like \"happy\", \"good\" or \"friends\"", higher: "used positive words more often", lower: "used positive words less often" },
  lex_negation: { label: "Negations", what: "how often they used words like \"not\", \"no\" and \"don't\"", higher: "used \"not\" and \"no\" more often", lower: "used \"not\" and \"no\" less often" },
  lex_hedge: { label: "Hedging words", what: "how often they used words like \"maybe\", \"I guess\" and \"sort of\"", higher: "hedged more (\"maybe\", \"I guess\")", lower: "hedged less (\"maybe\", \"I guess\")" },
  lex_past_tense: { label: "Talking about the past", what: "how often they used past-tense words like \"was\" and \"used to\"", higher: "talked about the past more", lower: "talked about the past less" },
  lex_sleep_fatigue: { label: "Sleep and tiredness words", what: "how often they mentioned sleep, rest or tiredness", higher: "mentioned sleep and tiredness more often", lower: "mentioned sleep and tiredness less often" },
  lex_self_focus_ratio: { label: "Talking about themselves", what: "how often they talked about themselves compared with other people", higher: "talked about themselves more, compared with others", lower: "talked about others more, compared with themselves" },
  lex_neg_pos_ratio: { label: "Negative compared with positive words", what: "how many negative words they used for each positive one", higher: "used more negative words for every positive one", lower: "used fewer negative words for every positive one" },
  lex_sentiment_balance: { label: "Overall tone of words", what: "the balance of positive against negative words", higher: "used a more positive mix of words", lower: "used a more negative mix of words" },
  lex_short_answer_rate: { label: "Very short answers", what: "how often they answered in three words or fewer", higher: "gave very short answers more often", lower: "gave very short answers less often" },
  lex_long_answer_rate: { label: "Long answers", what: "how often they answered in 30 words or more", higher: "gave long answers more often", lower: "gave long answers less often" },

  // Face tracking coverage (OpenFace).
  au_frac_tracked: { label: "Face visible to the camera", what: "how much of the time their face could be tracked", higher: "kept their face in view more of the time", lower: "kept their face in view less of the time" },
  gz_frac_tracked: { label: "Eyes visible to the camera", what: "how much of the time their eyes could be tracked", higher: "kept their eyes in view more of the time", lower: "kept their eyes in view less of the time" },
};

/**
 * The text model's sentence-meaning columns, reported as ONE item.
 *
 * 3,072 embedding coordinates mean nothing individually, so the ML service
 * sums their contributions into "sentence meaning". What it measures is a
 * resemblance — closer in meaning to one group of training interviews than the
 * other — and it is worded as exactly that, never as "they sounded depressed".
 */
const SENTENCE_MEANING = "sentence_meaning";

function isSentenceMeaning(featureName) {
  return String(featureName || "").trim().replace(/\s+/g, "_").toLowerCase() === SENTENCE_MEANING;
}

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
  if (isSentenceMeaning(featureName)) return "What was said, overall";
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
  if (statistic.isMovement) return `${measure.label} — movement`;
  return measure.label;
}

/** Which group of training interviews the sentence meaning resembled, from the sign. */
function meaningCloserTo(contributionScore) {
  return contributionScore > 0
    ? "what depressed participants said"
    : "what participants who were not depressed said";
}

/**
 * The short phrase for one factor in the "what it noticed" list.
 *
 * Spread and movement statistics describe how something VARIED, not its level:
 * a larger spread in answer length is "less consistent answer length", not
 * "longer answers". Reading the level phrase for them would state the wrong
 * observation.
 */
function observation(parsed, direction) {
  if (parsed.standalone) return direction === "higher" ? parsed.standalone.higher : parsed.standalone.lower;
  const { measure, statistic } = parsed;
  const label = measure.label.toLowerCase();
  if (statistic.isTrend) return null;
  if (statistic.isSpread) return `${direction === "higher" ? "less" : "more"} consistent ${label}`;
  if (statistic.isMovement) return `${direction === "higher" ? "more" : "less"} moment-to-moment change in ${label}`;
  return direction === "higher" ? measure.higher : measure.lower;
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
  if (isSentenceMeaning(featureName)) {
    const push = contributionScore > 0 ? "toward" : "away from";
    return `Taken as a whole, what they said was closer in meaning to ${meaningCloserTo(contributionScore)} in the interviews the system learned from. This pushed the result ${push} depressed.`;
  }
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
  if (statistic.isMovement) {
    const amount = direction === "higher" ? "more" : "less";
    return `Looking at ${source.what}, it changed ${amount} from moment to moment than average. This pushed the result ${push} depressed.`;
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
    if (isSentenceMeaning(f.featureName)) {
      return `answers whose overall meaning was closer to ${meaningCloserTo(f.contributionScore)}`;
    }
    const parsed = parse(f.featureName);
    const direction = measuredDirection(f.description);
    if (!parsed || !direction) return null;
    // Read from the measurement, never from the contribution's sign — see
    // measuredDirection for the bug that caused.
    return observation(parsed, direction);
  }).filter(Boolean);

  // Deduplicate: several statistics of one measurement produce the same phrase,
  // and "shorter answers, shorter answers and shorter answers" reads as broken.
  const unique = [...new Set(observations)];

  return {
    observations: unique,
    leaning: prediction === "depressed",
  };
}
