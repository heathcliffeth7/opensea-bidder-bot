const api = require('../src/api');
const { ethers } = require('ethers');
const config = require('../config');

async function testCollectionOffer() {
  console.log('🎯 Collection Offer Test - Duplicate Bypass\n');
  
  try {
    await api.switchChain('abstract');
    console.log('✅ Abstract chain\'e bağlandı');
    
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const price = '0.008'; // Daha düşük fiyat
    const duration = 24 * 60; // 24 saat
    
    console.log('📋 Collection Offer Parametreleri:');
    console.log('Collection:', 'pengztracted-abstract');
    console.log('Contract:', contractAddress);
    console.log('Price:', price, 'WETH');
    console.log('Duration:', duration / 60, 'hours');
    
    // Collection offer parametreleri
    const orderParams = {
      offerer: config.walletAddress,
      zone: ethers.ZeroAddress,
      offer: [{
        itemType: 1, // ERC20 (WETH)
        token: config.getWethAddress('abstract'),
        identifierOrCriteria: "0",
        startAmount: ethers.parseEther(price).toString(),
        endAmount: ethers.parseEther(price).toString()
      }],
      consideration: [{
        itemType: 4, // ERC721_WITH_CRITERIA (Collection)
        token: contractAddress,
        identifierOrCriteria: "0x0000000000000000000000000000000000000000000000000000000000000000", // Merkle root for collection
        startAmount: "1",
        endAmount: "1",
        recipient: config.walletAddress
      }],
      orderType: 0, // FULL_OPEN
      startTime: Math.floor(Date.now() / 1000).toString(),
      endTime: (Math.floor(Date.now() / 1000) + duration * 60).toString(),
      zoneHash: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
      counter: "0", // Web gibi 0
      totalOriginalConsiderationItems: 1
    };
    
    console.log('\n📝 Order imzalanıyor...');
    const signature = await api._signOrder(orderParams, 'abstract');
    console.log('✅ İmza oluşturuldu');
    
    const payload = {
      parameters: orderParams,
      signature: signature,
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    };
    
    // Farklı endpoint'ler dene
    const endpoints = [
      '/api/v2/orders/abstract/seaport/offers',
      '/api/v2/offers/collection/pengztracted-abstract', // Collection specific
      '/api/v2/orders/post' // Genel endpoint
    ];
    
    for (const endpoint of endpoints) {
      console.log(`\n🔄 Endpoint deneniyor: ${endpoint}`);
      
      try {
        const response = await api.makeRequest('POST', endpoint, payload);
        console.log('\n✅ BAŞARILI!');
        console.log('Order Hash:', response.order?.order_hash || response.order_hash);
        console.log('Endpoint:', endpoint);
        return;
      } catch (error) {
        if (error.response?.status === 400) {
          const errorMsg = error.response.data.errors?.[0] || error.response.data.detail || 'Unknown error';
          console.log(`❌ Hata: ${errorMsg}`);
          
          // Duplicate değilse devam et
          if (!errorMsg.toLowerCase().includes('duplicate')) {
            console.log('💡 Farklı bir hata, bir sonraki endpoint deneniyor...');
          }
        } else {
          console.log(`❌ Diğer hata: ${error.message}`);
        }
      }
    }
    
    // Alternatif: OpenSea SDK kullan
    console.log('\n🔄 OpenSea SDK ile deneniyor...');
    
    try {
      if (api.openseaSDK) {
        const sdkOffer = await api.openseaSDK.createCollectionOffer({
          collection: { slug: 'pengztracted-abstract' },
          accountAddress: config.walletAddress,
          amount: price,
          quantity: 1,
          expirationTime: Math.floor(Date.now() / 1000) + duration * 60
        });
        
        console.log('\n✅ SDK ile BAŞARILI!');
        console.log('Order:', sdkOffer);
      }
    } catch (sdkError) {
      console.log('❌ SDK hatası:', sdkError.message);
    }
    
    console.log('\n💡 SON ÇÖZÜM:');
    console.log('OpenSea bu wallet için token #16\'ya kalıcı bir block koymuş olabilir.');
    console.log('Öneriler:');
    console.log('1. Farklı bir collection deneyin');
    console.log('2. Farklı bir wallet kullanın');
    console.log('3. OpenSea support ile iletişime geçin');
    console.log('4. 24-48 saat bekleyin');
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
  }
  
  process.exit(0);
}

testCollectionOffer();