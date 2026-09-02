import apiClient from "./client";

export async function listSessions({
  status,
  participantId,
  search,
  sort = "createdAt",
  direction = "desc",
  page = 0,
  size = 20,
} = {}) {
  const { data } = await apiClient.get("/sessions", {
    params: {
      status: status || undefined,
      participantId: participantId || undefined,
      search: search || undefined,
      sort,
      direction,
      page,
      size,
    },
  });
  return data;
}

export async function getSessionStats() {
  const { data } = await apiClient.get("/sessions/stats");
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

export async function updateSessionNotes(id, notes) {
  const { data } = await apiClient.patch(`/sessions/${id}/notes`, { notes });
  return data;
}

export async function createSession(participantRef, videoFile, consent, language) {
  const formData = new FormData();
  formData.append("participant_ref", participantRef);
  formData.append("video", videoFile);
  formData.append("language", language || "en");
  formData.append("consent_recording", String(!!consent?.recording));
  formData.append("consent_ai_analysis", String(!!consent?.aiAnalysis));
  formData.append("consent_storage", String(!!consent?.storage));
  formData.append("consent_research_reuse", String(!!consent?.researchReuse));

  const { data } = await apiClient.post("/sessions", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
