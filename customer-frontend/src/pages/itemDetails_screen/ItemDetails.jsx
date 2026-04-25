<<<<<<< HEAD
import React, { useState } from "react";
import HeaderBar from "../../components/itemDetails_screen/HeaderBar.jsx";
import AddOnItem from "../../components/itemDetails_screen/AddOnItem.jsx";
import cappuccino from "../../assets/home_screen/offer.png";
import { useCart } from "../../context/CartContext.jsx";
=======
import { useParams } from "react-router-dom";
import { useMenu } from "@/context/MenuContext";
import { useCart } from "@/context/CartContext";
import { useFilter } from "@/context/FilterContext";
>>>>>>> d285cf7127bc244424a3601686f3f47350df882f

import HeaderBar from "@/components/itemDetails_screen/HeaderBar";
import ItemImage from "@/components/itemDetails_screen/ItemImage";
import Variations from "@/components/itemDetails_screen/Variations";
import AddOnGroup from "@/components/itemDetails_screen/AddOnGroup";

<<<<<<< HEAD
  const { addToCart, updateQuantity, cart } = useCart();
  const [selectedSize, setSelectedSize] = useState(sizes[0]);
  const [extraShot1, setExtraShot1] = useState(0);
  const [extraShot2, setExtraShot2] = useState(0);
  const [cartQty, setCartQty] = useState(0);
=======
import { useState, useEffect } from "react";
>>>>>>> d285cf7127bc244424a3601686f3f47350df882f

export default function ItemDetails() {

  const { id } = useParams();

  const { products } = useMenu();
  const { addToCart } = useCart();
  const { vegOnly } = useFilter();

  const product = products.find(p => p.id === id);

  const [variation, setVariation] = useState({});
  const [addons, setAddons] = useState({});
  const [showSnack, setShowSnack] = useState(false);

  // ✅ Set default variations
  useEffect(() => {

    if (!product) return;

    const initial = {};

    (product.variations || []).forEach((g, i) => {
      if (g.options?.length) {
        initial[i] = g.options[0].name;
      }
    });

    setVariation(initial);

  }, [product]);

  // ✅ Remove invalid addons when veg filter is ON
  useEffect(() => {

    if (!vegOnly || !product) return;

    setAddons(prev => {
      const cleaned = {};

      Object.entries(prev).forEach(([i, list]) => {

        const group = product.customizations[i];

        const valid = list.filter(name => {
          const opt = group.options.find(o => o.name === name);
          return opt?.isVeg;
        });

        if (valid.length) {
          cleaned[i] = valid;
        }

      });

      return cleaned;
    });

  }, [vegOnly, product]);

  // ✅ safe return
  if (!product) return null;

  // ✅ Calculate price
  let totalPrice = product.price;

  // variations price
  (product.variations || []).forEach((group, i) => {
    const selected = variation[i];
    const opt = group.options?.find(o => o.name === selected);
    if (opt) totalPrice += opt.price;
  });

  // addons price (filtered)
  Object.entries(addons || {}).forEach(([i, list]) => {

    const group = product.customizations[i];

    list.forEach(name => {

      const opt = group.options.find(o => o.name === name);

      if (!opt) return;

      if (vegOnly && !opt.isVeg) return;

      totalPrice += opt.price;

    });

  });

  const handleAdd = () => {

    addToCart({
      id: product.id,
      name: product.name,
      price: totalPrice,
      variation,
      addons,
      isVeg:product.isVeg
    });

    setShowSnack(true);
    
    setTimeout(() => {
      setShowSnack(false);
    }, 2000);

  };

  const handleAddToCart = () => {
    addToCart({
      id: "cappuccino-item", // Mock dynamic ID since we're hardcoding this page's product
      name: "Cappuccino",
      price: cartPrice,
      desc: `${selectedSize.name} / ${extraShot1 + extraShot2} Extra Shots`,
      type: "veg",
      category: "coffee", // Required for free pizza loyalty logic
      qty: 1
    });
    setCartQty(1);
  };

  const handleUpdate = (amt) => {
    setCartQty(amt);
    updateQuantity("cappuccino-item", amt);
  };

  return (

    <div className="h-screen flex flex-col">

      <HeaderBar />

      <ItemImage image={product.image} />

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

        {/* 🔹 Variations */}
        {(product.variations || []).map((group, i) => (
          <Variations
            key={i}
            group={group}
            selected={variation[i]}
            setSelected={(v) =>
              setVariation(prev => ({ ...prev, [i]: v }))
            }
          />
        ))}

        {/* 🔹 Add-ons (with veg filter) */}
        {(product.customizations || []).map((group, i) => {

          let filteredGroup = group;

          if (vegOnly) {
            filteredGroup = {
              ...group,
              options: group.options.filter(opt => opt.isVeg)
            };
          }

          // if no options → skip
          if (!filteredGroup.options.length) return null;

          return (
            <AddOnGroup
              key={i}
              group={filteredGroup}
              selected={addons[i] || []}
              setSelected={(v) =>
                setAddons(prev => ({ ...prev, [i]: v }))
              }
            />
          );

        })}

      </div>

<<<<<<< HEAD
      {/* ADD TO CART */}
      <div className="px-4 mt-5">
        {cartQty === 0 ? (
          <button
            onClick={handleAddToCart}
            className="w-full bg-green-700 text-white py-3 rounded-full font-semibold"
          >
            Add to cart • ₹{cartPrice}
          </button>
        ) : (
          <div className="flex items-center justify-between bg-green-700 text-white px-6 py-3 rounded-full">
            <button
              onClick={() => handleUpdate(Math.max(0, cartQty - 1))}
              className="text-xl font-bold"
            >
              −
            </button>
=======
      {/* 🔹 Add to cart button */}
      <button
        onClick={handleAdd}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[65%] bg-green-700 text-white py-4 rounded-full font-semibold shadow-lg"
      >
        Add To Cart • ₹{totalPrice}
      </button>
>>>>>>> d285cf7127bc244424a3601686f3f47350df882f

      {/* 🔹 Snackbar */}
      {showSnack && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-3 rounded-full text-sm shadow-lg z-50">
          ✓ Added to cart
        </div>
      )}

<<<<<<< HEAD
            <button
              onClick={() => handleUpdate(cartQty + 1)}
              className="text-xl font-bold"
            >
              +
            </button>
          </div>
        )}
      </div>
=======
>>>>>>> d285cf7127bc244424a3601686f3f47350df882f
    </div>

  );
}