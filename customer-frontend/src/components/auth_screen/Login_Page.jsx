import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom"; // ✅ useNavigate for redirect
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../lib/firebase";

const Login_Page = () => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const navigate = useNavigate(); // ✅ navigation function

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { email, password } = formData;

    // ✅ basic validation
    if (!email || !password) {
      alert("Please enter both email and password");
      setLoading(false);
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("Logged In:", userCredential.user); // ✅ logs user object, not password

      // ✅ redirect to homepage
      navigate("/select-outlet");

    } catch (error) {
      alert(error.message); // show Firebase error
      console.error("Login Error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = formData.email;
    if (!email) {
      alert("Please enter your email first");
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset email sent! Check your inbox.");
    } catch (error) {
      alert(error.message);
      console.error("Reset Error:", error);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white shadow-2xl rounded-3xl p-8">
      
      {/* Title */}
      <h2 className="text-3xl font-bold text-center text-[#3e2723] mb-2">
        Welcome Back 
      </h2>
      <p className="text-center text-gray-500 mb-6">
        Login to continue your coffee journey
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-[#3e2723]">
            Email
          </label>
          <input
            type="email"
            name="email"
            required
            value={formData.email}
            onChange={handleChange}
            className="w-full mt-1 px-4 py-3 border rounded-xl focus:ring-2 focus:ring-[#8B4513] outline-none transition"
            placeholder="Enter your email"
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-[#3e2723]">
            Password
          </label>
          <input
            type="password"
            name="password"
            required
            value={formData.password}
            onChange={handleChange}
            className="w-full mt-1 px-4 py-3 border rounded-xl focus:ring-2 focus:ring-[#8B4513] outline-none transition"
            placeholder="Enter your password"
          />
        </div>

        {/* Forgot Password */}
        <div className="text-right text-sm">
          <span 
            className="text-[#8B4513] cursor-pointer hover:underline"
            onClick={handleForgotPassword}
            disabled={resetLoading}
          >
            {resetLoading ? "Sending..." : "Forgot Password?"}
          </span>
        </div>

        {/* Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#8B4513] text-white py-3 rounded-xl font-semibold hover:bg-[#A0522D] transition duration-300 shadow-md disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        {/* Register Link */}
        <p className="text-center text-sm text-gray-600 mt-4">
          Don’t have an account?{" "}
          <Link
            to="/register"
            className="text-[#8B4513] font-medium hover:underline"
          >
            Register
          </Link>
        </p>
      </form>
    </div>
  );
};

export default Login_Page;
