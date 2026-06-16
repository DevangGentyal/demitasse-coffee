import { createContext, useContext, useState, useEffect, useRef } from "react";
import { getSessionById, getTableById } from "../lib/backendApi";
import { db } from "../lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

const LocationContext = createContext();

// Keys to clear when a session ends. Menu cache (menu_*) is intentionally excluded.
const LOCATION_KEYS = [
    "selectedOutlet",
    "outletName",
    "selectedTableId",
    "selectedTableName",
    "selectedTableOwnerId",
    "tableNumber",
    "locationLastSeenAt",
    "selectedSessionId",
    "sessionSelectedAt",
    "isClosingSession",
    "paymentLockSessionId",
    "paymentLockTableId",
    "paymentLockTableName",
];

const SESSION_SELECTION_GRACE_MS = 5000;

// ── Cookie helpers ────────────────────────────────────────────────────────────

const setCookie = (name, value) => {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${86400 * 7}`;
};

const getCookie = (name) => {
    const nameEQ = `${encodeURIComponent(name)}=`;
    for (let c of document.cookie.split(";")) {
        c = c.trim();
        if (c.startsWith(nameEQ)) return decodeURIComponent(c.substring(nameEQ.length));
    }
    return null;
};

const deleteCookie = (name) => {
    document.cookie = `${encodeURIComponent(name)}=; Path=/; Max-Age=-1`;
};

// Wipes every location-related key + session cookie, then hard-reloads.
const wipeSessionAndReload = () => {
    console.info("[customer/location] session closed remotely — wiping storage and reloading");
    LOCATION_KEYS.forEach((key) => localStorage.removeItem(key));
    deleteCookie("selectedSessionId");
    window.dispatchEvent(new CustomEvent("demitasse:session-ended"));
    window.location.reload();
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
    const sessionPollTokenRef = useRef(0);

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

    const resetSelectionState = () => {
        setSelectedOutletState("");
        setOutletNameState("");
        setTableNumberState("");
        setSelectedTableIdState("");
        setSelectedTableNameState("");
        setSelectedTableOwnerIdState("");
        setSelectedSessionIdState("");
    };

    // ── On-mount: verify stored session is still active ──────────────────────
    useEffect(() => {
        let cancelled = false;

        const verifyStoredSession = async () => {
            const storedSessionId = localStorage.getItem("selectedSessionId") || getCookie("selectedSessionId");
            const storedTableId = localStorage.getItem("selectedTableId") || "";
            const storedOutletId = localStorage.getItem("selectedOutlet") || "";

            if (!storedTableId || !storedOutletId) return;

            try {
                const tableDocs = await getTableById(storedTableId, storedOutletId);
                const tableData = tableDocs[0] || null;
                if (cancelled) return;

                if (!tableData) { clearStoredLocation(); resetSelectionState(); return; }

                const tableOutletId = typeof tableData.outletId === "string" ? tableData.outletId : "";
                if (tableOutletId && tableOutletId !== storedOutletId) {
                    clearStoredLocation(); resetSelectionState(); return;
                }

                const ownerId = typeof tableData.owner === "string" ? tableData.owner : "";
                if (ownerId && ownerId !== selectedTableOwnerId) {
                    setSelectedTableOwnerIdState(ownerId);
                    localStorage.setItem("selectedTableOwnerId", ownerId);
                }

                const tableStatus = typeof tableData.status === "string" ? tableData.status.trim().toUpperCase() : "";
                const tableName = typeof tableData.name === "string" ? tableData.name : storedTableId;
                const tableSessionId = typeof tableData.activeSessionId === "string" ? tableData.activeSessionId : storedSessionId || "";

                if (tableStatus === "BILL") {
                    requestPaymentLock({ sessionId: tableSessionId, tableId: storedTableId, tableName });
                    return;
                }

                if (storedSessionId) {
                    try {
                        const sessionDocs = await getSessionById(storedSessionId);
                        const sessionData = sessionDocs[0] || null;
                        if (sessionData) {
                            const sessionStatus = typeof sessionData.status === "string" ? sessionData.status : "";
                            const sessionDocId = typeof sessionData.id === "string" ? sessionData.id : "";
                            const sessionFieldId = String(sessionData.sessionId || "").trim();
                            const sessionTableId = typeof sessionData.tableId === "string" ? sessionData.tableId : "";
                            if (
                                sessionStatus === "ACTIVE" &&
                                (!sessionTableId || sessionTableId === storedTableId) &&
                                (sessionDocId === storedSessionId || sessionFieldId === storedSessionId)
                            ) {
                                if (cancelled) return;
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

                localStorage.removeItem("selectedSessionId");
                deleteCookie("selectedSessionId");
                if (cancelled) return;
                setSelectedSessionIdState("");
            } catch (error) {
                console.error("Failed to verify stored table:", error);
            }
        };

        verifyStoredSession();
        return () => { cancelled = true; };
    }, []);

    // ── Real-time listener: session document ─────────────────────────────────
    // Listens on outlets/{outletId}/sessions/{sessionId}.
    // Fires immediately when status → "CLOSED". Covered by Firestore rules that
    // allow the owning customer to read their session.
    useEffect(() => {
        const sessionId = selectedSessionId;
        const outletId = localStorage.getItem("selectedOutlet") || "";
        if (!sessionId || !outletId) return;

        console.info("[customer/location] attaching session listener", { sessionId, outletId });

        const sessionRef = doc(db, "outlets", outletId, "sessions", sessionId);
        let didFire = false; // prevent double-reload on fast unmount

        const unsubscribe = onSnapshot(
            sessionRef,
            (snapshot) => {
                if (didFire) return;

                if (!snapshot.exists()) {
                    // Doc deleted — treat as closed
                    didFire = true;
                    wipeSessionAndReload();
                    return;
                }

                const data = snapshot.data() || {};
                const status = typeof data.status === "string" ? data.status.trim().toUpperCase() : "";

                if (status === "CLOSED") {
                    didFire = true;
                    wipeSessionAndReload();
                }
            },
            (error) => {
                // Permission denied or unavailable — fall through to table listener
                console.warn("[customer/location] session snapshot error (falling back to table listener):", error.code, error.message);
            }
        );

        return () => {
            console.info("[customer/location] detaching session listener", { sessionId });
            unsubscribe();
        };
    }, [selectedSessionId]);

    // ── Real-time listener: table document ───────────────────────────────────
    // Customers already need read access to the tables collection (used via
    // getTableById throughout the app). This is the definitive fallback:
    // the moment the admin clears activeSessionId / sets occupied=false, we wipe
    // and reload. No polling delay, no debounce — instant Firestore push.
    useEffect(() => {
        const tableId = selectedTableId;
        const outletId = localStorage.getItem("selectedOutlet") || "";
        const sessionId = selectedSessionId;
        if (!tableId || !outletId || !sessionId) return;

        console.info("[customer/location] attaching table listener", { tableId, outletId, sessionId });

        const tableRef = doc(db, "outlets", outletId, "tables", tableId);
        let didFire = false;

        const unsubscribe = onSnapshot(
            tableRef,
            (snapshot) => {
                if (didFire) return;

                if (!snapshot.exists()) {
                    didFire = true;
                    wipeSessionAndReload();
                    return;
                }

                const data = snapshot.data() || {};
                const activeSessionId = typeof data.activeSessionId === "string" ? data.activeSessionId : "";
                const occupied = !!data.occupied;
                const tableStatus = typeof data.status === "string" ? data.status.trim().toUpperCase() : "";

                // Handle billing lock
                if (tableStatus === "BILL") {
                    requestPaymentLock({
                        sessionId: activeSessionId || sessionId,
                        tableId,
                        tableName: typeof data.name === "string" ? data.name : "",
                    });
                    return;
                }

                // Grace period: ignore changes in the first 5 seconds after selecting
                const selectedAt = Number(localStorage.getItem("sessionSelectedAt") || 0);
                const isFreshSelection = selectedAt > 0 && Date.now() - selectedAt < SESSION_SELECTION_GRACE_MS;
                if (isFreshSelection) return;

                // Session was closed: table is now idle / session changed
                const sessionWasReplaced = activeSessionId && activeSessionId !== sessionId;
                const sessionWasCleared = !activeSessionId && !occupied;

                if (sessionWasCleared || sessionWasReplaced) {
                    didFire = true;
                    wipeSessionAndReload();
                }
            },
            (error) => {
                console.warn("[customer/location] table snapshot error:", error.code, error.message);
            }
        );

        return () => {
            console.info("[customer/location] detaching table listener", { tableId });
            unsubscribe();
        };
    }, [selectedTableId, selectedSessionId]);

    // ── Touch lastSeenAt on window focus ─────────────────────────────────────
    useEffect(() => {
        const touch = () => localStorage.setItem("locationLastSeenAt", String(Date.now()));
        window.addEventListener("focus", touch);
        document.addEventListener("visibilitychange", touch);
        return () => {
            window.removeEventListener("focus", touch);
            document.removeEventListener("visibilitychange", touch);
        };
    }, []);

    // ── Payment lock polling (BILL status) ───────────────────────────────────
    // Keep the REST-based poll only for the payment lock scenario, since the
    // table onSnapshot already handles the session-closed case.
    useEffect(() => {
        if (!selectedTableId || !selectedSessionId) return undefined;
        const pollToken = ++sessionPollTokenRef.current;
        let cancelled = false;

        const pollTable = async () => {
            try {
                const tableDocs = await getTableById(selectedTableId, selectedOutlet);
                if (cancelled || pollToken !== sessionPollTokenRef.current) return;

                const data = tableDocs[0] || null;
                if (!data) { clearLocation(); resetSelectionState(); return; }

                const activeSessionId = typeof data.activeSessionId === "string" ? data.activeSessionId : "";
                const occupied = !!data.occupied;
                const lockSessionId = localStorage.getItem("paymentLockSessionId") || selectedSessionId || "";

                const lockStillActive = Boolean(activeSessionId && activeSessionId === lockSessionId && occupied);
                if (!lockStillActive) {
                    clearPaymentLock();
                    clearLocation();
                    resetSelectionState();
                }
            } catch (err) {
                console.warn("Payment lock poll error:", err);
            }
        };

        pollTable();
        const intervalId = setInterval(pollTable, 5000);
        return () => { cancelled = true; clearInterval(intervalId); };
    }, [paymentLockActive, selectedTableId, selectedSessionId]);

    // ── Setters ───────────────────────────────────────────────────────────────

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

        if (sessionId) {
            console.info("[customer/location] set table selection with session", {
                tableId: resolvedId, tableName: resolvedName,
                ownerId: resolvedOwnerId || null, sessionId,
            });
            localStorage.setItem("sessionSelectedAt", String(Date.now()));
            localStorage.setItem("selectedSessionId", sessionId);
            setCookie("selectedSessionId", sessionId);
            setSelectedSessionIdState(sessionId);
        }
    };

    const clearLocation = () => {
        clearStoredLocation();
        resetSelectionState();
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
