const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demitasse-cafe-pilot' });

(async () => {
    const base = 'http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1';
    
    console.log('--- Step 1: Open Session ---');
    const sessionRes = await fetch(base + '/customerSessionOpen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outletId: 'test-outlet', tableId: 'test-table', guestId: 'guest_probe_1' })
    });
    const sessionText = await sessionRes.text();
    console.log('SESSION_STATUS', sessionRes.status);
    console.log('SESSION_BODY', sessionText);
    
    const session = JSON.parse(sessionText);
    if (!session.success || !session.sessionId) throw new Error('session open failed');
    const sessionId = String(session.sessionId);
    
    console.log('--- Step 2: Create Order ---');
    const db = admin.firestore();
    await db.collection('orders').doc('probe_order_1').set({
        outletId: 'test-outlet',
        tableId: 'test-table',
        sessionId,
        status: 'ACTIVE',
        orderStatus: 'in-progress',
        items: [{ productId: 'prod_simple', name: 'Simple Coffee', qty: 1, price: 100, totalPrice: 100 }],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        timeOfOrder: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const orderSnap = await db.collection('orders').doc('probe_order_1').get();
    console.log('ORDER_EXISTS', orderSnap.exists);
    console.log('ORDER_BODY', JSON.stringify(orderSnap.data()));
    
    console.log('--- Step 3: Generate Bill ---');
    const billRes = await fetch(base + '/customerBillingGenerateBill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
    });
    const billText = await billRes.text();
    console.log('BILL_STATUS', billRes.status);
    console.log('BILL_BODY', billText);
})().catch(e => {
    console.error('SIM_ERROR', e && e.stack || e);
    process.exit(1);
});
