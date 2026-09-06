const abstractOffer = require('./src/abstractTokenOffer.js');
const api = require('./src/api.js');
const { ethers } = require('ethers');

async function testDuplicateOrder() {
  console.log('🔍 DUPLICATE ORDER DEBUG TEST\n');
  
  const offer = new abstractOffer(api);
  
  // 1. Counter mekanizmasını test et
  console.log('1️⃣ COUNTER MEKANİZMASI TESTİ:');
  console.log('================================');
  
  const counters = [];
  for(let i = 0; i < 5; i++) {
    const counter = await offer._getCounter();
    counters.push(counter);
    console.log(`Counter ${i+1}: ${counter}`);
    await new Promise(r => setTimeout(r, 100));
  }
  
  // Counter'ların benzersiz olup olmadığını kontrol et
  const uniqueCounters = [...new Set(counters)];
  console.log(`\n✅ Benzersiz counter sayısı: ${uniqueCounters.length}/${counters.length}`);
  
  if (uniqueCounters.length < counters.length) {
    console.log('❌ SORUN TESPİT EDİLDİ: Counter değerleri tekrar ediyor!');
  }
  
  // 2. Salt oluşturma mekanizmasını test et
  console.log('\n2️⃣ SALT OLUŞTURMA MEKANİZMASI TESTİ:');
  console.log('======================================');
  
  const salts = [];
  for(let i = 0; i < 5; i++) {
    const hrTime = process.hrtime.bigint();
    const saltBase = ethers.randomBytes(24);
    const saltWithHrTime = ethers.concat([
      saltBase,
      ethers.toBeArray(hrTime % (2n ** 64n), 8)
    ]);
    const saltHex = ethers.hexlify(saltWithHrTime);
    salts.push(saltHex);
    console.log(`Salt ${i+1}: ${saltHex}`);
    await new Promise(r => setTimeout(r, 50));
  }
  
  // Salt'ların benzersiz olup olmadığını kontrol et
  const uniqueSalts = [...new Set(salts)];
  console.log(`\n✅ Benzersiz salt sayısı: ${uniqueSalts.length}/${salts.length}`);
  
  if (uniqueSalts.length < salts.length) {
    console.log('❌ SORUN TESPİT EDİLDİ: Salt değerleri tekrar ediyor!');
  }
  
  // 3. Aynı token için ardışık order parametreleri oluştur
  console.log('\n3️⃣ AYNI TOKEN İÇİN ORDER PARAMETRELERİ TESTİ:');
  console.log('==============================================');
  
  const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
  const tokenId = '896';
  const price = '0.01';
  const walletAddress = process.env.WALLET_ADDRESS || '0x0000000000000000000000000000000000000000';
  
  const orders = [];
  for(let i = 0; i < 3; i++) {
    console.log(`\n📝 Order ${i+1} oluşturuluyor...`);
    
    const expirationTime = Date.now() + (15 * 60 * 1000);
    const abstractWethAddress = '0x3439153EB7AF838Ad19d56E1571FBD09333C2809';
    const offerWei = ethers.parseEther(price);
    const feeWei = (offerWei * 250n) / 10000n;
    
    // Her order için benzersiz parametreler
    const randomDelay = Math.floor(Math.random() * 6) + 2;
    const startTime = Math.floor(Date.now() / 1000) + randomDelay;
    const endTime = Math.floor(expirationTime / 1000);
    
    // Salt'ı çok daha benzersiz yap
    const hrTime = process.hrtime.bigint();
    const saltBase = ethers.randomBytes(24);
    const saltWithHrTime = ethers.concat([
      saltBase,
      ethers.toBeArray(hrTime % (2n ** 64n), 8)
    ]);
    
    const orderParameters = {
      offerer: walletAddress,
      zone: '0x000056F7000000EcE9003ca63978907a00FFD100',
      offer: [{
        itemType: 1,
        token: abstractWethAddress,
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
          recipient: walletAddress
        },
        {
          itemType: 1,
          token: abstractWethAddress,
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
      salt: ethers.hexlify(saltWithHrTime),
      conduitKey: '0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e',
      totalOriginalConsiderationItems: 2,
      counter: await offer._getCounter()
    };
    
    orders.push(orderParameters);
    
    console.log('Order parametreleri:');
    console.log('- Salt:', orderParameters.salt);
    console.log('- Counter:', orderParameters.counter);
    console.log('- StartTime:', orderParameters.startTime);
    console.log('- EndTime:', orderParameters.endTime);
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  // 4. Order'ların benzersizliğini kontrol et
  console.log('\n4️⃣ ORDER BENZERSİZLİK ANALİZİ:');
  console.log('================================');
  
  // Salt değerlerini karşılaştır
  const orderSalts = orders.map(o => o.salt);
  const uniqueOrderSalts = [...new Set(orderSalts)];
  console.log(`\nSalt benzersizliği: ${uniqueOrderSalts.length}/${orderSalts.length}`);
  if (uniqueOrderSalts.length < orderSalts.length) {
    console.log('❌ SALT TEKRARI VAR!');
    orderSalts.forEach((salt, i) => {
      const duplicates = orderSalts.filter((s, j) => s === salt && i !== j);
      if (duplicates.length > 0) {
        console.log(`- Order ${i+1} salt'ı başka order'larda da kullanılmış!`);
      }
    });
  }
  
  // Counter değerlerini karşılaştır
  const orderCounters = orders.map(o => o.counter);
  const uniqueOrderCounters = [...new Set(orderCounters)];
  console.log(`\nCounter benzersizliği: ${uniqueOrderCounters.length}/${orderCounters.length}`);
  if (uniqueOrderCounters.length < orderCounters.length) {
    console.log('❌ COUNTER TEKRARI VAR!');
    console.log('Counter değerleri:', orderCounters);
  }
  
  // StartTime değerlerini karşılaştır
  const startTimes = orders.map(o => o.startTime);
  const uniqueStartTimes = [...new Set(startTimes)];
  console.log(`\nStartTime benzersizliği: ${uniqueStartTimes.length}/${startTimes.length}`);
  if (uniqueStartTimes.length < startTimes.length) {
    console.log('⚠️ StartTime değerleri aynı olabilir!');
  }
  
  // Order hash'lerini hesapla
  console.log('\n5️⃣ ORDER HASH HESAPLAMA:');
  console.log('=========================');
  
  const orderHashes = [];
  for(let i = 0; i < orders.length; i++) {
    const order = orders[i];
    
    // EIP-712 hash hesapla (basitleştirilmiş)
    const orderHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes32', 'uint256', 'uint256', 'bytes32', 'uint256'],
        [order.offerer, order.salt, order.startTime, order.endTime, order.zoneHash, order.counter]
      )
    );
    
    orderHashes.push(orderHash);
    console.log(`Order ${i+1} hash: ${orderHash}`);
  }
  
  // Hash benzersizliğini kontrol et
  const uniqueHashes = [...new Set(orderHashes)];
  console.log(`\nHash benzersizliği: ${uniqueHashes.length}/${orderHashes.length}`);
  if (uniqueHashes.length < orderHashes.length) {
    console.log('❌ DUPLICATE ORDER HASH TESPİT EDİLDİ!');
  }
  
  // 6. SONUÇ
  console.log('\n📊 SONUÇ ANALİZİ:');
  console.log('==================');
  
  if (uniqueOrderCounters.length === 1) {
    console.log('\n❌ KRİTİK SORUN: TÜM ORDER\'LAR AYNI COUNTER DEĞERİNİ KULLANIYOR!');
    console.log('Bu, duplicate order hatasının ana nedeni olabilir.');
    console.log('Counter değeri: ' + orderCounters[0]);
    console.log('\nÇÖZÜM ÖNERİSİ:');
    console.log('1. Her token için farklı counter kullanılmalı');
    console.log('2. Ya da counter blockchain\'den gerçek değer olarak alınmalı');
    console.log('3. Ya da her order için counter artırılmalı');
  }
}

testDuplicateOrder().catch(console.error);