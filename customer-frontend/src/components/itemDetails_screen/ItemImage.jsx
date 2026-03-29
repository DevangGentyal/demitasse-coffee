import React, { useState } from "react";

const ItemImage = ({ image }) => {

  const [imgError, setImgError] = useState(false);

  const showImage = image && !imgError;

  return (
    <div className="w-full h-40 flex justify-center items-center">
      
      {showImage ? (
        <img
          src={image}
          alt="product"
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      ) : null}

    </div>
  );
};

export default ItemImage;