import * as admin from "firebase-admin";
admin.initializeApp();

export { openSession } from "./tableSessions/openSession";

export { closeSession } from "./tableSessions/closeSession";

export { createProduct } from "./products/createProduct";

export { updateProduct } from "./products/updateProduct";

export { deleteProduct } from "./products/deleteProduct";
