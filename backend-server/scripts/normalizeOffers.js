const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const deleteField = admin.firestore.FieldValue.delete();

const readString = (value) => String(value ?? '').trim();
const readNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeComboGroups = (combo) => {
  if (!Array.isArray(combo)) return [];
  return combo.map((group) => ({
    categoryName: readString(group?.categoryName) || null,
    groupName: readString(group?.groupName) || 'Group',
    isFree: !!group?.isFree,
    selectionType: group?.selectionType === 'MULTIPLE' ? 'MULTIPLE' : 'ONE',
    items: Array.isArray(group?.items)
      ? group.items.map((item) => ({
          productId: readString(item?.productId),
          isCustomizable: !!item?.isCustomizable,
        })).filter((item) => item.productId)
      : [],
  }));
};

const flattenComboProductIds = (groups) => Array.from(new Set(
  (groups || []).flatMap((group) => Array.isArray(group?.items)
    ? group.items.map((item) => readString(item?.productId)).filter(Boolean)
    : []),
));

const buildCanonicalUpdate = (data) => {
  const updates = {
    offerMeta: {
      ...(data.offerMeta || {}),
      canonical: true,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const offerType = readString(data.offerType || data.type).toUpperCase();
  if (offerType) updates.offerType = offerType;
  updates.type = deleteField;

  const config = data.config && typeof data.config === 'object' ? data.config : {};
  const canonicalConfig = {
    combo: null,
    b1g1: null,
    discount: null,
    freeItem: null,
    loyalty: null,
  };

  if (offerType === 'COMBO') {
    const comboSource = config.combo || {};
    const comboGroups = normalizeComboGroups(Array.isArray(comboSource?.groups) ? comboSource.groups : Array.isArray(comboSource) ? comboSource : []);
    const comboProductIds = Array.isArray(comboSource?.productIds)
      ? comboSource.productIds.map((id) => readString(id)).filter(Boolean)
      : flattenComboProductIds(comboGroups);

    updates.config = {
      ...canonicalConfig,
      combo: {
        productIds: comboProductIds,
        groups: comboGroups,
        comboPrice: readNumber(comboSource?.comboPrice ?? config.comboPrice, 0),
      },
    };
    updates.category = deleteField;
    updates.applicableCategory = deleteField;
    return updates;
  }

  if (offerType === 'B1G1') {
    const b1g1Source = config.b1g1 || {};
    updates.config = {
      ...canonicalConfig,
      b1g1: {
        productIds: Array.isArray(b1g1Source.productIds ?? b1g1Source.applicableProductIds)
          ? (b1g1Source.productIds ?? b1g1Source.applicableProductIds).map((id) => readString(id)).filter(Boolean)
          : [],
        type: readString(b1g1Source.type) || 'CHEAPEST_FREE',
      },
    };
    updates.category = deleteField;
    updates.applicableCategory = deleteField;
    return updates;
  }

  if (offerType === 'DISCOUNT') {
    const discountSource = config.discount || {};
    const categoryName = readString(discountSource.categoryName || discountSource.category || data.category || data.applicableCategory) || null;
    const discountMode = readString(discountSource.mode || discountSource.type || 'PRODUCT').toUpperCase();
    updates.config = {
      ...canonicalConfig,
      discount: {
        mode: discountMode === 'CATEGORY' ? 'CATEGORY' : 'PRODUCT',
        productIds: Array.isArray(discountSource.productIds)
          ? discountSource.productIds.map((id) => readString(id)).filter(Boolean)
          : [],
        categoryName,
        discountValue: readNumber(discountSource.discountValue ?? config.discountValue, 0),
      },
    };
    updates.category = categoryName;
    updates.applicableCategory = deleteField;
    return updates;
  }

  updates.config = {
    ...canonicalConfig,
    ...config,
  };
  updates.category = deleteField;
  updates.applicableCategory = deleteField;
  return updates;
};

const main = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const snapshot = await db.collection('offers').get();
  const writes = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const updates = buildCanonicalUpdate(data);
    writes.push({ id: doc.id, updates });
  }

  console.log(`Found ${writes.length} offer documents`);
  if (dryRun) {
    console.log(JSON.stringify(writes.slice(0, 5), null, 2));
    return;
  }

  const batchSize = 400;
  for (let i = 0; i < writes.length; i += batchSize) {
    const batch = db.batch();
    for (const entry of writes.slice(i, i + batchSize)) {
      batch.update(db.collection('offers').doc(entry.id), entry.updates);
    }
    await batch.commit();
  }

  console.log(`Normalized ${writes.length} offer documents`);
};

main().catch((error) => {
  console.error('normalizeOffers failed:', error);
  process.exit(1);
});