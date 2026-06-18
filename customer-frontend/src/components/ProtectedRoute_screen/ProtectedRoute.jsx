import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLocationContext } from "../../context/LocationContext";
import { useOffers } from "../../context/OfferContext";

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const { selectedOutlet, selectedTableId, selectedSessionId, clearLocation, isLocationInitialized } = useLocationContext();
  const { fullUser } = useOffers();
  const location = useLocation();
  const userType = localStorage.getItem("userType");

  if (!isLocationInitialized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f4efe9] text-[#3e2723]">
        <div className="w-10 h-10 border-4 border-[#6B4F4F]/20 border-t-[#6B4F4F] rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium tracking-wide">Restoring session...</p>
      </div>
    );
  }

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

  if (requiresLocationSelection) {
    const lsOutlet = localStorage.getItem("selectedOutlet");
    const lsTable = localStorage.getItem("selectedTableId");
    const lsSession = localStorage.getItem("selectedSessionId");

    const hasOutlet = selectedOutlet || lsOutlet;
    const hasTable = selectedTableId || lsTable;
    const hasSession = selectedSessionId || lsSession;

    if (!hasOutlet || !hasTable || !hasSession) {
      clearLocation();
      return <Navigate to="/select-outlet" />;
    }
  }

  return children;
};

export default ProtectedRoute;
