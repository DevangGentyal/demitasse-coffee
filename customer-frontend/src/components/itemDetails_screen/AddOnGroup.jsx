export default function AddOnGroup({
  group,
  selected = [],
  setSelected
}) {

  if (!group || !group.options) return null;

  const toggle = (name) => {

    // remove if already selected
    if (selected.includes(name)) {
      setSelected(selected.filter(x => x !== name));
      return;
    }

    // if only one allowed replace
    if (group.max === 1) {
      setSelected([name]);
      return;
    }

    // multi select allowed
    if (selected.length < group.max) {
      setSelected([...selected, name]);
    }

  };

  return (

    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">

      <div className="mb-3">
        <h3 className="font-semibold text-gray-800">
          {group.groupName}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
           {group.max === 1 ? "Select One" : "Select Multiple"} • {group.min > 0 ? "Required" : "Optional"}
        </p>
      </div>

      <div className="space-y-2">

        {group.options.map((opt) => {

          const active = selected.includes(opt.name);

          return (

            <div
              key={opt.name}
              onClick={() => toggle(opt.name)}
              className={`flex justify-between items-center p-3 rounded-xl border cursor-pointer transition
                ${active
                  ? "border-green-700 bg-green-50"
                  : "border-gray-200 bg-white"
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 flex items-center justify-center ${group.max === 1 ? 'rounded-full' : 'rounded'} border ${active ? (group.max === 1 ? 'border-green-700' : 'border-green-700 bg-green-700') : 'border-gray-400 bg-transparent'}`}>
                  {active && group.max === 1 && <div className="w-2.5 h-2.5 bg-green-700 rounded-full" />}
                  {active && group.max !== 1 && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
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