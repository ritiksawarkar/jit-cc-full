import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import CompilerPage from "./pages/CompilerPage";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLoginPage from "./pages/AdminLoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import StudentDashboard from "./pages/StudentDashboard";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import CertificateVerifyPage from "./pages/CertificateVerifyPage";
import { useCompilerStore } from "./store/useCompilerStore";

/**
 * App now hosts route-level RBAC for admin and student users.
 */

export default function App() {
  const currentUser = useCompilerStore((s) => s.currentUser);
  const role = String(currentUser?.role || "student").toLowerCase();

  const roleDefaultPath = currentUser
    ? role === "admin"
      ? "/admin/dashboard"
      : "/compiler"
    : "/compiler";

  return (
    <Routes>
      <Route path="/" element={<Navigate to={roleDefaultPath} replace />} />

      <Route
        path="/compiler"
        element={<CompilerPage />}
      />

      <Route path="/admin/login" element={<AdminLoginPage />} />

      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route path="/certificates/verify" element={<CertificateVerifyPage />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowedRoles={["student", "admin"]}>
            <StudentDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute
            allowedRoles={["admin"]}
            unauthenticatedPath="/admin/login"
          >
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to={roleDefaultPath} replace />} />
    </Routes>
  );
}
