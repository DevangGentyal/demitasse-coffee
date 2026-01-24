import { useLocation, useNavigate } from "react-router-dom";

const BillDetails = () => {
  const navigate = useNavigate();
  const { state } = useLocation();

  if (!state) {
    return (
      <div className="p-4">
        <p>No bill data available.</p>
        <button
          onClick={() => navigate("/cart")}
          className="text-orange-600 underline"
        >
          Go Back
        </button>
      </div>
    );
  }

  const { items, itemTotal, tax, grandTotal } = state;

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto p-4">
      <h2 className="text-lg font-semibold mb-4">Detailed Bill</h2>

      <div className="bg-white rounded-2xl p-4 shadow-md space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex justify-between text-sm"
          >
            <span>
              {item.name} × {item.qty}
            </span>
            <span>₹{item.price * item.qty}</span>
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

      <button
        onClick={() => navigate(-1)}
        className="mt-4 w-full bg-orange-500 text-white py-3 rounded-full"
      >
        Back to Cart
      </button>
    </div>
  );
};

export default BillDetails;
