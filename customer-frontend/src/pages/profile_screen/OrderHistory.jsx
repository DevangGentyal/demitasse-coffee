import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import OrderHistoryCard from "../../components/profile/OrderHistoryCard";
import EmptyOrders from "../../components/profile/EmptyOrders";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

const toDate = (value) => {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") {
    try { return value.toDate(); } catch { return new Date(0); }
  }
  if (value?.seconds) return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

export default function OrderHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      const uid = user?.uid || auth.currentUser?.uid;
      if (!uid) {
        setLoading(false);
        return;
      }

      try {
        const historyQuery = query(
          collection(db, "ordersHistory"),
          where("ownerId", "==", uid)
        );
        const snapshot = await getDocs(historyQuery);

        if (!isMounted) return;

        const rows = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((order) => {
            // Only show orders with items
            const items = Array.isArray(order.items) ? order.items : [];
            return items.length > 0;
          })
          .sort((a, b) => {
            const dateA = toDate(a.closedAt || a.archivedAt || a.createdAt);
            const dateB = toDate(b.closedAt || b.archivedAt || b.createdAt);
            return dateB.getTime() - dateA.getTime();
          });

        setOrders(rows);
      } catch (err) {
        console.error("Failed to fetch order history:", err);
        if (isMounted) {
          setError(
            err?.code === "permission-denied"
              ? "You don't have permission to view order history."
              : "Failed to load order history. Please try again."
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrders();
    return () => { isMounted = false; };
  }, [user]);

  const handleViewDetails = (order) => {
    navigate(`/profile/orders/${order.id}`, { state: { order } });
  };

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate("/profile")}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
          >
            <ArrowLeftIcon className="w-5 h-5 text-gray-700" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#3e2723]">Order History</h1>
            {!loading && orders.length > 0 && (
              <p className="text-[11px] text-gray-500">
                {orders.length} order{orders.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-5">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-3 border-[#8B4513] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-500">Loading orders...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 text-center">
            <p className="text-sm text-red-700 mb-3">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs font-semibold text-red-600 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && orders.length === 0 && <EmptyOrders />}

        {/* Orders list */}
        {!loading && !error && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map((order) => (
              <OrderHistoryCard
                key={order.id}
                order={order}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
