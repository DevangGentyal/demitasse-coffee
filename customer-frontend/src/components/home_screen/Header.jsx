import { MapPinIcon } from "@heroicons/react/24/solid";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useNavigate } from "react-router-dom";
import { useLocationContext } from "../../context/LocationContext";

export default function Header() {
  const navigate = useNavigate();
  const isGuest = localStorage.getItem("userType") === "guest";
  const { outletName, tableNumber } = useLocationContext();

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

  return (
    <div className="flex justify-between items-center px-4 pt-4">

      {/* Location */}
      <div className="flex items-center gap-2">
        <MapPinIcon className="w-5 h-5 text-green-600" />
        <div className="flex flex-col">
          <span className="font-semibold text-lg leading-tight">
            {outletName ? `${outletName}` : "Select Outlet"}
          </span>
        </div>
      </div>

      {/* Profile + Auth Action */}
      <div className="flex items-center gap-3">

        {/* Auth Hyperlink */}
        <button
          onClick={handleAuthAction}
          className={`text-sm font-medium hover:underline ${isGuest ? 'text-red-600' : 'text-red-600'}`}
        >
          {isGuest ? "Login" : "Logout"}
        </button>

        {/* Profile Circle */}
        {!isGuest && (
          <div className="w-10 h-10 bg-amber-800 rounded-full"></div>
        )}

      </div>

    </div>
  );
}