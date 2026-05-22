import { createContext, useContext, useState, useEffect } from "react";
import { getSessionById, getTableById } from "../lib/backendApi";

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
    "isClosingSession",
    "paymentLockSessionId",
    "paymentLockTableId",
    "paymentLockTableName",
];

const SESSION_SELECTION_GRACE_MS = 5000;

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

const notifySessionEnded = () => {
    window.dispatchEvent(new CustomEvent("demitasse:session-ended"));
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

    const [paymentLockActive, setPaymentLockActive] = useState(
        localStorage.getItem("isClosingSession") === "true"
    );

    useEffect(() => {
        const verifyStoredSession = async () => {
            const storedSessionId = localStorage.getItem("selectedSessionId") || getCookie("selectedSessionId");
            const storedTableId = localStorage.getItem("selectedTableId") || "";
            const storedOutletId = localStorage.getItem("selectedOutlet") || "";

            console.info("[customer/location] verify stored session", {
                storedSessionId: storedSessionId || null,
                storedTableId: storedTableId || null,
                storedOutletId: storedOutletId || null,
            });

            // Verify table exists and outlet matches
            if (!storedTableId || !storedOutletId) {
                return;
            }

            try {
                const tableDocs = await getTableById(storedTableId);
                const tableData = tableDocs[0] || null;
                if (!tableData) {
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
                        const sessionDocs = await getSessionById(storedSessionId);
                        const sessionData = sessionDocs[0] || null;
                        if (sessionData) {
                            const sessionStatus = typeof sessionData.status === "string" ? sessionData.status : "";
                            const sessionDocId = typeof sessionData.id === "string" ? sessionData.id : "";
                            const sessionFieldId = String(sessionData.sessionId || "").trim();
                            const sessionTableId = typeof sessionData.tableId === "string" ? sessionData.tableId : "";
                            if (sessionStatus === "ACTIVE" && (!sessionTableId || sessionTableId === storedTableId) && (sessionDocId === storedSessionId || sessionFieldId === storedSessionId)) {
                                // Session is still active, restore it
                                console.info("[customer/location] restored stored session", {
                                    storedSessionId,
                                    sessionDocId,
                                    sessionFieldId,
                                    sessionTableId,
                                    sessionStatus,
                                });
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
        let clearTimer = null;

        const pollTable = async () => {
            try {
                const tableDocs = await getTableById(selectedTableId);
                const data = tableDocs[0] || null;
                if (!data) {
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

                const activeSessionId = typeof data.activeSessionId === "string" ? data.activeSessionId : "";
                const isOccupied = !!data.isOccupied;
                const selectedAt = Number(localStorage.getItem("sessionSelectedAt") || 0);
                const isFreshSelection = selectedAt > 0 && Date.now() - selectedAt < SESSION_SELECTION_GRACE_MS;

                const isPaymentLocked = localStorage.getItem("isClosingSession") === "true";
                const lockSessionId = localStorage.getItem("paymentLockSessionId") || selectedSessionId || "";

                if (isPaymentLocked) {
                    const lockStillActive = Boolean(activeSessionId && activeSessionId === lockSessionId && isOccupied);
                    if (lockStillActive) {
                        if (clearTimer) {
                            clearTimeout(clearTimer);
                            clearTimer = null;
                        }
                        return;
                    }

                    clearPaymentLock();
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

                const currentStoredSessionId =
                    localStorage.getItem("selectedSessionId") ||
                    getCookie("selectedSessionId") ||
                    selectedSessionId ||
                    "";

                const shouldClear =
                    !isFreshSelection &&
                    currentStoredSessionId !== "" &&
                    (!activeSessionId || activeSessionId !== currentStoredSessionId || !isOccupied);

                if (shouldClear) {
                    if (!clearTimer) {
                        clearTimer = setTimeout(() => {
                            notifySessionEnded();
                            clearLocation();
                            setSelectedOutletState("");
                            setOutletNameState("");
                            setTableNumberState("");
                            setSelectedTableIdState("");
                            setSelectedTableNameState("");
                            setSelectedTableOwnerIdState("");
                            setSelectedSessionIdState("");
                        }, 3000);
                    }
                } else if (clearTimer) {
                    clearTimeout(clearTimer);
                    clearTimer = null;
                }
            } catch (err) {
                console.warn("Table polling error:", err);
            }
        };

        pollTable();
        const intervalId = setInterval(pollTable, 5000);

        return () => {
            clearInterval(intervalId);
            if (clearTimer) clearTimeout(clearTimer);
        };
    }, [selectedTableId, selectedSessionId, paymentLockActive]);

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
            console.info("[customer/location] set table selection with session", {
                tableId: resolvedId,
                tableName: resolvedName,
                ownerId: resolvedOwnerId || null,
                sessionId,
            });
            localStorage.setItem("sessionSelectedAt", String(Date.now()));
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
        setPaymentLockActive(false);
    };

    const requestPaymentLock = ({ sessionId = "", tableId = "", tableName = "" } = {}) => {
        localStorage.setItem("isClosingSession", "true");
        localStorage.setItem("paymentLockSessionId", sessionId);
        localStorage.setItem("paymentLockTableId", tableId);
        localStorage.setItem("paymentLockTableName", tableName);
        setPaymentLockActive(true);
    };

    const clearPaymentLock = () => {
        localStorage.removeItem("isClosingSession");
        localStorage.removeItem("paymentLockSessionId");
        localStorage.removeItem("paymentLockTableId");
        localStorage.removeItem("paymentLockTableName");
        setPaymentLockActive(false);
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
                paymentLockActive,
                setTableSelection,
                requestPaymentLock,
                clearPaymentLock,
                clearLocation,
            }}
        >
            {children}
        </LocationContext.Provider>
    );
}
