"""
Refusing to score an interview that is nothing like what the models learned from.

WHY THIS EXISTS
---------------
Every short test recording came back "depressed", regardless of what was said
or how it sounded. Measured on four real sessions, the text model returned
p_text = 0.2542, 0.2542, 0.2543, 0.2542 — the same number to four decimal
places across completely different videos.

That is not a model making mistakes. It is a model receiving input unlike
anything in its training set. The text stage is an RBF-kernel SVM, whose
kernel exp(-gamma * ||x - sv||^2) collapses toward zero once a point sits far
from every support vector; the decision function then reduces to its intercept
and the output is a constant. Checked against the fitted scaler, 20 of the 25
features the model actually selects were 3 to 9 standard deviations from the
training mean.

The cause is length. Measured over the 189 DAIC-WOZ interviews the models were
trained on, participant speech spans:

    words        min 167   5th pct 514   median 1293   max 4611
    utterances   min  42   5th pct  76   median  155   max  386

A one-minute recording produces something like 94 words over 8 utterances —
below the *minimum* of the training range on both counts, not merely below
average. Sentence-level max-pooling makes this structural rather than
incidental: the maximum over 8 sentence vectors is systematically smaller than
over 155, so the embedding block lands in a region the model has never seen.
Measured, that block came out at 0.47x the training scale.

The consequence is the dangerous part. A constant p_text of 0.2542, fused with
weights of 2.31 for text against 0.27 for audio, yields roughly 0.49 — and the
fusion threshold is 0.48. So every too-short session clears the bar by a
hair and is reported as depressed, with a plausible-looking confidence beside
it. Silently wrong, in the same direction, every time.

So this refuses. The platform already declines rather than guesses when it
cannot identify a speaker or has no model for a language; being asked to score
an interview shorter than anything it was trained on is the same kind of
problem and deserves the same answer.
"""

import os

# The floor is the observed MINIMUM of the training set, not a percentile.
#
# Anything below it is definitively outside the range the models saw, which is
# a claim that can be defended from the data rather than a threshold picked to
# feel about right. Sessions above it may still be short, and the caller is
# expected to say so — but they are at least inside the distribution.
MIN_WORDS = int(os.environ.get("MIN_PARTICIPANT_WORDS", "167"))
MIN_UTTERANCES = int(os.environ.get("MIN_PARTICIPANT_UTTERANCES", "42"))

# Where the training set actually sits, for the message. Hardcoded because
# they are properties of the shipped models, and recomputing them at runtime
# would need the corpus present in production, which it is not.
TRAINING_MEDIAN_WORDS = 1293
TRAINING_MIN_WORDS = 167
TRAINING_MEDIAN_UTTERANCES = 155
TRAINING_MIN_UTTERANCES = 42


class SessionTooShort(Exception):
    """
    Raised instead of returning a number for an interview below the training
    range.

    Carries the counts so the counsellor can see how far short it fell, rather
    than being told "too short" with no sense of by how much.
    """

    def __init__(self, n_words: int, n_utterances: int):
        self.n_words = n_words
        self.n_utterances = n_utterances
        super().__init__(
            f"This interview is too short to analyse. Only {n_words} words across "
            f"{n_utterances} separate replies were recorded from the participant, and "
            f"the models were trained on interviews of {TRAINING_MIN_WORDS}-4,611 words "
            f"(typically around {TRAINING_MEDIAN_WORDS}) across "
            f"{TRAINING_MIN_UTTERANCES}-386 replies. Scoring a recording this short "
            f"would not produce a weaker result, it would produce a meaningless one: "
            f"the model returns nearly the same value whatever is said, which happens "
            f"to land on the depressed side of the threshold every time. Record a "
            f"fuller interview and upload it again."
        )


def check_length(text_features) -> None:
    """
    Refuse the session if the participant said too little.

    Reads the first two lexical columns, lex_n_words and lex_n_utts, which are
    the counts the extractor has already computed — see text_features.LEX_COLS.
    """
    n_words = int(text_features[0])
    n_utterances = int(text_features[1])

    if n_words < MIN_WORDS or n_utterances < MIN_UTTERANCES:
        raise SessionTooShort(n_words, n_utterances)
