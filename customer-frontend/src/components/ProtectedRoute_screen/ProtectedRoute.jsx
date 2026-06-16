import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLocationContext } from "../../context/LocationContext";
import { useOffers } from "../../context/OfferContext";

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const { selectedOutlet, selectedTableId } = useLocationContext();
  const { fullUser } = useOffers();
  const location = useLocation();
  const userType = localStorage.getItem("userType");

  if (!user && userType !== "guest") {
    return <Navigate to="/login" />;
  }

  // Profile completeness check for authenticated (non-anonymous, non-guest) users
  const isProfileIncomplete =
    user &&
    !user.isAnonymous &&
    fullUser &&
    (!fullUser.dob || !fullUser.gender || !fullUser.location);

  const isProfileRoute = location.pathname.startsWith("/profile");
  const isCompleteProfileRoute = location.pathname === "/complete-profile";

  // [REGISTRATION FLOW] Redirect users with incomplete profiles to /complete-profile (NOT /profile)
  if (isProfileIncomplete && !isProfileRoute && !isCompleteProfileRoute) {
    const redirectTarget = "/complete-profile";
    console.log("[REGISTRATION FLOW]", {
      currentRoute: location.pathname,
      uid: user?.uid,
      fullUser,
      redirectTarget,
    });
    return <Navigate to={redirectTarget} />;
  }

  // Routes that don't need outlet/table selection — auth only
  const authOnlyRoutes = [
    "/select-outlet",
    "/complete-profile",
    "/profile",
    "/profile/orders",
  ];

  const requiresLocationSelection =
    !authOnlyRoutes.includes(location.pathname) && !isProfileRoute;

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
