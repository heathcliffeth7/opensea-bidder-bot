const api = require('../src/api');
const config = require('../config');
const { ethers } = require('ethers');

async function deepDebug() {
  console.log('🔍 DEEP DEBUG - Duplicate Order Sorunu Analizi\n');
  
  try {
    // Abstract chain'e geç
    await api.switchChain('abstract');
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('📋 Sistem Bilgileri:');
    console.log('Wallet:', config.walletAddress);
    console.log('Chain: Abstract (2741)');
    console.log('WETH:', config.getWethAddress('abstract'));
    
    // 1. Blockchain'den counter değerini al
    const seaportAbi = ['function getCounter(address offerer) view returns (uint256)'];
    const seaportContract = new ethers.Contract(
      '0x0000000000000068f116a894984e2db1123eb395',
      seaportAbi,
      api.provider
    );
    
    const currentCounter = await seaportContract.getCounter(config.walletAddress);
    console.log('\n📊 Blockchain Counter:', currentCounter.toString());
    
    // 2. Order parametrelerini hazırla
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenId = '123';
    const price = '0.00999';
    
    const offerWei = ethers.parseEther(price);
    const feeWei = (offerWei * 250n) / 10000n;
    
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + 900; // 15 dakika
    
    const salt = ethers.hexlify(ethers.randomBytes(32));
    
    const orderParameters = {
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
      conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
      totalOriginalConsiderationItems: 2,
      counter: currentCounter.toString()
    };
    
    console.log('\n📝 Order Parametreleri:');
    console.log('Token:', contractAddress);
    console.log('Token ID:', tokenId);
    console.log('Price:', price, 'ETH');
    console.log('Salt:', salt);
    console.log('Counter:', orderParameters.counter);
    console.log('Zone:', orderParameters.zone);
    console.log('OrderType:', orderParameters.orderType);
    
    // 3. Order hash'ini hesapla
    console.log('\n🔐 Order Hash Hesaplama...');
    
    // EIP-712 TypedData
    const domain = {
      name: "Seaport",
      version: "1.6",
      chainId: 2741,
      verifyingContract: "0x0000000000000068f116a894984e2db1123eb395"
    };
    
    const types = {
      OrderComponents: [
        { name: "offerer", type: "address" },
        { name: "zone", type: "address" },
        { name: "offer", type: "OfferItem[]" },
        { name: "consideration", type: "ConsiderationItem[]" },
        { name: "orderType", type: "uint8" },
        { name: "startTime", type: "uint256" },
        { name: "endTime", type: "uint256" },
        { name: "zoneHash", type: "bytes32" },
        { name: "salt", type: "uint256" },
        { name: "conduitKey", type: "bytes32" },
        { name: "counter", type: "uint256" }
      ],
      OfferItem: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" }
      ],
      ConsiderationItem: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" },
        { name: "recipient", type: "address" }
      ]
    };
    
    // Hash hesapla
    const orderHash = ethers.TypedDataEncoder.hash(domain, types, orderParameters);
    console.log('Hesaplanan Order Hash:', orderHash);
    
    // 4. İmzala
    console.log('\n✍️ Order imzalanıyor...');
    const signature = await api._signOrder(orderParameters, 'abstract');
    console.log('İmza:', signature);
    
    // 5. Mevcut offer'ları kontrol et
    console.log('\n📋 Mevcut Offer\'lar Kontrol Ediliyor...');
    
    try {
      // Wallet'tan tüm offer'ları al
      const walletOffers = await api.makeRequest(
        'GET',
        `/api/v2/orders/abstract/seaport/offers?maker=${config.walletAddress}&limit=50`
      );
      
      console.log('Toplam aktif offer sayısı:', walletOffers.orders?.length || 0);
      
      if (walletOffers.orders && walletOffers.orders.length > 0) {
        console.log('\n🔍 Aktif Offer\'lar:');
        walletOffers.orders.forEach((order, index) => {
          console.log(`\n--- Order ${index + 1} ---`);
          console.log('Order Hash:', order.order_hash);
          console.log('Protocol Data:', order.protocol_data?.parameters?.counter);
          console.log('Created:', new Date(order.created_date).toLocaleString());
          
          // Bu token için mi kontrol et
          const consideration = order.protocol_data?.parameters?.consideration;
          if (consideration && consideration[0]) {
            console.log('Token:', consideration[0].token);
            console.log('Token ID:', consideration[0].identifierOrCriteria);
          }
        });
      }
    } catch (e) {
      console.log('Offer listesi alınamadı:', e.message);
    }
    
    // 6. API payload hazırla
    const payload = {
      parameters: orderParameters,
      signature: signature,
      protocol_address: '0x0000000000000068f116a894984e2db1123eb395'
    };
    
    console.log('\n📤 API Payload:');
    console.log(JSON.stringify(payload, null, 2));
    
    // 7. Order'ı gönder
    console.log('\n🚀 Order gönderiliyor...');
    
    try {
      const response = await api.makeRequest('POST', '/api/v2/orders/abstract/seaport/offers', payload);
      
      console.log('\n✅ BAŞARILI!');
      console.log('Response:', JSON.stringify(response, null, 2));
      
    } catch (error) {
      console.log('\n❌ HATA!');
      
      if (error.response?.data) {
        const errorData = error.response.data;
        console.log('Error Response:', JSON.stringify(errorData, null, 2));
        
        // Duplicate hash'i çıkar
        if (errorData.errors) {
          errorData.errors.forEach(err => {
            const hashMatch = err.match(/0x[a-fA-F0-9]{64}/);
            if (hashMatch) {
              console.log('\n🔍 Duplicate Order Hash:', hashMatch[0]);
              console.log('Bizim Hash:', orderHash);
              console.log('Eşleşiyor mu?', hashMatch[0].toLowerCase() === orderHash.toLowerCase());
            }
          });
        }
      }
    }
    
  } catch (error) {
    console.error('Genel hata:', error);
  }
  
  process.exit(0);
}

deepDebug();