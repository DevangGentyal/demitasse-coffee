import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";

// 🎨 Guest popup — same style as OfferCard
function GuestOfferPopup({ visible, onLogin, onClose }) {
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] bg-white rounded-t-3xl px-6 pt-5 pb-10 shadow-2xl"
        style={{ animation: "slideUp 0.3s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center text-3xl shadow-sm">
            🎁
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-800 text-center mb-1">
          Members Only Offer
        </h2>
        <p className="text-sm text-gray-500 text-center leading-relaxed mb-6">
          Login or create an account to unlock exclusive deals, combos & special discounts.
        </p>
        <button
          onClick={onLogin}
          className="w-full py-3 bg-green-600 text-white font-bold rounded-xl shadow-md hover:bg-green-700 active:scale-95 transition mb-3"
        >
          Login / Register
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 bg-gray-100 text-gray-600 font-semibold rounded-xl hover:bg-gray-200 active:scale-95 transition"
        >
          Maybe Later
        </button>
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function MenuOfferTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPopup, setShowPopup] = useState(false);

  const active =
    location.pathname === "/offers" ? "OFFERS" : "MENU";

  const handleOffersClick = () => {
    const isGuest = localStorage.getItem("userType") === "guest";
    if (isGuest) {
      setShowPopup(true);
      return;
    }
    navigate("/offers");
  };

  const handleLogin = () => {
    setShowPopup(false);
    localStorage.removeItem("userType");
    navigate("/login");
  };

  return (
    <>
      <div className="flex gap-4 px-4 mt-6">
        <button
          onClick={() => navigate("/menu")}
          className={`flex-1 py-3 rounded-full font-medium transition
            ${
              active === "MENU"
                ? "bg-black text-white"
                : "bg-[#AE7A65] text-white"
            }`}
        >
          MENU
        </button>

        <button
          onClick={handleOffersClick}
          className={`flex-1 py-3 rounded-full font-medium transition
            ${
              active === "OFFERS"
                ? "bg-black text-white"
                : "bg-[#AE7A65] text-white"
            }`}
        >
          OFFERS
        </button>
      </div>

      <GuestOfferPopup
        visible={showPopup}
        onLogin={handleLogin}
        onClose={() => setShowPopup(false)}
      />
    </>
  );
}
