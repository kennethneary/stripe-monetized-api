const { createHash, randomBytes } = require("crypto");
const { apiKeys } = require("./db");

// Recursive function to generate a unique random string as API key
function generateAPIKey() {
  const apiKey = randomBytes(16).toString("hex");
  const hashedAPIKey = hashAPIKey(apiKey);

  // Ensure API key is unique
  if (apiKeys[hashedAPIKey]) {
    generateAPIKey();
  } else {
    return { hashedAPIKey, apiKey };
  }
}

// Hash the API key
function hashAPIKey(apiKey) {
  return createHash("sha256").update(apiKey).digest("hex");
}

module.exports = {
  generateAPIKey,
  hashAPIKey,
};
