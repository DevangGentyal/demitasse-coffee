import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLocationContext } from "../../context/LocationContext";

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const { selectedOutlet, selectedTableId } = useLocationContext();
  const location = useLocation();
  const userType = localStorage.getItem("userType");

  const locationSetupRoutes = ["/select-outlet", "/complete-profile"];
  const requiresLocationSelection = !locationSetupRoutes.includes(location.pathname);

  if (!user && userType !== "guest") {
    return <Navigate to="/login" />;
  }

  if (requiresLocationSelection && (!selectedOutlet || !selectedTableId)) {
    return <Navigate to="/select-outlet" />;
  }

  return children;
};

export default ProtectedRoute;
