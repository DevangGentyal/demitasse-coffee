import { createContext, useContext, useState, useEffect } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

const LocationContext = createContext();

const LOCATION_KEYS = [
    "selectedOutlet",
    "outletName",
    "selectedTableId",
    "selectedTableName",
    "selectedTableOwnerId",
    "tableNumber",
    "locationLastSeenAt",
    "selectedSessionId",
];

// Cookie utilities for sessionId (7-day persistence)
const setCookie = (name, value) => {
    const cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${86400 * 7}`;
    document.cookie = cookie;
};

const getCookie = (name) => {
    const nameEQ = `${encodeURIComponent(name)}=`;
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.startsWith(nameEQ)) {
            return decodeURIComponent(cookie.substring(nameEQ.length));
        }
    }
    return null;
};

const deleteCookie = (name) => {
    document.cookie = `${encodeURIComponent(name)}=; Path=/; Max-Age=-1`;
};

const clearStoredLocation = () => {
    LOCATION_KEYS.forEach((key) => localStorage.removeItem(key));
    deleteCookie("selectedSessionId");
};

export const useLocationContext = () => useContext(LocationContext);

export function LocationProvider({ children }) {
    const [selectedOutlet, setSelectedOutletState] = useState(
        localStorage.getItem("selectedOutlet") || ""
    );

    const [outletName, setOutletNameState] = useState(
        localStorage.getItem("outletName") || ""
    );

    const [tableNumber, setTableNumberState] = useState(
        localStorage.getItem("tableNumber") || ""
    );

    const [selectedTableId, setSelectedTableIdState] = useState(
        localStorage.getItem("selectedTableId") || ""
    );

    const [selectedTableName, setSelectedTableNameState] = useState(
        localStorage.getItem("selectedTableName") || localStorage.getItem("tableNumber") || ""
    );

    const [selectedTableOwnerId, setSelectedTableOwnerIdState] = useState(
        localStorage.getItem("selectedTableOwnerId") || ""
    );

    const [selectedSessionId, setSelectedSessionIdState] = useState(
        localStorage.getItem("selectedSessionId") || getCookie("selectedSessionId") || ""
    );

    useEffect(() => {
        const verifyStoredSession = async () => {
            const storedSessionId = localStorage.getItem("selectedSessionId") || getCookie("selectedSessionId");
            const storedTableId = localStorage.getItem("selectedTableId") || "";
            const storedOutletId = localStorage.getItem("selectedOutlet") || "";

            // Verify table exists and outlet matches
            if (!storedTableId || !storedOutletId) {
                return;
            }

            try {
                const tableSnap = await getDoc(doc(db, "tables", storedTableId));
                if (!tableSnap.exists()) {
                    clearStoredLocation();
                    setSelectedOutletState("");
                    setOutletNameState("");
                    setTableNumberState("");
                    setSelectedTableIdState("");
                    setSelectedTableNameState("");
                    setSelectedTableOwnerIdState("");
                    setSelectedSessionIdState("");
                    return;
                }

                const tableData = tableSnap.data() || {};
                const tableOutletId = typeof tableData.outletId === "string" ? tableData.outletId : "";
                if (tableOutletId && tableOutletId !== storedOutletId) {
                    clearStoredLocation();
                    setSelectedOutletState("");
                    setOutletNameState("");
                    setTableNumberState("");
                    setSelectedTableIdState("");
                    setSelectedTableNameState("");
                    setSelectedTableOwnerIdState("");
                    setSelectedSessionIdState("");
                    return;
                }

                const ownerId = typeof tableData.owner === "string" ? tableData.owner : "";
                if (ownerId && ownerId !== selectedTableOwnerId) {
                    setSelectedTableOwnerIdState(ownerId);
                    localStorage.setItem("selectedTableOwnerId", ownerId);
                }

                // Verify session is still active (if stored)
                if (storedSessionId) {
                    try {
                        const sessionSnap = await getDoc(doc(db, "sessions", storedSessionId));
                        if (sessionSnap.exists()) {
                            const sessionData = sessionSnap.data() || {};
                            const sessionStatus = typeof sessionData.status === "string" ? sessionData.status : "";
                            const sessionTableId = typeof sessionData.tableId === "string" ? sessionData.tableId : "";
                            if (sessionStatus === "ACTIVE" && (!sessionTableId || sessionTableId === storedTableId)) {
                                // Session is still active, restore it
                                localStorage.setItem("selectedSessionId", storedSessionId);
                                setCookie("selectedSessionId", storedSessionId);
                                setSelectedSessionIdState(storedSessionId);
                                return;
                            }
                        }
                    } catch (sessionError) {
                        console.warn("Failed to verify session:", sessionError);
                    }
                }

                // Session is closed/invalid - clear it but keep table selection
                // This allows users to still generate bills for previous orders
                console.warn("Stored session is no longer active; cleared sessionId but table selection preserved for fallback");
                localStorage.removeItem("selectedSessionId");
                deleteCookie("selectedSessionId");
                setSelectedSessionIdState("");
            } catch (error) {
                console.error("Failed to verify stored table:", error);
            }
        };

        verifyStoredSession();
    }, []);

    // Listen for remote table resets. If an admin closes the session or resets the table
    // (clears `activeSessionId` or marks `isOccupied=false`), clear the client's stored
    // outlet/table/session so they must re-select.
    useEffect(() => {
        if (!selectedTableId) return undefined;

        const tableRef = doc(db, "tables", selectedTableId);
        const unsub = onSnapshot(
            tableRef,
            (snap) => {
                if (!snap.exists()) {
                    // Table removed remotely — clear everything
                    clearLocation();
                    setSelectedOutletState("");
                    setOutletNameState("");
                    setTableNumberState("");
                    setSelectedTableIdState("");
                    setSelectedTableNameState("");
                    setSelectedTableOwnerIdState("");
                    setSelectedSessionIdState("");
                    return;
                }

                const data = snap.data() || {};
                const activeSessionId = typeof data.activeSessionId === "string" ? data.activeSessionId : "";
                const isOccupied = !!data.isOccupied;

                // If table was reset/cleared by admin, force client to reselect outlet/table
                if (!isOccupied || !activeSessionId) {
                    clearLocation();
                    setSelectedOutletState("");
                    setOutletNameState("");
                    setTableNumberState("");
                    setSelectedTableIdState("");
                    setSelectedTableNameState("");
                    setSelectedTableOwnerIdState("");
                    setSelectedSessionIdState("");
                }
            },
            (err) => {
                console.warn("Table listener error:", err);
            }
        );

        return () => unsub();
    }, [selectedTableId]);

    useEffect(() => {
        const touchLastSeen = () => {
            localStorage.setItem("locationLastSeenAt", String(Date.now()));
        };

        window.addEventListener("focus", touchLastSeen);
        document.addEventListener("visibilitychange", touchLastSeen);

        return () => {
            window.removeEventListener("focus", touchLastSeen);
            document.removeEventListener("visibilitychange", touchLastSeen);
        };
    }, []);

    const setOutlet = (outletId, name) => {
        setSelectedOutletState(outletId);
        localStorage.setItem("selectedOutlet", outletId);
        localStorage.setItem("locationLastSeenAt", String(Date.now()));
        if (name) {
            setOutletNameState(name);
            localStorage.setItem("outletName", name);
        }
    };

    const setTableNumber = (tableNum) => {
        // Backward-compatible setter used by older screens.
        setTableNumberState(tableNum);
        setSelectedTableNameState(tableNum);
        setSelectedTableIdState("");
        setSelectedTableOwnerIdState("");
        localStorage.setItem("selectedTableName", tableNum);
        localStorage.removeItem("selectedTableId");
        localStorage.removeItem("selectedTableOwnerId");
        localStorage.setItem("tableNumber", tableNum);
        localStorage.setItem("locationLastSeenAt", String(Date.now()));
    };

    const setTableSelection = (tableId, tableName, ownerId = "", sessionId = null) => {
        const resolvedId = tableId || "";
        const resolvedName = tableName || "";
        const resolvedOwnerId = ownerId || "";

        setSelectedTableIdState(resolvedId);
        setSelectedTableNameState(resolvedName);
        setSelectedTableOwnerIdState(resolvedOwnerId);
        setTableNumberState(resolvedName);

        localStorage.setItem("selectedTableId", resolvedId);
        localStorage.setItem("selectedTableName", resolvedName);
        localStorage.setItem("selectedTableOwnerId", resolvedOwnerId);
        localStorage.setItem("tableNumber", resolvedName);
        localStorage.setItem("locationLastSeenAt", String(Date.now()));

        // Store sessionId in both localStorage and cookies
        if (sessionId) {
            localStorage.setItem("selectedSessionId", sessionId);
            setCookie("selectedSessionId", sessionId);
            setSelectedSessionIdState(sessionId);
        }
    };

    const clearLocation = () => {
        clearStoredLocation();
        setSelectedOutletState("");
        setOutletNameState("");
        setTableNumberState("");
        setSelectedTableIdState("");
        setSelectedTableNameState("");
        setSelectedTableOwnerIdState("");
        setSelectedSessionIdState("");
    };

    return (
        <LocationContext.Provider
            value={{
                selectedOutlet,
                outletName,
                setOutlet,
                tableNumber,
                setTableNumber,
                selectedTableId,
                selectedTableName,
                selectedTableOwnerId,
                selectedSessionId,
                setTableSelection,
                clearLocation,
            }}
        >
            {children}
        </LocationContext.Provider>
    );
}
