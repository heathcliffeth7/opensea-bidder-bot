require('dotenv').config({ path: '../.env' });
const OffChainOffer = require('../src/offChainOffer');
const config = require('../config');

async function testFastOffer() {
  console.log('⚡ Fast Offer Test\n');
  
  try {
    const offChainOffer = new OffChainOffer();
    
    // Test parametreleri
    const params = {
      contractAddress: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      tokenId: '50',
      price: 0.01,
      chain: 'abstract'
    };
    
    console.log('📋 Test Parametreleri:');
    console.log(`Contract: ${params.contractAddress}`);
    console.log(`Token ID: ${params.tokenId}`);
    console.log(`Fiyat: ${params.price} WETH`);
    console.log(`Chain: ${params.chain}\n`);
    
    // Off-chain offer oluştur
    console.log('🎯 Off-chain offer oluşturuluyor...');
    const result = await offChainOffer.createOffChainOffer(
      params.contractAddress,
      params.tokenId,
      params.price.toString(),
      15, // 15 dakika
      params.chain
    );
    
    console.log('\n✅ Test sonucu:');
    console.log('Success:', result.success);
    console.log('Order Hash:', result.orderHash);
    console.log('Off-chain:', result.offChain);
    console.log('Gas kullanıldı:', result.gasUsed);
    
  } catch (error) {
    console.error('\n❌ Hata:', error.message);
    if (error.response?.data) {
      console.error('API yanıtı:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testFastOffer();