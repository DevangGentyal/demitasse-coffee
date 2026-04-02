import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { collection, addDoc, doc, updateDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { useLocationContext } from "../../context/LocationContext";

const BillDetails = () => {

  const navigate = useNavigate();
  const { state } = useLocation();
  const userType = localStorage.getItem("userType");
  const { tableNumber, selectedOutlet } = useLocationContext();

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const handleBack = () => {
    navigate("/cart");
  };

  const handleBack = () => {
    navigate("/cart"); // ✅ always go to cart
  };

  if (!state) {
    return <div className="p-4">No bill data</div>;
  }

  const { items, itemTotal, tax, discount, grandTotal } = state;

  // ✅ PLACE ORDER FUNCTION
  const handlePlaceOrder = async () => {
    try {
      if (userType === "guest") {
        if (!guestName || !guestPhone) {
          alert("Please enter Name and Phone to place your order");
          return;
        }

        await addDoc(collection(db, "orders"), {
          userType: "guest",
          name: guestName,
          phone: guestPhone,
          tableNumber: tableNumber || null,
          outletId: selectedOutlet || null,
          items,
          itemTotal,
          tax,
          grandTotal,
          status: "pending",
          createdAt: new Date(),
        });

        alert("Order placed successfully!");
        navigate("/home");
        return;
      }

      const user = auth.currentUser;

      if (!user) {
        alert("User not logged in");
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        alert("User not found");
        return;
      }

      const userData = userSnap.data();

      // 🧾 1. SAVE ORDER
      await addDoc(collection(db, "orders"), {
        userId: user.uid,
        tableNumber: tableNumber || null,
        outletId: selectedOutlet || null,
        items,
        itemTotal,
        tax,
        grandTotal,
        status: "pending",
        createdAt: new Date(),
      });

      // 🎯 2. UPDATE FIRST ORDER FLAG (ONLY IF FIRST TIME)
      if (!userData.hasPlacedFirstOrder) {
        await updateDoc(userRef, {
          hasPlacedFirstOrder: true,
        });
      }

      alert("Order placed successfully!");

      navigate("/home");

    } catch (error) {
      console.error("Order Error:", error);
      alert("Failed to place order");
    }
  };

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto">

      {/* 🔹 HEADER */}
      <div className="flex items-center gap-3 p-4 bg-white shadow-sm">

        <button onClick={handleBack} className="text-xl">
          ←
        </button>

        <h2 className="text-lg font-semibold">
          Detailed Bill
        </h2>

      </div>

      {/* 🔹 CONTENT */}
      <div className="p-4">

        <div className="bg-white rounded-2xl p-4 shadow-md space-y-3">

          {items.map((item, idx) => (

            <div key={idx}>

              <div className="flex justify-between text-sm">
                <span>{item.name} × {item.qty}</span>
                <span>₹{item.price * item.qty}</span>
              </div>

              {Object.values(item.variation || {}).map((v, i) => (
                <div key={i} className="text-xs text-gray-500 ml-2">
                  • {v}
                </div>
              ))}

              {Object.values(item.addons || {}).flat().map((a, i) => (
                <div key={i} className="text-xs text-gray-500 ml-2">
                  + {a}
                </div>
              ))}

            </div>

          ))}

          <hr />

          <div className="flex justify-between text-sm">
            <span>Item Total</span>
            <span>₹{itemTotal}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span>Taxes & Charges</span>
            <span>₹{tax}</span>
          </div>

          {discount > 0 && (
            <div className="flex justify-between text-sm text-green-600 font-medium">
              <span>Total Discount</span>
              <span>-₹{discount}</span>
            </div>
          )}

          <hr />

          <div className="flex justify-between font-semibold text-lg">
            <span>Grand Total</span>
            <span>₹{grandTotal}</span>
          </div>

        </div>

        {/* ✅ LOCATION & TABLE INFO ON BILL */}
        <div className="bg-white rounded-2xl p-4 shadow-md mt-4 text-sm text-gray-700 font-medium space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Outlet</span>
            <span className="text-black font-semibold text-right">{selectedOutlet || "Not selected"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Table Number</span>
            <span className="text-black font-semibold text-right">{tableNumber || "Not selected"}</span>
          </div>
        </div>

        {/* ✅ GUEST FIELDS */}
        {userType === "guest" && (
          <div className="bg-white rounded-2xl p-4 shadow-md mt-4 space-y-3">
            <h3 className="font-semibold text-gray-700">Guest Checkout</h3>
            <input
              type="text"
              placeholder="Your Name (Required)"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-green-400"
            />
            <input
              type="tel"
              placeholder="Phone Number (Required)"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-green-400"
            />
          </div>
        )}

        {/* ✅ PLACE ORDER BUTTON */}
        <button
          onClick={handlePlaceOrder}
          className="w-full mt-6 bg-green-600 text-white py-3 rounded-xl font-semibold"
        >
          Confirm Order
        </button>

      </div>

    </div>
  );
};

export default BillDetails;