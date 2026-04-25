import offerImg from "@/assets/home_screen/offer.png";
import { useOffers } from "../../context/OfferContext";
import { useNavigate } from "react-router-dom";
import { useRef, useState } from "react";

// 🎨 Reusable guest popup
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

export default function OfferCard() {
  const { offers } = useOffers();
  // Show all active offers on home page — same for guests and logged-in users
  const allOffers = offers.filter((o) => o.isActive);
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const [showPopup, setShowPopup] = useState(false);

  if (!allOffers.length) return null;

  const handleCardClick = () => {
    const isGuest = localStorage.getItem("userType") === "guest";
    if (isGuest) {
      setShowPopup(true);
      return;
    }
    navigate(`/offers`);
  };

  const handleLogin = () => {
    setShowPopup(false);
    localStorage.removeItem("userType");
    navigate("/login");
  };

  return (
    <>
      <div className="mx-4 mt-5">
        <div
          className="flex gap-4 overflow-x-auto scrollbar-hide"
          ref={scrollRef}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {allOffers.map((offer) => (
            <div
              key={offer.id}
              className="min-w-[270px] bg-gradient-to-r from-amber-900 to-amber-600 rounded-2xl p-4 text-white flex justify-between cursor-pointer hover:scale-105 transition-transform duration-200"
              onClick={handleCardClick}
            >
              <div>
                <h2 className="font-bold text-lg">{offer.title}</h2>
                <p className="text-sm opacity-80 mt-1 line-clamp-2">
                  {offer.description}
                </p>
                <button className="mt-3 bg-white text-black px-4 py-2 rounded-full text-sm font-medium">
                  BUY NOW
                </button>
              </div>
              <img src={offerImg} alt="offer" className="h-24 ml-2" />
            </div>
          ))}
        </div>
      </div>

      <GuestOfferPopup
        visible={showPopup}
        onLogin={handleLogin}
        onClose={() => setShowPopup(false)}
      />
    </>
  );
}
