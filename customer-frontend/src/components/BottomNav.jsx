import {
  HomeIcon,
  HeartIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";

export default function BottomNav() {
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#f4efe9] border-t z-50">
      <div className="flex justify-around items-center py-3">
        <NavItem label="Home">
          <HomeIcon className="w-7 h-7" />
        </NavItem>

        <NavItem label="Fav">
          <HeartIcon className="w-7 h-7" />
        </NavItem>

        <NavItem label="Cart">
          <ShoppingCartIcon className="w-7 h-7" />
        </NavItem>
      </div>
    </div>
  );
}

function NavItem({ children, label }) {
  return (
    <button className="flex flex-col items-center text-gray-700">
      {children}
      <span className="text-xs mt-1">{label}</span>
    </button>
  );
}
