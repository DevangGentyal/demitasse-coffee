import React, { useState, useEffect } from "react"
import { getOutlets, getTablesByOutletId } from "../../lib/backendApi"
import { useNavigate } from "react-router-dom"
import { useLocationContext } from "../../context/LocationContext"
import { useAuth } from "../../context/AuthContext"
import { validateUserProximity } from "../../lib/proximityUtils"

const API_BASE =
  import.meta.env.VITE_API_BASE ||
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

const SelectOutlet = ({ onClose }) => {
  const navigate = useNavigate()

  const { setOutlet: setGlobalOutlet, setTableSelection } =
    useLocationContext()

  const { user } = useAuth()

  const [location, setLocation] = useState(null)
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

  useEffect(() => {
    getLocation()
  }, [])

  useEffect(() => {
    if (!selectedOutlet) {
      setTables([])
      setSelectedTableId("")
      return
    }

    fetchTablesByOutlet(selectedOutlet)
  }, [selectedOutlet])

  // ────────────────────────────────────────────────────────────────────────────
  // Distance calculation
  // ────────────────────────────────────────────────────────────────────────────

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

  // ────────────────────────────────────────────────────────────────────────────
  // Fetch outlets
  // ────────────────────────────────────────────────────────────────────────────

  const fetchOutlets = async (userLocation = null) => {
    try {
      const outletListRaw = await getOutlets()

      const outletList = outletListRaw
        .filter((docSnap) => {
          const status = String(docSnap?.status || '').trim().toLowerCase()
          const name = String(docSnap?.name || '').trim()
          return Boolean(name) && (status === "approved" || status === "accepted")
        })
        .map((docSnap) => {
          const data = docSnap || {}

          let distance = null

        /* TEMPORARILY DISABLED
        if (
          userLocation &&
          typeof data.lat === "number" &&
          typeof data.lng === "number"
        ) {
          distance = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            data.lat,
            data.lng
          )
        }
        */

        return {
          id: docSnap.id,
          ...data,
          distance,
        }
        })

      // Sort only if we have user location
      if (userLocation) {
        outletList.sort(
          (a, b) => (a.distance || 999999) - (b.distance || 999999)
        )
      }

      setOutlets(outletList)
    } catch (error) {
      console.error("Error fetching outlets:", error)
      showMsg("Failed to load outlets.")
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Fetch tables
  // ────────────────────────────────────────────────────────────────────────────

  const fetchTablesByOutlet = async (outletId) => {
    try {
      setTablesLoading(true)

      const tableDocs = await getTablesByOutletId(outletId)

      const tableList = tableDocs
        .map((tableDoc) => {
          const data = tableDoc || {}

          return {
            id: tableDoc.id,
            name: data.name || "",
            owner: data.owner || "",
          }
        })
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

  // ────────────────────────────────────────────────────────────────────────────
  // Get location
  // ────────────────────────────────────────────────────────────────────────────

  const getLocation = () => {
    if (!navigator.geolocation) {
      showMsg(
        "Geolocation is not supported by your browser. Showing all outlets instead."
      )

      fetchOutlets()

      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }

        setLocation(userLocation)

        fetchOutlets(userLocation)
      },

      (error) => {
        console.error("Geolocation error:", error)

        showMsg(
          "Unable to retrieve your location. Showing all outlets instead."
        )

        // IMPORTANT FIX
        fetchOutlets()
      },

      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ────────────────────────────────────────────────────────────────────────────

  const handleOutletChange = (e) => {
    setSelectedOutlet(e.target.value)
    setSelectedTableId("")
    setBannerMsg("")
  }

  const handleTableChange = (e) => {
    setSelectedTableId(e.target.value)
    setBannerMsg("")
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Continue
  // ────────────────────────────────────────────────────────────────────────────

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

    const selectedTable = tables.find(
      (table) => table.id === selectedTableId
    )

    if (!selectedTable) {
      showMsg("Selected table was not found. Please choose again.")
      return
    }

    try {
      setContinueLoading(true)

      // Step 1: Validate distance to selected outlet
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

      // Resolve participant identity (userId for registered, guestId for guests)
      const participantFields = getParticipantId()
      console.info('[customer/select-outlet] participant resolved', participantFields)
      if (!participantFields.userId && !participantFields.guestId) {
        showMsg("Please log in or continue as guest to proceed.")
        return
      }

      // Open/join session via backend — this is the source of truth
      const sessionResponse = await fetch(
        `${API_BASE}/customerSessionOpen`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            outletId: selectedOutlet,
            tableId: selectedTable.id,
            ...participantFields,
          }),
        }
      )

      const sessionPayload = await sessionResponse
        .json()
        .catch(() => ({}))

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
        throw new Error(
          sessionPayload?.message || "Failed to initialize session"
        )
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
        showMsg(
          "Unable to identify the table owner. Please reselect the table."
        )
        return
      }

      // If joining an existing session as a different participant, show confirmation dialog
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

      // New session — proceed directly
      setTableSelection(
        selectedTable.id,
        selectedTable.name,
        resolvedOwnerId,
        sessionId
      )

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

  // ────────────────────────────────────────────────────────────────────────────
  // Join dialog handlers (uses already-fetched data from joinDialog state)
  // ────────────────────────────────────────────────────────────────────────────

  const handleJoinConfirm = () => {
    if (!joinDialog) return

    // Must set outlet FIRST — ProtectedRoute checks selectedOutlet before rendering /home
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

  // ────────────────────────────────────────────────────────────────────────────
  // UI
  // ────────────────────────────────────────────────────────────────────────────

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

        {location ? (
          <p className="text-sm text-green-600 mb-4">
            Location detected successfully
          </p>
        ) : (
          <p className="text-sm text-gray-600 mb-4">
            Showing all available outlets
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
