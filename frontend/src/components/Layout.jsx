import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          Depression Detection Platform
        </Link>
        {user && (
          <nav className="header-nav">
            {user.role === "ADMIN" ? (
              <>
                <NavLink to="/admin" end>Overview</NavLink>
                <NavLink to="/admin/applications">Access Requests</NavLink>
                <NavLink to="/admin/users">Users</NavLink>
                <NavLink to="/admin/dataset">Dataset</NavLink>
              </>
            ) : (
              <NavLink to="/" end>Dashboard</NavLink>
            )}
          </nav>
        )}
        {user && (
          <div className="header-actions">
            <Link to="/profile" className="header-user">
              {user.name} <span className="role-tag">{user.role}</span>
            </Link>
            <button className="btn-link" onClick={handleLogout}>
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
