export default function Variations({
  group,
  selected,
  setSelected
}){

  if(!group || !group.options) return null;

  return(

    <div className="mt-4">

      <h3 className="font-semibold mb-2">
        {group.label}
      </h3>

      <div className="flex flex-wrap gap-2">

        {group.options.map((opt)=>{

          const active = selected === opt.name;

          return(

            <button
              key={opt.name}
              onClick={()=>setSelected(opt.name)}
              className={`px-4 py-2 rounded-full border text-sm transition
                ${active
                  ? "bg-green-700 text-white border-green-700"
                  : "bg-white border-gray-300"
                }
              `}
            >
              {opt.name} ₹{opt.price}
            </button>

          );

        })}

      </div>

    </div>

  );
}