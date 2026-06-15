import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLocationContext } from "../../context/LocationContext";

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const { selectedOutlet, selectedTableId } = useLocationContext();
  const location = useLocation();
  const userType = localStorage.getItem("userType");

  // Routes that don't need outlet/table selection — auth only
  const authOnlyRoutes = [
    "/select-outlet",
    "/complete-profile",
    "/profile",
    "/profile/orders",
  ];

  // Profile sub-routes like /profile/orders/:id also only need auth
  const isProfileRoute =
    location.pathname.startsWith("/profile");

  const requiresLocationSelection =
    !authOnlyRoutes.includes(location.pathname) && !isProfileRoute;

  if (!user && userType !== "guest") {
    return <Navigate to="/login" />;
  }

  if (requiresLocationSelection && (!selectedOutlet || !selectedTableId)) {
    // Check localStorage as synchronous fallback — setGlobalOutlet/setTableSelection
    // write to localStorage before navigate(), but React state updates are batched
    // and may not be available until the next render cycle.
    const lsOutlet = localStorage.getItem("selectedOutlet");
    const lsTable = localStorage.getItem("selectedTableId");
    if (!lsOutlet || !lsTable) {
      return <Navigate to="/select-outlet" />;
    }
  }

  return children;
};

export default ProtectedRoute;
