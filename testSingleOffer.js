const api = require('./src/api');

async function testSingleOffer() {
  try {
    console.log('=== Abstract Token Offer Test ===\n');
    
    const chain = 'abstract';
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenId = 7777; // Test token ID - son token ID
    const price = 0.008; // ETH - Biraz farklı fiyat
    const expirationTime = Date.now() + (15 * 60 * 1000); // 15 dakika
    
    console.log('Test parametreleri:');
    console.log('- Chain:', chain);
    console.log('- Contract:', contractAddress);
    console.log('- Token ID:', tokenId);
    console.log('- Fiyat:', price, 'ETH');
    console.log('- Süre: 15 dakika\n');
    
    const result = await api.createTokenOffer(
      chain,
      contractAddress,
      tokenId,
      price,
      expirationTime
    );
    
    console.log('\nSonuç:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('\nHata:', error.message);
    if (error.response) {
      console.error('HTTP Status:', error.response.status);
      console.error('Hata detayı:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  process.exit(0);
}

testSingleOffer();