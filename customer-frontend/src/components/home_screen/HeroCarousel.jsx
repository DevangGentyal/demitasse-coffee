import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useOffers } from "../../context/OfferContext";
import offerImg from "@/assets/home_screen/offer.png";

export default function HeroCarousel() {
  const { offers } = useOffers();
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showPopup, setShowPopup] = useState(false);

  // Filter and map actual active offers from context
  const activeOffers = offers.filter((o) => o.isActive);
  const totalBanners = activeOffers.length;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || totalBanners <= 1) return;

    let timer;
    const autoScroll = () => {
      const nextIndex = (activeIndex + 1) % totalBanners;
      const cardWidth = el.clientWidth;
      el.scrollTo({
        left: nextIndex * cardWidth,
        behavior: "smooth"
      });
      setActiveIndex(nextIndex);
    };

    timer = setInterval(autoScroll, 4500);

    return () => clearInterval(timer);
  }, [activeIndex, totalBanners]);

  const handleScroll = (e) => {
    const el = e.currentTarget;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== activeIndex && index >= 0 && index < totalBanners) {
      setActiveIndex(index);
    }
  };

  const handleBannerClick = () => {
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

  if (totalBanners === 0) return null;

  return (
    <div className="relative mx-4 mt-5 group">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto scrollbar-hide snap-x snap-mandatory rounded-2xl"
        style={{ WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory" }}
      >
        {activeOffers.map((offer) => (
          <div
            key={offer.id}
            onClick={handleBannerClick}
            className="w-full flex-shrink-0 snap-center relative overflow-hidden bg-gradient-to-br from-[#4E3629] to-[#2A1B15] h-44 p-6 flex flex-col justify-between text-white cursor-pointer select-none"
          >
            {/* Background patterns */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#AE7A65]/10 rounded-full blur-2xl transform translate-x-10 -translate-y-10" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-amber-600/10 rounded-full blur-3xl" />
            
            <div className="relative flex justify-between h-full w-full">
              <div className="flex-1 flex flex-col justify-between pr-2 z-10">
                <div>
                  <span className="text-[10px] tracking-widest uppercase bg-[#AE7A65] text-white px-2 py-0.5 rounded-full font-bold">
                    PROMO
                  </span>
                  <h2 className="font-extrabold text-xl mt-2 leading-tight drop-shadow-md line-clamp-1">
                    {offer.title}
                  </h2>
                  <p className="text-xs text-amber-100/80 mt-1 line-clamp-2 leading-snug">
                    {offer.description}
                  </p>
                </div>
                <div>
                  <button className="bg-white text-[#2A1B15] font-bold text-xs px-4 py-2 rounded-xl shadow-md hover:bg-amber-100 transition active:scale-95">
                    BUY NOW
                  </button>
                </div>
              </div>

              <div className="w-28 h-28 flex items-center justify-center self-center relative z-10">
                <img
                  src={offer.imageurl || offer.imageUrl || offerImg}
                  alt={offer.title}
                  className="w-full h-full object-contain rounded-xl shadow-lg border-2 border-white/20 transform rotate-3"
                  onError={(e) => {
                    e.target.src = offerImg;
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dot Indicators */}
      {totalBanners > 1 && (
        <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex gap-1.5 z-20">
          {activeOffers.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                const el = scrollRef.current;
                if (el) {
                  el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
                  setActiveIndex(idx);
                }
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                activeIndex === idx ? "w-4 bg-white" : "w-1.5 bg-white/50"
              }`}
            />
          ))}
        </div>
      )}

      {/* Guest member popup */}
      {showPopup && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}
          onClick={() => setShowPopup(false)}
        >
          <div
            className="w-full max-w-[420px] bg-white rounded-t-3xl px-6 pt-5 pb-10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center text-3xl shadow-sm">🎁</div>
            </div>
            <h2 className="text-xl font-bold text-gray-800 text-center mb-1">Members Only Offer</h2>
            <p className="text-sm text-gray-500 text-center leading-relaxed mb-6">Login or create an account to unlock exclusive deals, combos & special discounts.</p>
            <button onClick={handleLogin} className="w-full py-3 bg-green-600 text-white font-bold rounded-xl shadow-md hover:bg-green-700 active:scale-95 transition mb-3">Login / Register</button>
            <button onClick={() => setShowPopup(false)} className="w-full py-3 bg-gray-100 text-gray-600 font-semibold rounded-xl hover:bg-gray-200 active:scale-95 transition">Maybe Later</button>
          </div>
        </div>
      )}
    </div>
  );
}
