import { useNavigate, useLocation } from "react-router-dom";

export default function MenuOfferTabs() {
  const navigate = useNavigate();
  const location = useLocation();

  const active =
    location.pathname === "/offers" ? "OFFERS" : "MENU";

  return (
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
        onClick={() => navigate("/offers")}
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
  );
}
