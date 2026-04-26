import { useNavigate } from "react-router-dom";

const OfferHeader = () => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center px-4 py-4 bg-[#fdfbf9] sticky top-0 z-10">
      <button
        onClick={() => navigate(-1)}
        className="w-9 h-9 flex items-center justify-center bg-white rounded-full text-lg shadow"
      >
        ←
      </button>
      <h2 className="flex-1 text-center text-lg font-semibold mr-9">
        Offers
      </h2>
    </div>
  );
};

export default OfferHeader;
