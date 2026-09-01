import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import RequestCounselorAccess from "./pages/RequestCounselorAccess";
import Profile from "./pages/Profile";
import Dashboard from "./pages/Dashboard";
import NewSession from "./pages/NewSession";
import SessionDetail from "./pages/SessionDetail";
import Report from "./pages/Report";
import AdminHome from "./pages/admin/AdminHome";
import AdminApplications from "./pages/admin/AdminApplications";
import AdminApplicationDetail from "./pages/admin/AdminApplicationDetail";
import AdminUsers from "./pages/admin/AdminUsers";
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
            <Route path="/request-access" element={<RequestCounselorAccess />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<RoleHome />} />
              <Route path="/profile" element={<Profile />} />
            </Route>

            <Route element={<ProtectedRoute requireRole="COUNSELOR" />}>
              <Route path="/sessions/new" element={<NewSession />} />
              <Route path="/sessions/:id" element={<SessionDetail />} />
              <Route path="/sessions/:id/report" element={<Report />} />
            </Route>

            <Route element={<ProtectedRoute requireRole="ADMIN" />}>
              <Route path="/admin" element={<AdminHome />} />
              <Route path="/admin/applications" element={<AdminApplications />} />
              <Route path="/admin/applications/:id" element={<AdminApplicationDetail />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/dataset" element={<AdminDataset />} />
              <Route path="/admin/dataset/:id" element={<AdminDatasetDetail />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}
