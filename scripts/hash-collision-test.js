const { ethers } = require('ethers');
const config = require('../config');
const crypto = require('crypto');

async function hashCollisionTest() {
  console.log('🔍 Order Hash Çakışma Testi\n');
  
  // Test parametreleri
  const baseParams = {
    offerer: config.walletAddress,
    zone: "0x000056F7000000EcE9003ca63978907a00FFD100",
    offer: [{
      itemType: 1,
      token: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809",
      identifierOrCriteria: "0",
      startAmount: "10000000000000000",
      endAmount: "10000000000000000"
    }],
    consideration: [
      {
        itemType: 2,
        token: "0xa6c46c07f7f1966d772e29049175ebba26262513",
        identifierOrCriteria: "16",
        startAmount: "1",
        endAmount: "1",
        recipient: config.walletAddress
      },
      {
        itemType: 1,
        token: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809",
        identifierOrCriteria: "0",
        startAmount: "250000000000000",
        endAmount: "250000000000000",
        recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
      }
    ],
    orderType: 2,
    zoneHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
    totalOriginalConsiderationItems: 2,
    counter: "4115701217458079753998782749013937966217"
  };
  
  // Duplicate hash'ler (önceki hatalardan)
  const knownDuplicates = [
    '0x7bf4a477d0a59365bee32d820ae2d55e9cdd511eb745019a14767502718d2737',
    '0x046d6d63c146bc5bf2d291ad97686adc810355a39fb9aa1e2b7f23b177a3bc1d',
    '0xa6eb9efc8b3317ff68b096b778e1532a95d8f260c9db2d0ff7248af33202c5f7',
    '0xe1d4ebda88e9ec19531c8f0ce46d676f29aea845cce164fbaac2be6820c7c299',
    '0x3cf18b8950108b8dd712afab5f4ead8a7c9e53a71f6197beba87fc8efbcb9e3e'
  ];
  
  console.log('📊 Bilinen Duplicate Hash\'ler:');
  knownDuplicates.forEach(hash => console.log(`- ${hash}`));
  
  // 1000 farklı salt ile test
  console.log('\n🧪 1000 Farklı Salt ile Hash Üretimi:');
  const hashes = new Map();
  const collisions = [];
  
  for (let i = 0; i < 1000; i++) {
    // Farklı salt üretme yöntemleri
    const salts = [
      // Yöntem 1: Tamamen random
      ethers.hexlify(ethers.randomBytes(32)),
      
      // Yöntem 2: Timestamp + random
      ethers.keccak256(ethers.toUtf8Bytes(`${Date.now()}-${Math.random()}-${i}`)),
      
      // Yöntem 3: Crypto.randomBytes
      '0x' + crypto.randomBytes(32).toString('hex'),
      
      // Yöntem 4: Counter based
      ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256'], [Date.now(), i]))
    ];
    
    const salt = salts[i % 4]; // Farklı yöntemleri dene
    const timestamp = Math.floor(Date.now() / 1000) + i; // Her biri için farklı timestamp
    
    const params = {
      ...baseParams,
      salt: salt,
      startTime: timestamp.toString(),
      endTime: (timestamp + 900).toString()
    };
    
    // Order hash hesapla (Seaport standardına göre)
    const orderHash = calculateSeaportOrderHash(params);
    
    // Çakışma kontrolü
    if (hashes.has(orderHash)) {
      collisions.push({
        hash: orderHash,
        salt1: hashes.get(orderHash).salt,
        salt2: salt,
        index1: hashes.get(orderHash).index,
        index2: i
      });
    }
    
    // Known duplicates ile karşılaştır
    if (knownDuplicates.includes(orderHash)) {
      console.log(`\n⚠️ KNOWN DUPLICATE BULUNDU!`);
      console.log(`Hash: ${orderHash}`);
      console.log(`Salt: ${salt}`);
      console.log(`Index: ${i}`);
    }
    
    hashes.set(orderHash, { salt, index: i });
  }
  
  console.log(`\n📊 Test Sonuçları:`);
  console.log(`- Toplam üretilen hash: ${hashes.size}`);
  console.log(`- Çakışma sayısı: ${collisions.length}`);
  console.log(`- Benzersizlik oranı: ${((hashes.size / 1000) * 100).toFixed(2)}%`);
  
  if (collisions.length > 0) {
    console.log('\n❌ ÇAKIŞMALAR:');
    collisions.forEach(c => {
      console.log(`\nHash: ${c.hash}`);
      console.log(`Salt 1 (index ${c.index1}): ${c.salt1}`);
      console.log(`Salt 2 (index ${c.index2}): ${c.salt2}`);
    });
  }
  
  // Salt benzersizlik testi
  console.log('\n🧪 Salt Benzersizlik Testi:');
  const saltSet = new Set();
  const saltCollisions = [];
  
  for (let i = 0; i < 10000; i++) {
    const salt = ethers.hexlify(ethers.randomBytes(32));
    if (saltSet.has(salt)) {
      saltCollisions.push(salt);
    }
    saltSet.add(salt);
  }
  
  console.log(`- 10,000 salt üretildi`);
  console.log(`- Benzersiz salt sayısı: ${saltSet.size}`);
  console.log(`- Salt çakışması: ${saltCollisions.length}`);
  
  // OpenSea'nin muhtemel hash kontrolü
  console.log('\n🔍 OpenSea Hash Kontrolü Simülasyonu:');
  
  // Son 5 dakika içindeki order'ları simüle et
  const recentOrders = new Map();
  const testOrder = {
    ...baseParams,
    salt: ethers.hexlify(ethers.randomBytes(32)),
    startTime: Math.floor(Date.now() / 1000).toString(),
    endTime: (Math.floor(Date.now() / 1000) + 900).toString()
  };
  
  const testHash = calculateSeaportOrderHash(testOrder);
  
  // Farklı parametrelerle aynı hash üretmeye çalış
  console.log('\n🧪 Aynı Hash Üretme Denemeleri:');
  let sameHashFound = false;
  
  for (let i = 0; i < 1000; i++) {
    const attemptParams = {
      ...testOrder,
      salt: ethers.hexlify(ethers.randomBytes(32)) // Farklı salt
    };
    
    const attemptHash = calculateSeaportOrderHash(attemptParams);
    if (attemptHash === testHash) {
      sameHashFound = true;
      console.log('⚠️ AYNI HASH BULUNDU!');
      console.log('Original salt:', testOrder.salt);
      console.log('Duplicate salt:', attemptParams.salt);
      break;
    }
  }
  
  if (!sameHashFound) {
    console.log('✅ 1000 denemede aynı hash üretilemedi (beklenen)');
  }
  
  // Çözüm önerileri
  console.log('\n💡 ÇÖZÜM ÖNERİLERİ:');
  console.log('1. Salt her zaman ethers.randomBytes(32) ile üretilmeli');
  console.log('2. Timestamp\'ler her zaman güncel olmalı');
  console.log('3. Counter değeri blockchain\'den alınmalı');
  console.log('4. Her order için en az 1-2 saniye beklenmeli');
  console.log('5. OpenSea cache temizlenmesi için 5-10 dakika beklenebilir');
}

