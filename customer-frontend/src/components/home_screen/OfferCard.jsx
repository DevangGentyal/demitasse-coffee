import offerImg from "@/assets/home_screen/offer.png";
import { useOffers } from "../../context/OfferContext";
import { useNavigate } from "react-router-dom";
import { useRef } from "react";

export default function OfferCard() {
  const { filteredOffers } = useOffers();
  const trendingOffers = filteredOffers?.trendingOffers || [];
  const navigate = useNavigate();
  const scrollRef = useRef(null);

  if (!trendingOffers.length) return null;

  const handleCardClick = () => {
    const isGuest = localStorage.getItem("userType") === "guest";
    if (isGuest) {
      if (window.confirm("Offers are exclusive for members. Login or Register to unlock!")) {
        localStorage.removeItem("userType");
        navigate("/login");
      }
      return;
    }
    navigate(`/offers`);
  };

  return (
    <div className="mx-4 mt-5">
      <div
        className="flex gap-4 overflow-x-auto scrollbar-hide"
        ref={scrollRef}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {trendingOffers.map((offer) => (
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
  );
}
