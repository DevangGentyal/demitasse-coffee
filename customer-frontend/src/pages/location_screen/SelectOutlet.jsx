import React, { useState, useEffect, useRef } from "react"
import { getOutlets, getTablesByOutletId } from "../../lib/backendApi"
import { useNavigate } from "react-router-dom"
import { useLocationContext } from "../../context/LocationContext"
import { useAuth } from "../../context/AuthContext"
import { validateUserProximity } from "../../lib/proximityUtils"

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_LOCAL ||
  "http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1"

// ── Inline banner ─────────────────────────────────────────────────────────────
const Banner = ({ message, type = "error", onClose }) => {
  if (!message) return null

  const styles =
    type === "success"
      ? "bg-green-50 border-green-200 text-green-700"
      : "bg-red-50 border-red-200 text-red-700"

  const icon = type === "success" ? "✅" : "⚠️"

  return (
    <div
      className={`flex items-start gap-3 border rounded-xl px-4 py-3 text-sm mb-4 ${styles}`}
    >
      <span className="text-base leading-none mt-0.5">{icon}</span>
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="font-bold text-base leading-none ml-1 opacity-50 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  )
}

// ─── Detecting Location Loader (full-screen, shown until step 2 is done) ──────
const DetectingLocationLoader = () => (
  <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f3ede8]">
    <div className="flex flex-col items-center gap-6">
      {/* Pulsing pin */}
      <div className="relative flex items-center justify-center">
        <span
          className="absolute inline-flex h-20 w-20 rounded-full bg-[#6B4F4F] opacity-20 animate-ping"
          style={{ animationDuration: "1.4s" }}
        />
        <span className="relative inline-flex items-center justify-center h-16 w-16 rounded-full bg-[#6B4F4F] shadow-lg">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-white"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </div>

      <div className="text-center">
        <p className="text-xl font-bold text-[#3e2723] tracking-tight">
          Detecting your location
        </p>
        <p className="text-sm text-[#6B4F4F]/70 mt-1">
          Finding the nearest outlet for you…
        </p>
      </div>

      {/* Animated dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-[#6B4F4F]"
            style={{
              animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>

    <style>{`
      @keyframes bounce {
        0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
        40%            { transform: translateY(-8px); opacity: 1; }
      }
    `}</style>
  </div>
)

// ─── Proximity Error Modal ────────────────────────────────────────────────────
const ProximityErrorModal = ({ message, onClose }) => {
  if (!message) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl text-center transform transition-all"
        style={{ animation: "slideUp 0.3s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
          <span className="text-3xl">📍</span>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Location Required</h3>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          {message}
        </p>
        <button
          onClick={onClose}
          className="w-full py-3 bg-[#8B4513] text-white rounded-xl font-bold shadow-md hover:bg-[#A0522D] transition-colors"
        >
          Okay, I understand
        </button>
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

// ─── Location Error Modal ─────────────────────────────────────────────────────
const LocationErrorModal = ({ message, onRefresh }) => {
  if (!message) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl text-center transform transition-all"
        style={{ animation: "slideUp 0.3s ease-out" }}
      >
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
          <span className="text-3xl">📍</span>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Location Access Required</h3>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          {message}
        </p>
        <button
          onClick={onRefresh}
          className="w-full py-3 bg-[#6B4F4F] text-white rounded-xl font-bold shadow-md hover:bg-[#5a4242] transition-colors"
        >
          Refresh Page
        </button>
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

const SelectOutlet = ({ onClose }) => {
  const navigate = useNavigate()
  const { setOutlet: setGlobalOutlet, setTableSelection } = useLocationContext()
  const { user } = useAuth()

  // ── Step tracking ─────────────────────────────────────────────────────────
  // Phase 1: fetch outlets (background)
  // Phase 2: fetch user location
  // After both done → rank + auto-select closest, show UI
  const rawOutletsRef = useRef([])   // unranked outlets cached until location arrives

  const [location, setLocation] = useState(null)
  // true until BOTH outlets fetched AND location resolved
  const [detectingLocation, setDetectingLocation] = useState(true)
  const [locationError, setLocationError] = useState(null)

  const [outlets, setOutlets] = useState([])
  const [tables, setTables] = useState([])
  const [tablesLoading, setTablesLoading] = useState(false)

  const [selectedOutlet, setSelectedOutlet] = useState("")
  const [selectedTableId, setSelectedTableId] = useState("")

  const [bannerMsg, setBannerMsg] = useState("")
  const [bannerType, setBannerType] = useState("error")

  const [continueLoading, setContinueLoading] = useState(false)
  const [joinDialog, setJoinDialog] = useState(null)

  const [showProximityModal, setShowProximityModal] = useState(false)
  const [proximityMessage, setProximityMessage] = useState("")

  const handleProximityError = (msg) => {
    setProximityMessage(msg)
    setShowProximityModal(true)
  }

  // Resolve a participant ID: registered user uid or persistent guest ID
  const getParticipantId = () => {
    if (user?.uid) return { userId: user.uid }
    let guestId = localStorage.getItem("guestId")
    if (!guestId) {
      guestId = "guest_" + Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem("guestId", guestId)
    }
    return { guestId }
  }

  const showMsg = (msg, type = "error") => {
    setBannerMsg(msg)
    setBannerType(type)
  }

  // ── Distance calculation ─────────────────────────────────────────────────
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371
    const dLat = (lat2 - lat1) * (Math.PI / 180)
    const dLon = (lon2 - lon1) * (Math.PI / 180)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // ── Rank outlets by distance and auto-select the closest ────────────────
  const rankAndSelectOutlets = (rawList, userLocation) => {
    const ranked = rawList
      .map((outlet) => {
        let distance = null
        if (userLocation && typeof outlet.location === "string" && outlet.location.includes(",")) {
          const [parsedLat, parsedLng] = outlet.location
            .split(",")
            .map((v) => parseFloat(v.trim()))
          if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
            distance = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              parsedLat,
              parsedLng
            )
          }
        }
        return { ...outlet, distance }
      })
      .sort((a, b) => (a.distance ?? 999999) - (b.distance ?? 999999))

    setOutlets(ranked)

    // Auto-select the nearest outlet
    if (ranked.length > 0) {
      setSelectedOutlet(ranked[0].id)
    }
  }


  // ── Step 1 + 2: fetch outlets and location in parallel ───────────────────
  useEffect(() => {
    let cancelled = false

    // Step 1: fetch outlets (runs immediately, result cached in ref)
    const fetchRawOutlets = async () => {
      try {
        const outletListRaw = await getOutlets()
        if (cancelled) return

        const filtered = outletListRaw
          .filter((docSnap) => {
            const status = String(docSnap?.status || '').trim().toLowerCase()
            const name = String(docSnap?.name || '').trim()
            return Boolean(name) && (status === "approved" || status === "accepted")
          })
          .map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap || {}),
            distance: null,
          }))

        rawOutletsRef.current = filtered
      } catch (error) {
        console.error("Error fetching outlets:", error)
        if (!cancelled) showMsg("Failed to load outlets.")
      }
    }

    // Step 2: get user location
    const getLocation = () => {
      if (!navigator.geolocation) {
        const errMsg =
          "Geolocation is not supported by your browser. Please use a browser that supports location services."
        setLocationError(errMsg)
        setDetectingLocation(false)
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }
          setLocation(userLocation)
          rankAndSelectOutlets(rawOutletsRef.current, userLocation)
          setDetectingLocation(false)
        },
        (error) => {
          if (cancelled) return
          console.error("Geolocation error:", error)
          let errMsg =
            "Unable to retrieve your location. Please ensure location access is enabled in your browser settings and try again."
          if (error.code === error.PERMISSION_DENIED) {
            errMsg =
              "Location access was denied. Please enable location permissions for this website in your browser settings and refresh."
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            errMsg =
              "Location information is unavailable. Please verify your device's location services are turned on."
          } else if (error.code === error.TIMEOUT) {
            errMsg = "Location request timed out. Please try refreshing."
          }
          setLocationError(errMsg)
          setDetectingLocation(false)
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      )
    }

    // Run both in parallel — outlets fetches while browser asks for permission
    fetchRawOutlets().then(() => {
      if (!cancelled) getLocation()
    })

    return () => { cancelled = true }
  }, [])

  // ── Fetch tables whenever selected outlet changes ────────────────────────
  useEffect(() => {
    if (!selectedOutlet) {
      setTables([])
      setSelectedTableId("")
      return
    }
    fetchTablesByOutlet(selectedOutlet)
  }, [selectedOutlet])

  const fetchTablesByOutlet = async (outletId) => {
    try {
      setTablesLoading(true)
      const tableDocs = await getTablesByOutletId(outletId)
      const tableList = tableDocs
        .map((tableDoc) => ({
          id: tableDoc.id,
          name: tableDoc?.name || "",
          owner: tableDoc?.owner || "",
        }))
        .filter((table) => Boolean(table.name))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        )
      setTables(tableList)
    } catch (error) {
      console.error("Error fetching tables:", error)
      showMsg("Failed to load tables for the selected outlet.")
    } finally {
      setTablesLoading(false)
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleOutletChange = (e) => {
    setSelectedOutlet(e.target.value)
    setSelectedTableId("")
    setBannerMsg("")
  }

  const handleTableChange = (e) => {
    setSelectedTableId(e.target.value)
    setBannerMsg("")
  }

  // ── Continue ─────────────────────────────────────────────────────────────
  const handleContinue = async () => {
    if (continueLoading) return

    if (!selectedOutlet) {
      showMsg("Please select an outlet to continue.")
      return
    }

    if (!selectedTableId.trim()) {
      showMsg("Please select a table.")
      return
    }

    const selectedObj = outlets.find((o) => o.id === selectedOutlet)

    if (selectedObj) {
      setGlobalOutlet(selectedObj.id, selectedObj.name)
    }

    const selectedTable = tables.find((table) => table.id === selectedTableId)

    if (!selectedTable) {
      showMsg("Selected table was not found. Please choose again.")
      return
    }

    try {
      setContinueLoading(true)

      // Validate distance to selected outlet
      const prox = await validateUserProximity(selectedOutlet)
      if (!prox.success) {
        handleProximityError(prox.error)
        setContinueLoading(false)
        return
      }

      console.info('[customer/select-outlet] continue clicked', {
        selectedOutlet,
        selectedTableId,
        selectedTableName: selectedTable?.name || null,
        currentUserId: user?.uid || null,
        hasGuestId: Boolean(localStorage.getItem('guestId')),
      })

      const participantFields = getParticipantId()
      console.info('[customer/select-outlet] participant resolved', participantFields)
      if (!participantFields.userId && !participantFields.guestId) {
        showMsg("Please log in or continue as guest to proceed.")
        return
      }

      const sessionResponse = await fetch(
        `${API_BASE}/customerSessionOpen`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outletId: selectedOutlet,
            tableId: selectedTable.id,
            ...participantFields,
          }),
        }
      )

      const sessionPayload = await sessionResponse.json().catch(() => ({}))

      console.info('[customer/select-outlet] session response', {
        ok: sessionResponse.ok,
        status: sessionResponse.status,
        payload: sessionPayload,
      })

      if (
        !sessionResponse.ok ||
        !sessionPayload?.success ||
        !sessionPayload?.sessionId
      ) {
        throw new Error(sessionPayload?.message || "Failed to initialize session")
      }

      const sessionId = String(sessionPayload.sessionId)
      const currentParticipantId = participantFields.userId || participantFields.guestId || ""
      const resolvedOwnerId = String(sessionPayload.ownerId || "") || currentParticipantId
      const isJoining = sessionPayload.created === false && resolvedOwnerId !== currentParticipantId

      console.info('[customer/select-outlet] session resolved', {
        sessionId,
        created: sessionPayload.created,
        isJoining,
        ownerId: resolvedOwnerId,
      })

      if (!resolvedOwnerId) {
        showMsg("Unable to identify the table owner. Please reselect the table.")
        return
      }

      if (isJoining) {
        setJoinDialog({
          tableId: selectedTable.id,
          tableName: selectedTable.name,
          ownerId: resolvedOwnerId,
          sessionId,
          outletId: selectedOutlet,
          outletName: selectedObj?.name || "",
        })
        setContinueLoading(false)
        return
      }

      setTableSelection(selectedTable.id, selectedTable.name, resolvedOwnerId, sessionId)
      if (onClose) onClose()
      navigate("/home")
    } catch (error) {
      console.error("Failed to initialize table session:", error)
      showMsg(
        error?.message ||
        "Unable to reserve table ownership right now. Please try again."
      )
    } finally {
      setContinueLoading(false)
    }
  }

  // ── Join dialog handlers ──────────────────────────────────────────────────
  const handleJoinConfirm = () => {
    if (!joinDialog) return
    setGlobalOutlet(joinDialog.outletId, joinDialog.outletName)
    setTableSelection(
      joinDialog.tableId,
      joinDialog.tableName,
      joinDialog.ownerId,
      joinDialog.sessionId
    )
    setJoinDialog(null)
    if (onClose) onClose()
    navigate("/home")
  }

  const handleJoinCancel = () => {
    setJoinDialog(null)
  }

  // ── Phase guard: show full-screen loader until location is resolved ───────
  if (detectingLocation) {
    return <DetectingLocationLoader />
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f3ede8] px-4">
      {/* Join session confirmation dialog */}
      {joinDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center text-2xl">
              👥
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Join Existing Session?
            </h3>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              You are joining an existing table session at{" "}
              <strong>{joinDialog.tableName}</strong>. All orders placed at
              this table will be shared in the same session.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleJoinCancel}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleJoinConfirm}
                className="flex-1 py-2.5 rounded-xl bg-[#6B4F4F] text-sm font-semibold text-white hover:bg-[#5a4242] transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8 text-center">
        <h2 className="text-2xl font-bold text-[#3e2723] mb-4">
          Select Nearby Outlet &amp; Table
        </h2>

        {showProximityModal && (
          <ProximityErrorModal
            message={proximityMessage}
            onClose={() => setShowProximityModal(false)}
          />
        )}

        {/* Banner for non-proximity errors */}
        <Banner
          message={bannerMsg}
          type={bannerType}
          onClose={() => setBannerMsg("")}
        />

        {locationError && (
          <LocationErrorModal
            message={locationError}
            onRefresh={() => window.location.reload()}
          />
        )}

        {/* Location status badge */}
        {location ? (
          <p className="text-sm text-green-600 mb-4">
            📍 Location detected
          </p>
        ) : (
          <p className="text-sm text-red-600 mb-4">
            Location access required
          </p>
        )}

        {/* OUTLET SELECT */}
        <select
          className="w-full border rounded-md p-2 mb-4 outline-none focus:ring-1 focus:ring-brown-500"
          value={selectedOutlet}
          onChange={handleOutletChange}
        >
          <option value="">Select Outlet</option>
          {outlets.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.name}
              {outlet.distance != null
                ? ` (${outlet.distance.toFixed(1)} km)`
                : ""}
            </option>
          ))}
        </select>

        {/* TABLE SELECT */}
        <select
          className="w-full border rounded-md p-2 mb-4 outline-none focus:ring-1 focus:ring-brown-500"
          value={selectedTableId}
          onChange={handleTableChange}
          disabled={!selectedOutlet || tablesLoading}
        >
          <option value="">
            {!selectedOutlet
              ? "Select outlet first"
              : tablesLoading
                ? "Loading tables..."
                : "Select Table"}
          </option>
          {tables.map((table) => (
            <option key={table.id} value={table.id}>
              {table.name}
            </option>
          ))}
        </select>

        {selectedOutlet && !tablesLoading && tables.length === 0 && (
          <p className="text-xs text-red-600 mb-4 text-left">
            No tables found for this outlet.
          </p>
        )}

        <button
          className={`text-white w-full py-2 rounded-lg font-medium transition ${continueLoading
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-[#6B4F4F]"
            }`}
          onClick={handleContinue}
          disabled={continueLoading}
        >
          {continueLoading ? "Please wait..." : "Continue"}
        </button>
      </div>
    </div>
  )
}

export default SelectOutlet
