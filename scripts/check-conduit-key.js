const api = require('../src/api');
const config = require('../config');
const { ethers } = require('ethers');

async function checkConduitKey() {
  console.log('🔍 ConduitKey Kontrolü\n');
  
  try {
    // Abstract chain'e geç
    await api.switchChain('abstract');
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('📋 Abstract Chain Bilgileri:');
    console.log('Chain ID:', 2741);
    console.log('Seaport Address:', '0x0000000000000068f116a894984e2db1123eb395');
    
    // ConduitKey'leri test et
    const conduitKeys = [
      {
        name: 'OpenSea Conduit (Abstract)',
        key: '0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e'
      },
      {
        name: 'Zero Conduit (Default)',
        key: '0x0000000000000000000000000000000000000000000000000000000000000000'
      },
      {
        name: 'OpenSea Conduit (Ethereum)',
        key: '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000'
      }
    ];
    
    console.log('\n🔐 ConduitKey Alternatifleri:');
    conduitKeys.forEach(ck => {
      console.log(`\n${ck.name}:`);
      console.log(`Key: ${ck.key}`);
    });
    
    // Test order parametreleri
    const testOrder = {
      contract: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      tokenId: '88',
      price: '0.00888'
    };
    
    console.log('\n📋 Test Order:');
    console.log('Contract:', testOrder.contract);
    console.log('Token ID:', testOrder.tokenId);
    console.log('Price:', testOrder.price, 'ETH');
    
    // Her conduitKey için test et
    for (const conduit of conduitKeys) {
      console.log('\n' + '='.repeat(60));
      console.log(`🧪 Test: ${conduit.name}`);
      
      try {
        const orderParams = createOrderParams(
          testOrder.contract,
          testOrder.tokenId,
          testOrder.price,
          conduit.key
        );
        
        // İmzala
        const signature = await api._signOrder(orderParams, 'abstract');
        
        // API'ye gönder
        const payload = {
          parameters: orderParams,
          signature: signature,
          protocol_address: '0x0000000000000068f116a894984e2db1123eb395'
        };
        
        console.log('📤 API isteği gönderiliyor...');
        
        const response = await api.makeRequest('POST', '/api/v2/orders/abstract/seaport/offers', payload);
        
        console.log('✅ BAŞARILI!');
        console.log('Order Hash:', response.order?.order_hash || response.order_hash);
        console.log('\n🎉 DOĞRU CONDUIT KEY BULUNDU:', conduit.name);
        break;
        
      } catch (error) {
        console.log('❌ Başarısız');
        if (error.response?.data?.errors) {
          console.log('Hata:', error.response.data.errors[0]);
        } else {
          console.log('Hata:', error.message);
        }
      }
      
      // Rate limit için bekle
      await new Promise(r => setTimeout(r, 2000));
    }
    
  } catch (error) {
    console.error('Genel hata:', error.message);
  }
  
  process.exit(0);
}

function createOrderParams(contractAddress, tokenId, price, conduitKey) {
  const offerWei = ethers.parseEther(price);
  const feeWei = (offerWei * 250n) / 10000n;
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const startTime = Math.floor(Date.now() / 1000);
  const endTime = startTime + 1800; // 30 dakika
  
  return {
    offerer: config.walletAddress,
    zone: "0x000056F7000000EcE9003ca63978907a00FFD100",
    offer: [{
      itemType: 1,
      token: config.getWethAddress('abstract'),
      identifierOrCriteria: "0",
      startAmount: offerWei.toString(),
      endAmount: offerWei.toString()
    }],
    consideration: [
      {
        itemType: 2,
        token: contractAddress,
        identifierOrCriteria: tokenId,
        startAmount: "1",
        endAmount: "1",
        recipient: config.walletAddress
      },
      {
        itemType: 1,
        token: config.getWethAddress('abstract'),
        identifierOrCriteria: "0",
        startAmount: feeWei.toString(),
        endAmount: feeWei.toString(),
        recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
      }
    ],
    orderType: 2,
    startTime: startTime.toString(),
    endTime: endTime.toString(),
    zoneHash: ethers.ZeroHash,
    salt: salt,
    conduitKey: conduitKey,
    totalOriginalConsiderationItems: 2,
    counter: "3764503413860693020149304177498396137625" // Mevcut counter
  };
}

checkConduitKey();