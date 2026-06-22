export default function Variations({
  group,
  selected,
  setSelected
}) {

  if (!group || !group.options) return null;

  return (

    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">

      <div className="mb-3">
        <h3 className="font-semibold text-gray-800">
          {group.label}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">Select One • Required</p>
      </div>

      <div className="space-y-2">

        {group.options.map((opt) => {

          const active = selected === opt.name;

          return (

            <div
              key={opt.name}
              onClick={() => setSelected(opt.name)}
              className={`flex justify-between items-center p-3 rounded-xl border cursor-pointer transition
                ${active
                  ? "border-green-700 bg-green-50"
                  : "border-gray-200 bg-white"
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${active ? 'border-green-700' : 'border-gray-400'}`}>
                  {active && <div className="w-2.5 h-2.5 bg-green-700 rounded-full" />}
                </div>
                <span className="text-sm text-gray-800">{opt.name}</span>
              </div>
              <span className="text-sm font-medium">₹{opt.price}</span>
            </div>

          );

        })}

      </div>

    </div>

  );
}