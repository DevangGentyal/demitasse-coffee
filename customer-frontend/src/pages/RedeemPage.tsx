import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftIcon, GiftIcon } from "@heroicons/react/24/outline";

// We use a mock customer ID since there is no auth implemented in the frontend
const CUSTOMER_ID = "customer-123";

// Update this API base URL with your deployed Firebase project URL or local emulator URL
// @ts-ignore
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1";

export default function RedeemPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  useEffect(() => {
    fetchRewards();
  }, []);

  const fetchRewards = () => {
    setLoading(true);
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
  };

  const redeemProduct = async (productId: string) => {
    setRedeeming(`product-${productId}`);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/redeemReward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: CUSTOMER_ID, productId })
      });
      const result = await res.json();
      
      if (result.success) {
        setMessage({ type: 'success', text: `Successfully redeemed! Discount: $${result.discountAmount}` });
        fetchRewards(); // Refresh points balance and items
      } else {
        setMessage({ type: 'error', text: result.message || "Failed to redeem reward" });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: "Network error occurred." });
    } finally {
      setRedeeming(null);
    }
  };

  const redeemFreeReward = async (rewardId: string) => {
    setRedeeming(`reward-${rewardId}`);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/redeemReward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: CUSTOMER_ID, rewardId })
      });
      const result = await res.json();
      
      if (result.success) {
        setMessage({ type: 'success', text: `Successfully redeemed reward! Discount: ${result.discountAmount}` });
        fetchRewards(); // Refresh rewards
      } else {
        setMessage({ type: 'error', text: result.message || "Failed to redeem reward" });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: "Network error occurred." });
    } finally {
      setRedeeming(null);
    }
  };

  return (
    <div className="p-4 pt-8">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 bg-white rounded-full shadow-sm">
          <ArrowLeftIcon className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-2xl font-bold">Redeem Rewards</h1>
      </div>

      {message && (
        <div className={`p-4 mb-6 rounded-xl border ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {loading && !data ? (
        <div className="animate-pulse space-y-4">
          <div className="h-24 bg-gray-200 rounded-2xl"></div>
          <div className="h-24 bg-gray-200 rounded-2xl"></div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          
          <div className="flex justify-between items-end pb-2 border-b border-gray-200">
            <span className="text-gray-500 font-medium">Your Points</span>
            <span className="text-2xl font-bold text-green-600">{data.pointsBalance}</span>
          </div>

          {/* Special Rewards (Free Items) */}
          {data.availableRewards?.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-lg text-amber-800">Special Rewards</h2>
              {data.availableRewards.map((reward: any) => (
                <div key={reward.id} className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg text-amber-700">
                      <GiftIcon className="w-6 h-6" />
                    </div>
                    <span className="font-semibold capitalize text-amber-900">{reward.type.replace('_', ' ')}</span>
                  </div>
                  <button 
                    onClick={() => redeemFreeReward(reward.id)}
                    disabled={redeeming !== null}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white rounded-lg font-medium text-sm transition-colors"
                  >
                    {redeeming === `reward-${reward.id}` ? 'Redeeming...' : 'Claim'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Points Redeemable Products */}
          <div className="space-y-3">
            <h2 className="font-semibold text-lg">Redeemable Items</h2>
            {data.redeemableProducts?.length === 0 && (
              <p className="text-gray-500 text-sm">You don't have enough points for any items yet.</p>
            )}
            
            <div className="grid gap-3">
              {data.redeemableProducts?.map((product: any) => (
                <div key={product.productId} className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{product.name}</h3>
                      <p className="text-sm text-gray-500">${product.price.toFixed(2)} value</p>
                    </div>
                    <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-md">
                      {product.pointsRequired} pts
                    </span>
                  </div>
                  <button
                    onClick={() => redeemProduct(product.productId)}
                    disabled={redeeming !== null || data.pointsBalance < product.pointsRequired}
                    className="w-full py-2 bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 rounded-xl font-medium text-sm transition-colors"
                  >
                    {redeeming === `product-${product.productId}` ? 'Redeeming...' : 'Use Points'}
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>
      ) : (
        <p className="text-red-500">Could not load rewards.</p>
      )}
    </div>
  );
}
