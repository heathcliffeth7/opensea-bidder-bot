const axios = require('axios');
const config = require('./config');
const Api = require('./src/api');

async function testSpecificToken() {
  console.log('🔍 Testing specific token #588 (shows 0.0536 in logs)...\n');
  
  const headers = {
    'accept': 'application/json',
    'x-api-key': config.apiKey
  };
  
  // 1. Direct API call
  try {
    const response = await axios.get(
      'https://api.opensea.io/api/v2/offers/collection/gemesis/nfts/588/best',
      { headers }
    );
    
    console.log('1️⃣ Direct API Response:');
    console.log('   - Raw value:', response.data.price?.value);
    console.log('   - ETH:', response.data.price?.value / 1e18);
    console.log('   - Order hash:', response.data.order_hash);
    console.log('   - Criteria:', response.data.criteria);
    
    // 2. Test with our Api class
    const api = new Api();
    const bestPrice = api._extractPrice(response.data);
    console.log('\n2️⃣ _extractPrice result:', bestPrice, 'ETH');
    
    // 3. Check if it's a collection offer
    if (response.data.criteria?.encoded_token_ids === '*') {
      console.log('\n⚠️  This is a COLLECTION OFFER (applies to all tokens)');
    }
    
    // 4. Calculate what our bot would show
    const counterbidAmount = 0.0001;
    const calculatedPrice = bestPrice + counterbidAmount;
    console.log('\n3️⃣ What our bot calculates:');
    console.log('   - Best price:', bestPrice);
    console.log('   - Counterbid amount:', counterbidAmount);
    console.log('   - Calculated price:', calculatedPrice);
    console.log('   - Doubled best price:', bestPrice * 2);
    
    // 5. Mystery check
    console.log('\n4️⃣ Mystery values:');
    console.log('   - 0.0267 * 2 =', 0.0267 * 2);
    console.log('   - 0.0268 * 2 =', 0.0268 * 2);
    console.log('   - Our log shows: 0.0536');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSpecificToken();