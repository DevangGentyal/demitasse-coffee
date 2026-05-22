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
import { useLocationContext } from "./context/LocationContext";

// Pages
import Login from "./pages/auth_screen/Login";
import Register from "./pages/auth_screen/Register";
import Home from "./pages/home_screen/Home";
import Menu from "./pages/menu_screen/Menu";
import Cart from "./pages/cart_screen/Cart";
import BillDetails from "./pages/cart_screen/BillDetails";
import ItemDetails from "./pages/itemDetails_screen/ItemDetails";
import Orders from "./pages/orders_screen/Orders";
import Offers from "./pages/offer_screen/Offers";
import OfferDetails from "./pages/offer_screen/offerDetails";
import SelectOutlet from "./pages/location_screen/SelectOutlet";
import CompleteProfile from "./components/auth_screen/completeProfile";
import LoyaltyPage from "./pages/LoyaltyPage";

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
        <OfferProvider user={currentUser || {}}>
          <CartProvider>
            <FilterProvider>
              <Layout />
            </FilterProvider>
          </CartProvider>
        </OfferProvider>
      </MenuProvider>
    </LocationProvider>
  );
}

function Layout() {
  const location = useLocation();
  const { paymentLockActive, selectedTableName, tableNumber, selectedOutlet, outletName } = useLocationContext();

  if (paymentLockActive) {
    return <PaymentRequestScreen tableName={selectedTableName || tableNumber || "your table"} outletName={outletName || selectedOutlet || "the outlet"} />;
  }

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
          path="/loyalty"
          element={
            <ProtectedRoute>
              <LoyaltyPage />
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
        <Route
          path="/orders"
          element={
            <ProtectedRoute>
              <Orders />
            </ProtectedRoute>
          }
        />
      </Routes>

      {!hideNav && <BottomNav />}
    </div>
  );
}

function PaymentRequestScreen({ tableName, outletName }) {
  return (
    <div className="min-h-screen w-full bg-white text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-6">
        <div className="w-full rounded-[2rem] border border-gray-200 bg-[#120f0d] p-6 shadow-2xl backdrop-blur-xl">
          <div className="space-y-3 text-center">
            <p className="text-[11px] uppercase tracking-[0.35em] text-amber-300">Request for Payment</p>
            <h1 className="text-3xl font-black tracking-tight">Payment required</h1>
            <p className="text-sm leading-6 text-white/75">
              Your payment at {outletName} is Pending. Please pay for {tableName}.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-50">
            Do not refresh, close, or leave this screen. It will unlock automatically after payment is marked successful.
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.24em] text-white/45">
            <span className="h-2 w-2 rounded-full bg-amber-300 animate-pulse" />
            Waiting for billing confirmation
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthRedirect() {
  const { user } = useAuth();
  const { selectedOutlet, selectedTableId } = useLocationContext();
  const userType = localStorage.getItem("userType");

  if (!user && userType !== "guest") {
    return <Navigate to="/login" />;
  }

  if (!selectedOutlet || !selectedTableId) {
    return <Navigate to="/select-outlet" />;
  }

  return <Navigate to="/home" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent /> {/* ✅ FIXED */}
    </BrowserRouter>
  );
}