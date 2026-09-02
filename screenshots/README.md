# Screenshots

Every screen in the platform, captured from the running application at
1440×900 (and 390×844 for the mobile set), at 2× for sharpness.

## Before you read anything into these

- **All data shown is fictional.** "Dr. Meera Joshi", the participant
  references (`P-2001`…), and the counselor assessments were written for this
  capture. No real person's data appears anywhere.
- **The predictions came from the mock pipeline, not the real models.** The
  scores, confidence percentages and explanation factors are generated numbers
  in the right shape. They show what the screens look like, not what the models
  actually say.
- **The speaker match scores are likewise mock**, shaped to look like real
  output: a known speaker scores high against their own enrolled voice and low
  against everyone else's.

Everything else — the layout, the copy, the warnings, the flows — is the real
application.

## The screens

### Public (no account needed)

| File | Screen |
|---|---|
| `01-login` | Sign in |
| `02-05 request-access-*` | Counselor access request, all four steps: account, professional details, contact & location, documents |
| `06-forgot-password` | Password reset request |
| `07-help-guide` | How the platform works |
| `08-crisis-resources` | Escalation guidance. The emergency number shown depends on the counselor's registered country |
| `09-privacy-policy` | Privacy policy |
| `10-terms-of-service` | Terms of service |

### Counselor

| File | Screen |
|---|---|
| `11-counselor-dashboard` | Landing page: counts, the assessment queue, recent sessions |
| `12-sessions-list` | All sessions, with status filters |
| `13-session-report` | **The main screen.** Verdict, confidence, modality contributions, explainability, the counselor's own assessment, and "Who was analysed" |
| `14-session-detail` | A single session before/around processing |
| `15-participants` | Participants this counselor has seen |
| `16-participant-detail` | One participant's history and trend |
| `17-20 new-session-*` | Creating a session: details & language, participant consent, who else is in the room, upload/record |
| `21-voice-enrollment` | Recording your own voice so the analysis can exclude it |
| `22-counselor-profile` | Account, professional profile, password |

### Admin

| File | Screen |
|---|---|
| `23-admin-overview` | Platform statistics |
| `24-admin-applications` | Counselor access requests |
| `25-admin-application-detail` | Reviewing one application, including typed verification documents |
| `26-admin-users` | All accounts |
| `27-admin-models` | Model weights, per language. Uploading all three stages for a new language is what makes that language selectable |
| `28-admin-dataset` | Research dataset review and export |
| `29-admin-privacy` | Retention, consent withdrawal, erasure |
| `30-admin-profile` | Admin account |

### Mobile (390px)

`31-34` — dashboard, sessions, report, voice enrollment.

## Things worth discussing with the team

Some deliberate decisions that are easy to miss, and are the kind of thing
worth arguing about:

1. **The report gives a binary verdict plus confidence — not a severity
   scale.** The model outputs "elevated / not elevated" and a confidence. There
   is no Mild/Moderate/Severe anywhere, because the model never produced one
   and inventing a grade would imply a clinical judgment it did not make.
2. **The confidence ring is confidence, not severity.** The disclaimer says so
   explicitly. 64% means the model is fairly sure, not that someone is 64% unwell.
3. **Video shows as "Not used".** The research project's own evaluation found
   including video made the fused result worse, so it is excluded from the
   prediction path rather than shown as a 0% bar.
4. **"Who was analysed" is on the report.** Identifying the wrong speaker
   produces a normal-looking report about the wrong person, so the evidence for
   who was who is shown rather than hidden.
5. **Only English can be scored today.** Other languages appear in the session
   language picker but are greyed out — the gap is a missing trained model, not
   a missing feature, and saying so is better than hiding the option.
6. **The counselor's assessment is stored separately** and never overwrites the
   model's. Disagreement is expected and is what the research dataset is
   labelled from.

## Regenerating

The capture is scripted, so it can be re-run after any UI change. It needs the
Postgres container, the ML service, the backend, and the Vite dev server all
running, plus a seeded counselor account. See the project README.
