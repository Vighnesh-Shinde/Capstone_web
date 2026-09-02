import apiClient from "./client";

/**
 * Submit an access request with its labelled documents.
 *
 * Document metadata is sent as parallel arrays aligned by index with the files,
 * which is the only way multipart can carry per-file fields in one request.
 * Every array is appended once per document — including empty strings for
 * blank fields — because skipping a blank would shift every later document's
 * metadata onto the wrong file.
 */
export async function submitCounselorApplication(fields, documents) {
  const formData = new FormData();

  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      formData.append(key, value);
    }
  });

  (documents || [])
    .filter((doc) => doc.file)
    .forEach((doc) => {
      formData.append("documents", doc.file);
      formData.append("documentTypes", doc.docType || "OTHER");
      formData.append("documentAuthorities", doc.issuingAuthority || "");
      formData.append("documentNumbers", doc.documentNumber || "");
      formData.append("documentExpiries", doc.expiresOn || "");
    });

  const { data } = await apiClient.post("/counselor-applications", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
