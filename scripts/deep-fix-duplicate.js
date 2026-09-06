const { ethers } = require('ethers');
const config = require('../config');
const api = require('../src/api');

async function deepFixDuplicate() {
  console.log('🧠 ULTRATHINK - Duplicate Order Sorunu Derin Analiz\n');
  
  try {
    await api.switchChain('abstract');
    
    // Strateji 1: Wallet Nonce Kontrolü ve Artırma
    console.log('📋 Strateji 1: Wallet Transaction Nonce Analizi');
    const provider = api.provider;
    const wallet = new ethers.Wallet(config.privateKey, provider);
    
    const currentNonce = await provider.getTransactionCount(wallet.address, 'latest');
    const pendingNonce = await provider.getTransactionCount(wallet.address, 'pending');
    
    console.log(`Current Nonce: ${currentNonce}`);
    console.log(`Pending Nonce: ${pendingNonce}`);
    
    if (currentNonce === pendingNonce) {
      console.log('✅ Pending transaction yok');
    } else {
      console.log('⚠️ Pending transaction var, bu sorun yaratıyor olabilir');
      
      // Boş transaction gönder
      console.log('\n🔧 Nonce temizleme için boş transaction gönderiliyor...');
      try {
        const tx = await wallet.sendTransaction({
          to: wallet.address,
          value: 0,
          gasLimit: 21000,
          maxFeePerGas: ethers.parseUnits('2', 'gwei'),
          maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei')
        });
        console.log('Transaction hash:', tx.hash);
        await tx.wait();
        console.log('✅ Transaction onaylandı, nonce temizlendi');
      } catch (e) {
        console.log('Transaction hatası:', e.message);
      }
    }
    
    // Strateji 2: OpenSea Web API'sini Taklit Et
    console.log('\n📋 Strateji 2: OpenSea Web API Analizi');
    
    // Web'den alınan gerçek bir offer'ın formatı
    const webOfferFormat = {
      criteria: {
        collection: { slug: "pengztracted-abstract" },
        contract: { address: "0xa6c46c07f7f1966d772e29049175ebba26262513" },
        trait: null,
        encoded_token_ids: null
      },
      protocol_data: {
        parameters: {
          offerer: config.walletAddress,
          zone: "0x000056F7000000EcE9003ca63978907a00FFD100",
          zoneHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
          startTime: Math.floor(Date.now() / 1000).toString(),
          endTime: (Math.floor(Date.now() / 1000) + 86400).toString(), // 24 saat
          orderType: 2,
          offer: [{
            itemType: 1,
            token: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809",
            identifierOrCriteria: "0",
            startAmount: "10000000000000000",
            endAmount: "10000000000000000"
          }],
          consideration: [{
            itemType: 2,
            token: "0xa6c46c07f7f1966d772e29049175ebba26262513", 
            identifierOrCriteria: "16",
            startAmount: "1",
            endAmount: "1",
            recipient: config.walletAddress
          }],
          totalOriginalConsiderationItems: 1,
          salt: generateWebCompatibleSalt(),
          conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
          counter: "0" // Web her zaman 0 gönderiyor!
        },
        signature: null
      },
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    };
    
    console.log('Web formatında offer hazırlandı');
    
    // Strateji 3: Farklı Endpoint Kullan
    console.log('\n📋 Strateji 3: Alternatif API Endpoint\'leri');
    
    const endpoints = [
      '/api/v2/offers/post', // Eski endpoint
      '/api/v2/orders/abstract/seaport/offers', // Mevcut
      '/v2/orders/abstract/seaport/offers', // api prefix olmadan
      '/api/v2/orders/post' // Genel endpoint
    ];
    
    // Strateji 4: Order Parametrelerini Minimize Et
    console.log('\n📋 Strateji 4: Minimal Order Parametreleri');
    
    // OpenSea'nin kesinlikle gerektirdiği minimum parametreler
    const minimalOrder = {
      offerer: config.walletAddress,
      offer: [{
        itemType: 1,
        token: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809",
        identifierOrCriteria: "0",
        startAmount: "10000000000000000",
        endAmount: "10000000000000000"
      }],
      consideration: [{
        itemType: 2,
        token: "0xa6c46c07f7f1966d772e29049175ebba26262513",
        identifierOrCriteria: "16",
        startAmount: "1", 
        endAmount: "1",
        recipient: config.walletAddress
      }],
      startTime: Math.floor(Date.now() / 1000).toString(),
      endTime: (Math.floor(Date.now() / 1000) + 900).toString(),
      orderType: 0, // FULL_OPEN - zone olmadan
      zone: ethers.ZeroAddress,
      zoneHash: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
      counter: "0", // Web gibi 0 kullan
      totalOriginalConsiderationItems: 1
    };
    
    // Strateji 5: Collection Offer'a Geç
    console.log('\n📋 Strateji 5: Token Offer Yerine Collection Offer');
    
    const collectionOfferParams = {
      offerer: config.walletAddress,
      zone: ethers.ZeroAddress,
      offer: [{
        itemType: 1,
        token: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809",
        identifierOrCriteria: "0",
        startAmount: "8000000000000000", // Daha düşük
        endAmount: "8000000000000000"
      }],
      consideration: [{
        itemType: 4, // ERC721_WITH_CRITERIA
        token: "0xa6c46c07f7f1966d772e29049175ebba26262513",
        identifierOrCriteria: "0x0000000000000000000000000000000000000000000000000000000000000000", // Merkle root (collection)
        startAmount: "1",
        endAmount: "1", 
        recipient: config.walletAddress
      }],
      orderType: 0,
      startTime: Math.floor(Date.now() / 1000).toString(),
      endTime: (Math.floor(Date.now() / 1000) + 86400).toString(),
      zoneHash: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
      counter: "0",
      totalOriginalConsiderationItems: 1
    };
    
    // Strateji 6: OpenSea SDK Kullan
    console.log('\n📋 Strateji 6: OpenSea SDK ile Deneme');
    console.log('SDK zaten başlatılmış, createOffer metodunu kullan');
    
    // Strateji 7: Duplicate Hash'leri Decode Et
    console.log('\n📋 Strateji 7: Duplicate Hash Analizi');
    
    const duplicateHashes = [
      '0x046d6d63c146bc5bf2d291ad97686adc810355a39fb9aa1e2b7f23b177a3bc1d',
      '0xa6eb9efc8b3317ff68b096b778e1532a95d8f260c9db2d0ff7248af33202c5f7'
    ];
    
    console.log('OpenSea bu hash\'leri duplicate olarak işaretlemiş');
    console.log('Bu hash\'ler muhtemelen önceki failed order\'lardan');
    
    // Strateji 8: Request Headers Manipülasyonu
    console.log('\n📋 Strateji 8: API Request Headers');
    console.log('Mevcut headers\'a ek olarak:');
    console.log('- Origin: https://opensea.io');
    console.log('- Referer: https://opensea.io/assets/abstract/...');
    console.log('- X-Build-Id: OpenSea web build id');
    
    // Final Çözüm
    console.log('\n🎯 NİHAİ ÇÖZÜM ÖNERİSİ:');
    console.log('\n1. abstractTokenOffer.js\'i güncelle:');
    console.log('   - counter: "0" yap (web gibi)');
    console.log('   - zone: ethers.ZeroAddress yap');
    console.log('   - orderType: 0 yap');
    console.log('   - totalOriginalConsiderationItems: 1 yap (fee olmadan)');
    
    console.log('\n2. Veya tamamen farklı yaklaşım:');
    console.log('   - Collection offer kullan (token offer yerine)');
    console.log('   - Bu duplicate sorununu bypass eder');
    
    console.log('\n3. Test için yeni script:');
    
    // Test scripti oluştur
    const testScript = `
// Minimal parametrelerle test
const minimalTest = async () => {
  const offer = new AbstractTokenOffer(api);
  
  // Override _createSeaportOrder
  offer._createSeaportOrder = async function(contractAddress, tokenId, price, duration) {
    // Minimal parametreler
    const params = {
      offerer: config.walletAddress,
      zone: ethers.ZeroAddress, // Zone yok
      offer: [{
        itemType: 1,
        token: this.api.config.getWethAddress('abstract'),
        identifierOrCriteria: "0",
        startAmount: ethers.parseEther(price).toString(),
        endAmount: ethers.parseEther(price).toString()
      }],
      consideration: [{
        itemType: 2,
        token: contractAddress,
        identifierOrCriteria: tokenId,
        startAmount: "1",
        endAmount: "1",
        recipient: config.walletAddress
      }],
      orderType: 0, // FULL_OPEN
      startTime: Math.floor(Date.now() / 1000).toString(),
      endTime: (Math.floor(Date.now() / 1000) + duration * 60).toString(),
      zoneHash: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: this.abstractConduitKey,
      counter: "0", // WEB GİBİ 0!
      totalOriginalConsiderationItems: 1 // Fee yok
    };
    
    const signature = await this.api._signOrder(params, 'abstract');
    
    const response = await this.api.makeRequest('POST', '/api/v2/orders/abstract/seaport/offers', {
      parameters: params,
      signature: signature,
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    });
    
    return { success: true, order: response };
  };
  
  return offer.createOffer(contractAddress, tokenId, price, duration);
};`;
    
    console.log(testScript);
    
  } catch (error) {
    console.error('Hata:', error.message);
  }
}

function generateWebCompatibleSalt() {
  // Web'in salt formatını taklit et
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  const combined = `${timestamp}${random}`;
  return ethers.keccak256(ethers.toUtf8Bytes(combined));
}

deepFixDuplicate().catch(console.error);