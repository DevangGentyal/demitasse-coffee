import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const userType = localStorage.getItem("userType");

  if (!user && userType !== "guest") {
    return <Navigate to="/login" />;
  }

  if (userType === "guest" && location.pathname === "/complete-profile") {
    return <Navigate to="/select-outlet" />;
  }

  return children;
};

export default ProtectedRoute;
