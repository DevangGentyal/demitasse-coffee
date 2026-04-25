import React, { useState, useEffect } from "react"
import { collection, getDocs } from "firebase/firestore"
import { db } from "../../lib/firebase"
import { useNavigate } from "react-router-dom"
import { useLocationContext } from "../../context/LocationContext"

// ── Inline banner ─────────────────────────────────────────────────────────────
const Banner = ({ message, type = "error", onClose }) => {
  if (!message) return null;
  const styles = type === "success"
    ? "bg-green-50 border-green-200 text-green-700"
    : "bg-red-50 border-red-200 text-red-700";
  const icon = type === "success" ? "✅" : "⚠️";
  return (
    <div className={`flex items-start gap-3 border rounded-xl px-4 py-3 text-sm mb-4 ${styles}`}>
      <span className="text-base leading-none mt-0.5">{icon}</span>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="font-bold text-base leading-none ml-1 opacity-50 hover:opacity-100">✕</button>
    </div>
  );
};

const SelectOutlet = ({ onClose }) => {

  const navigate = useNavigate()
  const { setOutlet: setGlobalOutlet, setTableNumber: setGlobalTable } = useLocationContext()

  const [location, setLocation] = useState(null)
  const [outlets, setOutlets] = useState([])
  const [selectedOutlet, setSelectedOutlet] = useState("")
  const [tableNo, setTableNo] = useState("")
  const [bannerMsg, setBannerMsg] = useState("")
  const [bannerType, setBannerType] = useState("error")

  const showMsg = (msg, type = "error") => {
    setBannerMsg(msg);
    setBannerType(type);
  };

  useEffect(() => {
    getLocation()
  }, [])

  // Distance calculation
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

  // Fetch outlets from Firestore
  const fetchOutlets = async (userLocation) => {
    try {
      const querySnapshot = await getDocs(collection(db, "outlets"))
      const outletList = querySnapshot.docs.map((doc) => {
        const data = doc.data()
        const distance = calculateDistance(
          userLocation.lat, userLocation.lng,
          data.lat, data.lng
        )
        return { id: doc.id, ...data, distance }
      })
      outletList.sort((a, b) => a.distance - b.distance)
      setOutlets(outletList)
    } catch (error) {
      console.error("Error fetching outlets:", error)
    }
  }

  // Get user GPS location
  const getLocation = () => {
    if (!navigator.geolocation) {
      showMsg("Geolocation is not supported by your browser.");
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        }
        setLocation(userLocation)
        fetchOutlets(userLocation)
      },
      (error) => {
        console.error(error)
        showMsg("Unable to retrieve your location. Please select an outlet manually.");
      }
    )
  }

  const handleOutletChange = (e) => { setSelectedOutlet(e.target.value); setBannerMsg(""); }
  const handleTableChange  = (e) => { setTableNo(e.target.value); setBannerMsg(""); }

  const handleContinue = () => {
    if (!selectedOutlet) {
      showMsg("Please select an outlet to continue.");
      return
    }
    if (!tableNo.trim()) {
      showMsg("Please enter your table number.");
      return
    }

    const selectedObj = outlets.find(o => o.id === selectedOutlet);
    if (selectedObj) {
      setGlobalOutlet(selectedObj.id, selectedObj.name);
    }
    setGlobalTable(tableNo)

    if (onClose) onClose()
    navigate("/home")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f3ede8] px-4">
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8 text-center">

        <h2 className="text-2xl font-bold text-[#3e2723] mb-4">
          Select Nearby Outlet &amp; Table
        </h2>

        <Banner message={bannerMsg} type={bannerType} onClose={() => setBannerMsg("")} />

        {location ? (
          <p className="text-sm text-green-600 mb-4">Location detected successfully</p>
        ) : (
          <p className="text-sm text-gray-600 mb-4">Detecting your location...</p>
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
              {outlet.name} ({outlet.distance.toFixed(2)} km)
            </option>
          ))}
        </select>

        {/* TABLE NUMBER INPUT */}
        <input
          type="text"
          placeholder="Enter Table Number (e.g. 5)"
          className="w-full border rounded-md p-2 mb-4 outline-none focus:ring-1 focus:ring-brown-500"
          value={tableNo}
          onChange={handleTableChange}
        />

        <button
          className="bg-[#6B4F4F] text-white w-full py-2 rounded-lg font-medium"
          onClick={handleContinue}
        >
          Continue
        </button>

      </div>
    </div>
  )
}

export default SelectOutlet