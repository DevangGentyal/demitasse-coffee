import offerImg from "@/assets/home_screen/offer.png";
import { useOffers } from "../../context/OfferContext";
import { useNavigate } from "react-router-dom";
import { useRef, useState, useEffect } from "react";

export default function OfferCard() {
  const { offers } = useOffers();
  const allOffers = offers.filter((o) => o.isActive);
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const [showPopup, setShowPopup] = useState(false);

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
  // Auto-scroll one full card at a time, pause for 1s, then move to next.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let idx = 0;
    let cards = el.querySelectorAll('.offer-card');
    if (!cards.length) return;

    const total = cards.length;

    let running = true;
    let timer = null;

    const scrollToIndex = (i) => {
      // recompute step in case of layout changes
      cards = el.querySelectorAll('.offer-card');
      const gap = 16;
      const step = (cards[0]?.offsetWidth || el.clientWidth) + gap;
      el.scrollTo({ left: Math.round(i * step), behavior: 'smooth' });
    };

    const advance = () => {
      if (!running) return;
      idx = (idx + 1) % total;
      scrollToIndex(idx);
      // pause of 1s before next advance handled by interval below
    };

    // Start immediately showing first card
    scrollToIndex(0);

    timer = setInterval(advance, 2000); // every 2s: ~1s visible + smooth movement

    const onEnter = () => { running = false; };
    const onLeave = () => { running = true; };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);

    return () => {
      clearInterval(timer);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [allOffers.length]);

  if (!allOffers.length) return null;

  try {
    return (
      <>
        <div className="mx-4 mt-5">
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide px-1"
            style={{ WebkitOverflowScrolling: 'touch', scrollSnapType: 'x mandatory' }}
          >
            {allOffers.map((offer) => (
              <div
                key={offer.id}
                className="offer-card min-w-[260px] h-40 flex-shrink-0 bg-gradient-to-r from-amber-900 to-amber-600 rounded-2xl p-4 text-white flex justify-between cursor-pointer hover:scale-105 transition-transform duration-200 scroll-snap-align:center"
                onClick={handleCardClick}
              >
                <div className="flex-1 pr-2">
                  <h2 className="font-bold text-lg">{offer.title}</h2>
                  <p className="text-sm opacity-80 mt-1 line-clamp-2">{offer.description}</p>
                  <button className="mt-3 bg-white text-black px-4 py-2 rounded-full text-sm font-medium">BUY NOW</button>
                </div>
                <img src={offerImg} alt="offer" className="h-24 ml-2" />
              </div>
            ))}
          </div>
        </div>

        {/* Guest popup kept simple inline to avoid missing import issues */}
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
      </>
    );
  } catch (err) {
    console.error("OfferCard render error:", err);
    return null;
  }
}
