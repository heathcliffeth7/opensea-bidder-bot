const axios = require('axios');
const config = require('./config');

async function debugWorkerAPI() {
  const tokenId = '653';
  const collectionSlug = 'gemesis';
  
  console.log('🔍 Testing different API endpoints for Gemesis #653...\n');
  
  const headers = {
    'accept': 'application/json',
    'x-api-key': config.apiKey
  };
  
  // Test 1: Best offer endpoint
  try {
    console.log('1️⃣ Testing /best endpoint:');
    const response = await axios.get(
      `https://api.opensea.io/api/v2/offers/collection/${collectionSlug}/nfts/${tokenId}/best`,
      { headers }
    );
    console.log('   - Price value:', response.data.price?.value);
    console.log('   - ETH:', response.data.price?.value / 1e18);
  } catch (e) {
    console.log('   - Error:', e.message);
  }
  
  // Test 2: All offers endpoint
  try {
    console.log('\n2️⃣ Testing /all endpoint:');
    const response = await axios.get(
      `https://api.opensea.io/api/v2/offers/collection/${collectionSlug}/nfts/${tokenId}/all`,
      { headers }
    );
    console.log('   - Number of offers:', response.data.offers?.length || 0);
    if (response.data.offers?.[0]) {
      const firstOffer = response.data.offers[0];
      console.log('   - First offer price:', firstOffer.price);
      console.log('   - First offer value:', firstOffer.price?.value);
      console.log('   - First offer ETH:', firstOffer.price?.value / 1e18);
      
      // Check if it's double
      const bestOfferValue = 26700000000000000;
      if (firstOffer.price?.value === (bestOfferValue * 2).toString()) {
        console.log('   ⚠️  VALUE IS EXACTLY DOUBLE!');
      }
    }
  } catch (e) {
    console.log('   - Error:', e.message);
  }
  
  // Test 3: Collection offers
  try {
    console.log('\n3️⃣ Testing collection offers:');
    const response = await axios.get(
      `https://api.opensea.io/api/v2/offers/collection/${collectionSlug}/all`,
      { headers, params: { limit: 5 } }
    );
    console.log('   - Number of collection offers:', response.data.offers?.length || 0);
    if (response.data.offers?.[0]) {
      const firstOffer = response.data.offers[0];
      console.log('   - First collection offer ETH:', firstOffer.price?.value / 1e18);
    }
  } catch (e) {
    console.log('   - Error:', e.message);
  }
  
  // Test 4: Check our logs
  console.log('\n4️⃣ Checking what our code might be doing:');
  console.log('   - 0.0267 * 2 = 0.0534');
  console.log('   - 0.0268335 * 2 = 0.053667 (with fee)');
  console.log('   - Our log shows: 0.0536');
  console.log('   - This is closer to 0.0534, suggesting the value is doubled');
}

debugWorkerAPI();