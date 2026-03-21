import { useParams } from "react-router-dom";
import { useMenu } from "@/context/MenuContext";
import { useCart } from "@/context/CartContext";

import HeaderBar from "@/components/itemDetails_screen/HeaderBar";
import ItemImage from "@/components/itemDetails_screen/ItemImage";
import Variations from "@/components/itemDetails_screen/Variations";
import AddOnGroup from "@/components/itemDetails_screen/AddOnGroup";

import { useState, useEffect } from "react";

export default function ItemDetails(){

  const {id} = useParams();

  const {products} = useMenu();
  const {addToCart} = useCart();

  const product = products.find(p=>p.id===id);

const [variation,setVariation] = useState({});
const [addons,setAddons] = useState({});
const [showSnack,setShowSnack] = useState(false);

// ✅ hook ALWAYS runs
useEffect(()=>{

  if(!product) return;

  const initial = {};

  (product.variations || []).forEach((g,i)=>{
    if(g.options?.length){
      initial[i] = g.options[0].name;
    }
  });

  setVariation(initial);

},[product]);

// ✅ safe return AFTER hooks
if(!product) return null;

  let totalPrice = product.price;

  (product.variations || []).forEach((group,i)=>{

    const selected = variation[i];

    const opt = group.options?.find(o=>o.name===selected);

    if(opt) totalPrice += opt.price;

  });

  Object.entries(addons || {}).forEach(([i,list])=>{

    const group = product.customizations[i];

    list.forEach(name=>{

      const opt = group.options.find(o=>o.name===name);

      if(opt) totalPrice += opt.price;

    });

  });

  const handleAdd = ()=>{

    addToCart({
      id:product.id,
      name:product.name,
      price:totalPrice,
      variation,
      addons
    });

    setShowSnack(true);

    setTimeout(()=>{
      setShowSnack(false);
    },2000);

  };

  return(

    <div className="h-screen flex flex-col">

      <HeaderBar/>

      <ItemImage image={product.image}/>

      <div className="mx-4 mt-2 bg-white rounded-2xl p-4 max-h-[52vh] overflow-y-auto">

        <div className="flex justify-between items-start">

          <h1 className="text-lg font-bold">
            {product.name}
          </h1>

          <span className="text-lg font-semibold">
            ₹{product.price}
          </span>

        </div>

        <p className="text-sm text-gray-600 mt-2">
          {product.desc}
        </p>

        {(product.variations || []).map((group,i)=>(
          <Variations
            key={i}
            group={group}
            selected={variation[i]}
            setSelected={(v)=>
              setVariation(prev=>({...prev,[i]:v}))
            }
          />
        ))}

        {(product.customizations || []).map((group,i)=>(
          <AddOnGroup
            key={i}
            group={group}
            selected={addons[i] || []}
            setSelected={(v)=>
              setAddons(prev=>({...prev,[i]:v}))
            }
          />
        ))}

      </div>

      <button
        onClick={handleAdd}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[65%] bg-green-700 text-white py-4 rounded-full font-semibold shadow-lg"
      >
        Add To Cart • ₹{totalPrice}
      </button>

      {showSnack && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-3 rounded-full text-sm shadow-lg z-50">
          ✓ Added to cart
        </div>
      )}

    </div>

  );

}