// Final attempt to find the bug
const axios = require('axios');
const config = require('./config');
const api = require('./src/api');
const { formatPrice } = require('./utils/helpers');

async function finalDebug() {
  console.log('🔍 Final Debug - Simulating exact worker flow...\n');
  
  // Create axios instance like worker
  const worker = {
    id: 1,
    axios: axios.create({
      baseURL: 'https://api.opensea.io',
      timeout: 2000,
      headers: {
        'X-API-KEY': config.apiKey,
        'Accept': 'application/json'
      }
    })
  };
  
  const tokenId = '588';
  const collectionSlug = 'gemesis';
  
  try {
    // Exact same API call as worker
    console.log('1️⃣ Making API call (same as worker):');
    const response = await worker.axios.get(`/api/v2/offers/collection/${collectionSlug}/nfts/${tokenId}/best`);
    const bestOffer = response.data;
    
    console.log('   Raw response.data.price:', bestOffer.price);
    console.log('   Value:', bestOffer.price?.value);
    console.log('   ETH:', bestOffer.price?.value / 1e18);
    
    // Extract price same way
    console.log('\n2️⃣ Extracting price:');
    const bestPrice = api._extractPrice(bestOffer);
    console.log('   bestPrice:', bestPrice);
    
    // Format price same way
    console.log('\n3️⃣ Formatting price:');
    const formatted = formatPrice(bestPrice);
    console.log('   formatPrice(bestPrice):', formatted);
    
    // What would the log show?
    console.log('\n4️⃣ What worker would log:');
    console.log(`   [Worker 1] Token #588: Best offer ${formatted} → ...`);
    
    // Mystery check
    console.log('\n5️⃣ Mystery values:');
    console.log('   bestPrice * 2:', bestPrice * 2);
    console.log('   formatPrice(bestPrice * 2):', formatPrice(bestPrice * 2));
    
    // Check if axios is modifying response
    console.log('\n6️⃣ Checking if axios modifies response:');
    console.log('   typeof response.data.price.value:', typeof response.data.price.value);
    console.log('   Original value unchanged?', response.data.price.value === '26700000000000000');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

finalDebug();