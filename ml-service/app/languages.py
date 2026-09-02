"""
Which languages this platform can actually work in — and, more importantly,
which ones it must refuse to score.

The distinction that matters here is between TRANSCRIPTION and SCORING.

Whisper transcribes ~99 languages, so producing a Hindi or Marathi transcript
is already possible today. Scoring one is not, and the reason is not that
somebody forgot to switch it on:

  * The 24 lexical features are English word lists (first-person pronouns,
    absolutist terms, negations, hedges...). A Marathi transcript scores ~0 on
    every one of them. That is not "no depression markers found" — it is "no
    English words found", and the model cannot tell those apart.
  * all-mpnet-base-v2 is an English-only sentence encoder. Give it Devanagari
    and it returns a 768-dim vector, confidently, that means nothing.
  * The 85 acoustic features (F0, jitter, shimmer, pause timing, speech rate)
    are the one part that partially transfers — they measure voice, not words.
    But speech-rate and pause norms differ by language, and the fusion model
    was fitted on English speakers regardless.
  * The models were trained on DAIC-WOZ: American English, one clinical
    population, one interview protocol.

So a non-English session run through the English pipeline would not fail. It
would return a clean, plausible, confident number about someone's mental
health, computed from noise. That is the single most dangerous thing this
software could do, so scoring is gated here rather than left to chance.

Adding a language later is a data problem, not a code problem: train models on
that language's sessions, upload them under that language code through the
admin model-version screen, and this registry starts reporting it as
scoring-capable because the weights are on disk. See model_loader.py.
"""

from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class Language:
    code: str          # BCP-47 / ISO 639-1, what Whisper expects
    name: str          # English name, for logs and admin screens
    native_name: str   # endonym, for the counselor-facing picker
    transcription: bool


# Ordered: English first (the only scoring language today), then the Indian
# languages this platform is being deployed into, then wider coverage.
LANGUAGES: tuple[Language, ...] = (
    Language("en", "English", "English", True),
    Language("hi", "Hindi", "\u0939\u093f\u0928\u094d\u0926\u0940", True),
    Language("mr", "Marathi", "\u092e\u0930\u093e\u0920\u0940", True),
    Language("bn", "Bengali", "\u09ac\u09be\u0982\u09b2\u09be", True),
    Language("gu", "Gujarati", "\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0", True),
    Language("kn", "Kannada", "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1", True),
    Language("ml", "Malayalam", "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02", True),
    Language("pa", "Punjabi", "\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40", True),
    Language("ta", "Tamil", "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd", True),
    Language("te", "Telugu", "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41", True),
    Language("ur", "Urdu", "\u0627\u0631\u062f\u0648", True),
    Language("ar", "Arabic", "\u0627\u0644\u0639\u0631\u0628\u064a\u0629", True),
    Language("de", "German", "Deutsch", True),
    Language("es", "Spanish", "Espa\u00f1ol", True),
    Language("fr", "French", "Fran\u00e7ais", True),
    Language("id", "Indonesian", "Bahasa Indonesia", True),
    Language("ja", "Japanese", "\u65e5\u672c\u8a9e", True),
    Language("pt", "Portuguese", "Portugu\u00eas", True),
    Language("ru", "Russian", "\u0420\u0443\u0441\u0441\u043a\u0438\u0439", True),
    Language("sw", "Swahili", "Kiswahili", True),
    Language("zh", "Chinese", "\u4e2d\u6587", True),
)

BY_CODE = {lang.code: lang for lang in LANGUAGES}

DEFAULT_LANGUAGE = "en"


def is_known(code: str) -> bool:
    return code in BY_CODE


def catalog() -> list[dict]:
    """
    The registry, annotated with what is actually installed right now.

    `scoring` is deliberately computed from the model files on disk rather than
    hardcoded: the day someone uploads and activates a Marathi model set, this
    flips to True with no code change. Imported lazily so that merely reading
    the catalog never drags scikit-learn into the process.
    """
    from app.real.model_loader import scoring_languages

    installed = scoring_languages()
    return [
        {**asdict(lang), "scoring": lang.code in installed}
        for lang in LANGUAGES
    ]


class LanguageNotScorable(Exception):
    """
    Raised instead of returning a number for a language we have no models for.

    Carries the reason so the counselor sees why their session stopped rather
    than a bare failure, and so the message stays true when the answer changes
    from "never" to "not yet".
    """

    def __init__(self, code: str):
        self.code = code
        lang = BY_CODE.get(code)
        label = lang.name if lang else code
        if lang is None:
            super().__init__(
                f"'{code}' is not a language this platform recognises. "
                f"Supported codes: {', '.join(sorted(BY_CODE))}."
            )
        elif lang.transcription:
            super().__init__(
                f"{label} sessions can be transcribed but cannot be scored: no "
                f"{label} model has been trained and activated on this deployment. "
                f"The English models cannot be reused — their language features and "
                f"sentence encoder are English-only, so they would return a confident "
                f"but meaningless result. Ask your administrator to activate "
                f"{label} models, or record this session in a scoring-capable language."
            )
        else:
            super().__init__(f"{label} is not supported by this platform.")
