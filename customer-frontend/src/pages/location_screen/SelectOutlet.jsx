import React, { useState, useEffect } from "react"
import { collection, getDocs } from "firebase/firestore"
import { db } from "../../lib/firebase"
import { useNavigate } from "react-router-dom"
import { useLocationContext } from "../../context/LocationContext" // ✅ Added Context

const SelectOutlet = ({ onClose }) => {

  const navigate = useNavigate()
  const { setOutlet: setGlobalOutlet, setTableNumber: setGlobalTable } = useLocationContext() // ✅ Added Context

  const [location, setLocation] = useState(null)
  const [outlets, setOutlets] = useState([])
  const [selectedOutlet, setSelectedOutlet] = useState("")
  const [tableNo, setTableNo] = useState("") // ✅ Added local state

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
          userLocation.lat,
          userLocation.lng,
          data.lat,
          data.lng
        )
        return {
          id: doc.id,
          ...data,
          distance
        }
      })

      // Sort nearest outlets
      outletList.sort((a, b) => a.distance - b.distance)
      setOutlets(outletList)

    } catch (error) {
      console.error("Error fetching outlets:", error)
    }
  }

  // Get user GPS location
  const getLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser")
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
        alert("Unable to retrieve your location")
      }
    )
  }

  // Handle dropdown selection
  const handleOutletChange = (e) => {
    setSelectedOutlet(e.target.value)
  }

  // Handle table change
  const handleTableChange = (e) => {
    setTableNo(e.target.value)
  }

  // Continue button logic
  const handleContinue = () => {
    if (!selectedOutlet) {
      alert("Please select an outlet")
      return
    }

    if (!tableNo.trim()) {
      alert("Please enter a Table Number")
      return
    }

    // Save selected outlet and table using context
    setGlobalOutlet(selectedOutlet)
    setGlobalTable(tableNo)

    // Close popup safely
    if (onClose) {
      onClose()
    }

    // Redirect to home
    navigate("/home")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f3ede8] px-4">

      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8 text-center">

        <h2 className="text-2xl font-bold text-[#3e2723] mb-4">
          Select Nearby Outlet & Table
        </h2>

        {location ? (
          <p className="text-sm text-green-600 mb-4">
            Location detected successfully
          </p>
        ) : (
          <p className="text-sm text-gray-600 mb-4">
            Detecting your location...
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
            <option key={outlet.id} value={outlet.name}>
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