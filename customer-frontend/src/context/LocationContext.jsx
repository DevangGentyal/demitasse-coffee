import { createContext, useContext, useState, useEffect } from "react";

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
        localStorage.getItem("tableNumber") || ""
    );

    const setOutlet = (outletId, name) => {
        setSelectedOutletState(outletId);
        localStorage.setItem("selectedOutlet", outletId);
        if (name) {
            setOutletNameState(name);
            localStorage.setItem("outletName", name);
        }
    };

    const setTableNumber = (tableNum) => {
        setTableNumberState(tableNum);
        localStorage.setItem("tableNumber", tableNum);
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
