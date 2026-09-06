const axios = require('axios');
const config = require('./config');

async function checkMysteryTokens() {
  console.log('🔍 Checking tokens that show 0.0536 in logs...\n');
  
  const headers = {
    'accept': 'application/json',
    'x-api-key': config.apiKey
  };
  
  // Tokens that showed 0.0536 in logs
  const mysteryTokens = ['588', '418', '753', '799', '147', '197'];
  
  for (const tokenId of mysteryTokens) {
    try {
      const response = await axios.get(
        `https://api.opensea.io/api/v2/offers/collection/gemesis/nfts/${tokenId}/best`,
        { headers }
      );
      
      const rawValue = response.data.price?.value;
      const ethValue = rawValue / 1e18;
      
      console.log(`Token #${tokenId}:`);
      console.log(`  Raw: ${rawValue}`);
      console.log(`  ETH: ${ethValue}`);
      console.log(`  2x: ${ethValue * 2}`);
      
      // Check if raw value is already doubled
      if (rawValue === '53400000000000000') {
        console.log(`  ⚠️  API returns DOUBLED value!`);
      }
      
    } catch (error) {
      console.log(`Token #${tokenId}: No offer`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log('\n📊 Theory:');
  console.log('If all show 0.0267, then the doubling happens in our code.');
  console.log('If some show 0.0534, then API sometimes returns doubled values.');
}

checkMysteryTokens();