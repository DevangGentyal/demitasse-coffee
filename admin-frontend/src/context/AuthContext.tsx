"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, logOut as firebaseLogOut } from "@/lib/firebase/auth";
import { getCurrentUserProfile } from "@/lib/services/backendApi";

// Global Context
interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  outletId: string | null;
  role: string | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [outletId, setOutletId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser?.email || "No user");
      setUser(firebaseUser);
      setIsLoggedIn(!!firebaseUser);
      
      if (firebaseUser) {
        // Try to get outlet ID from custom claims
        const idTokenResult = await firebaseUser.getIdTokenResult();
        const outlet = idTokenResult.claims.outlet_id || localStorage.getItem('outlet_id');
        setOutletId(outlet as string);

        // Fetch role from backend users profile
        try {
          const profile = await getCurrentUserProfile();
          setRole((profile?.role as string) || null);
        } catch (error) {
          console.error("Error fetching user role from backend:", error);
        }
      } else {
        setOutletId(null);
        setRole(null);
      }
      
      setIsLoading(false); // Auth check complete
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await firebaseLogOut();
      setUser(null);
      setIsLoggedIn(false);
      setOutletId(null);
      setRole(null);
      localStorage.removeItem('outlet_id');
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn, isLoading, outletId, role, logout }}>
      {children}
    </AuthContext.Provider>
  );
}


// Custom hook to access auth state

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
