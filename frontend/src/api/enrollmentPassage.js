import apiClient from "./client";

export async function getPassageHistory() {
  const { data } = await apiClient.get("/admin/enrollment-passage");
  return data;
}

/**
 * Replace the live passage.
 *
 * Creates a new version rather than editing in place. Existing voiceprints
 * stay valid — a voiceprint describes a voice, not a script — so nobody has
 * to re-record after a change.
 */
export async function updatePassage(body, notes) {
  const { data } = await apiClient.put("/admin/enrollment-passage", { body, notes });
  return data;
}
