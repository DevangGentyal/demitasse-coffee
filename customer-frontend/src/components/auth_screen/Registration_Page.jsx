import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";

const RegisterForm = () => {
  const [formData, setFormData] = useState({
    name: "",
    dob: "",
    gender: "",
    location: "",
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { name, dob, gender, location, email, password } = formData;

    // Basic validation
    if (!name || !dob || !gender || !location || !email || !password) {
      alert("Please fill in all fields!");
      setLoading(false);
      return;
    }

    try {
      // 🔐 Create user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = userCredential.user;

      // 🔥 Store extra user details in Firestore
      await setDoc(doc(db, "users", user.uid), {
        name: name,
        dob: dob,
        gender: gender,
        location: location,
        email: email,
        createdAt: new Date(),
      });

      console.log("User Registered:", user);

      // Redirect after registration
      navigate("/home");

    } catch (error) {
  console.log("Full Error:", error);
  alert(error.code);
} finally {
  setLoading(false);
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

        {/* DOB */}
        <div>
          <label className="block text-sm font-medium text-[#3e2723]">
            Date of Birth
          </label>
          <input
            type="date"
            name="dob"
            required
            value={formData.dob}
            onChange={handleChange}
            className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#8B4513] outline-none"
          />
        </div>

        {/* Gender */}
        <div>
          <label className="block text-sm font-medium text-[#3e2723]">
            Gender
          </label>
          <select
            name="gender"
            required
            value={formData.gender}
            onChange={handleChange}
            className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#8B4513] outline-none"
          >
            <option value="">Select Gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-[#3e2723]">
            Location
          </label>
          <input
            type="text"
            name="location"
            required
            value={formData.location}
            onChange={handleChange}
            placeholder="Enter your city"
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

        {/* Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#8B4513] text-white py-3 rounded-xl font-semibold hover:bg-[#A0522D] transition duration-300 shadow-md disabled:opacity-50"
        >
          {loading ? "Registering..." : "Register"}
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
