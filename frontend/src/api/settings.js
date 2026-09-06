import apiClient from "./client";

export async function getSettings() {
  const { data } = await apiClient.get("/me/settings");
  return data;
}

export async function updateNotifications(preferences) {
  const { data } = await apiClient.put("/me/settings/notifications", preferences);
  return data;
}

/**
 * Start an email change.
 *
 * The address does not move until the new mailbox confirms — the response
 * comes back with `pendingEmail` set, not with the new address live.
 */
export async function requestEmailChange(newEmail, currentPassword) {
  const { data } = await apiClient.post("/me/settings/email", { newEmail, currentPassword });
  return data;
}

export async function cancelEmailChange() {
  const { data } = await apiClient.delete("/me/settings/email");
  return data;
}

export async function unlinkGoogle() {
  const { data } = await apiClient.delete("/me/settings/google");
  return data;
}
