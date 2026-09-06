require('dotenv').config({ path: '../.env' });
const api = require('../src/api');

async function testApiResponse() {
  try {
    console.log('🧪 API Response Test\n');
    
    // Test parametreleri
    const chain = 'abstract';
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenId = 100;
    const price = 0.0087;
    const expirationTime = Date.now() + (15 * 60 * 1000);
    
    console.log('📋 Parametreler:');
    console.log(`- Chain: ${chain}`);
    console.log(`- Contract: ${contractAddress}`);
    console.log(`- Token ID: ${tokenId}`);
    console.log(`- Fiyat: ${price} ETH`);
    console.log(`- Süre: 15 dakika\n`);
    
    console.log('🚀 API çağrısı yapılıyor...\n');
    
    const result = await api.createTokenOffer(
      chain,
      contractAddress,
      tokenId,
      price,
      expirationTime
    );
    
    console.log('\n📦 SONUÇ:');
    console.log(JSON.stringify(result, null, 2));
    
    // Order hash kontrolü
    const orderHash = result?.order_hash || 
                     result?.orderHash || 
                     result?.response?.order?.order_hash ||
                     result?.response?.order_hash;
                     
    console.log(`\n🔑 Order Hash: ${orderHash || 'BULUNAMADI'}`);
    
  } catch (error) {
    console.error('\n❌ Hata:', error.message);
    if (error.response?.data) {
      console.error('API Hatası:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  process.exit(0);
}

testApiResponse();