const axios = require('axios');
const config = require('./config');

async function debugBestOffer() {
  const tokenId = '653';
  const collectionSlug = 'gemesis';
  
  console.log('🔍 Debugging Best Offer for Gemesis #653...\n');
  
  try {
    // 1. Direct API call
    const response = await axios.get(
      `https://api.opensea.io/api/v2/offers/collection/${collectionSlug}/nfts/${tokenId}/best`,
      {
        headers: {
          'accept': 'application/json',
          'x-api-key': config.apiKey
        }
      }
    );
    
    console.log('📦 Raw API Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n---\n');
    
    // 2. Price extraction
    const offer = response.data;
    console.log('💰 Price field:', offer.price);
    console.log('   - Currency:', offer.price?.currency);
    console.log('   - Decimals:', offer.price?.decimals);
    console.log('   - Value:', offer.price?.value);
    console.log('   - ETH value:', offer.price?.value / Math.pow(10, offer.price?.decimals || 18));
    console.log('\n');
    
    // 3. Protocol data
    if (offer.protocol_data?.parameters?.offer?.[0]) {
      const offerItem = offer.protocol_data.parameters.offer[0];
      console.log('📋 Protocol data offer:');
      console.log('   - StartAmount:', offerItem.startAmount);
      console.log('   - ETH value:', offerItem.startAmount / 1e18);
    }
    
    // 4. Check if values match
    const priceValue = offer.price?.value / Math.pow(10, offer.price?.decimals || 18);
    const protocolValue = offer.protocol_data?.parameters?.offer?.[0]?.startAmount / 1e18;
    
    console.log('\n🔍 Value comparison:');
    console.log('   - Price field ETH:', priceValue);
    console.log('   - Protocol data ETH:', protocolValue);
    console.log('   - Match:', priceValue === protocolValue);
    
    // 5. Test _extractPrice function
    const api = require('./src/api');
    const extractedPrice = api._extractPrice(offer);
    console.log('\n🧪 _extractPrice result:', extractedPrice, 'ETH');
    console.log('   - Expected:', 0.0267, 'ETH');
    console.log('   - Got double?:', extractedPrice === 0.0534);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

debugBestOffer();