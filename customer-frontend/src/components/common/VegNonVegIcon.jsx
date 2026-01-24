const VegNonVegIcon = ({ type }) => {
  return (
    <div
      className={`w-4 h-4 border rounded-sm flex items-center justify-center
      ${type === "veg" ? "border-green-600" : "border-red-600"}`}
    >
      <div
        className={`w-2 h-2 rounded-full
        ${type === "veg" ? "bg-green-600" : "bg-red-600"}`}
      />
    </div>
  );
};

export default VegNonVegIcon;
