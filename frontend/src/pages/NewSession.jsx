import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createSession } from "../api/sessions";
import { listParticipants } from "../api/participants";
import LanguageSelect from "../components/LanguageSelect";
import CompanionStep from "../components/CompanionStep";
import VoiceprintGate from "../components/VoiceprintGate";

const initialConsent = {
  recording: false,
  aiAnalysis: false,
  storage: false,
  researchReuse: false,
};

const STEPS = ["details", "consent", "room", "capture"];

export default function NewSession() {
  const navigate = useNavigate();
  // The wizard step lives in the URL, not in component state.
  //
  // THE BUG THIS FIXES: with the step in state, pressing browser Back on step
  // 3 left the whole form — discarding the consent that had been ticked and,
  // worse, any companion voice recordings already captured. Those cannot be
  // re-created without the person who made them, who by then has usually left
  // the room. Back now moves between steps, which is what it looks like it
  // should do.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStep = searchParams.get("step");
  const step = STEPS.includes(requestedStep) ? requestedStep : "details";

  // Guarded rather than trusted: Back, Forward, a bookmark or a reload can all
  // ask for a later step whose prerequisites were never met. Rendering the
  // upload screen for someone who never ticked consent would let a session be
  // created without it.
  function setStep(next) {
    setSearchParams({ step: next });
  }
  const [participantRef, setParticipantRef] = useState("");
  const [participantMode, setParticipantMode] = useState("new"); // "new" | "returning"
  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  // Defaults to English, the only language with trained models today. Chosen
  // here rather than detected from the audio: see LanguageSelect for why.
  const [language, setLanguage] = useState("en");
  // Everyone in the room who is not the participant. Each records the passage
  // so their speech can be subtracted rather than scored.
  const [companions, setCompanions] = useState([]);
  const [consent, setConsent] = useState(initialConsent);
  const [mode, setMode] = useState("upload"); // "upload" | "record"
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Prerequisite guard for URL-driven steps. Consent and recordings live in
  // component state and cannot survive a reload, so a deep link or a Forward
  // press into a later step has to fall back to where the data actually is.
  useEffect(() => {
    const consented = consent.recording && consent.aiAnalysis && consent.storage;
    if ((step === "room" || step === "capture") && !consented) {
      setSearchParams({ step: participantRef.trim() ? "consent" : "details" }, { replace: true });
    } else if (step === "consent" && !participantRef.trim()) {
      setSearchParams({ step: "details" }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, consent, participantRef]);

  useEffect(() => {
    listParticipants()
      .then(setParticipants)
      .catch(() => {
        /* returning-participant picker just won't have suggestions */
      })
      .finally(() => setParticipantsLoading(false));
  }, []);

  function handleParticipantModeChange(nextMode) {
    setParticipantMode(nextMode);
    setError("");
    if (nextMode === "new") {
      setSelectedParticipantId("");
      setParticipantRef("");
    }
  }

  function handleReturningParticipantSelect(participantId) {
    setSelectedParticipantId(participantId);
    const found = participants.find((p) => p.id === participantId);
    setParticipantRef(found ? found.participantRef : "");
  }

  // recording state
  const videoPreviewRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState(null);

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
    } catch {
      setError("Could not access camera/microphone. Please grant permission or use file upload instead.");
    }
  }

  function startRecording() {
    if (!mediaStreamRef.current) return;
    recordedChunksRef.current = [];
    const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType: "video/webm" });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setRecordedBlobUrl(url);
      setFile(new File([blob], "recording.webm", { type: "video/webm" }));
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setFile(null);
    setRecordedBlobUrl(null);
    if (nextMode === "record") {
      startCamera();
    } else {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }

  function handleDetailsNext(e) {
    e.preventDefault();
    setError("");
    if (!participantRef.trim()) {
      setError("Participant reference is required.");
      return;
    }
    setStep("consent");
  }

  function handleConsentNext(e) {
    e.preventDefault();
    setError("");
    if (!consent.recording || !consent.aiAnalysis || !consent.storage) {
      setError("Recording, AI analysis, and storage consent are required to proceed.");
      return;
    }
    setStep("room");
  }

  function handleRoomNext(e) {
    e.preventDefault();
    setError("");

    // Blocked rather than warned. A companion who speaks without a recording
    // makes the session unscorable, and that is only discovered after the
    // interview is over and the participant has gone home.
    const incomplete = companions.filter((c) => !c.audio || !c.consentGiven);
    if (incomplete.length > 0) {
      setError(
        "Everyone in the room besides the participant needs a voice recording and " +
          "their agreement before the interview starts."
      );
      return;
    }
    setStep("capture");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!file) {
      setError("Please provide a video, either by upload or recording.");
      return;
    }

    setSubmitting(true);
    try {
      const session = await createSession(
        participantRef.trim(), file, consent, language, companions
      );
      navigate(`/sessions/${session.id}`);
    } catch {
      setError(err.response?.data?.message || "Failed to create session.");
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1>New Session</h1>

      {/* Renders the whole form only once the counselor's own voice is on
          file. Without it the pipeline cannot tell their speech from the
          participant's, and finding that out after the interview means asking
          the participant to come back. */}
      <VoiceprintGate>

      {step === "details" && (
        <form className="card" onSubmit={handleDetailsNext}>
          <label className="field-label">Is this participant new or returning?</label>
          <div className="tab-switch">
            <button
              type="button"
              className={participantMode === "new" ? "tab active" : "tab"}
              onClick={() => handleParticipantModeChange("new")}
            >
              New participant
            </button>
            <button
              type="button"
              className={participantMode === "returning" ? "tab active" : "tab"}
              onClick={() => handleParticipantModeChange("returning")}
            >
              Returning participant
            </button>
          </div>

          {participantMode === "new" && (
            <>
              <label className="field-label" htmlFor="participantRef">
                Participant reference (anonymized ID)
              </label>
              <input
                id="participantRef"
                type="text"
                placeholder="e.g. P-0231"
                value={participantRef}
                onChange={(e) => setParticipantRef(e.target.value)}
                required
              />
            </>
          )}

          {participantMode === "returning" && (
            <>
              <label className="field-label" htmlFor="existingParticipant">
                Select participant
              </label>
              {participantsLoading && <p className="muted">Loading participants...</p>}
              {!participantsLoading && participants.length === 0 && (
                <p className="muted">
                  No prior participants found for your account. Use "New participant" instead.
                </p>
              )}
              {!participantsLoading && participants.length > 0 && (
                <select
                  id="existingParticipant"
                  value={selectedParticipantId}
                  onChange={(e) => handleReturningParticipantSelect(e.target.value)}
                >
                  <option value="">-- Select a participant --</option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.participantRef} — {p.sessionCount} prior session{p.sessionCount === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          <label className="field-label" htmlFor="sessionLanguage">
            Language of this interview
          </label>
          <LanguageSelect id="sessionLanguage" value={language} onChange={setLanguage} />

          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn-primary" type="submit">
            Next: Participant consent
          </button>
        </form>
      )}

      {step === "consent" && (
        <form className="card" onSubmit={handleConsentNext}>
          <h2>Participant Consent</h2>
          <div className="consent-text-box">
            <span className="placeholder-note">
              Placeholder text — replace with reviewed legal/ethical consent wording before real use.
            </span>
            This interview will be recorded and analyzed by an AI system as part of a
            depression-screening assessment. The recording and derived data will be
            stored securely and associated with this session. With separate, optional
            consent, appropriately de-identified data may also be used to help improve
            future versions of the AI models. Declining research reuse does not affect
            whether this interview can be processed.
          </div>

          <div className="checkbox-row">
            <input
              id="consentRecording"
              type="checkbox"
              checked={consent.recording}
              onChange={(e) => setConsent((c) => ({ ...c, recording: e.target.checked }))}
            />
            <label htmlFor="consentRecording">Participant consents to recording of this interview.</label>
          </div>
          <div className="checkbox-row">
            <input
              id="consentAiAnalysis"
              type="checkbox"
              checked={consent.aiAnalysis}
              onChange={(e) => setConsent((c) => ({ ...c, aiAnalysis: e.target.checked }))}
            />
            <label htmlFor="consentAiAnalysis">Participant consents to AI-based analysis of the interview.</label>
          </div>
          <div className="checkbox-row">
            <input
              id="consentStorage"
              type="checkbox"
              checked={consent.storage}
              onChange={(e) => setConsent((c) => ({ ...c, storage: e.target.checked }))}
            />
            <label htmlFor="consentStorage">Participant consents to storage of the interview/data.</label>
          </div>
          <div className="checkbox-row">
            <input
              id="consentResearchReuse"
              type="checkbox"
              checked={consent.researchReuse}
              onChange={(e) => setConsent((c) => ({ ...c, researchReuse: e.target.checked }))}
            />
            <label htmlFor="consentResearchReuse">
              Participant consents to potential future research/model-improvement use of
              de-identified data. <span className="optional-tag">(optional)</span>
            </label>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="action-row">
            <button className="btn-primary" type="submit">
              Next: Who else is present
            </button>
            <button type="button" className="btn-secondary" onClick={() => setStep("details")}>
              Back
            </button>
          </div>
        </form>
      )}

      {step === "room" && (
        <form className="card" onSubmit={handleRoomNext}>
          <CompanionStep companions={companions} onChange={setCompanions} />

          {error && <div className="alert alert-error">{error}</div>}

          <div className="action-row">
            <button className="btn-primary" type="submit">
              Next: Upload / record video
            </button>
            <button type="button" className="btn-secondary" onClick={() => setStep("consent")}>
              Back
            </button>
          </div>
        </form>
      )}

      {step === "capture" && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="tab-switch">
            <button
              type="button"
              className={mode === "upload" ? "tab active" : "tab"}
              onClick={() => switchMode("upload")}
            >
              Upload video file
            </button>
            <button
              type="button"
              className={mode === "record" ? "tab active" : "tab"}
              onClick={() => switchMode("record")}
            >
              Record via webcam
            </button>
          </div>

          {mode === "upload" && (
            <div className="upload-zone">
              <input
                type="file"
                accept="video/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && <p className="muted">Selected: {file.name}</p>}
            </div>
          )}

          {mode === "record" && (
            <div className="record-zone">
              {!recordedBlobUrl && (
                <video ref={videoPreviewRef} autoPlay muted playsInline className="video-preview" />
              )}
              {recordedBlobUrl && (
                <video src={recordedBlobUrl} controls className="video-preview" />
              )}
              <div className="record-controls">
                {!isRecording && !recordedBlobUrl && (
                  <button type="button" className="btn-secondary" onClick={startRecording}>
                    Start recording
                  </button>
                )}
                {isRecording && (
                  <button type="button" className="btn-secondary" onClick={stopRecording}>
                    Stop recording
                  </button>
                )}
                {recordedBlobUrl && (
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                      setRecordedBlobUrl(null);
                      setFile(null);
                      startCamera();
                    }}
                  >
                    Record again
                  </button>
                )}
              </div>
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          <div className="action-row">
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Uploading..." : "Submit for analysis"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setStep("room")}>
              Back
            </button>
          </div>
        </form>
      )}
      </VoiceprintGate>
    </div>
  );
}
