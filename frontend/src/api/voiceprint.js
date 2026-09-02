import apiClient from "./client";

export async function getVoiceprintStatus() {
  const { data } = await apiClient.get("/me/voiceprint");
  return data;
}

export async function getEnrollmentPassage() {
  const { data } = await apiClient.get("/me/voiceprint/passage");
  return data;
}

/**
 * Submit a recording of the passage.
 *
 * The audio is deleted server-side as soon as the voiceprint is extracted, so
 * there is no "delete my recording" call to pair with this — there is never a
 * recording left to delete.
 */
export async function enrollVoice(audioFile) {
  const formData = new FormData();
  formData.append("audio", audioFile);
  const { data } = await apiClient.post("/me/voiceprint", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
