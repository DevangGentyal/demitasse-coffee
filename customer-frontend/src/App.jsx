import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

import Home from "@/pages/home_screen/Home";
import Menu from "@/pages/menu_screen/Menu";
import Offers from "@/pages/offer_screen/Offers";
import Cart from "@/pages/cart_screen/Cart";
import ItemDetails from "@/pages/itemDetails_screen/ItemDetails";
import BillDetails from "@/pages/cart_screen/BillDetails";

import BottomNav from "@/components/BottomNav";

import { CartProvider } from "@/context/CartContext";
import { MenuProvider } from "@/context/MenuContext";


function Layout() {

  const location = useLocation();

  const hideNav =
    location.pathname.startsWith("/item") ||
    location.pathname.startsWith("/bill");

  return (

    <div className="min-h-screen bg-[#f4efe9] max-w-md mx-auto pb-24">

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Home />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/offers" element={<Offers />} />
        <Route path="/item/:id" element={<ItemDetails />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/bill" element={<BillDetails />} />
      </Routes>

      {!hideNav && <BottomNav />}

    </div>

  );

}


export default function App() {

  return (

    <BrowserRouter>

      <MenuProvider>

        <CartProvider>

          <Layout />

        </CartProvider>

      </MenuProvider>

    </BrowserRouter>

  );

}