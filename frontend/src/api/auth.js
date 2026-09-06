import apiClient from "./client";

/** `identifier` is a username or an email — the backend resolves which. */
export async function login(identifier, password, captchaToken) {
  const { data } = await apiClient.post("/auth/login", { identifier, password, captchaToken });
  return data;
}

/**
 * Exchange a Google ID token for one of ours.
 *
 * This signs in to an account an administrator already approved — it never
 * creates one. See AuthService.loginWithGoogle on the backend.
 */
export async function loginWithGoogle(credential, captchaToken) {
  const { data } = await apiClient.post("/auth/google", { credential, captchaToken });
  return data;
}

/**
 * Which sign-in methods this deployment has configured.
 *
 * Asked rather than assumed, so the login page never shows a Google button on
 * a server that has no client ID and cannot honour it.
 */
export async function getAuthConfig() {
  const { data } = await apiClient.get("/auth/config");
  return data;
}

export async function forgotPassword(identifier, captchaToken) {
  await apiClient.post("/auth/forgot-password", { identifier, captchaToken });
}

export async function resetPassword(token, newPassword) {
  await apiClient.post("/auth/reset-password", { token, newPassword });
}
