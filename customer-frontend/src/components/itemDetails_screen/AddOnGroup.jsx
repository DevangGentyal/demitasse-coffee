export default function AddOnGroup({
  group,
  selected = [],
  setSelected
}){

  if(!group || !group.options) return null;

  const toggle = (name)=>{

    // remove if already selected
    if(selected.includes(name)){
      setSelected(selected.filter(x => x !== name));
      return;
    }

    // if only one allowed replace
    if(group.max === 1){
      setSelected([name]);
      return;
    }

    // multi select allowed
    if(selected.length < group.max){
      setSelected([...selected, name]);
    }

  };

  return(

    <div className="mt-5">

      <h3 className="font-semibold mb-2">
        {group.groupName}
      </h3>

      <div className="space-y-2">

        {group.options.map((opt)=>{

          const active = selected.includes(opt.name);

          return(

            <div
              key={opt.name}
              onClick={()=>toggle(opt.name)}
              className={`flex justify-between items-center p-3 rounded-xl border cursor-pointer transition
                ${active
                  ? "border-green-700 bg-green-50"
                  : "border-gray-200 bg-white"
                }
              `}
            >

              <span className="text-sm">
                {opt.name}
              </span>

              <span className="text-sm font-medium">
                ₹{opt.price}
              </span>

            </div>

          );

        })}

      </div>

    </div>

  );
}