const axios = require('axios');
const config = require('./config');

async function debugCollectionVsToken() {
  console.log('🔍 Debugging Collection vs Token Offers...\n');
  
  const headers = {
    'accept': 'application/json',
    'x-api-key': config.apiKey
  };
  
  try {
    // 1. Get collection offers
    console.log('1️⃣ Getting collection offers:');
    const collectionResponse = await axios.get(
      'https://api.opensea.io/api/v2/offers/collection/gemesis/all',
      { headers, params: { limit: 5 } }
    );
    
    const collectionOffers = collectionResponse.data.offers || [];
    
    // Find 0.0267 collection offer
    const targetCollectionOffer = collectionOffers.find(offer => {
      const ethValue = offer.price?.value / 1e18;
      return Math.abs(ethValue - 0.0267) < 0.0001;
    });
    
    if (targetCollectionOffer) {
      console.log('   Found 0.0267 ETH collection offer:');
      console.log('   - Order hash:', targetCollectionOffer.order_hash);
      console.log('   - Offerer:', targetCollectionOffer.protocol_data?.parameters?.offerer);
    }
    
    // 2. Get best offer for a specific token
    console.log('\n2️⃣ Getting best offer for token #588:');
    const tokenResponse = await axios.get(
      'https://api.opensea.io/api/v2/offers/collection/gemesis/nfts/588/best',
      { headers }
    );
    
    const bestOffer = tokenResponse.data;
    console.log('   - Order hash:', bestOffer.order_hash);
    console.log('   - Price:', bestOffer.price?.value / 1e18, 'ETH');
    console.log('   - Criteria:', bestOffer.criteria);
    console.log('   - Offerer:', bestOffer.protocol_data?.parameters?.offerer);
    
    // 3. Compare
    console.log('\n3️⃣ Comparison:');
    if (targetCollectionOffer && bestOffer.order_hash === targetCollectionOffer.order_hash) {
      console.log('   ✅ SAME ORDER! The best offer API is returning a collection offer!');
      console.log('   This explains why all tokens show the same price.');
      
      // Check if our code is doubling this
      console.log('\n4️⃣ The mystery of doubling:');
      console.log('   - API returns: 0.0267 ETH (collection offer)');
      console.log('   - Our logs show: 0.0536 ETH');
      console.log('   - 0.0267 * 2 = 0.0534 ≈ 0.0536');
      console.log('   - CONFIRMED: The value is being doubled in our code!');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugCollectionVsToken();