import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "./firebase";

export const calculateDistanceInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getCurrentPosition = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
};

export const validateUserProximity = async (selectedOutletId) => {
  if (!selectedOutletId) {
    return { success: false, error: "No outlet selected." };
  }

  try {
    // 1. Fetch the selected outlet's details directly from the nested outletDetails collection
    const detailsColRef = collection(db, "outlets", selectedOutletId, "outletDetails");
    let querySnapshot = await getDocs(query(detailsColRef, limit(1)));
    
    // Check spelling fallback if empty
    if (querySnapshot.empty) {
      const altColRef = collection(db, "outlets", selectedOutletId, "outlateDetails");
      querySnapshot = await getDocs(query(altColRef, limit(1)));
    }
    
    const outletDoc = !querySnapshot.empty ? querySnapshot.docs[0] : null;
    const outletData = outletDoc ? outletDoc.data() : null;

    // Add required debug logs
    console.log("Selected Outlet ID:", selectedOutletId);
    console.log("Outlet Document Exists:", !!outletDoc);
    console.log("Outlet Data:", outletData);
    console.log("Location:", outletData?.location);
    console.log("Radius:", outletData?.radius);

    // Bypass Validation Rules: If the outlet details do not exist, or are missing location or radius, just let the user in
    if (!outletDoc || !outletData || !outletData.location || outletData.radius === undefined || outletData.radius === null) {
      console.warn("[PROXIMITY] Outlet details missing, or missing location or radius. Bypassing validation and allowing access.");
      return { success: true };
    }

    // 2. Extract location and radius
    const locationString = outletData.location;
    const radius = Number(outletData.radius);

    // 3. Parse outlet location string
    const [outletLat, outletLng] = locationString
      .split(",")
      .map(value => Number(value.trim()));

    if (isNaN(outletLat) || isNaN(outletLng)) {
      console.warn("[PROXIMITY] Invalid location format. Bypassing validation and allowing access.");
      return { success: true };
    }

    // 4. Request current device location
    let position;
    try {
      position = await getCurrentPosition();
    } catch (err) {
      return { success: false, error: "Location permission is required to verify your proximity. Please enable GPS and allow location access." };
    }

    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;

    // 5. Calculate distance
    const distance = calculateDistanceInMeters(userLat, userLng, outletLat, outletLng);

    console.log("[PROXIMITY] User Lat:", userLat, "User Lng:", userLng);
    console.log("[PROXIMITY] Outlet Lat:", outletLat, "Outlet Lng:", outletLng);
    console.log("[PROXIMITY] Calculated Distance (meters):", distance);
    console.log("[PROXIMITY] Allowed Radius (meters):", radius);

    // 6. Compare with outlet radius
    if (distance <= radius) {
      return { success: true };
    } else {
      return { 
        success: false, 
        error: `You are currently outside the allowed range of this outlet.\n\nPlease move closer to the selected outlet and try again.\n\nDistance from outlet: ${Math.round(distance)}m\nAllowed radius: ${radius}m` 
      };
    }

  } catch (error) {
    console.error("[PROXIMITY] Validation error:", error);
    return { success: false, error: "Unable to verify your location due to an unexpected error." };
  }
};
