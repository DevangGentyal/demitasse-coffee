import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom"; 
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  signInWithPopup 
} from "firebase/auth";

import { auth, googleProvider } from "../../lib/firebase";
import { db } from "../../lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";


const Login_Page = () => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // ✅ EMAIL/PASSWORD LOGIN
 const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);

  const { email, password } = formData;

  if (!email || !password) {
    alert("Please enter both email and password");
    setLoading(false);
    return;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      alert("User data not found.");
      setLoading(false);
      return;
    }

    const userData = userSnap.data();

    // 🟡 Profile incomplete
    if (!userData.isProfileComplete) {
      navigate("/complete-profile");
      return;
    }

    // ✅ Normal flow
    navigate("/select-outlet");

  } catch (error) {
    alert(error.message);
    console.error("Login Error:", error.message);
  } finally {
    setLoading(false);
  }
};

  // ✅ GOOGLE LOGIN
const handleGoogleLogin = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    // ❌ User not registered
    if (!userSnap.exists()) {
      alert("No account found. Please register first.");
      await auth.signOut();
      navigate("/register");
      return;
    }

    const userData = userSnap.data();

    // 🟡 Profile incomplete → go complete profile
    if (!userData.isProfileComplete) {
      navigate("/complete-profile");
      return;
    }

    // ✅ Profile complete → go to outlet
    navigate("/select-outlet");

  } catch (error) {
    console.error("Google Login Error:", error);

    if (error.code === "auth/popup-blocked") {
      alert("Popup blocked! Allow popups and try again.");
    } else {
      alert(error.message);
    }
  }
};

  // ✅ FORGOT PASSWORD
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
          >
            {resetLoading ? "Sending..." : "Forgot Password?"}
          </span>
        </div>

        {/* Email Login Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#8B4513] text-white py-3 rounded-xl font-semibold hover:bg-[#A0522D] transition duration-300 shadow-md disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        {/* 🔥 Google Login Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 border py-3 rounded-xl font-medium hover:bg-gray-100 transition duration-300 shadow-sm"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            className="w-5 h-5"
          />
          Continue with Google
        </button>

        {/* Guest Login Button */}
        <button
          type="button"
          onClick={() => {
            localStorage.setItem("userType", "guest");
            navigate("/select-outlet");
          }}
          className="w-full flex items-center justify-center gap-3 bg-gray-100 py-3 rounded-xl font-medium hover:bg-gray-200 transition duration-300 shadow-sm"
        >
          Continue as Guest
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