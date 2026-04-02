import { useLocation, useNavigate } from "react-router-dom";

const BillDetails = () => {

  const navigate = useNavigate();
  const { state } = useLocation();

  const handleBack = () => {
    navigate("/cart"); // ✅ always go to cart
  };

  if (!state) {
    return <div className="p-4">No bill data</div>;
  }

  const { items, itemTotal, tax, grandTotal } = state;

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto">

      {/* 🔹 HEADER */}
      <div className="flex items-center gap-3 p-4 bg-white shadow-sm">

        <button
          onClick={handleBack}
          className="text-xl"
        >
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

              {/* Variations */}
              {Object.values(item.variation || {}).map((v, i) => (
                <div key={i} className="text-xs text-gray-500 ml-2">
                  • {v}
                </div>
              ))}

              {/* Add-ons */}
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

          <hr />

          <div className="flex justify-between font-semibold text-lg">
            <span>Grand Total</span>
            <span>₹{grandTotal}</span>
          </div>

        </div>

      </div>

    </div>
  );
};

export default BillDetails;