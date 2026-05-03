import * as admin from "firebase-admin";
admin.initializeApp();

export { openSession } from "./admin/sessions.admin";

export { closeSession } from "./admin/sessions.admin";

export { createProduct } from "./products/createProduct";

export { updateProduct } from "./products/updateProduct";

export { deleteProduct } from "./products/deleteProduct";

export { createOrder } from "./admin/orders.admin";
export { syncOrderCreated } from "./admin/orders.admin";
export { updateOrder } from "./admin/orders.admin";
export { deleteOrder } from "./admin/orders.admin";

export { openSession as customerOpenSession } from "./customer/sessions.customer";
export { addItemsToOrder } from "./customer/orders.customer";
export { generateBill } from "./customer/billing.customer";
export { closeSession as closeCustomerSession } from "./customer/billing.customer";
export { validateAndCalculateBill } from "./customer/billing.customer";
export { finalizeAndClose } from "./customer/billing.customer";

export { checkRewards } from "./loyalty/checkRewards";

export { redeemReward } from "./loyalty/redeemReward";
export { createOffer } from "./offers/createOffer";
export { updateOffer } from "./offers/updateOffer";

export { addTable } from "./tables/addTable";
export { updateTable } from "./tables/updateTable";
export { deleteTable } from "./tables/deleteTable";
export { saveFloorMap } from "./floorMap/saveFloorMap";

