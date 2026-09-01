import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function NotFound() {
  const { user } = useAuth();

  return (
    <div className="centered-page">
      <div className="card auth-card">
        <h1>Page not found</h1>
        <p className="muted">
          That page doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <Link to={user ? "/" : "/login"} className="btn-primary">
          {user ? "Back to dashboard" : "Go to sign in"}
        </Link>
      </div>
    </div>
  );
}
