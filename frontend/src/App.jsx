import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import RequestCounselorAccess from "./pages/RequestCounselorAccess";
import Profile from "./pages/Profile";
import VoiceEnrollment from "./pages/VoiceEnrollment";
import VerifyEmail from "./pages/VerifyEmail";
import Dashboard from "./pages/Dashboard";
import Sessions from "./pages/Sessions";
import NewSession from "./pages/NewSession";
import SessionDetail from "./pages/SessionDetail";
import Report from "./pages/Report";
import Participants from "./pages/Participants";
import ParticipantDetail from "./pages/ParticipantDetail";
import HelpGuide from "./pages/HelpGuide";
import CrisisResources from "./pages/CrisisResources";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import NotFound from "./pages/NotFound";
import AdminHome from "./pages/admin/AdminHome";
import AdminApplications from "./pages/admin/AdminApplications";
import AdminApplicationDetail from "./pages/admin/AdminApplicationDetail";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminModels from "./pages/admin/AdminModels";
import AdminVoicePassage from "./pages/admin/AdminVoicePassage";
import AdminPrivacy from "./pages/admin/AdminPrivacy";
import AdminDataset from "./pages/admin/AdminDataset";
import AdminDatasetDetail from "./pages/admin/AdminDatasetDetail";

function RoleHome() {
  const { user } = useAuth();
  if (user?.role === "ADMIN") {
    return <Navigate to="/admin" replace />;
  }
  return <Dashboard />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/request-access" element={<RequestCounselorAccess />} />

            {/* Public: a counselor must be able to reach crisis guidance and the
                privacy notice without being signed in. */}
            <Route path="/help" element={<HelpGuide />} />
            <Route path="/crisis-resources" element={<CrisisResources />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<RoleHome />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/voice-enrollment" element={<VoiceEnrollment />} />
            </Route>

            <Route element={<ProtectedRoute requireRole="COUNSELOR" />}>
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/sessions/new" element={<NewSession />} />
              <Route path="/sessions/:id" element={<SessionDetail />} />
              <Route path="/sessions/:id/report" element={<Report />} />
              <Route path="/participants" element={<Participants />} />
              <Route path="/participants/:id" element={<ParticipantDetail />} />
            </Route>

            <Route element={<ProtectedRoute requireRole="ADMIN" />}>
              <Route path="/admin" element={<AdminHome />} />
              <Route path="/admin/applications" element={<AdminApplications />} />
              <Route path="/admin/applications/:id" element={<AdminApplicationDetail />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/models" element={<AdminModels />} />
              <Route path="/admin/voice-passage" element={<AdminVoicePassage />} />
              <Route path="/admin/privacy" element={<AdminPrivacy />} />
              <Route path="/admin/dataset" element={<AdminDataset />} />
              <Route path="/admin/dataset/:id" element={<AdminDatasetDetail />} />
            </Route>

            {/* A real 404 rather than a silent redirect home — a mistyped or
                stale link should say so, not pretend it worked. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}
