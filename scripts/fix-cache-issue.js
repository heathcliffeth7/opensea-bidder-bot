const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');
const { ethers } = require('ethers');

async function fixCacheIssue() {
  console.log('🛠️ OpenSea Cache Sorunu Çözümü\n');
  
  try {
    // API'yi başlat
    await api.switchChain('abstract');
    console.log('✅ Abstract chain\'e bağlandı');
    
    // AbstractTokenOffer instance oluştur ve modifiye et
    const abstractOffer = new AbstractTokenOffer(api);
    
    // Strateji 1: Farklı Zone kullan
    console.log('\n📋 Strateji 1: Farklı Zone Adresi');
    abstractOffer.zone = ethers.ZeroAddress; // 0x0000...0000
    
    // Strateji 2: Farklı OrderType dene
    console.log('📋 Strateji 2: OrderType değiştir');
    const orderTypes = [0, 1, 2]; // FULL_OPEN, PARTIAL_OPEN, FULL_RESTRICTED
    
    // Strateji 3: ConduitKey'i değiştir
    console.log('📋 Strateji 3: ConduitKey modifikasyonu');
    const defaultConduitKey = '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000';
    
    // Test parametreleri
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenId = '16';
    const price = '0.008'; // Daha düşük fiyat
    const duration = 30; // Daha uzun süre
    
    // Strateji 4: Özel _createSeaportOrder fonksiyonu
    abstractOffer._createSeaportOrderModified = async function(contractAddress, tokenId, price, expirationMinutes) {
      try {
        console.log('\n📝 Modifiye Seaport order oluşturuluyor...');
        
        const lockKey = `${contractAddress}-${tokenId}`;
        this.orderLock.set(lockKey, true);
        
        const expirationTime = Date.now() + (expirationMinutes * 60 * 1000);
        const config = require('../config');
        const walletAddress = config.walletAddress;
        
        // Abstract WETH
        const abstractWethAddress = '0x3439153EB7AF838Ad19d56E1571FBD09333C2809';
        
        // Offer miktarları
        const offerWei = ethers.parseEther(price.toString());
        const feeWei = (offerWei * 250n) / 10000n;
        
        // Benzersiz parametreler
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const startTime = currentTimestamp + 10; // 10 saniye sonra başla
        const endTime = Math.floor(expirationTime / 1000);
        
        // Ultra random salt
        const randomData = ethers.randomBytes(32);
        const timeData = ethers.toBeHex(Date.now());
        const combinedData = ethers.concat([randomData, ethers.toUtf8Bytes(timeData)]);
        const salt = ethers.keccak256(combinedData);
        
        // Counter al
        const counter = await this._getCounter();
        
        // Farklı zone kombinasyonları dene
        const zones = [
          ethers.ZeroAddress, // 0x0000...0000
          "0x000056F7000000EcE9003ca63978907a00FFD100", // Original
          "0x0000000000000000000000000000000000000000", // Full zero
          "0x004C00500000aD104D7DBd00e3ae0A5C00560C00" // OpenSea shared zone
        ];
        
        // Farklı conduitKey kombinasyonları
        const conduitKeys = [
          defaultConduitKey,
          this.abstractConduitKey,
          ethers.ZeroHash // 0x0000...0000 (32 bytes)
        ];
        
        for (let orderType of orderTypes) {
          for (let zone of zones) {
            for (let conduitKey of conduitKeys) {
              console.log(`\n🔄 Deneniyor: OrderType=${orderType}, Zone=${zone.slice(0,10)}..., ConduitKey=${conduitKey.slice(0,10)}...`);
              
              const orderParameters = {
                offerer: walletAddress,
                zone: zone,
                offer: [{
                  itemType: 1, // ERC20
                  token: abstractWethAddress,
                  identifierOrCriteria: "0",
                  startAmount: offerWei.toString(),
                  endAmount: offerWei.toString()
                }],
                consideration: [
                  {
                    itemType: 2, // ERC721
                    token: contractAddress,
                    identifierOrCriteria: tokenId.toString(),
                    startAmount: "1",
                    endAmount: "1",
                    recipient: walletAddress
                  },
                  {
                    itemType: 1, // ERC20 - Fee
                    token: abstractWethAddress,
                    identifierOrCriteria: "0",
                    startAmount: feeWei.toString(),
                    endAmount: feeWei.toString(),
                    recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
                  }
                ],
                orderType: orderType,
                startTime: startTime.toString(),
                endTime: endTime.toString(),
                zoneHash: ethers.ZeroHash,
                salt: salt,
                conduitKey: conduitKey,
                counter: counter
              };
              
              // totalOriginalConsiderationItems her zaman gerekli
              orderParameters.totalOriginalConsiderationItems = 2;
              
              try {
                // İmzala
                const signature = await this.api._signOrder(orderParameters, 'abstract');
                
                // Farklı protocol_address'ler dene
                const protocolAddresses = [
                  '0x0000000000000068f116a894984e2db1123eb395', // Default
                  undefined, // Protocol_address olmadan
                  '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC' // V1.5
                ];
                
                for (let protocolAddress of protocolAddresses) {
                  console.log(`   Protocol: ${protocolAddress || 'undefined'}`);
                  
                  const payload = {
                    parameters: orderParameters,
                    signature: signature
                  };
                  
                  if (protocolAddress) {
                    payload.protocol_address = protocolAddress;
                  }
                  
                  try {
                    const response = await this.api.makeRequest('POST', '/api/v2/orders/abstract/seaport/offers', payload);
                    
                    // Başarılı!
                    this.orderLock.delete(lockKey);
                    console.log('\n✅ BAŞARILI! Order oluşturuldu');
                    console.log('Kullanılan parametreler:');
                    console.log('- OrderType:', orderType);
                    console.log('- Zone:', zone);
                    console.log('- ConduitKey:', conduitKey);
                    console.log('- Protocol:', protocolAddress || 'undefined');
                    
                    return {
                      success: true,
                      order_hash: response.order?.order_hash || response.order_hash,
                      order: response,
                      chain: 'abstract',
                      params: { orderType, zone, conduitKey, protocolAddress }
                    };
                    
                  } catch (apiError) {
                    // Bu kombinasyon çalışmadı, devam et
                    if (!apiError.response?.data?.errors?.[0]?.includes('Duplicate')) {
                      console.log(`   ❌ Farklı hata: ${apiError.response?.data?.errors?.[0] || apiError.message}`);
                    }
                  }
                }
              } catch (signError) {
                console.log(`   ❌ İmza hatası: ${signError.message}`);
              }
            }
          }
        }
        
        // Hiçbir kombinasyon çalışmadı
        this.orderLock.delete(lockKey);
        throw new Error('Tüm kombinasyonlar denendi, başarısız');
        
      } catch (error) {
        throw error;
      }
    };
    
    // Test et
    console.log('\n🚀 Cache sorunu çözümü test ediliyor...');
    const result = await abstractOffer._createSeaportOrderModified.call(
      abstractOffer, 
      contractAddress, 
      tokenId, 
      price, 
      duration
    );
    
    if (result.success) {
      console.log('\n🎉 SORUN ÇÖZÜLDÜ!');
      console.log('Order Hash:', result.order_hash);
      console.log('Çalışan parametreler:', result.params);
      
      // abstractTokenOffer.js'i güncelle
      console.log('\n📝 abstractTokenOffer.js güncellenmelidir:');
      console.log(`- Zone: ${result.params.zone}`);
      console.log(`- OrderType: ${result.params.orderType}`);
      console.log(`- ConduitKey: ${result.params.conduitKey}`);
      console.log(`- Protocol: ${result.params.protocolAddress || 'kaldırılmalı'}`);
    }
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
  }
  
  process.exit(0);
}

fixCacheIssue();