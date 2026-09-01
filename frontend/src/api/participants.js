import apiClient from "./client";

export async function listParticipants() {
  const { data } = await apiClient.get("/participants");
  return data;
}
