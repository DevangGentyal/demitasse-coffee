import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "../../lib/firebase";

const Login_Page = ({ setShowOutletPopup }) => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      
      const userSnap = await getDoc(doc(db, "users", userCredential.user.uid));
      localStorage.setItem("userType", "registered");

      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (!userData.isProfileComplete) {
          navigate("/complete-profile");
        } else {
          if (setShowOutletPopup) setShowOutletPopup(true);
          else navigate("/select-outlet");
        }
      } else {
         navigate("/complete-profile");
      }
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        alert("Account not found or invalid credentials. Please check or register first.");
        navigate("/register");
      } else {
        alert("Login failed: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      localStorage.setItem("userType", "registered");

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          name: user.displayName,
          email: user.email,
          provider: "google",
          isProfileComplete: false,
          hasPlacedFirstOrder: false,
          createdAt: new Date(),
        });
        navigate("/complete-profile");
      } else {
        const userData = userSnap.data();
        if (!userData.isProfileComplete) {
          navigate("/complete-profile");
        } else {
          if (setShowOutletPopup) setShowOutletPopup(true);
          else navigate("/select-outlet");
        }
      }
    } catch (error) {
      alert(error.message);
    }
  };

  const handleGuestLogin = () => {
    localStorage.setItem("userType", "guest");
    if (setShowOutletPopup) setShowOutletPopup(true);
    else navigate("/select-outlet");
  };

  return (
    <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8">
      <h2 className="text-3xl font-bold text-center text-[#3e2723] mb-2">
        Welcome Back
      </h2>
      <p className="text-center text-sm text-gray-500 mb-6">
        Login to continue your coffee journey
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
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
            placeholder="Enter your email"
            className="w-full mt-1 px-4 py-3 border rounded-lg outline-none focus:ring-2 focus:ring-[#8B4513]"
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
            placeholder="Enter your password"
            className="w-full mt-1 px-4 py-3 border rounded-lg outline-none focus:ring-2 focus:ring-[#8B4513]"
          />
        </div>

        <div className="flex justify-end">
          <Link to="#" className="text-sm text-[#8B4513] font-medium hover:underline">
            Forgot Password?
          </Link>
        </div>

        {/* Login Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#8B4513] text-white py-3 rounded-xl font-semibold hover:bg-[#A0522D] transition duration-300 shadow-md disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        {/* Google Login */}
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

        {/* Guest Login */}
        <button
          type="button"
          onClick={handleGuestLogin}
          className="w-full bg-[#f3f4f6] text-[#3e2723] py-3 rounded-xl font-semibold hover:bg-gray-200 transition duration-300 shadow-sm"
        >
          Continue as Guest
        </button>

        <p className="text-center text-sm text-gray-600 mt-4">
          Don't have an account?{" "}
          <Link to="/register" className="text-[#8B4513] font-medium hover:underline">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
};

export default Login_Page;