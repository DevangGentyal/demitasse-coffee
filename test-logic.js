function normalizeProductIds(rawIds) {
  let values = [];
  if (Array.isArray(rawIds)) {
    values = rawIds;
  } else if (rawIds && typeof rawIds === 'object') {
    values = Object.values(rawIds);
  }
  
  return values
    .map(item => {
      if (!item) return "";
      if (typeof item === "string") return String(item).trim();
      return String(item.productId || item.id || "").trim();
    })
    .filter(id => id.length > 0);
}

function getOfferBirthdayProductIds(offer) {
  const configKeys = Object.keys(offer?.config || {});
  const configRewardKey = configKeys.find(k => k.trim().toLowerCase() === 'reward');
  const configReward = configRewardKey ? offer?.config[configRewardKey] : {};

  const rootKeys = Object.keys(offer || {});
  const rootRewardKey = rootKeys.find(k => k.trim().toLowerCase() === 'reward');
  const rootReward = rootRewardKey ? offer[rootRewardKey] : {};

  const combinedReward = { ...configReward, ...rootReward };
  const rewardKeys = Object.keys(combinedReward || {});
  const productIdsKey = rewardKeys.find(k => k.trim().toLowerCase() === 'productids');
  
  const rawIds = (productIdsKey ? combinedReward[productIdsKey] : null) || offer?.rewardItems || [];
  return normalizeProductIds(rawIds);
}

const offer = {
  applicableFor: "birthday",
  category: "BIRTHDAY",
  config: {},
  reward: {
    productIds: [
      "5ObhyyKvwFbTtEq9kxkE",
      "pC5NDUTRkGv5h1CPLXdP",
      "y4k2dVAdlz0VE5435fu8"
    ]
  }
};

console.log("Extracted IDs:", getOfferBirthdayProductIds(offer));
