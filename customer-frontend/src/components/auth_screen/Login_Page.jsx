import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  EmailAuthProvider,
  linkWithCredential,
  fetchSignInMethodsForEmail,
  signInAnonymously,
} from "firebase/auth";
import { auth, googleProvider } from "../../lib/firebase";
import { getCurrentUserProfile, upsertUserProfile } from "../../lib/backendApi";

// ─── Friendly error map ───────────────────────────────────────────────────────
const getFriendlyError = (code) => {
  const map = {
    "auth/user-not-found":        "No account found with this email. Please register first.",
    "auth/invalid-credential":    "Incorrect email or password. Please try again.",
    "auth/wrong-password":        "Incorrect password. Please try again.",
    "auth/invalid-email":         "The email address is not valid.",
    "auth/too-many-requests":     "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed":"No internet connection. Please try again.",
    "auth/popup-closed-by-user":  "Google sign-in was cancelled.",
    "auth/provider-already-linked":"Email login is already enabled for your account.",
    "auth/weak-password":         "Password must be at least 6 characters.",
    "auth/email-already-in-use":  "This email is already registered. Please login with your password.",
  };
  return map[code] || "Something went wrong. Please try again.";
};

// ─── Inline banner ─────────────────────────────────────────────────────────────
const Banner = ({ message, type = "error", onClose }) => {
  if (!message) return null;
  const styles = type === "success"
    ? "bg-green-50 border-green-200 text-green-700"
    : "bg-red-50 border-red-200 text-red-700";
  const icon = type === "success" ? "✅" : "⚠️";
  return (
    <div className={`flex items-start gap-3 border rounded-xl px-4 py-3 text-sm shadow-sm ${styles}`}>
      <span className="text-base leading-none mt-0.5">{icon}</span>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="font-bold text-base leading-none ml-1 opacity-50 hover:opacity-100">✕</button>
    </div>
  );
};

