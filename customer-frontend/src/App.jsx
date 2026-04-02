// src/App.jsx
import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import { useAuth } from "./context/AuthContext";

// Pages
import Login from "./pages/auth_screen/Login";
import Register from "./pages/auth_screen/Register";
import Home from "./pages/home_screen/Home";
import Menu from "./pages/menu_screen/Menu";
import Cart from "./pages/cart_screen/Cart";
import BillDetails from "./pages/cart_screen/BillDetails";
import ItemDetails from "./pages/itemDetails_screen/ItemDetails";
import Offers from "./pages/offer_screen/Offers";
import OfferDetails from "./pages/offer_screen/OfferDetails";
import SelectOutlet from "./pages/location_screen/SelectOutlet";
import CompleteProfile from "./components/auth_screen/completeProfile";

// Components
import ProtectedRoute from "./components/ProtectedRoute_screen/ProtectedRoute";
import BottomNav from "@/components/BottomNav";

// Contexts
import { CartProvider } from "@/context/CartContext";
import { MenuProvider } from "@/context/MenuContext";
import { FilterProvider } from "@/context/FilterContext";
import { OfferProvider } from "@/context/OfferContext";
import { LocationProvider } from "@/context/LocationContext"; // ✅ Added LocationProvider

// ✅ NEW WRAPPER (VERY IMPORTANT)
function AppContent() {
  const { user: currentUser } = useAuth();

  return (
    <LocationProvider>
      <MenuProvider>
        <CartProvider>
          <FilterProvider>
            <OfferProvider user={currentUser || {}}>
              <Layout />
            </OfferProvider>
          </FilterProvider>
        </CartProvider>
      </MenuProvider>
    </LocationProvider>
  );
}

function Layout() {
  const location = useLocation();

  const hideNav =
    location.pathname.startsWith("/item") ||
    location.pathname.startsWith("/bill") ||
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    location.pathname === "/complete-profile" ||
    location.pathname === "/select-outlet";

  return (
    <div className="min-h-screen bg-[#f4efe9] max-w-md mx-auto pb-24">
      <Routes>
        {/* Auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Redirect */}
        <Route path="/" element={<AuthRedirect />} />

        {/* Protected routes */}
        <Route
          path="/complete-profile"
          element={
            <ProtectedRoute>
              <CompleteProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/select-outlet"
          element={
            <ProtectedRoute>
              <SelectOutlet />
            </ProtectedRoute>
          }
        />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/menu"
          element={
            <ProtectedRoute>
              <Menu />
            </ProtectedRoute>
          }
        />
        <Route
          path="/offers"
          element={
            <ProtectedRoute>
              <Offers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/offer/:id"
          element={
            <ProtectedRoute>
              <OfferDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/item/:id"
          element={
            <ProtectedRoute>
              <ItemDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cart"
          element={
            <ProtectedRoute>
              <Cart />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bill"
          element={
            <ProtectedRoute>
              <BillDetails />
            </ProtectedRoute>
          }
        />
      </Routes>

      {!hideNav && <BottomNav />}
    </div>
  );
}

function AuthRedirect() {
  const { user } = useAuth();
  const userType = localStorage.getItem("userType");
  return user || userType === "guest" ? <Navigate to="/home" /> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent /> {/* ✅ FIXED */}
    </BrowserRouter>
  );
}