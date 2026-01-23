import { PlusIcon } from "@heroicons/react/24/solid";

export default function ProductCard({
  image,
  name,
  desc,
  price,
  onAdd,
}) {
  return (
    <div className="bg-white rounded-3xl p-4 shadow-md">
      <div className="bg-gray-100 rounded-2xl p-3 flex justify-center">
        <img
          src={image}
          alt={name}
          className="h-36 object-contain"
        />
      </div>

      <h3 className="mt-3 font-bold text-lg">{name}</h3>
      <p className="text-sm text-gray-500">{desc}</p>

      <div className="flex items-center justify-between mt-3">
        <span className="font-bold text-lg">₹{price}</span>

        <button
          onClick={() =>
            onAdd?.({ image, name, desc, price })
          }
          className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center"
        >
          <PlusIcon className="w-6 h-6 text-white" />
        </button>
      </div>
    </div>
  );
}
