import { PlusIcon } from "@heroicons/react/24/solid";
import { useNavigate } from "react-router-dom";

export default function ProductCard({
  id,
  image,
  name,
  desc,
  price,
}) {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-3xl p-4 shadow-md">

      <div className="bg-gray-100 rounded-2xl flex items-center justify-center h-44 w-full overflow-hidden">
        {image && !image.includes("placeholder") ? (
          <img
            src={image}
            alt={name}
            className="h-54 w-54 object-contain"
            loading="lazy"
          />
        ) : null}
      </div>

      <h3 className="mt-3 font-bold text-lg">{name}</h3>

      <p className="text-sm text-gray-500">{desc}</p>

      <div className="flex items-center justify-between mt-3">
        <span className="font-bold text-lg">₹{price}</span>

        <button
          onClick={() => navigate(`/item/${id}`)}
          className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center"
        >
          <PlusIcon className="w-6 h-6 text-white" />
        </button>
      </div>

    </div>
  );
}