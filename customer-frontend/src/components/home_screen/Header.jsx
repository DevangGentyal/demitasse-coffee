import { MapPinIcon } from "@heroicons/react/24/solid";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useNavigate } from "react-router-dom";
import { useLocationContext } from "../../context/LocationContext";

export default function Header() {
  const navigate = useNavigate();
  const isGuest = localStorage.getItem("userType") === "guest";
  const { outletName, tableNumber, selectedOutlet } = useLocationContext();

  const handleAuthAction = async () => {
    try {
      if (isGuest) {
        localStorage.removeItem("userType");
        navigate("/login");
        return;
      }
      await signOut(auth);
      localStorage.removeItem("userType");
      navigate("/login");
    } catch (error) {
      console.error("Auth Error:", error);
    }
  };

  // ✅ CLICK HANDLER
  const handleLocationClick = () => {
    navigate("/select-outlet");
  };

  return (
    <div className="flex justify-between items-center px-4 pt-4">

      {/* Location */}
      <div
        onClick={handleLocationClick}
        className="flex items-center gap-2 cursor-pointer"
      >
        <MapPinIcon className="w-5 h-5 text-green-600" />

        <div className="flex flex-col">
          <span className="font-semibold text-lg leading-tight">
            {selectedOutlet
              ? outletName
              : "Select Outlet & Table"}
          </span>

          {tableNumber ? (
            <span className="text-xs font-medium text-gray-500">
              Table: {tableNumber}
            </span>
          ) : (
            selectedOutlet && (
              <span className="text-xs text-red-500">
                Select Table
              </span>
            )
          )}
        </div>
      </div>

      {/* Auth */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleAuthAction}
          className="text-sm font-medium text-red-600 hover:underline"
        >
          {isGuest ? "Login" : "Logout"}
        </button>

        {!isGuest && (
          <div className="w-10 h-10 bg-amber-800 rounded-full"></div>
        )}
      </div>
    </div>
  );
}