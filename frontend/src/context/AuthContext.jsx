import { createContext, useContext, useEffect, useState } from "react";
import { login as loginRequest, loginWithGoogle as googleLoginRequest } from "../api/auth";
import { UNAUTHORIZED_EVENT } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    // Both, deliberately: half a session is not a session, and treating one
    // as valid is how the app ends up rendering a signed-in shell for
    // somebody the server will refuse.
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  // The server rejecting the session has to clear it HERE, because this is
  // where the rest of the app reads it from. The API layer emptying
  // localStorage on its own left React holding a user that storage no longer
  // had — which is what rendered the sign-in page inside the signed-in shell.
  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
    }
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  async function login(identifier, password, captchaToken) {
    return establishSession(await loginRequest(identifier, password, captchaToken));
  }

  /** Same resulting session as a password sign-in — same claims, same expiry. */
  async function loginWithGoogle(credential, captchaToken) {
    return establishSession(await googleLoginRequest(credential, captchaToken));
  }

  function establishSession(data) {
    const loggedInUser = {
      email: data.email,
      username: data.username,
      name: data.name,
      role: data.role,
    };
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    return loggedInUser;
  }

  /** Keeps the header/nav in sync after the user edits their own profile. */
  function updateCurrentUser(patch) {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem("user", JSON.stringify(next));
      return next;
    });
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, logout, updateCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
