export default function AddOnGroup({
  group,
  selected,
  setSelected,
  vegOnly
}) {

  const options = group.options.filter(opt => {

    if (!vegOnly) return true;

    return opt.meta?.vegType !== "Non-Veg";

  });

  if (options.length === 0) return null;

  return (
    <div className="mt-6">

      <h3 className="font-semibold mb-2">{group.groupName}</h3>

      <div className="space-y-2">

        {options.map((opt) => {

          const active = selected.includes(opt.name);

          const toggle = () => {

            if (active) {
              setSelected(selected.filter(o => o !== opt.name));
              return;
            }

            if (selected.length >= group.max) return;

            setSelected([...selected, opt.name]);

          };

          return (
            <div
              key={opt.name}
              onClick={toggle}
              className={`flex justify-between p-3 rounded-xl border
                ${active ? "border-green-700 bg-green-50" : ""}
              `}
            >

              <span>{opt.name}</span>

              <span>₹{opt.price}</span>

            </div>
          );

        })}

      </div>

    </div>
  );
}