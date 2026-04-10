import React, { useState, useEffect } from "react"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "../../lib/firebase"
import { useNavigate } from "react-router-dom"
import { useLocationContext } from "../../context/LocationContext"

const SelectOutlet = ({ onClose }) => {

  const navigate = useNavigate()
  const { setOutlet: setGlobalOutlet, setTableNumber: setGlobalTable } = useLocationContext()

  const [location, setLocation] = useState(null)
  const [outlets, setOutlets] = useState([])
  const [tables, setTables] = useState([])

  const [selectedOutlet, setSelectedOutlet] = useState("")
  const [selectedTable, setSelectedTable] = useState("")

  useEffect(() => {
    getLocation()
  }, [])

  useEffect(() => {
    if (selectedOutlet) {
      fetchTables(selectedOutlet)
      setSelectedTable("") // reset on outlet change
    }
  }, [selectedOutlet])

  // Distance calculation
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371
    const dLat = (lat2 - lat1) * (Math.PI / 180)
    const dLon = (lon2 - lon1) * (Math.PI / 180)

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // Fetch outlets
  const fetchOutlets = async (userLocation = null) => {
    try {
      const querySnapshot = await getDocs(collection(db, "outlets"))

      let outletList = querySnapshot.docs.map((doc) => {
        const data = doc.data()

        let distance = null
        if (userLocation) {
          distance = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            data.lat,
            data.lng
          )
        }

        return {
          id: doc.id,
          ...data,
          distance
        }
      })

      // Sort if location available
      if (userLocation) {
        outletList.sort((a, b) => a.distance - b.distance)
      }

      // Ensure outlet_001 always exists
      const exists = outletList.find(o => o.id === "outlet_001")
      if (!exists) {
        const fallbackDoc = querySnapshot.docs.find(d => d.id === "outlet_001")
        if (fallbackDoc) {
          outletList.unshift({
            id: fallbackDoc.id,
            ...fallbackDoc.data(),
            distance: 0
          })
        }
      }

      setOutlets(outletList)

    } catch (error) {
      console.error("Error fetching outlets:", error)
    }
  }

  // Fetch tables (isOccupied = false)
  const fetchTables = async (outletId) => {
    try {
      const q = query(
        collection(db, "tables"),
        where("outletId", "==", outletId),
        where("isOccupied", "==", false)
      )

      const snapshot = await getDocs(q)

      const tableList = snapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          .sort((a, b) => a.tableNumber - b.tableNumber) // ✅ SORT

        setTables(tableList)

    } catch (error) {
      console.error("Error fetching tables:", error)
    }
  }

  // Get location
  const getLocation = () => {
    if (!navigator.geolocation) {
      fetchOutlets() // fallback
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
      () => {
        // ❗ user denied → fallback
        fetchOutlets()
      }
    )
  }

  const handleContinue = () => {
    if (!selectedOutlet) {
      alert("Please select an outlet")
      return
    }

    if (!selectedTable) {
      alert("Please select a table")
      return
    }

    const selectedObj = outlets.find(o => o.id === selectedOutlet)

    if (selectedObj) {
      setGlobalOutlet(selectedObj.id, selectedObj.name)
    }

    setGlobalTable(Number(selectedTable))

    if (onClose) onClose()

    navigate("/home")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f3ede8] px-4">

      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8 text-center">

        <h2 className="text-2xl font-bold text-[#3e2723] mb-4">
          Select Outlet & Table
        </h2>

        {/* OUTLETS */}
        <select
          className="w-full border rounded-md p-2 mb-4"
          value={selectedOutlet}
          onChange={(e) => setSelectedOutlet(e.target.value)}
        >
          <option value="">Select Outlet</option>
          {outlets.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.name}
              {outlet.distance !== null && ` (${outlet.distance.toFixed(2)} km)`}
            </option>
          ))}
        </select>

        {/* TABLE DROPDOWN */}
        <select
          className="w-full border rounded-md p-2 mb-4"
          value={selectedTable}
          onChange={(e) => setSelectedTable(e.target.value)}
          disabled={!selectedOutlet}
        >
          <option value="">Select Table</option>
          {tables.map((table) => (
            <option key={table.id} value={table.tableNumber}>
              {table.tableNumber}
            </option>
          ))}
        </select>

        <button
          className="bg-[#6B4F4F] text-white w-full py-2 rounded-lg"
          onClick={handleContinue}
        >
          Continue
        </button>

      </div>

    </div>
  )
}

export default SelectOutlet