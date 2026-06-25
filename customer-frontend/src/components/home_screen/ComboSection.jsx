import React from "react";
import { useNavigate } from "react-router-dom";
import { useOffers } from "../../context/OfferContext";
import defaultComboImg from "@/assets/home_screen/offer.png";

export default function ComboSection() {
  const { offers } = useOffers();
  const navigate = useNavigate();

  // Filter combo offers from context
  const comboOffers = offers.filter(
    (o) =>
      o.isActive &&
      String(o.offerType || o.type || "").toUpperCase() === "COMBO"
  );

  if (comboOffers.length === 0) return null;

  const handleComboClick = () => {
    navigate("/menu", { state: { category: "Combos" } });
  };

  return (
    <div className="mt-8 px-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-extrabold text-[#3e2723] tracking-tight">
          Perfect Combos
        </h2>
      </div>

      <div
        className="flex gap-4 overflow-x-auto scrollbar-hide py-1 snap-x snap-mandatory"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {comboOffers.map((combo) => {
          // Resolve price from combo config or discount value
          let price = 0;
          if (combo.config?.combo && !Array.isArray(combo.config.combo)) {
            price = combo.config.combo.comboPrice || 0;
          } else if (combo.discountValue) {
            price = combo.discountValue;
          }

          return (
            <div
              key={combo.id}
              onClick={handleComboClick}
              className="relative flex-shrink-0 w-[340px] h-[200px] rounded-[28px]
        shadow-2xl
        shadow-stone-300/40
        snap-start cursor-pointer
        transition-all duration-300 hover:-translate-y-1
        hover:shadow-[0_16px_40px_-4px_rgba(62,39,35,0.25)]"
            >
              {/* Inner Card */}
              <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-gray-100 bg-gradient-to-br from-white via-[#FCFCFC] to-[#F7F7F7]">

                {/* Product Image */}
                <img
                  src={combo.imageUrl || defaultComboImg}
                  alt={combo.title}
                  onError={(e) => (e.target.src = defaultComboImg)}
                  className="absolute right-0 bottom-0 h-[175px] w-[175px] object-contain opacity-90 pointer-events-none select-none"
                />

                {/* Left Fade */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.92) 30%, rgba(255,255,255,0.45) 60%, rgba(255,255,255,0) 85%)",
                  }}
                />

                {/* Badge */}
                <div className="absolute top-4 right-4 z-10 rounded-full bg-[#3B2418] px-3 py-1 text-[10px] font-bold text-white">
                  COMBO
                </div>

                {/* Content */}
                <div className="relative z-10 flex h-full flex-col p-5 w-[100%]">
                  <div>
                    <h3 className="text-[20px] font-black leading-tight text-[#2A1B15]">
                      {combo.title}
                    </h3>

                    <p className="mt-2 text-xs leading-5 text-gray-500 line-clamp-2">
                      {combo.description}
                    </p>
                  </div>

                  {/* Bottom */}
                  <div className="mt-auto w-[100%] ">
                    <div>
                      <p className="text-[11px] text-gray-500">
                        Starting from
                      </p>

                      <h2 className="mt-1 text-[30px] font-black leading-none text-[#2A1B15]">
                        ₹{price}
                      </h2>
                    </div>

                    <div className="flex justify-start w-[100%] bottom-4 pt-5">
                      <button
                        className="rounded-full
      bg-[#2F1E17]
      px-6 py-2.5
      text-sm font-semibold text-white
      drop-shadow-[0_5px_10px_rgba(62,39,35,0.35)]
      transition-all duration-200
      hover:bg-[#20140F]"
                      >
                        Order
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
