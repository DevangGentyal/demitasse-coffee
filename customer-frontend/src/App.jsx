import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext"; // added
import Login from "./pages/auth_screen/Login";
import Register from "./pages/auth_screen/Register";
import Home from "./pages/home_screen/Home";
import Menu from "./pages/menu_screen/Menu";
import Cart from "./pages/cart_screen/Cart";
import BillDetails from "./pages/cart_screen/BillDetails";
import ItemDetails from "./pages/itemDetails_screen/ItemDetails";
import Offers from "./pages/offer_screen/Offers";
import ProtectedRoute from "./components/ProtectedRoute_screen/ProtectedRoute";
import SelectOutlet from "./pages/location_screen/SelectOutlet";


function App() {
  const { user } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* send unauthenticated visitors to login, otherwise go home */}
        <Route
          path="/"
          element={
            user ? <Navigate to="/home" /> : <Navigate to="/login" />
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/select-outlet" element={<SelectOutlet />} />
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/menu" element={<ProtectedRoute><Menu /></ProtectedRoute>} />
        <Route path="/cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
        <Route path="/bill-details" element={<ProtectedRoute><BillDetails /></ProtectedRoute>} />
        <Route path="/item-details" element={<ProtectedRoute><ItemDetails /></ProtectedRoute>} />
        <Route path="/offers" element={<ProtectedRoute><Offers /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
