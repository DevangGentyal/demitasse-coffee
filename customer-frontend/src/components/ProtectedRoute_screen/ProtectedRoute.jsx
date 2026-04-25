import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const userType = localStorage.getItem("userType");

  if (!user && userType !== "guest") {
    return <Navigate to="/login" />;
  }

  return children;
};

export default ProtectedRoute;
