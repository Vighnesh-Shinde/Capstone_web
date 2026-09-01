import apiClient from "./client";

export async function listSessions(page = 0, size = 20) {
  const { data } = await apiClient.get("/sessions", { params: { page, size } });
  return data;
}

export async function getSession(id) {
  const { data } = await apiClient.get(`/sessions/${id}`);
  return data;
}

export async function getReport(id) {
  const { data } = await apiClient.get(`/sessions/${id}/report`);
  return data;
}

export async function createSession(participantRef, videoFile, consent) {
  const formData = new FormData();
  formData.append("participant_ref", participantRef);
  formData.append("video", videoFile);
  formData.append("consent_recording", String(!!consent?.recording));
  formData.append("consent_ai_analysis", String(!!consent?.aiAnalysis));
  formData.append("consent_storage", String(!!consent?.storage));
  formData.append("consent_research_reuse", String(!!consent?.researchReuse));

  const { data } = await apiClient.post("/sessions", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
