import { createContext, useContext, useState } from "react";

const FilterContext = createContext();

export function FilterProvider({ children }) {
  const [vegOnly, setVegOnly] = useState(false);

  return (
    <FilterContext.Provider value={{ vegOnly, setVegOnly }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  return useContext(FilterContext);
}