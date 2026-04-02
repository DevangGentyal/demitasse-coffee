import { createContext, useContext, useState, useEffect } from "react";

const LocationContext = createContext();

export const useLocationContext = () => useContext(LocationContext);

export function LocationProvider({ children }) {
  const [selectedOutlet, setSelectedOutletState] = useState(
    localStorage.getItem("selectedOutlet") || ""
  );
  
  const [tableNumber, setTableNumberState] = useState(
    localStorage.getItem("tableNumber") || ""
  );

  const setOutlet = (outlet) => {
    setSelectedOutletState(outlet);
    localStorage.setItem("selectedOutlet", outlet);
  };

  const setTableNumber = (tableNum) => {
    setTableNumberState(tableNum);
    localStorage.setItem("tableNumber", tableNum);
  };

  return (
    <LocationContext.Provider
      value={{
        selectedOutlet,
        setOutlet,
        tableNumber,
        setTableNumber,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}
