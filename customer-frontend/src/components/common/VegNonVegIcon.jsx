const VegNonVegIcon = ({ isVeg }) => {
  // Assume true for typical cafe items unless explicitly false. Handles both strict booleans and Firebase string conversions.
  const isVegetarian = String(isVeg).toLowerCase() !== "false" && isVeg !== false; 

  return (
    <div
      className={`min-w-[16px] w-4 h-4 border rounded-sm flex items-center justify-center
      ${isVegetarian ? "border-green-600" : "border-red-600"}`}
    >
      <div
        className={`w-2 h-2 rounded-full
        ${isVegetarian ? "bg-green-600" : "bg-red-600"}`}
      />
    </div>
  );
};

export default VegNonVegIcon;
