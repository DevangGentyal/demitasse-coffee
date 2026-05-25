import { useNavigate } from "react-router-dom";

export default function EmptyOrders() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      {/* Icon */}
      <div className="w-24 h-24 bg-[#8B4513]/10 rounded-full flex items-center justify-center mb-6">
        <svg className="w-12 h-12 text-[#8B4513]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      </div>

      <h3 className="text-lg font-bold text-[#3e2723] mb-2">
        No Previous Orders Yet
      </h3>
      <p className="text-sm text-gray-500 text-center mb-8 max-w-[260px]">
        Your order history will appear here once you place your first order.
      </p>

      <button
        onClick={() => navigate("/menu")}
        className="bg-[#8B4513] text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-[#8B4513]/20 hover:bg-[#A0522D] active:scale-95 transition-all"
      >
        Start Ordering ☕
      </button>
    </div>
  );
}
