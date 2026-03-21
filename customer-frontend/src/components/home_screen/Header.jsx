import { MapPinIcon } from "@heroicons/react/24/solid";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useNavigate } from "react-router-dom";

export default function Header() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  return (
    <div className="flex justify-between items-center px-4 pt-4">
      
      {/* Location */}
      <div className="flex items-center gap-2">
        <MapPinIcon className="w-5 h-5 text-green-600" />
        <span className="font-semibold text-lg">Baner, Pune</span>
      </div>

      {/* Profile + Logout */}
      <div className="flex items-center gap-3">
        
        {/* Logout Hyperlink */}
        <button
          onClick={handleLogout}
          className="text-sm text-red-600 hover:underline font-medium"
        >
          Logout
        </button>

        {/* Profile Circle */}
        <div className="w-10 h-10 bg-amber-800 rounded-full"></div>

      </div>

    </div>
  );
}