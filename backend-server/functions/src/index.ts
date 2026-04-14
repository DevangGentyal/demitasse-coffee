import * as admin from "firebase-admin";
admin.initializeApp();

export { openSession } from "./tableSessions/openSession";

export { closeSession } from "./tableSessions/closeSession";

export { createProduct } from "./products/createProduct";

export { updateProduct } from "./products/updateProduct";

export { deleteProduct } from "./products/deleteProduct";

export { createOrder } from "./orders/createOrder";
export { syncOrderCreated } from "./orders/syncOrderCreated";
export { updateOrder } from "./orders/updateOrder";
export { deleteOrder } from "./orders/deleteOrder";

export { checkRewards } from "./loyalty/checkRewards";

export { redeemReward } from "./loyalty/redeemReward";
export { createOffer } from "./offers/createOffer";
export { updateOffer } from "./offers/updateOffer";

export { addTable } from "./tables/addTable";
export { updateTable } from "./tables/updateTable";
export { deleteTable } from "./tables/deleteTable";
export { saveFloorMap } from "./floorMap/saveFloorMap";

