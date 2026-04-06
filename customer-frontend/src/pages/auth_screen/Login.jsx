import React from "react";
import Login_Page from "@/components/auth_screen/Login_Page";

const Login = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f3ede8] px-4">
      {/* Login Form */}
      <Login_Page />
    </div>
  );
};

export default Login;