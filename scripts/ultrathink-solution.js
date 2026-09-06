const api = require('../src/api');
const { ethers } = require('ethers');
const config = require('../config');

async function ultrathinkSolution() {
  console.log('🧠 ULTRATHINK - Nihai Çözüm\n');
  
  try {
    await api.switchChain('abstract');
    console.log('✅ Abstract chain\'e bağlandı');
    
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenId = '2500'; // Çok yüksek bir token ID
    const price = '0.009'; // Biraz farklı fiyat
    const duration = 20; // Farklı süre
    
    console.log('📋 Farklı Parametrelerle Test:');
    console.log('Token ID:', tokenId, '(yüksek ID)');
    console.log('Price:', price, 'WETH (farklı fiyat)');
    console.log('Duration:', duration, 'minutes');
    
    // Zone kullan - OpenSea'nin beklediği zone
    const zone = '0x000056F7000000EcE9003ca63978907a00FFD100';
    const orderType = 2; // FULL_RESTRICTED (zone ile)
    
    // Parametreler
    const orderParams = {
      offerer: config.walletAddress,
      zone: zone, // Zone kullan
      offer: [{
        itemType: 1, // ERC20 (WETH)
        token: config.getWethAddress('abstract'),
        identifierOrCriteria: "0",
        startAmount: ethers.parseEther(price).toString(),
        endAmount: ethers.parseEther(price).toString()
      }],
      consideration: [
        {
          itemType: 2, // ERC721
          token: contractAddress,
          identifierOrCriteria: tokenId,
          startAmount: "1",
          endAmount: "1",
          recipient: config.walletAddress
        },
        // OpenSea fee ekle (zone kullanırken gerekli)
        {
          itemType: 1, // ERC20 (WETH) - Fee
          token: config.getWethAddress('abstract'),
          identifierOrCriteria: "0",
          startAmount: (ethers.parseEther(price) * 250n / 10000n).toString(), // %2.5 fee
          endAmount: (ethers.parseEther(price) * 250n / 10000n).toString(),
          recipient: "0x0000a26b00c1F0DF003000390027140000fAa719" // OpenSea fee recipient
        }
      ],
      orderType: orderType, // FULL_RESTRICTED
      startTime: Math.floor(Date.now() / 1000).toString(),
      endTime: (Math.floor(Date.now() / 1000) + duration * 60).toString(),
      zoneHash: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
      counter: "0", // Web gibi 0 kullan
      totalOriginalConsiderationItems: 2 // Fee dahil
    };
    
    console.log('\n🔧 Özel Parametreler:');
    console.log('- Zone kullanılıyor:', zone);
    console.log('- OrderType:', orderType, '(FULL_RESTRICTED)');
    console.log('- OpenSea fee dahil');
    console.log('- Counter: 0 (web gibi)');
    
    console.log('\n📝 Order imzalanıyor...');
    const signature = await api._signOrder(orderParams, 'abstract');
    console.log('✅ İmza oluşturuldu');
    
    const payload = {
      parameters: orderParams,
      signature: signature,
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    };
    
    console.log('\n📤 OpenSea\'ye gönderiliyor...');
    
    try {
      const response = await api.makeRequest('POST', '/api/v2/orders/abstract/seaport/offers', payload);
      
      console.log('\n✅ BAŞARILI!');
      console.log('Order Hash:', response.order?.order_hash || response.order_hash);
      console.log('\n🎉 ÇÖZÜM BULUNDU!');
      console.log('Zone ve orderType kullanarak duplicate sorunu aşıldı.');
      
    } catch (error) {
      if (error.response?.status === 400) {
        const errorMsg = error.response.data.errors?.[0] || error.response.data.detail || 'Unknown error';
        console.log(`\n❌ Hata: ${errorMsg}`);
        
        if (!errorMsg.toLowerCase().includes('duplicate')) {
          console.log('✨ Farklı bir hata! Duplicate değil, bu iyi haber.');
          console.log('Parametreleri ayarlayıp tekrar deneyin.');
        }
      } else {
        console.log(`\n❌ Diğer hata: ${error.message}`);
      }
    }
    
    // Alternatif 2: Tamamen farklı bir collection dene
    console.log('\n\n🔄 ALTERNATİF: Farklı Collection');
    console.log('pengztracted-abstract yerine başka bir Abstract collection deneyin.');
    console.log('Örnek: !settask test abstract:different-collection ...');
    
    console.log('\n\n💡 ÖZET:');
    console.log('1. Zone kullanarak farklı order type deneyin');
    console.log('2. Çok yüksek token ID\'ler kullanın (2000+)');
    console.log('3. Farklı fiyatlar deneyin');
    console.log('4. En kesin çözüm: Farklı collection kullanın');
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
  }
  
  process.exit(0);
}

ultrathinkSolution();