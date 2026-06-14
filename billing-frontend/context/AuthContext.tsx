"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, logOut as firebaseLogOut } from "@/lib/firebase/auth";
import { getCurrentUserProfile, invalidateReadCache } from "@/lib/services/backendApi";

// Global Context
interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  outletId: string | null;
  accountStatus: string | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [outletId, setOutletId] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setIsLoggedIn(!!firebaseUser);
      
        if (firebaseUser) {
        let outlet: string | null = null;
        let status = 'approved';

        try {
          const profile = await getCurrentUserProfile();
          if (profile) {
            outlet = (profile?.outletID || profile?.outletId) as string;
            status = (profile?.status as string) || 'approved';
          }
        } catch (err) {
          console.error("Error fetching backend user profile for outlet ID/status:", err);
          status = 'pending';
        }

          setAccountStatus(status);
          if (status !== 'approved') {
            localStorage.setItem('auth_error', `Your outlet account is currently ${status === 'pending' ? 'pending admin approval' : status}.`);
          } else {
            localStorage.removeItem('auth_error');
          }
          localStorage.setItem('billing_account_status', status);

        // 2. Try custom claims as fallback
        if (!outlet) {
          const idTokenResult = await firebaseUser.getIdTokenResult();
          outlet = idTokenResult.claims.outlet_id as string;
        }

        // 3. Fallback to localStorage
        if (!outlet) {
          outlet = localStorage.getItem('outlet_id') as string;
        }

        if (outlet) {
          setOutletId(outlet);
          localStorage.setItem('outlet_id', outlet);
        } else {
          setOutletId(null);
        }
      } else {
        setOutletId(null);
        setAccountStatus(null);
        localStorage.removeItem('billing_account_status');
      }
      
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await firebaseLogOut();
      setUser(null);
      setIsLoggedIn(false);
      setOutletId(null);
      setAccountStatus(null);
      localStorage.removeItem('outlet_id');
      localStorage.removeItem('billing_account_status');
      invalidateReadCache();
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn, isLoading, outletId, accountStatus, logout }}>
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
