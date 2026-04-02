import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

const CompleteProfile = () => {
  const [formData, setFormData] = useState({
    dob: "",
    gender: "",
    location: "",
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

    const { dob, gender, location } = formData;

    if (!dob || !gender || !location) {
      alert("Please fill all fields");
      setLoading(false);
      return;
    }

    try {
      const user = auth.currentUser;

      if (!user) {
        alert("User not logged in");
        return;
      }

      const userRef = doc(db, "users", user.uid);

      await updateDoc(userRef, {
        dob,
        gender,
        location,
        isProfileComplete: true,
      });

      console.log("Profile completed");

      // ✅ redirect to select outlet
      navigate("/select-outlet");

    } catch (error) {
      console.error("Profile Update Error:", error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-md bg-white shadow-2xl rounded-3xl p-8">
      
        {/* Title */}
        <h2 className="text-3xl font-bold text-center text-[#3e2723] mb-2">
          Complete Your Profile
        </h2>

        <p className="text-center text-gray-500 mb-6">
          Just a few more details to continue 
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">

        {/* DOB */}
        <div>
          <label className="block text-sm font-medium text-[#3e2723]">
            Date of Birth
          </label>
          <input
            type="date"
            name="dob"
            value={formData.dob}
            onChange={handleChange}
            required
            className="w-full mt-1 px-4 py-3 border rounded-xl focus:ring-2 focus:ring-[#8B4513] outline-none transition"
          />
        </div>

        {/* Gender */}
        <div>
          <label className="block text-sm font-medium text-[#3e2723]">
            Gender
          </label>
          <select
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            required
            className="w-full mt-1 px-4 py-3 border rounded-xl focus:ring-2 focus:ring-[#8B4513] outline-none transition"
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
            value={formData.location}
            onChange={handleChange}
            placeholder="Enter your city"
            required
            className="w-full mt-1 px-4 py-3 border rounded-xl focus:ring-2 focus:ring-[#8B4513] outline-none transition"
          />
        </div>

        {/* Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#8B4513] text-white py-3 rounded-xl font-semibold hover:bg-[#A0522D] transition duration-300 shadow-md disabled:opacity-50"
        >
          {loading ? "Saving..." : "Complete Profile"}
        </button>
      </form>
      </div>
    </div>
  );
};

export default CompleteProfile;