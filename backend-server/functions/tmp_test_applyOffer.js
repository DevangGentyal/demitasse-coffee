const { applyOffer } = require('./lib/shared/utilities/offers/applyOffer');

const log = (name, res) => console.log('\n===', name, '===\n', JSON.stringify(res, null, 2));

// B1G1 test
const b1g1 = applyOffer({ subTotal: 200, items: [
  { productId: 'p1', unitPrice: 100, qty: 1, offerId: 'offer-b1', isManualB1G1: true },
  { productId: 'p2', unitPrice: 80, qty: 1, offerId: 'offer-b1', isManualB1G1: true }
]}, { id: 'offer-b1', offerType: 'B1G1', title: 'B1G1 Offer' });
log('B1G1', b1g1);

// COMBO test: two products listed on offer
const combo = applyOffer({ subTotal: 400, items: [
  { productId: 'a', unitPrice: 150, qty: 1 },
  { productId: 'b', unitPrice: 120, qty: 1 },
  { productId: 'x', unitPrice: 50, qty: 1 }
]}, { id: 'combo1', offerType: 'COMBO', title: 'Combo', products: [{productId:'a'},{productId:'b'}], config: { combo: { comboPrice: 200 } } });
log('COMBO', combo);

// DISCOUNT CATEGORY test: items with category
const discountCategory = applyOffer({ subTotal: 500, items: [
  { productId: 'p10', unitPrice: 200, qty: 1, category: 'drinks' },
  { productId: 'p11', unitPrice: 100, qty: 2, category: 'snacks' },
  { productId: 'p12', unitPrice: 50, qty: 1, category: 'drinks' }
]}, { id: 'disc1', offerType: 'DISCOUNT', title: 'Drinks 10% off', config: { discount: { mode: 'CATEGORY', categoryName: 'drinks', discountValue: 10 } } });
log('DISCOUNT_CATEGORY', discountCategory);

// DISCOUNT PRODUCT list test
const discountProduct = applyOffer({ subTotal: 300, items: [
  { productId: 'x1', unitPrice: 100, qty: 2 },
  { productId: 'y1', unitPrice: 100, qty: 1 }
]}, { id: 'disc2', offerType: 'DISCOUNT', title: 'Product Discount', products: [{productId:'x1'}], config: { discount: { mode: 'PRODUCT', productIds: ['x1'], discountValue: 20 } } });
log('DISCOUNT_PRODUCT', discountProduct);

