import apiClient from "./client";

/** `identifier` is a username or an email — the backend resolves which. */
export async function login(identifier, password) {
  const { data } = await apiClient.post("/auth/login", { identifier, password });
  return data;
}

export async function forgotPassword(identifier) {
  await apiClient.post("/auth/forgot-password", { identifier });
}

export async function resetPassword(token, newPassword) {
  await apiClient.post("/auth/reset-password", { token, newPassword });
}
