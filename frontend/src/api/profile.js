import apiClient from "./client";

export async function getProfile() {
  const { data } = await apiClient.get("/me");
  return data;
}

export async function updateProfile({ name, username }) {
  const { data } = await apiClient.patch("/me", { name, username });
  return data;
}

export async function changePassword(currentPassword, newPassword) {
  await apiClient.post("/me/change-password", { currentPassword, newPassword });
}
