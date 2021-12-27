// TODO: Implement a real database
const customers = {
  // stripeCustomerId : data
  stripeCustomerId: {
    apiKey: "123xyz",
    active: false,
    itemId: "stripeSubscriptionItemId",
  },
};
const apiKeys = {
  // apiKey : customerdata
  "123xyz": "stripeCustomerId",
};

module.exports = {
  customers,
  apiKeys,
};
