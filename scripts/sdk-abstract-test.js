const api = require('../src/api');
const { ethers } = require('ethers');
const config = require('../config');

async function sdkAbstractTest() {
  console.log('🔧 SDK Abstract Test\n');
  
  try {
    // Abstract chain'e geç
    await api.switchChain('abstract');
    console.log('Chain: Abstract');
    
    // SDK direkt kullan
    if (!api.sdk) {
      console.log('SDK hazır değil, bekleniyor...');
      await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log('\n📝 SDK ile offer oluşturuluyor...');
    
    // SDK'nın _getSeaportConduitKey metodunu override et
    const originalGetConduitKey = api.sdk._getSeaportConduitKey;
    api.sdk._getSeaportConduitKey = function() {
      // Abstract chain için özel conduitKey döndür
      if (this.chain === 'abstract') {
        return "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e";
      }
      return originalGetConduitKey.call(this);
    };
    
    try {
      const offer = await api.sdk.createOffer({
        asset: {
          tokenId: "16",
          tokenAddress: "0xa6c46c07f7f1966d772e29049175ebba26262513",
          schemaName: "ERC721"
        },
        accountAddress: config.walletAddress,
        startAmount: 0.011, // 0.011 ETH
        expirationTime: Math.floor(Date.now() / 1000) + 600, // 10 dakika
        paymentTokenAddress: config.getWethAddress('abstract')
      });
      
      console.log('\n✅ BAŞARILI!');
      console.log('Order Hash:', offer.hash || offer.orderHash);
      console.log('Order:', JSON.stringify(offer, null, 2));
    } finally {
      // Override'ı geri al
      api.sdk._getSeaportConduitKey = originalGetConduitKey;
    }
    
  } catch (error) {
    console.error('❌ HATA:', error.message);
    console.error('Detay:', error);
  }
  
  process.exit(0);
}

sdkAbstractTest();