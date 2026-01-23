import { useState } from "react";

export default function MenuOfferTabs() {
  const [active, setActive] = useState("MENU");

  return (
    <div className="flex gap-4 px-4 mt-6">
      {["MENU", "OFFERS"].map((tab) => (
        <button
          key={tab}
          onClick={() => setActive(tab)}
          className={`flex-1 py-3 rounded-full font-medium transition
            ${
              active === tab
                ? "bg-black text-white"
                : "bg-[#AE7A65] text-white"
            }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
