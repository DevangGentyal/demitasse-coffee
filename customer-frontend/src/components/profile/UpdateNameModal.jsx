import { useState } from "react";
import { updateProfile } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../../lib/firebase";

export default function UpdateNameModal({ currentName, onClose, onSuccess }) {
  const [name, setName] = useState(currentName || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      setError("Name must be at least 3 characters.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");

      // Use the shared functions instance (emulator already connected in firebase.js)
      const updateProfile_ = httpsCallable(functions, "customerUpdateUserProfile");
      const result = await updateProfile_({ displayName: trimmed });

      if (!result.data?.success) {
        throw new Error(result.data?.message || "Failed to update name");
      }

      // Refresh the Firebase Auth displayName locally so it reflects immediately
      await updateProfile(user, { displayName: trimmed });

      onSuccess(trimmed);
    } catch (err) {
      console.error("Update name error:", err);
      setError(err.message || "Failed to update name. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] bg-white rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 shadow-2xl"
        style={{ animation: "slideUp 0.3s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden" />

        <h2 className="text-lg font-bold text-[#3e2723] text-center mb-1">
          Update Name
        </h2>
        <p className="text-sm text-gray-500 text-center mb-5">
          Enter your new display name
        </p>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
            <span className="text-base leading-none mt-0.5">⚠️</span>
            <span className="flex-1">{error}</span>
          </div>
        )}

        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          placeholder="Enter new name"
          maxLength={50}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8B4513] bg-[#faf6f1] mb-4"
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-3 bg-[#8B4513] text-white font-bold rounded-xl shadow-md hover:bg-[#A0522D] transition disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
