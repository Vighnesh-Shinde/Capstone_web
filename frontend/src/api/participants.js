import apiClient from "./client";

export async function listParticipants() {
  const { data } = await apiClient.get("/participants");
  return data;
}

export async function getParticipant(id) {
  const { data } = await apiClient.get(`/participants/${id}`);
  return data;
}
