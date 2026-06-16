import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  EmailAuthProvider,
  linkWithCredential,
} from "firebase/auth";
import { auth, googleProvider } from "../../lib/firebase";
import { getCurrentUserProfile, upsertUserProfile } from "../../lib/backendApi";

// 🎨 Friendly error messages for Firebase error codes
const getFriendlyError = (errorCode) => {
  const map = {
    "auth/email-already-in-use": "An account with this email already exists. Please login instead.",
    "auth/invalid-email": "The email address is not valid.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/network-request-failed": "No internet connection. Please try again.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  };
  return map[errorCode] || "Something went wrong. Please try again.";
};

// 🎨 Inline error banner component
const ErrorBanner = ({ message, onClose }) => {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm shadow-sm">
      <span className="text-lg leading-none mt-0.5">⚠️</span>
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="text-red-400 hover:text-red-600 font-bold text-base leading-none ml-1"
      >
        ✕
      </button>
    </div>
  );
};

const RegisterForm = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setErrorMsg(""); // Clear error on input change
  };

  // ✅ EMAIL REGISTER (UPDATED)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { name, email, password } = formData;

    if (!name || !email || !password) {
      setErrorMsg("Please fill in all fields to continue.");
      setLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = userCredential.user;

      await upsertUserProfile({
        uid: user.uid,
        name,
        email,
        provider: "email",
        isProfileComplete: false,
        hasPlacedFirstOrder: false,
        createdAt: new Date(),
      });

      console.log("User Registered:", user);

      navigate("/complete-profile");

    } catch (error) {
      console.log("Full Error:", error);
      setErrorMsg(getFriendlyError(error.code));
    } finally {
      setLoading(false);
    }
  };

  // 🔥 GOOGLE REGISTER (UPDATED)
  const handleGoogleRegister = async () => {
    setErrorMsg("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      console.log("Google User:", user);

      const profile = await getCurrentUserProfile();
      if (!profile) {
        await upsertUserProfile({
          uid: user.uid,
          name: user.displayName,
          email: user.email,
          provider: "google",
          isProfileComplete: false,
          hasPlacedFirstOrder: false,
          createdAt: new Date(),
        });

        navigate("/complete-profile");
      } else if (!profile.isProfileComplete) {
        navigate("/complete-profile");
        return;
      }

      const redirectTarget = "/complete-profile";
      console.log("[REGISTRATION FLOW] Google User Configured:", {
        uid: user.uid,
        redirectTarget,
      });

      navigate(redirectTarget);
    } catch (error) {
      setErrorMsg(getFriendlyError(error.code));
      console.error("Google Register Error:", error);
    }
  };

  // ── Guest login ──────────────────────────────────────────────────────────
  const handleGuestLogin = async () => {
    setErrorMsg("");
    setLoading(true);
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.warn("Guest sign in failed", err);
    }
    
    localStorage.setItem("userType", "guest");
    navigate("/select-outlet");
    setLoading(false);
  };

  return (
    <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8">
      <h2 className="text-3xl font-bold text-center text-[#3e2723] mb-6">
        Create Account
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ✅ Inline Error Banner */}
        <ErrorBanner message={errorMsg} onClose={() => setErrorMsg("")} />

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-[#3e2723]">
            Full Name
          </label>
          <input
            type="text"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#8B4513] outline-none"
          />
        </div>

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
            className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#8B4513] outline-none"
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
            className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#8B4513] outline-none"
          />
        </div>

        {/* Register Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#8B4513] text-white py-3 rounded-xl font-semibold hover:bg-[#A0522D] transition duration-300 shadow-md disabled:opacity-50"
        >
          {loading ? "Registering..." : "Register"}
        </button>

        {/* Google Register */}
        <button
          type="button"
          onClick={handleGoogleRegister}
          className="w-full flex items-center justify-center gap-3 border py-3 rounded-xl font-medium hover:bg-gray-100 transition duration-300 shadow-sm"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            className="w-5 h-5"
          />
          Continue with Google
        </button>

        {/* Guest */}
        <button
          type="button"
          onClick={handleGuestLogin}
          className="w-full bg-[#f3f4f6] text-[#3e2723] py-3 rounded-xl font-semibold hover:bg-gray-200 transition duration-300 shadow-sm"
        >
          Continue as Guest
        </button>

        <p className="text-center text-sm text-gray-600 mt-4">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-[#8B4513] font-medium hover:underline"
          >
            Login
          </Link>
        </p>
      </form>
    </div>
  );
};

export default RegisterForm;