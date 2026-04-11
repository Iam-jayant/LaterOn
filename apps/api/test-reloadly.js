// Quick test script to check Reloadly API connectivity
const RELOADLY_AUTH_URL = "https://auth.reloadly.com";
const RELOADLY_BASE_URL = "https://giftcards-sandbox.reloadly.com";
const CLIENT_ID = "TxLI0dH46VVYIbNPx0wj2JoBDzQhKm11";
const CLIENT_SECRET = "8rTpsH2X8P-7K7KW5lh9mdHDTOGBlR-blUyFc9OJlqjmU1bS59SULIsRXXmTnPD";

async function testAuth() {
  console.log("Testing Reloadly authentication...");
  console.log("Auth URL:", `${RELOADLY_AUTH_URL}/oauth/token`);
  
  try {
    const response = await fetch(`${RELOADLY_AUTH_URL}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "client_credentials",
        audience: RELOADLY_BASE_URL
      })
    });

    console.log("Response status:", response.status);
    console.log("Response headers:", Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log("Response body:", text);
    
    if (response.ok) {
      const data = JSON.parse(text);
      console.log("\n✅ Authentication successful!");
      console.log("Access token (first 50 chars):", data.access_token.substring(0, 50) + "...");
      console.log("Expires in:", data.expires_in, "seconds");
      return data.access_token;
    } else {
      console.log("\n❌ Authentication failed!");
      return null;
    }
  } catch (error) {
    console.error("\n❌ Error during authentication:");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Error cause:", error.cause);
    console.error("Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error("Error stack:", error.stack);
    return null;
  }
}

testAuth().then(() => {
  console.log("\nTest complete.");
}).catch(err => {
  console.error("Unhandled error:", err);
});
