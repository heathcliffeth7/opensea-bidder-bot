const axios = require('axios');
const config = require('./config');

async function debugDoubleValue() {
  console.log('🔍 Searching for the double value issue...\n');
  
  const headers = {
    'accept': 'application/json',
    'x-api-key': config.apiKey
  };
  
  // Test various endpoints and calculations
  console.log('1️⃣ Raw values:');
  console.log('   - API returns: 0.0267 ETH (26700000000000000 wei)');
  console.log('   - We show: 0.0536 ETH');
  console.log('   - 0.0536 / 0.0267 = 2.007 (approximately 2x)');
  
  console.log('\n2️⃣ Testing collection offers that might be 0.0267:');
  
  try {
    // Get collection offers
    const response = await axios.get(
      'https://api.opensea.io/api/v2/offers/collection/gemesis/all',
      { 
        headers,
        params: { limit: 20 }
      }
    );
    
    const offers = response.data.offers || [];
    console.log(`   - Found ${offers.length} collection offers`);
    
    // Look for 0.0267 ETH offers
    const targetOffers = offers.filter(offer => {
      const ethValue = offer.price?.value / 1e18;
      return Math.abs(ethValue - 0.0267) < 0.0001;
    });
    
    if (targetOffers.length > 0) {
      console.log(`   - Found ${targetOffers.length} offers at 0.0267 ETH`);
      targetOffers.forEach((offer, i) => {
        console.log(`\n   Offer ${i + 1}:`);
        console.log(`   - Order hash: ${offer.order_hash}`);
        console.log(`   - Price: ${offer.price.value / 1e18} ETH`);
        console.log(`   - Type: ${offer.criteria ? 'Collection/Criteria' : 'Unknown'}`);
        if (offer.criteria?.trait) {
          console.log(`   - Trait: ${JSON.stringify(offer.criteria.trait)}`);
        }
      });
    }
    
    // Check if any collection offer is exactly half of 0.0536
    const doubleOffers = offers.filter(offer => {
      const ethValue = offer.price?.value / 1e18;
      return Math.abs(ethValue - 0.0534) < 0.001 || Math.abs(ethValue - 0.0536) < 0.001;
    });
    
    if (doubleOffers.length > 0) {
      console.log(`\n   ⚠️  Found offers near 0.0536 ETH:`);
      doubleOffers.forEach(offer => {
        console.log(`   - ${offer.price.value / 1e18} ETH`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.log('\n3️⃣ Theory: Collection offer is being applied twice');
  console.log('   - Collection offer: 0.0267 ETH');
  console.log('   - When calculating token offer price, it might be:');
  console.log('     a) Added twice: 0.0267 + 0.0267 = 0.0534');
  console.log('     b) Multiplied by 2 for some reason');
  console.log('     c) Collection + Token offer combined');
  
  console.log('\n4️⃣ Checking our code logic...');
  
  // Simulate the logic
  const collectionOfferPrice = 0.0267;
  const counterbidAmount = 0.0001;
  
  console.log('   - If collection offer = 0.0267');
  console.log('   - And we add counterbid = 0.0001');
  console.log('   - Result should be = 0.0268');
  console.log('   - But we see = 0.0536 (exactly 2x collection offer)');
  
  console.log('\n5️⃣ Possible bug locations:');
  console.log('   - _extractPrice might be called twice');
  console.log('   - Collection offer might be counted as both offer and consideration');
  console.log('   - Worker pool might be doubling the value somewhere');
}

debugDoubleValue();