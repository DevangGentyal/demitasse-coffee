import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GiftIcon } from "@heroicons/react/24/outline";

// We use a mock customer ID since there is no auth implemented in the frontend
const CUSTOMER_ID = "customer-123";

// Update this API base URL with your deployed Firebase project URL or local emulator URL
// For example: "http://127.0.0.1:5001/your-project-id/us-central1"
// @ts-ignore
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1";

export default function LoyaltyPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/checkRewards?customerId=${CUSTOMER_ID}`)
      .then(res => res.json())
      .then(res => {
        if (res.success) setData(res);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching loyalty data:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-4 pt-8">
      <h1 className="text-2xl font-bold mb-6">Loyalty Dashboard</h1>
      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded-2xl"></div>
          <div className="h-40 bg-gray-200 rounded-2xl"></div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Points Card */}
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100 space-y-2 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-5">
               <GiftIcon className="w-24 h-24" />
             </div>
             <h2 className="text-gray-500 font-medium">Points Balance</h2>
             <div className="text-5xl font-bold text-green-600">{data.pointsBalance}</div>
          </div>
          
          {/* Coffee Progress Card */}
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100 space-y-4">
             <h2 className="font-semibold text-lg">Coffee Progress</h2>
             <div className="flex gap-2 h-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div 
                    key={i} 
                    className={`flex-1 rounded-full ${i <= data.coffeeProgress.current ? 'bg-amber-600' : 'bg-gray-100'}`}
                  ></div>
                ))}
             </div>
             <div>
               <p className="text-sm font-medium text-gray-800">
                 {data.coffeeProgress.current} / 5 coffees
               </p>
               <p className="text-sm text-gray-500">
                 {data.coffeeProgress.remaining > 0 
                    ? `${data.coffeeProgress.remaining} coffees away from free pizza!` 
                    : "You have earned a free pizza!"}
               </p>
             </div>
          </div>

          {/* Available Rewards */}
          {data.availableRewards && data.availableRewards.length > 0 && (
            <div className="p-6 bg-amber-50 rounded-2xl border border-amber-200 space-y-3">
               <h2 className="font-semibold text-lg text-amber-900">Your Rewards</h2>
               <div className="space-y-2">
                 {data.availableRewards.map((reward: any) => (
                   <div key={reward.id} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-amber-100">
                     <div className="p-2 bg-amber-100 rounded-lg text-amber-700">
                       <GiftIcon className="w-6 h-6" />
                     </div>
                     <span className="font-medium capitalize text-amber-900">
                       {reward.type.replace('_', ' ')}
                     </span>
                   </div>
                 ))}
               </div>
            </div>
          )}

          <button 
             onClick={() => navigate("/redeem")}
             className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold shadow-md transition-colors"
          >
             Redeem Rewards
          </button>
        </div>
      ) : (
        <div className="p-6 bg-red-50 text-red-600 rounded-2xl border border-red-200">
          <p>Could not load loyalty data. Ensure the backend functions are running and API_BASE is correct.</p>
        </div>
      )}
    </div>
  );
}
