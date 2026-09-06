require('dotenv').config();
const api = require('./src/api');

async function testGemesisFixed() {
  console.log('🧪 Gemesis Fixed Test\n');
  
  // Test token'lar
  const testTokens = [16, 50, 108, 963, 896];
  const contractAddress = '0xbe9371326f91345777b04394448c23e2bfeaa826';
  
  console.log('Contract Address:', contractAddress);
  console.log('Test Tokens:', testTokens.join(', '));
  console.log('\n' + '='.repeat(60) + '\n');
  
  for (const tokenId of testTokens) {
    console.log(`\n📍 Testing Token #${tokenId}:`);
    console.log('-'.repeat(40));
    
    try {
      const result = await api.getBestOfferForNFT('ethereum', contractAddress, tokenId);
      
      if (result && result.offer) {
        const price = api._extractPrice(result.offer);
        const isCollectionOffer = result.offer.criteria?.encoded_token_ids === '*';
        
        console.log(`✅ Best offer found!`);
        console.log(`   Price: ${price.toFixed(4)} ETH`);
        console.log(`   Type: ${isCollectionOffer ? 'COLLECTION OFFER ⚠️' : 'TOKEN SPECIFIC ✅'}`);
        console.log(`   Order Hash: ${result.offer.order_hash?.substring(0, 16)}...`);
        
        // Offer detayları
        if (result.offer.protocol_data?.parameters) {
          const params = result.offer.protocol_data.parameters;
          console.log(`   Offerer: ${params.offerer?.substring(0, 10)}...`);
          console.log(`   Expiration: ${new Date(parseInt(params.endTime) * 1000).toLocaleString()}`);
        }
      } else {
        console.log(`❌ No offers found`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  console.log('✅ Test completed!');
}

testGemesisFixed().catch(console.error);