import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
// 1. Added 'startAfter' to imports
import { collection, query, where, getDocs, orderBy, limit, startAfter } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import OrderHistoryCard from "../../components/profile/OrderHistoryCard";
import EmptyOrders from "../../components/profile/EmptyOrders";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useLocationContext } from "../../context/LocationContext";

export default function OrderHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false); // Track loading state for pagination
  const [error, setError] = useState("");
  const [lastDoc, setLastDoc] = useState(null); // Keeps track of the last visible Firestore document snapshot
  const [hasMore, setHasMore] = useState(true); // Tracks if there are more orders left to fetch
  const { selectedOutlet } = useLocationContext();

  const ORDERS_LIMIT = 5;

  // Initial fetch function
  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      const uid = user?.uid || auth.currentUser?.uid;
      if (!uid || !selectedOutlet) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const historyQuery = query(
          collection(db, "outlets", selectedOutlet, "orders"),
          where("customerId", "==", uid),
          orderBy("createdAt", "desc"),
          limit(ORDERS_LIMIT)
        );

        const snapshot = await getDocs(historyQuery);

        if (!isMounted) return;

        // Capture the raw last document snapshot for the cursor
        if (snapshot.docs.length > 0) {
          setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
          // If we fetched fewer items than the limit, we know there are no more records left
          setHasMore(snapshot.docs.length === ORDERS_LIMIT);
        } else {
          setHasMore(false);
        }

        const rows = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((order) => {
            const items = Array.isArray(order.items) ? order.items : [];
            return items.length > 0;
          });

        setOrders(rows);
      } catch (err) {
        console.error("Failed to fetch order history:", err);
        if (isMounted) {
          setError("Failed to load order history. Please try again.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrders();
    return () => { isMounted = false; };
  }, [user, selectedOutlet]);

  // Function to load the next 5 orders
  const loadMoreOrders = async () => {
    const uid = user?.uid || auth.currentUser?.uid;
    if (!uid || !selectedOutlet || !lastDoc || loadingMore) return;

    setLoadingMore(true);

    try {
      // Create a query that begins *after* the last document we previously fetched
      const nextQuery = query(
        collection(db, "outlets", selectedOutlet, "orders"),
        where("customerId", "==", uid),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(ORDERS_LIMIT)
      );

      const snapshot = await getDocs(nextQuery);

      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === ORDERS_LIMIT);
      } else {
        setHasMore(false);
      }

      const newRows = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((order) => {
          const items = Array.isArray(order.items) ? order.items : [];
          return items.length > 0;
        });

      // Append new orders to the existing ones
      setOrders((prevOrders) => [...prevOrders, ...newRows]);
    } catch (err) {
      console.error("Failed to fetch more orders:", err);
    } finally {
      setLoadingMore(false);
    }
  };

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
                Showing {orders.length} order{orders.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-5">
        {/* Loading Initial State */}
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

            {/* Load More Button Container */}
            {hasMore && (
              <div className="pt-4 pb-2 text-center">
                <button
                  onClick={loadMoreOrders}
                  disabled={loadingMore}
                  className="w-full py-3 px-4 rounded-2xl bg-white border border-gray-200 text-sm font-semibold text-[#8B4513] shadow-sm hover:bg-gray-50 active:bg-gray-100 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loadingMore ? (
                    <>
                      <div className="w-4 h-4 border-2 border-[#8B4513] border-t-transparent rounded-full animate-spin" />
                      Loading more...
                    </>
                  ) : (
                    "Load More Orders"
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}