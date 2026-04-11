import * as admin from "firebase-admin";
admin.initializeApp();

export { openSession } from "./tableSessions/openSession";

export { closeSession } from "./tableSessions/closeSession";

export { createProduct } from "./products/createProduct";

export { updateProduct } from "./products/updateProduct";

export { deleteProduct } from "./products/deleteProduct";

export { createOrder } from "./orders/createOrder";

export { updateOrder } from "./orders/updateOrder";

export { deleteOrder } from "./orders/deleteOrder";

export { createOffer } from "./offers/createOffer";

export { updateOffer } from "./offers/updateOffer";

