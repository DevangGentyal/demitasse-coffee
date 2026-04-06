import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  signInWithPopup
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "../../lib/firebase";

const RegisterForm = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // ✅ EMAIL REGISTER (UPDATED)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { name, email, password } = formData;

    if (!name || !email || !password) {
      alert("Please fill in all fields!");
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

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name,
        email,
        provider: "email",
        isProfileComplete: false, // Redirects to complete-profile
        hasPlacedFirstOrder: false, 
        createdAt: new Date(),
      });

      console.log("User Registered:", user);

      navigate("/complete-profile");

    } catch (error) {
      console.log("Full Error:", error);
      alert(error.code);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 GOOGLE REGISTER (UPDATED)
  const handleGoogleRegister = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      console.log("Google User:", user);

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        // 🆕 New user
        await setDoc(userRef, {
          uid: user.uid,
          name: user.displayName,
          email: user.email,
          provider: "google",
          isProfileComplete: false,
          hasPlacedFirstOrder: false, // 🔥 ADDED
          createdAt: new Date(),
        });

        navigate("/complete-profile");

      } else {
        const userData = userSnap.data();

        if (!userData.isProfileComplete) {
          navigate("/complete-profile");
        } else {
          navigate("/select-outlet");
        }
      }

    } catch (error) {
      alert(error.message);
      console.error("Google Register Error:", error);
    }
  };

  return (
    <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8">
      <h2 className="text-3xl font-bold text-center text-[#3e2723] mb-6">
        Create Account
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">

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