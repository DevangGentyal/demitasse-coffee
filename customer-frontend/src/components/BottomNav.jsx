import {
  HomeIcon,
  HeartIcon,
  ShoppingCartIcon,
  GiftIcon,
} from "@heroicons/react/24/outline";
import { useNavigate, useLocation } from "react-router-dom";

export default function BottomNav() {
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#f4efe9] border-t z-50">
      <div className="flex justify-around items-center py-3">
        
        {/* HOME */}
        <NavItem label="Home" to="/home">
          <HomeIcon className="w-7 h-7" />
        </NavItem>

        {/* LOYALTY */}
        <NavItem label="Loyalty" to="/loyalty">
          <GiftIcon className="w-7 h-7" />
        </NavItem>

        {/* CART */}
        <NavItem label="Cart" to="/cart">
          <ShoppingCartIcon className="w-7 h-7" />
        </NavItem>
      </div>
    </div>
  );
}

function NavItem({ children, label, to }) {
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname === to;

  return (
    <button
      onClick={() => navigate(to)}
      className={`flex flex-col items-center ${
        active ? "text-green-600" : "text-gray-700"
      }`}
    >
      {children}
      <span className="text-xs mt-1">{label}</span>
    </button>
  );
}

function DisabledNavItem({ children, label }) {
  return (
    <button
      disabled
      className="flex flex-col items-center text-gray-400 opacity-60 cursor-not-allowed"
    >
      {children}
      <span className="text-xs mt-1">{label}</span>
    </button>
  );
}