// ─── Set-password modal (for Google users who want email login) ────────────────
const LinkPasswordModal = ({ email, user, onSuccess, onClose }) => {
  const [pw, setPw]         = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr]       = useState("");
  const [linking, setLinking] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleLink = async () => {
    setErr("");
    if (pw.length < 6)       { setErr("Password must be at least 6 characters."); return; }
    if (pw !== confirm)      { setErr("Passwords do not match."); return; }

    setLinking(true);
    try {
      const credential = EmailAuthProvider.credential(email, pw);
      await linkWithCredential(user, credential);
      onSuccess("You're all set! You can now login using email & password 🎉");
    } catch (error) {
      setErr(getFriendlyError(error.code));
    } finally {
      setLinking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] bg-white rounded-t-3xl px-6 pt-5 pb-10 shadow-2xl"
        style={{ animation: "slideUp 0.3s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h2 className="text-lg font-bold text-gray-800 text-center mb-1">Set a Password</h2>
        <p className="text-sm text-gray-500 text-center mb-4">
          Add a password so you can also login with <strong>{email}</strong>
        </p>

        {err && <Banner message={err} onClose={() => setErr("")} />}

        <div className="space-y-3 mt-3">
          <div className="relative">
            <input
              type={showNewPassword ? "text" : "password"}
              placeholder="New password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full pl-4 pr-10 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8B4513]"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showNewPassword ? "Hide password" : "Show password"}
            >
              {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full pl-4 pr-10 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8B4513]"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <button
            onClick={handleLink}
            disabled={linking}
            className="w-full py-3 bg-[#8B4513] text-white font-bold rounded-xl shadow-md hover:bg-[#A0522D] disabled:opacity-50 transition"
          >
            {linking ? "Linking..." : "Save Password"}
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-100 text-gray-600 font-semibold rounded-xl hover:bg-gray-200 transition"
          >
            Skip for now
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
};

// ─── Navigate after successful login ──────────────────────────────────────────
const navigateAfterLogin = async (uid, setShowOutletPopup, navigate) => {
  const profile = await getCurrentUserProfile();
  if (!profile || !profile.isProfileComplete) {
    navigate("/complete-profile");
    return;
  }

  if (setShowOutletPopup) setShowOutletPopup(true);
  else navigate("/select-outlet");
};

// ─── Main Component ───────────────────────────────────────────────────────────
const Login_Page = ({ setShowOutletPopup }) => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading]   = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [linkModal, setLinkModal]   = useState(null); // { user, email }
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const clearMessages = () => { setErrorMsg(""); setSuccessMsg(""); };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    clearMessages();
  };

  const location = useLocation();

  React.useEffect(() => {
    if (location.state?.proximityError) {
      setErrorMsg(location.state.proximityError);
    }
  }, [location.state]);

  React.useEffect(() => {
    const authError = localStorage.getItem("auth_error");
    if (authError && authError.toLowerCase().includes("pending admin approval")) {
      setWaitingForApproval(true);
      setErrorMsg("");
      setSuccessMsg("");
    }
  }, []);

  // ── Email/password login ─────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth, formData.email, formData.password
      );
      localStorage.setItem("userType", "registered");
      await navigateAfterLogin(userCredential.user.uid, setShowOutletPopup, navigate);
    } catch (error) {
      console.error(error);
      // If the account was created with Google, guide them
      if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password"
      ) {
        try {
          const methods = await fetchSignInMethodsForEmail(auth, formData.email);
          if (methods.includes("google.com")) {
            setErrorMsg("This email is linked to Google. Please use 'Continue with Google' to login.");
            setLoading(false);
            return;
          }
        } catch (_) { /* ignore */ }

        try {
          const response = await fetch(`${API_BASE}/readAppData?resource=checkGoogleUser&email=${encodeURIComponent(formData.email)}`);
          const result = await response.json().catch(() => ({}));
          if (result?.success && result?.data?.[0]?.isGoogle) {
            setErrorMsg("This email is linked to Google. Please use 'Continue with Google' to login.");
            setLoading(false);
            return;
          }
        } catch (_) { /* ignore */ }
      }
      setErrorMsg(getFriendlyError(error.code));
    } finally {
      setLoading(false);
    }
  };

  // ── Google login ─────────────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    clearMessages();
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user   = result.user;

      localStorage.setItem("userType", "registered");

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
      }

      // Check if password provider is already linked
      const hasPassword = user.providerData.some(p => p.providerId === "password");
      if (!hasPassword) {
        // Offer to link a password — non-blocking, user can skip
        setLinkModal({ user, email: user.email });
        return; // navigateAfterLogin happens onClose or onSuccess
      }

      await navigateAfterLogin(user.uid, setShowOutletPopup, navigate);
    } catch (error) {
      console.error(error);
      setErrorMsg(getFriendlyError(error.code));
    }
  };

  // ── Guest login ──────────────────────────────────────────────────────────
  const handleGuestLogin = async () => {
    clearMessages();
    setLoading(true);
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.warn("Guest sign in failed", err);
    }
    localStorage.setItem("userType", "guest");
    if (setShowOutletPopup) setShowOutletPopup(true);
    else navigate("/select-outlet");
    setLoading(false);
  };

  // ── Link modal callbacks ─────────────────────────────────────────────────
  const handleLinkSuccess = async (msg) => {
    setLinkModal(null);
    setSuccessMsg(msg);
    // Navigate after a brief delay so user sees the success message
    setTimeout(async () => {
      if (auth.currentUser) {
        try {
          await navigateAfterLogin(auth.currentUser.uid, setShowOutletPopup, navigate);
        } catch (e) {
          // Error already handled and set in navigateAfterLogin
        }
      }
    }, 1800);
  };

  const handleLinkClose = async () => {
    const user = linkModal?.user;
    setLinkModal(null);
    if (user) {
      try {
        await navigateAfterLogin(user.uid, setShowOutletPopup, navigate);
      } catch (e) {
        // Error already handled
      }
    }
  };

  if (waitingForApproval) {
    return (
      <div className="min-h-screen bg-[#f4efe9] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white shadow-2xl rounded-3xl p-8 text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl">
            ⏳
          </div>
          <h2 className="text-2xl font-bold text-[#3e2723]">Waiting for Approval</h2>
          <p className="text-sm text-gray-600 mt-3 leading-6">
            Your outlet account is pending admin approval. Once approved, you will be able to access the billing portal.
          </p>
          <button
            onClick={() => {
              localStorage.removeItem("auth_error");
              setWaitingForApproval(false);
            }}
            className="mt-6 w-full bg-[#8B4513] text-white py-3 rounded-xl font-semibold hover:bg-[#A0522D] transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8">
        <h2 className="text-3xl font-bold text-center text-[#3e2723] mb-2">
          Welcome Back
        </h2>
        <p className="text-center text-sm text-gray-500 mb-6">
          Login to continue your coffee journey
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Banners */}
          <Banner message={errorMsg}   type="error"   onClose={() => setErrorMsg("")} />
          <Banner message={successMsg} type="success" onClose={() => setSuccessMsg("")} />

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-[#3e2723]">Email</label>
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
            <label className="block text-sm font-medium text-[#3e2723]">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                required
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                className="w-full mt-1 pl-4 pr-10 py-3 border rounded-lg outline-none focus:ring-2 focus:ring-[#8B4513]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link to="#" className="text-sm text-[#8B4513] font-medium hover:underline">
              Forgot Password?
            </Link>
          </div>

          {/* Login */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#8B4513] text-white py-3 rounded-xl font-semibold hover:bg-[#A0522D] transition duration-300 shadow-md disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          {/* Google */}
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

          {/* Guest */}
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

      {/* Link Password Modal */}
      {linkModal && (
        <LinkPasswordModal
          email={linkModal.email}
          user={linkModal.user}
          onSuccess={handleLinkSuccess}
          onClose={handleLinkClose}
        />
      )}
    </>
  );
};

export default Login_Page;
