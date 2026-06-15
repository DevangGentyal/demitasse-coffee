import { useState } from "react";
import {
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from "firebase/auth";
import { auth } from "../../lib/firebase";

export default function UpdatePasswordModal({ onClose, onSuccess }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getFriendlyError = (code) => {
    const map = {
      "auth/wrong-password": "Current password is incorrect.",
      "auth/invalid-credential": "Current password is incorrect.",
      "auth/weak-password": "New password must be at least 6 characters.",
      "auth/too-many-requests": "Too many attempts. Please wait a moment.",
      "auth/requires-recent-login": "Please logout and login again before changing password.",
      "auth/network-request-failed": "No internet connection. Please try again.",
    };
    return map[code] || "Something went wrong. Please try again.";
  };

  const handleUpdate = async () => {
    setError("");

    if (!currentPw) {
      setError("Please enter your current password.");
      return;
    }
    if (newPw.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setError("Passwords do not match.");
      return;
    }
    if (currentPw === newPw) {
      setError("New password must be different from current password.");
      return;
    }

    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("Not authenticated");

      // Re-authenticate
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPw);

      onSuccess();
    } catch (err) {
      console.error("Update password error:", err);
      setError(err.code ? getFriendlyError(err.code) : (err.message || "Failed to update password."));
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
            Update Password
          </h2>
          <p className="text-sm text-gray-500 text-center mb-5">
            Enter your current and new password
          </p>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
              <span className="text-base leading-none mt-0.5">⚠️</span>
              <span className="flex-1">{error}</span>
            </div>
          )}

          <div className="space-y-3 mb-5">
            <input
              type="password"
              value={currentPw}
              onChange={(e) => { setCurrentPw(e.target.value); setError(""); }}
              placeholder="Current password"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8B4513] bg-[#faf6f1]"
            />
            <input
              type="password"
              value={newPw}
              onChange={(e) => { setNewPw(e.target.value); setError(""); }}
              placeholder="New password (min 6 chars)"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8B4513] bg-[#faf6f1]"
            />
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => { setConfirmPw(e.target.value); setError(""); }}
              placeholder="Confirm new password"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8B4513] bg-[#faf6f1]"
            />
          </div>
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
            onClick={handleUpdate}
            disabled={loading}
            className="flex-1 py-3 bg-[#8B4513] text-white font-bold rounded-xl shadow-md hover:bg-[#A0522D] transition disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update Password"}
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
