import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

export default function SearchBar({ onChange }) {
  return (
    <div className="px-4 mt-4">
      <div className="flex items-center gap-2 bg-white rounded-full shadow-md px-4 py-3">
        <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />

        <input
          placeholder="Search"
          className="w-full outline-none text-sm"
          onChange={(e) => onChange?.(e.target.value)}
        />
      </div>
    </div>
  );
}