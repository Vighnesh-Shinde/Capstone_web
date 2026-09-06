import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Footer from "./Footer";
import {
  IconDashboard,
  IconDataset,
  IconLogo,
  IconLogout,
  IconModels,
  IconParticipants,
  IconPrivacy,
  IconRequests,
  IconSessions,
  IconUsers,
  IconVoice,
} from "./NavIcons";

const COUNSELOR_NAV = [
  { to: "/", label: "Dashboard", icon: IconDashboard, end: true },
  { to: "/sessions", label: "Sessions", icon: IconSessions },
  { to: "/participants", label: "Participants", icon: IconParticipants },
  // Reachable from the nav, not only from the gate on the session form: a
  // counselor whose recording expires next week should be able to renew it
  // when it suits them, rather than being stopped mid-clinic to find it.
  { to: "/voice-enrollment", label: "My voice", icon: IconVoice },
];

const ADMIN_NAV = [
  { to: "/admin", label: "Overview", icon: IconDashboard, end: true },
  { to: "/admin/applications", label: "Access requests", icon: IconRequests },
  { to: "/admin/users", label: "Users", icon: IconUsers },
  { to: "/admin/dataset", label: "Dataset", icon: IconDataset },
  { to: "/admin/models", label: "Models", icon: IconModels },
  { to: "/admin/voice-passage", label: "Voice passage", icon: IconVoice },
  { to: "/admin/privacy", label: "Privacy & data", icon: IconPrivacy },
];

/** "Sarah Khan" -> "SK". Falls back to a single letter for one-word names. */
function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  // Signed-out pages (login, reset, the public legal pages) render without the
  // sidebar so they can centre their own content. The footer stays: it carries
  // the legal links and the clinical disclaimer, which must be reachable
  // without an account.
  if (!user) {
    return (
      <div className="app-shell plain">
        <main>{children}</main>
        <Footer />
      </div>
    );
  }

  const navItems = user.role === "ADMIN" ? ADMIN_NAV : COUNSELOR_NAV;

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link to="/" className="sidebar-brand">
          <span className="brand-mark"><IconLogo /></span>
          <span className="brand-name">
            Counselor Portal
            <span className="brand-sub">Screening support</span>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="Main">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button className="sidebar-logout" onClick={handleLogout}>
            <IconLogout />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="app-body">
        <header className="app-topbar">
          <Link to="/profile" className="topbar-user">
            <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
            <span className="topbar-name">
              {user.name}
              <span className="topbar-role">{user.role === "ADMIN" ? "Administrator" : "Counselor"}</span>
            </span>
          </Link>
        </header>

        <main className="app-main">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
