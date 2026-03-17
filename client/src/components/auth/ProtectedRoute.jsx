import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCompilerStore } from "../../store/useCompilerStore";

export default function ProtectedRoute({
    allowedRoles = [],
    unauthenticatedPath = "/compiler",
    children,
}) {
    const currentUser = useCompilerStore((s) => s.currentUser);
    const location = useLocation();

    if (!currentUser) {
        return (
            <Navigate
                to={unauthenticatedPath}
                replace
                state={{ from: location }}
            />
        );
    }

    if (!allowedRoles.length) {
        return children;
    }

    const userRole = String(currentUser?.role || "student").toLowerCase();
    const canAccess = allowedRoles.map((r) => String(r).toLowerCase()).includes(userRole);

    if (!canAccess) {
        return (
            <Navigate
                to="/unauthorized"
                replace
                state={{
                    from: location,
                    reason: "This account is signed in, but it does not have the required role for that page.",
                }}
            />
        );
    }

    return children;
}
