import React, { useState } from "react";
import Login_Page from "@/components/auth_screen/Login_Page";
import SelectOutlet from "@/pages/location_screen/SelectOutlet";

const Login = () => {

  const [showOutletPopup, setShowOutletPopup] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f3ede8] px-4">

      {/* Login Form */}
      <Login_Page setShowOutletPopup={setShowOutletPopup} />

      {/* Outlet Selection Popup */}
      {showOutletPopup && (
        <SelectOutlet onClose={() => setShowOutletPopup(false)} />
      )}

    </div>
  );
};

export default Login;