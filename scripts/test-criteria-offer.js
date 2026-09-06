const api = require('../src/api');
const { ethers } = require('ethers');
const config = require('../config');

async function testCriteriaOffer() {
  console.log('🎯 Criteria Offer Test - Trait Bazlı Teklif\n');
  
  try {
    await api.switchChain('abstract');
    console.log('✅ Abstract chain\'e bağlandı');
    
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const price = '0.008'; // Daha düşük fiyat
    const duration = 15; // 15 dakika
    
    console.log('📋 Criteria Offer Parametreleri:');
    console.log('Collection:', 'pengztracted-abstract');
    console.log('Contract:', contractAddress);
    console.log('Price:', price, 'WETH');
    console.log('Duration:', duration, 'minutes');
    console.log('Type: Criteria (Tüm koleksiyon için geçerli)');
    
    // Criteria offer için parametreler
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
        itemType: 4, // ERC721_WITH_CRITERIA
        token: contractAddress,
        identifierOrCriteria: "0", // Criteria root - "0" means any token from collection
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
      counter: "0",
      totalOriginalConsiderationItems: 1
    };
    
    console.log('\n📝 Order imzalanıyor...');
    const signature = await api._signOrder(orderParams, 'abstract');
    console.log('✅ İmza oluşturuldu');
    
    // Farklı payload formatları dene
    console.log('\n🔄 Format 1: Standard Seaport');
    const payload1 = {
      parameters: orderParams,
      signature: signature,
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    };
    
    try {
      const response = await api.makeRequest('POST', '/api/v2/orders/abstract/seaport/offers', payload1);
      console.log('\n✅ BAŞARILI! (Format 1)');
      console.log('Order Hash:', response.order?.order_hash || response.order_hash);
      return;
    } catch (error) {
      if (error.response?.status === 400) {
        const errorMsg = error.response.data.errors?.[0] || error.response.data.detail || 'Unknown error';
        console.log(`❌ Format 1 hatası: ${errorMsg}`);
      }
    }
    
    // Format 2: Criteria specific endpoint
    console.log('\n🔄 Format 2: Criteria Endpoint');
    const payload2 = {
      criteria: {
        collection: { slug: "pengztracted-abstract" },
        contract: { address: contractAddress }
      },
      protocol_data: {
        parameters: orderParams,
        signature: signature
      },
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    };
    
    try {
      const response = await api.makeRequest('POST', '/api/v2/offers/post', payload2);
      console.log('\n✅ BAŞARILI! (Format 2)');
      console.log('Order Hash:', response.order?.order_hash || response.order_hash);
      return;
    } catch (error) {
      if (error.response?.status === 400) {
        const errorMsg = error.response.data.errors?.[0] || error.response.data.detail || 'Unknown error';
        console.log(`❌ Format 2 hatası: ${errorMsg}`);
      } else {
        console.log(`❌ Format 2 diğer hata: ${error.message}`);
      }
    }
    
    // Format 3: Collection endpoint
    console.log('\n🔄 Format 3: Collection Endpoint');
    try {
      const response = await api.makeRequest('POST', `/api/v2/collections/pengztracted-abstract/offers`, payload1);
      console.log('\n✅ BAŞARILI! (Format 3)');
      console.log('Order Hash:', response.order?.order_hash || response.order_hash);
      return;
    } catch (error) {
      console.log(`❌ Format 3 hatası: ${error.message}`);
    }
    
    console.log('\n\n💡 SONUÇ:');
    console.log('OpenSea bu wallet için pengztracted-abstract koleksiyonunda');
    console.log('geçici bir blok koymuş görünüyor.');
    console.log('\n🎯 KEYFİ ÇÖZÜM:');
    console.log('1. 24-48 saat bekleyin');
    console.log('2. Farklı bir Abstract koleksiyonunda test edin');
    console.log('3. Farklı wallet kullanın');
    console.log('4. OpenSea destek ekibiyle iletişime geçin');
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
  }
  
  process.exit(0);
}

testCriteriaOffer();