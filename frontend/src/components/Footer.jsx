import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="app-footer">
      <p className="footer-disclaimer">
        This platform provides <strong>screening support</strong> for a qualified
        clinician. It is not a diagnostic device. Never use its output as the sole
        basis for a clinical decision.
      </p>
      <nav className="footer-links">
        <Link to="/help">How it works</Link>
        <Link to="/crisis-resources">Crisis resources</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
      </nav>
    </footer>
  );
}
