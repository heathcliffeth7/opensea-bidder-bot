require('dotenv').config({ path: '../.env' });
const api = require('../src/api');
const TokenOfferV2Fix = require('../src/tokenOfferV2Fix');

async function testFinalFix() {
  console.log('🔧 Final Fix Test\n');
  
  try {
    // v2 Fix instance
    const v2Fix = new TokenOfferV2Fix(api);
    
    // Test parametreleri
    const params = {
      contractAddress: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      tokenId: '50', // Token 50'yi dene
      price: 0.01,
      expirationTime: Date.now() + 15 * 60 * 1000, // 15 dakika
      chain: 'abstract'
    };
    
    console.log('📋 Test Parametreleri:');
    console.log(`Contract: ${params.contractAddress}`);
    console.log(`Token ID: ${params.tokenId}`);
    console.log(`Fiyat: ${params.price} WETH`);
    console.log(`Chain: ${params.chain}\n`);
    
    // Offer oluştur
    console.log('🎯 v2 API ile offer oluşturuluyor...');
    const result = await v2Fix.createTokenOfferV2(
      params.contractAddress,
      params.tokenId,
      params.price,
      params.expirationTime,
      params.chain
    );
    
    console.log('\n✅ Başarılı!');
    console.log('Order Hash:', result.orderHash);
    console.log('Response:', JSON.stringify(result.response, null, 2));
    
  } catch (error) {
    console.error('\n❌ Hata:', error.message);
    if (error.response?.data) {
      console.error('API yanıtı:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testFinalFix();