import { MapPinIcon } from "@heroicons/react/24/solid";

export default function Header() {
  return (
    <div className="flex justify-between items-center px-4 pt-4">
      <div className="flex items-center gap-2">
        <MapPinIcon className="w-5 h-5 text-green-600" />
        <span className="font-semibold text-lg">Baner, Pune</span>
      </div>

      <div className="w-10 h-10 bg-amber-800 rounded-full" />
    </div>
  );
}
