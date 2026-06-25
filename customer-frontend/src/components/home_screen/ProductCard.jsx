import { useNavigate } from "react-router-dom";

export default function ProductCard({
  id,
  image,
  name,
  price,
  isAvailable = true,
}) {
  const navigate = useNavigate();

  const handleCardClick = () => {
    if (isAvailable) {
      navigate(`/item/${id}`);
    }
  };

  return (
    <div
      className={`bg-white rounded-3xl p-4 shadow-md flex flex-col ${
        !isAvailable ? "grayscale opacity-50 cursor-not-allowed" : ""
      }`}
    >
      {/* Image — fixed height so all cards are even */}
      <div
        className={`bg-gray-100 rounded-2xl flex items-center justify-center h-44 w-full overflow-hidden flex-shrink-0 ${
          isAvailable ? "cursor-pointer" : ""
        }`}
        onClick={handleCardClick}
      >
        {image && !image.includes("placeholder") ? (
          <img
            src={image}
            alt={name}
            className="w-full h-full object-contain scale-[1.8]"
            loading="lazy"
          />
        ) : null}
      </div>

      {/* Name — smaller font, 2-line clamp for consistent height */}
      <h3
        className="mt-3 font-bold text-sm leading-snug line-clamp-2 min-h-[40px] cursor-pointer"
        onClick={handleCardClick}
      >
        {name}
      </h3>

      {/* Price */}
      <div className="flex items-center justify-between mt-3">
        <span className="font-bold text-base">₹{price}</span>
        {!isAvailable && (
          <span className="text-red-500 text-xs font-bold tracking-tight">
            Unavailable
          </span>
        )}
      </div>
    </div>
  );
}