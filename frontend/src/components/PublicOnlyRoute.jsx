import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Keeps signed-in users off the sign-in pages.
 *
 * THE BUG THIS FIXES
 * /login had no guard, so pressing browser Back after signing in rendered the
 * login form INSIDE the authenticated shell — sidebar, "Vighnesh /
 * Administrator" in the corner, and a "Welcome back, sign in" card in the
 * middle of it. Layout renders the authenticated chrome whenever a session
 * exists, and nothing was stopping a public route from being reached while one
 * did.
 *
 * Redirects to "/" rather than to a role-specific page, so RoleHome stays the
 * single place that decides where each role lands. Two components deciding
 * that is how they drift apart.
 *
 * WHAT IS DELIBERATELY *NOT* GUARDED
 * ----------------------------------
 * Only /login, /forgot-password and /request-access use this. Two other public
 * routes must stay reachable while signed in, and guarding them would break
 * real flows:
 *
 *   /verify-email  — the email-change flow depends on it. A signed-in user
 *                    requests a new address and clicks the link that arrives;
 *                    bouncing them to the dashboard would make changing an
 *                    email address impossible.
 *   /reset-password — someone signed in on one device who clicks a reset link
 *                    is usually recovering from something. Redirecting them
 *                    would block a legitimate recovery for no security gain.
 */
export default function PublicOnlyRoute() {
  const { user, loading } = useAuth();

  // Rendering the sign-in form during the auth check would flash a login page
  // at somebody who is already signed in, on every refresh.
  if (loading) {
    return <div className="page-loading">Loading...</div>;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
