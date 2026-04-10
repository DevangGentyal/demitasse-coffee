import { createContext, useContext, useState } from "react";

const LocationContext = createContext();

export const useLocationContext = () => useContext(LocationContext);

export function LocationProvider({ children }) {

  const [selectedOutlet, setSelectedOutletState] = useState(
    localStorage.getItem("selectedOutlet") || ""
  );

  const [outletName, setOutletNameState] = useState(
    localStorage.getItem("outletName") || ""
  );

  const [tableNumber, setTableNumberState] = useState(
    localStorage.getItem("tableNumber")
      ? Number(localStorage.getItem("tableNumber")) // ✅ FIX
      : ""
  );

  const setOutlet = (outletId, name) => {
    setSelectedOutletState(outletId);
    localStorage.setItem("selectedOutlet", outletId);

    if (name) {
      setOutletNameState(name);
      localStorage.setItem("outletName", name);
    }

    // ✅ reset table when outlet changes
    setTableNumberState("");
    localStorage.removeItem("tableNumber");
  };

  const setTableNumber = (tableNum) => {
    const parsed = Number(tableNum); // ✅ FIX
    setTableNumberState(parsed);
    localStorage.setItem("tableNumber", parsed);
  };

  return (
    <LocationContext.Provider
      value={{
        selectedOutlet,
        outletName,
        setOutlet,
        tableNumber,
        setTableNumber,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}