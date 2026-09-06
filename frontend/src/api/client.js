import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api";

/**
 * Fired when the server says the session is no longer valid.
 *
 * AuthContext listens for it and clears its own state. This exists because the
 * interceptor and AuthContext previously disagreed about who owned the
 * session: the interceptor emptied localStorage directly, while AuthContext
 * kept the user in React state and never found out.
 *
 * The visible symptom was the sign-in page rendering inside the signed-in
 * shell — sidebar, name and all — because every component still believed
 * somebody was logged in while storage said otherwise.
 */
export const UNAUTHORIZED_EVENT = "auth:unauthorized";

const apiClient = axios.create({ baseURL });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 only: the server distinguishes "I don't know who you are" from "I
    // know, and you may not". Reacting to 403 as well would sign a counselor
    // out for clicking something meant for admins.
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      // Announced rather than navigated. The previous version set
      // window.location.href, which reloads the whole application — and,
      // worse, skipped even that when the user was already on /login, leaving
      // React holding a user that storage no longer had.
      //
      // AuthContext clears its state on this, ProtectedRoute then routes to
      // the sign-in page by itself, and the SPA never reloads.
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  }
);

export default apiClient;
