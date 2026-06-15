import { useState } from "react";
import { updateProfile } from "firebase/auth";
import { auth } from "../../lib/firebase";

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

      // Update Firebase Auth displayName
      await updateProfile(user, { displayName: trimmed });

      // Call cloud function to update Firestore user document
      const idToken = await user.getIdToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE || 'http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1'}/customerUpdateUserProfile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            displayName: trimmed,
          }),
        }
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || result.message || "Failed to update name");
      }

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: "slideUp 0.3s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scrollable content */}
        <div className="overflow-y-auto px-6 py-6 flex-1">
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
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8B4513] bg-[#faf6f1] mb-5"
          />
        </div>

        {/* Buttons at bottom */}
        <div className="border-t border-gray-100 px-6 py-6 flex gap-3 bg-white">
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
