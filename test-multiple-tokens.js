const axios = require('axios');
const config = require('./config');

async function testMultipleTokens() {
  console.log('🔍 Testing best offers for multiple Gemesis tokens...\n');
  
  const headers = {
    'accept': 'application/json',
    'x-api-key': config.apiKey
  };
  
  const tokens = ['653', '896', '478', '96', '85', '108'];
  const results = [];
  
  for (const tokenId of tokens) {
    try {
      const response = await axios.get(
        `https://api.opensea.io/api/v2/offers/collection/gemesis/nfts/${tokenId}/best`,
        { headers }
      );
      
      const ethValue = response.data.price?.value / 1e18;
      results.push({
        tokenId,
        value: response.data.price?.value,
        eth: ethValue,
        orderHash: response.data.order_hash
      });
      
      console.log(`Token #${tokenId}: ${ethValue} ETH`);
    } catch (error) {
      console.log(`Token #${tokenId}: No offer (${error.response?.status || error.message})`);
      results.push({
        tokenId,
        value: null,
        eth: 0,
        orderHash: null
      });
    }
    
    // Small delay to avoid rate limit
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n📊 Analysis:');
  
  // Check if all values are the same
  const uniqueValues = [...new Set(results.filter(r => r.value).map(r => r.value))];
  console.log(`Unique values: ${uniqueValues.length}`);
  
  if (uniqueValues.length === 1) {
    console.log('⚠️  All tokens have the SAME best offer value!');
    console.log('This suggests a collection offer is being returned as best offer for each token.');
    
    // Check if it's exactly double
    const singleValue = uniqueValues[0] / 1e18;
    console.log(`\nSingle value: ${singleValue} ETH`);
    console.log(`Double value: ${singleValue * 2} ETH`);
    
    if (Math.abs(singleValue * 2 - 0.0534) < 0.001) {
      console.log('✅ Confirmed: The value is being doubled somewhere in the code!');
    }
  } else {
    console.log('Different tokens have different best offers.');
    results.forEach(r => {
      if (r.value) {
        console.log(`  Token #${r.tokenId}: ${r.eth} ETH`);
      }
    });
  }
  
  // Check order hashes
  const uniqueHashes = [...new Set(results.filter(r => r.orderHash).map(r => r.orderHash))];
  console.log(`\nUnique order hashes: ${uniqueHashes.length}`);
  if (uniqueHashes.length === 1) {
    console.log('⚠️  All tokens return the SAME order hash!');
    console.log('This confirms it\'s a collection offer being returned.');
  }
}

testMultipleTokens();