import React from "react";

const ItemImage = ({ image }) => {
  return (
    <div className="flex justify-center items-center py-2">

      {image ? (
        <img
          src={image}
          alt="product"
          className="max-h-32 w-auto object-contain"
        />
      ) : null}

    </div>
  );
};

export default ItemImage;