"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, logOut as firebaseLogOut } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/app";
import { doc, getDoc } from "firebase/firestore";

// Global Context
interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  outletId: string | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [outletId, setOutletId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser?.email || "No user");
      setUser(firebaseUser);
      setIsLoggedIn(!!firebaseUser);
      
      if (firebaseUser) {
        // 1. Try to get outlet ID from custom claims
        const idTokenResult = await firebaseUser.getIdTokenResult();
        let outlet = idTokenResult.claims.outlet_id as string;
        
        // 2. If not in claims, try Firestore document
        if (!outlet) {
          try {
            const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
            if (userDoc.exists()) {
              outlet = userDoc.data()?.outletID;
              console.log("Fetched outlet ID from Firestore:", outlet);
            }
          } catch (err) {
            console.error("Error fetching user document for outlet ID:", err);
          }
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
      localStorage.removeItem('outlet_id');
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn, isLoading, outletId, logout }}>
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
