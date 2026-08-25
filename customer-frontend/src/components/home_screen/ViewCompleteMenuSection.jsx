import React from "react";
import { useNavigate } from "react-router-dom";

export default function ViewCompleteMenuSection() {
  const navigate = useNavigate();

  return (
    <div className="mt-8 px-4 flex flex-col items-center text-center">
      <h2 className="text-xl font-extrabold text-[#3e2723] tracking-tight mb-4">
        Explore Our Complete Menu
      </h2>
      <button
        type="button"
        onClick={() => navigate("/menu")}
        className="rounded-full bg-[#2F1E17] px-8 py-3 text-sm font-semibold text-white cursor-pointer transition-colors hover:bg-[#20140F]"
      >
        View Full Menu
      </button>
    </div>
  );
}
