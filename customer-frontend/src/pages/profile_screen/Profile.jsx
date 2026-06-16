import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useOffers } from "../../context/OfferContext";
import UpdateNameModal from "../../components/profile/UpdateNameModal";
import UpdatePasswordModal from "../../components/profile/UpdatePasswordModal";

// Icons from heroicons
import {
  ArrowLeftIcon,
  ClipboardDocumentListIcon,
  PencilSquareIcon,
  LockClosedIcon,
  ArrowRightOnRectangleIcon,
  ChevronRightIcon,
  UserCircleIcon,
  CalendarDaysIcon,
  MapPinIcon,
  AtSymbolIcon,
} from "@heroicons/react/24/outline";

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshUserProfile } = useOffers();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [toast, setToast] = useState(null);

  const isGuest = !user && localStorage.getItem("userType") === "guest";

  // Check if user has password provider (for Google-only users)
  const hasPasswordProvider = user?.providerData?.some(
    (p) => p.providerId === "password"
  );
  const isGoogleOnly = user?.providerData?.some(
    (p) => p.providerId === "google.com"
  ) && !hasPasswordProvider;

  // Fetch user data from Firestore
  useEffect(() => {
    let isMounted = true;

    const fetchUserData = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (snap.exists() && isMounted) {
          setUserData(snap.data());
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchUserData();
    return () => { isMounted = false; };
  }, [user]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("userType");
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
      showToast("Failed to logout", "error");
    }
  };

  const handleNameSuccess = (newName) => {
    setShowNameModal(false);
    setUserData((prev) => (prev ? { ...prev, name: newName } : prev));
    refreshUserProfile().catch((err) => console.error("Failed to refresh profile context:", err));
    showToast("Display name updated successfully! 🎉");
  };

  const handlePasswordSuccess = () => {
    setShowPasswordModal(false);
    showToast("Password updated successfully! 🔒");
  };

  // Format DOB
  const formatDob = (dob) => {
    if (!dob) return "Not set";
    try {
      const date = new Date(dob);
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dob;
    }
  };

  // Guest view
  if (isGuest) {
    return (
      <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28">
        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-gray-100">
          <div className="flex items-center gap-3 px-4 py-4">
            <button onClick={() => navigate("/home")} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
              <ArrowLeftIcon className="w-5 h-5 text-gray-700" />
            </button>
            <h1 className="text-lg font-bold text-[#3e2723]">Profile</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-4">
            <UserCircleIcon className="w-12 h-12 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-[#3e2723] mb-2">Guest User</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Create an account to access your profile and order history
          </p>
          <button
            onClick={() => { localStorage.removeItem("userType"); navigate("/register"); }}
            className="bg-[#8B4513] text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-lg"
          >
            Create Account
          </button>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#8B4513] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  const displayName = userData?.name || user?.displayName || "User";
  const email = userData?.email || user?.email || "";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-[380px] w-[90%] px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold text-center transition-all ${toast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
            }`}
          style={{ animation: "slideDown 0.3s ease-out" }}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate("/home")}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
          >
            <ArrowLeftIcon className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-[#3e2723]">Profile</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-5">
        {/* Profile Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <div className="flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="w-20 h-20 bg-gradient-to-br from-[#8B4513] to-[#A0522D] rounded-full flex items-center justify-center mb-4 shadow-lg shadow-[#8B4513]/20">
              <span className="text-2xl font-bold text-white">{initials}</span>
            </div>

            <h2 className="text-xl font-bold text-[#3e2723]">{displayName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{email}</p>

            {/* Provider badge */}
            {userData?.provider && (
              <span className="mt-2 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#8B4513]/10 text-[#8B4513]">
                {userData.provider === "google" ? "Google Account" : "Email Account"}
              </span>
            )}
          </div>

          {/* User details */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 bg-[#faf6f1] rounded-xl px-4 py-3">
              <CalendarDaysIcon className="w-5 h-5 text-[#8B4513]/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Date of Birth</p>
                <p className="text-sm font-medium text-[#3e2723] truncate">{formatDob(userData?.dob)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-[#faf6f1] rounded-xl px-4 py-3">
              <UserCircleIcon className="w-5 h-5 text-[#8B4513]/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Gender</p>
                <p className="text-sm font-medium text-[#3e2723] truncate capitalize">{userData?.gender || "Not set"}</p>
              </div>
            </div>



            <div className="flex items-center gap-3 bg-[#faf6f1] rounded-xl px-4 py-3">
              <MapPinIcon className="w-5 h-5 text-[#8B4513]/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Location</p>
                <p className="text-sm font-medium text-[#3e2723] truncate">{userData?.location || "Not set"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Account
          </p>

          {/* Order History */}
          <MenuItem
            icon={<ClipboardDocumentListIcon className="w-5 h-5" />}
            label="Order History"
            subtitle="View your previous orders"
            onClick={() => navigate("/profile/orders")}
          />

          {/* Update Display Name */}
          <MenuItem
            icon={<PencilSquareIcon className="w-5 h-5" />}
            label="Update UserName"
            subtitle="Change your UserName"
            onClick={() => setShowNameModal(true)}
          />



          {/* Update Password */}
          {isGoogleOnly ? (
            <div className="flex items-center gap-4 px-5 py-4 border-t border-gray-50">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
                <LockClosedIcon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-400">Password</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Google sign-in only — no password set
                </p>
              </div>
            </div>
          ) : (
            <MenuItem
              icon={<LockClosedIcon className="w-5 h-5" />}
              label="Update Password"
              subtitle="Change your account password"
              onClick={() => setShowPasswordModal(true)}
            />
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-4 px-5 py-4 border-t border-gray-50 w-full text-left hover:bg-red-50/50 transition"
          >
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-500">
              <ArrowRightOnRectangleIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-600">Logout</p>
              <p className="text-xs text-red-400 mt-0.5">Sign out of your account</p>
            </div>
          </button>
        </div>
      </div>

      {/* Modals */}
      {showNameModal && (
        <UpdateNameModal
          currentName={displayName}
          onClose={() => setShowNameModal(false)}
          onSuccess={handleNameSuccess}
        />
      )}

      {showPasswordModal && (
        <UpdatePasswordModal
          onClose={() => setShowPasswordModal(false)}
          onSuccess={handlePasswordSuccess}
        />
      )}



      <style>{`
        @keyframes slideDown {
          from { transform: translate(-50%, -100%); opacity: 0; }
          to   { transform: translate(-50%, 0);     opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Reusable menu item
function MenuItem({ icon, label, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 px-5 py-4 border-t border-gray-50 w-full text-left hover:bg-[#faf6f1]/50 transition group"
    >
      <div className="w-10 h-10 bg-[#8B4513]/10 rounded-xl flex items-center justify-center text-[#8B4513] group-hover:bg-[#8B4513]/15 transition">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#3e2723]">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <ChevronRightIcon className="w-4 h-4 text-gray-400 shrink-0 group-hover:text-[#8B4513] transition" />
    </button>
  );
}
