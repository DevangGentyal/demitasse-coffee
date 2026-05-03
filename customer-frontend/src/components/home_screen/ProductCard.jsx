import { PlusIcon } from "@heroicons/react/24/solid";
import { useNavigate } from "react-router-dom";

export default function ProductCard({
  id,
  image,
  name,
  desc,
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
    <div className={`bg-white rounded-3xl p-4 shadow-md ${!isAvailable ? 'grayscale opacity-50 cursor-not-allowed' : ''}`}>

      <div className={`bg-gray-100 rounded-2xl flex items-center justify-center h-44 w-full overflow-hidden ${isAvailable ? 'cursor-pointer' : ''}`} onClick={handleCardClick}>
        {image && !image.includes("placeholder") ? (
          <img
            src={image}
            alt={name}
            className="h-54 w-54 object-contain"
            loading="lazy"
          />
        ) : null}
      </div>

      <h3 className="mt-3 font-bold text-lg truncate">{name}</h3>

      <p className="text-sm text-gray-500 line-clamp-2">{desc}</p>

      <div className="flex items-center justify-between mt-3">
        <span className="font-bold text-lg">₹{price}</span>

        <button
          onClick={handleCardClick}
          disabled={!isAvailable}
          className={`${!isAvailable ? 'h-8 px-2 bg-gray-500 rounded-lg' : 'w-10 h-10 bg-green-600 rounded-full'} flex items-center justify-center`}
        >
          {!isAvailable ? (
            <span className="text-white text-xs font-bold tracking-tight">Currently Unavailable</span>
          ) : (
            <PlusIcon className="w-6 h-6 text-white" />
          )}
        </button>
      </div>

    </div>
  );
}