import apiClient from "./client";

export async function getProfile() {
  const { data } = await apiClient.get("/me");
  return data;
}

/**
 * The whole profile is sent every time, not a partial patch.
 *
 * The form holds every field, so anything omitted here was cleared by the user
 * on purpose. Sending only the changed keys would make "I deleted my address"
 * indistinguishable from "I didn't touch my address".
 */
export async function updateProfile(profile) {
  const { data } = await apiClient.patch("/me", profile);
  return data;
}

export async function changePassword(currentPassword, newPassword) {
  await apiClient.post("/me/change-password", { currentPassword, newPassword });
}
