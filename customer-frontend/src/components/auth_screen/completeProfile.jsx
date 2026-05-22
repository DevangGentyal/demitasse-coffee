import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../lib/firebase";
import { upsertUserProfile } from "../../lib/backendApi";

// ── Inline banner ─────────────────────────────────────────────────────────────
const Banner = ({ message, type = "error", onClose }) => {
    if (!message) return null;
    const styles = type === "success"
        ? "bg-green-50 border-green-200 text-green-700"
        : "bg-red-50 border-red-200 text-red-700";
    const icon = type === "success" ? "✅" : "⚠️";
    return (
        <div className={`flex items-start gap-3 border rounded-xl px-4 py-3 text-sm mb-4 ${styles}`}>
            <span className="text-base leading-none mt-0.5">{icon}</span>
            <span className="flex-1">{message}</span>
            <button onClick={onClose} className="font-bold text-base leading-none ml-1 opacity-50 hover:opacity-100">✕</button>
        </div>
    );
};

const CompleteProfile = () => {
    const [formData, setFormData] = useState({
        dob: "",
        gender: "",
        location: "",
    });

    const [loading, setLoading] = useState(false);
    const [bannerMsg, setBannerMsg] = useState("");
    const [bannerType, setBannerType] = useState("error");
    const navigate = useNavigate();

    const showMsg = (msg, type = "error") => { setBannerMsg(msg); setBannerType(type); };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setBannerMsg("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setBannerMsg("");

        const { dob, gender, location } = formData;

        if (!dob || !gender || !location) {
            showMsg("Please fill in all fields to continue.");
            setLoading(false);
            return;
        }

        try {
            const user = auth.currentUser;

            if (!user) {
                showMsg("You are not logged in. Please login again.");
                setLoading(false);
                navigate("/login");
                return;
            }

            await upsertUserProfile({
                dob,
                gender,
                location,
                isProfileComplete: true,
            });

            console.log("Profile completed");
            navigate("/select-outlet");

        } catch (error) {
            console.error("Profile Update Error:", error);
            showMsg(error.message || "Failed to save profile. Please try again.");
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

                    {/* Banner */}
                    <Banner message={bannerMsg} type={bannerType} onClose={() => setBannerMsg("")} />

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