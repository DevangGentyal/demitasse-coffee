import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const earnPoints = async (
  customerId: string,
  customerName: string,
  totalAmount: number,
  items: any[],
  orderId: string
) => {
  const db = admin.firestore();
  try {
    console.log("🏆 Processing loyalty points for customer:", customerId);
    const points = Math.floor((totalAmount || 0) / 20);
    
    let coffeeCountIncrement = 0;
    for (const item of items) {
      if (item.category === "coffee" || item.category === "Coffee") {
         coffeeCountIncrement += (item.quantity || 1);
      }
    }

    const customerRef = db.collection("customers").doc(customerId);
    
    await db.runTransaction(async (transaction) => {
      const customerDoc = await transaction.get(customerRef);
      
      if (!customerDoc.exists) {
        transaction.set(customerRef, {
          name: customerName,
          pointsBalance: points,
          totalSpent: totalAmount || 0,
          totalOrders: 1,
          coffeeCount: coffeeCountIncrement,
          lastVisitDate: FieldValue.serverTimestamp()
        });
        
        if (Math.floor(coffeeCountIncrement / 5) > 0) {
          const numNewPizzas = Math.floor(coffeeCountIncrement / 5);
          for (let i = 0; i < numNewPizzas; i++) {
            const newRewardRef = db.collection("rewards").doc();
            transaction.set(newRewardRef, {
              type: "free_pizza",
              customerId,
              isUsed: false,
              createdAt: FieldValue.serverTimestamp()
            });
          }
        }
      } else {
        const data = customerDoc.data()!;
        const currentCoffeeCount = data.coffeeCount || 0;
        const newCoffeeCount = currentCoffeeCount + coffeeCountIncrement;
        
        transaction.update(customerRef, {
          pointsBalance: FieldValue.increment(points),
          totalSpent: FieldValue.increment(totalAmount || 0),
          totalOrders: FieldValue.increment(1),
          coffeeCount: FieldValue.increment(coffeeCountIncrement),
          lastVisitDate: FieldValue.serverTimestamp()
        });

        const currentPizzas = Math.floor(currentCoffeeCount / 5);
        const newPizzas = Math.floor(newCoffeeCount / 5);
        
        if (newPizzas > currentPizzas) {
          const numNewPizzas = newPizzas - currentPizzas;
          for (let i = 0; i < numNewPizzas; i++) {
            const newRewardRef = db.collection("rewards").doc();
            transaction.set(newRewardRef, {
              type: "free_pizza",
              customerId,
              isUsed: false,
              createdAt: FieldValue.serverTimestamp()
            });
          }
        }
      }
      
      if (points > 0 || coffeeCountIncrement > 0) {
        const loyaltyTxRef = db.collection("loyaltyTransactions").doc();
        transaction.set(loyaltyTxRef, {
          customerId,
          orderId,
          type: "earn",
          points,
          createdAt: FieldValue.serverTimestamp()
        });
      }
    });
    
    console.log("✅ Loyalty processed for:", customerId);
  } catch (loyaltyError) {
    console.error("❌ Error processing loyalty:", loyaltyError);
    // We don't fail the caller if loyalty fails
  }
};
