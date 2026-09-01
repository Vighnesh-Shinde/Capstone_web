import apiClient from "./client";

export async function getJudgment(sessionId) {
  const { data, status } = await apiClient.get(`/sessions/${sessionId}/judgment`, {
    validateStatus: (s) => s === 200 || s === 204,
  });
  return status === 204 ? null : data;
}

export async function submitJudgment(sessionId, assessment, observation) {
  const { data } = await apiClient.post(`/sessions/${sessionId}/judgment`, { assessment, observation });
  return data;
}
