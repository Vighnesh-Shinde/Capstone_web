import apiClient from "./client";

export async function submitCounselorApplication(fields, documents) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      formData.append(key, value);
    }
  });
  (documents || []).forEach((file) => formData.append("documents", file));

  const { data } = await apiClient.post("/counselor-applications", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