// Seaport order hash hesaplama (EIP-712)
function calculateSeaportOrderHash(params) {
  // OrderComponents struct hash
  const ORDER_TYPE_HASH = ethers.id(
    "OrderComponents(address offerer,address zone,OfferItem[] offer,ConsiderationItem[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)"
  );
  
  const OFFER_ITEM_TYPE_HASH = ethers.id(
    "OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)"
  );
  
  const CONSIDERATION_ITEM_TYPE_HASH = ethers.id(
    "ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)"
  );
  
  // Offer items hash
  const offerHashes = params.offer.map(item => 
    ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint8', 'address', 'uint256', 'uint256', 'uint256'],
      [OFFER_ITEM_TYPE_HASH, item.itemType, item.token, item.identifierOrCriteria, item.startAmount, item.endAmount]
    ))
  );
  const offerHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [offerHashes]));
  
  // Consideration items hash
  const considerationHashes = params.consideration.map(item =>
    ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint8', 'address', 'uint256', 'uint256', 'uint256', 'address'],
      [CONSIDERATION_ITEM_TYPE_HASH, item.itemType, item.token, item.identifierOrCriteria, item.startAmount, item.endAmount, item.recipient]
    ))
  );
  const considerationHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [considerationHashes]));
  
  // Final order hash
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'address', 'address', 'bytes32', 'bytes32', 'uint8', 'uint256', 'uint256', 'bytes32', 'uint256', 'bytes32', 'uint256'],
    [
      ORDER_TYPE_HASH,
      params.offerer,
      params.zone,
      offerHash,
      considerationHash,
      params.orderType,
      params.startTime,
      params.endTime,
      params.zoneHash,
      params.salt,
      params.conduitKey,
      params.counter
    ]
  ));
}

hashCollisionTest().catch(console.error);