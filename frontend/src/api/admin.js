import apiClient from "./client";

// --- counselor applications ---

export async function listApplications(status, page = 0, size = 20) {
  const { data } = await apiClient.get("/admin/counselor-applications", {
    params: { status: status || undefined, page, size },
  });
  return data;
}

export async function getApplication(id) {
  const { data } = await apiClient.get(`/admin/counselor-applications/${id}`);
  return data;
}

export async function approveApplication(id) {
  const { data } = await apiClient.post(`/admin/counselor-applications/${id}/approve`);
  return data;
}

export async function rejectApplication(id, reason) {
  const { data } = await apiClient.post(`/admin/counselor-applications/${id}/reject`, { reason });
  return data;
}

export async function suspendApplication(id) {
  const { data } = await apiClient.post(`/admin/counselor-applications/${id}/suspend`);
  return data;
}

export async function reactivateApplication(id) {
  const { data } = await apiClient.post(`/admin/counselor-applications/${id}/reactivate`);
  return data;
}

// The download endpoint requires the JWT bearer header, so a plain <a href>
// won't authenticate. Fetch as a blob instead and trigger the save via a
// temporary object URL.
export async function downloadDocument(applicationId, documentId, fileName) {
  const response = await apiClient.get(
    `/admin/counselor-applications/${applicationId}/documents/${documentId}`,
    { responseType: "blob" }
  );
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "document";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// --- dataset ---

export async function listDatasetSamples(status, page = 0, size = 20) {
  const { data } = await apiClient.get("/admin/dataset", {
    params: { status: status || undefined, page, size },
  });
  return data;
}

export async function getDatasetSample(id) {
  const { data } = await apiClient.get(`/admin/dataset/${id}`);
  return data;
}

export async function approveDatasetSample(id, notes) {
  const { data } = await apiClient.post(`/admin/dataset/${id}/approve`, { notes });
  return data;
}

export async function rejectDatasetSample(id, notes) {
  const { data } = await apiClient.post(`/admin/dataset/${id}/reject`, { notes });
  return data;
}

// Needs the JWT header, so a plain <a href> won't authenticate — fetch as a
// blob and save via a temporary object URL, same as the document download above.
export async function downloadDatasetExport() {
  const response = await apiClient.get("/admin/dataset/export", { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `depression-dataset-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// --- privacy ---

export async function searchParticipants(search) {
  const { data } = await apiClient.get("/admin/privacy/participants", {
    params: { search: search || undefined },
  });
  return data;
}

export async function withdrawConsent(sessionId) {
  await apiClient.post(`/admin/privacy/sessions/${sessionId}/withdraw-consent`);
}

export async function eraseParticipant(participantId) {
  const { data } = await apiClient.delete(`/admin/privacy/participants/${participantId}`);
  return data;
}

export async function runRetentionSweep() {
  const { data } = await apiClient.post("/admin/privacy/retention-sweep");
  return data;
}

// --- users ---

export async function listUsers({ role, search, page = 0, size = 20 } = {}) {
  const { data } = await apiClient.get("/admin/users", {
    params: { role: role || undefined, search: search || undefined, page, size },
  });
  return data;
}

export async function suspendUser(id) {
  const { data } = await apiClient.post(`/admin/users/${id}/suspend`);
  return data;
}

export async function reactivateUser(id) {
  const { data } = await apiClient.post(`/admin/users/${id}/reactivate`);
  return data;
}

export async function issueUserPasswordReset(id) {
  await apiClient.post(`/admin/users/${id}/reset-password`);
}

// --- model weights ---

export async function listModelVersions(modality) {
  const { data } = await apiClient.get("/admin/models", {
    params: { modality: modality || undefined },
  });
  return data;
}

export async function uploadModelVersion({ modality, language, file, versionLabel, notes }) {
  const formData = new FormData();
  formData.append("modality", modality);
  formData.append("language", language || "en");
  formData.append("file", file);
  if (versionLabel) formData.append("versionLabel", versionLabel);
  if (notes) formData.append("notes", notes);

  const { data } = await apiClient.post("/admin/models", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function activateModelVersion(id) {
  const { data } = await apiClient.post(`/admin/models/${id}/activate`);
  return data;
}

export async function revertModelToDefault(modality, language = "en") {
  await apiClient.post("/admin/models/revert-to-default", null, {
    params: { modality, language },
  });
}

// --- stats ---

export async function getAdminStats() {
  const { data } = await apiClient.get("/admin/stats");
  return data;
}

export async function listAuditLogs(page = 0, size = 50) {
  const { data } = await apiClient.get("/admin/audit-logs", { params: { page, size } });
  return data;
}
