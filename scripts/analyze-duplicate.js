const { ethers } = require('ethers');
const crypto = require('crypto');

// OpenSea'nin muhtemel order hash hesaplama yöntemi
function calculateOrderHash(params) {
  // Seaport 1.6 order hash calculation
  const types = [
    'address', // offerer
    'address', // zone  
    'bytes32', // offer hash
    'bytes32', // consideration hash
    'uint8',   // orderType
    'uint256', // startTime
    'uint256', // endTime
    'bytes32', // zoneHash
    'uint256', // salt
    'bytes32', // conduitKey
    'uint256'  // counter
  ];
  
  // Offer ve consideration hash'lerini basitleştirilmiş hesapla
  const offerHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(params.offer)));
  const considerationHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(params.consideration)));
  
  const values = [
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
  ];
  
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(types, values);
  return ethers.keccak256(encoded);
}

// Test parameters
const testParams = {
  offerer: process.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000",
  zone: "0x000056F7000000EcE9003ca63978907a00FFD100",
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
    recipient: process.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  }],
  orderType: 2,
  startTime: "1749231915",
  endTime: "1749226808",
  zoneHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  salt: "0x17f73c1540c566bafc1730223d17f9fc32f007739d98b79d04d7bb4513ded4",
  conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
  counter: "3079289294899052847375189187577495606294"
};

console.log('🔍 Analyzing Order Duplicate Issue\n');

// Hesaplanan hash
const calculatedHash = calculateOrderHash(testParams);
console.log('Calculated Hash:', calculatedHash);

// OpenSea'nin verdiği duplicate hash'ler
const duplicateHashes = [
  '0x5bb3547435e09b1bb1fd97bfb239a981b1978ba6325fdf9a5caa54405d0947df',
  '0x31ff896ee817f07a790d440bc421aa7e8b561fbcd05ed5e61f2cc1a26b993113',
  '0xeae0deda80102c4f18c206c8fc43c9447679311043e7aceddfb7cb488107bbc2'
];

console.log('\nOpenSea Duplicate Hashes:');
duplicateHashes.forEach(hash => console.log('-', hash));

// Muhtemel sorunlar
console.log('\n🤔 Muhtemel Sorunlar:');
console.log('1. ConduitKey yanlış olabilir');
console.log('   - Kullanılan:', testParams.conduitKey);
console.log('   - Abstract için doğru mu?');

console.log('\n2. Zone adresi yanlış olabilir');
console.log('   - Kullanılan:', testParams.zone);
console.log('   - Bu Seaport 1.6 zone\'u Abstract\'ta geçerli mi?');

console.log('\n3. Protocol address yanlış olabilir');
console.log('   - Gönderilen: 0x0000000000000068f116a894984e2db1123eb395');
console.log('   - Abstract için farklı mı olmalı?');

console.log('\n4. OpenSea Abstract için rate limiting uyguluyor olabilir');
console.log('   - Aynı wallet + collection kombinasyonu için bekleme süresi olabilir');

// ConduitKey'i decode edelim
console.log('\n📊 ConduitKey Analizi:');
const conduitKeyBuffer = Buffer.from(testParams.conduitKey.slice(2), 'hex');
console.log('- Hex:', testParams.conduitKey);
console.log('- Length:', conduitKeyBuffer.length, 'bytes');
console.log('- As UTF8 (if readable):', conduitKeyBuffer.toString('utf8').replace(/[^\x20-\x7E]/g, '.'));

// Zone analizi
console.log('\n📊 Zone Analizi:');
console.log('- Address:', testParams.zone);
console.log('- Checksum:', ethers.getAddress(testParams.zone));

// Çözüm önerileri
console.log('\n💡 ÇÖZÜM ÖNERİLERİ:');
console.log('1. Abstract chain için OpenSea\'den özel conduitKey isteyin');
console.log('2. Farklı bir zone adresi deneyin (0x0000...0000 gibi)');
console.log('3. OrderType\'ı değiştirin (0 veya 1 deneyin)');
console.log('4. totalOriginalConsiderationItems\'ı kaldırın veya değiştirin');
console.log('5. Protocol_address parametresini kaldırın veya değiştirin');