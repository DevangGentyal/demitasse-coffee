import Home from "@/pages/home_screen/Home";
import BottomNav from "@/components/BottomNav";
import Menu from "./pages/menu_screen/Menu";


export default function App() {
  return (
    <div className="min-h-screen bg-[#f4efe9] max-w-md mx-auto">
     <Menu />
      <BottomNav />
    </div>
  );
}
