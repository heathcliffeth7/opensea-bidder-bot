const { ethers } = require('ethers');
const config = require('../config');
const axios = require('axios');

async function validateParams() {
  console.log('🔍 ConduitKey ve Zone Parametreleri Doğrulama\n');
  
  // 1. Abstract RPC'ye bağlan
  const rpcUrl = config.getRpcUrl('abstract');
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  console.log('📋 Abstract Chain Bilgileri:');
  console.log('- Chain ID:', 2741);
  console.log('- RPC URL:', rpcUrl);
  
  // 2. Seaport Contract'ları kontrol et
  console.log('\n📋 Seaport Contract Adresleri:');
  const seaportAddresses = [
    '0x0000000000000068f116a894984e2db1123eb395', // Seaport 1.6
    '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC', // Seaport 1.5
    '0x00000000006687982678b03100b9bdc8be440814'  // Yeni adres
  ];
  
  for (const address of seaportAddresses) {
    try {
      const code = await provider.getCode(address);
      const hasCode = code !== '0x';
      console.log(`- ${address}: ${hasCode ? '✅ Deployed' : '❌ Not deployed'}`);
    } catch (error) {
      console.log(`- ${address}: ❌ Error: ${error.message}`);
    }
  }
  
  // 3. Zone adresleri kontrol et
  console.log('\n📋 Zone Adresleri:');
  const zones = [
    '0x000056F7000000EcE9003ca63978907a00FFD100', // Current
    '0x0000000000000000000000000000000000000000', // Zero
    '0x004C00500000aD104D7DBd00e3ae0A5C00560C00'  // OpenSea shared
  ];
  
  for (const zone of zones) {
    try {
      const code = await provider.getCode(zone);
      const hasCode = code !== '0x';
      console.log(`- ${zone}: ${hasCode ? '✅ Has code' : '⚠️ No code (EOA)'}`);
    } catch (error) {
      console.log(`- ${zone}: ❌ Error: ${error.message}`);
    }
  }
  
  // 4. ConduitKey kontrolü
  console.log('\n📋 ConduitKey Analizi:');
  const conduitKeys = {
    'Current': '0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e',
    'Default': '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
    'Zero': '0x0000000000000000000000000000000000000000000000000000000000000000'
  };
  
  // ConduitController adresi (Seaport'un conduit'leri yönettiği contract)
  const conduitControllerAddress = '0x00000000F9490004C11Cef243f5400493c00Ad63';
  
  console.log('ConduitController:', conduitControllerAddress);
  
  for (const [name, key] of Object.entries(conduitKeys)) {
    console.log(`\n${name} ConduitKey: ${key}`);
    
    // Conduit address'i hesapla (CREATE2 ile)
    try {
      // ConduitController'ın getConduit fonksiyonunu simüle et
      const conduitAddress = await calculateConduitAddress(conduitControllerAddress, key);
      console.log(`  Calculated Conduit Address: ${conduitAddress}`);
      
      // Conduit deployed mı kontrol et
      const code = await provider.getCode(conduitAddress);
      const hasCode = code !== '0x';
      console.log(`  Status: ${hasCode ? '✅ Deployed' : '❌ Not deployed'}`);
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }
  
  // 5. OpenSea API ile doğrulama
  console.log('\n📋 OpenSea API Doğrulama:');
  
  // Test order parametreleri
  const testOrderParams = {
    offerer: config.walletAddress,
    zone: zones[0],
    offer: [{
      itemType: 1,
      token: config.getWethAddress('abstract'),
      identifierOrCriteria: "0",
      startAmount: "1000000000000000",
      endAmount: "1000000000000000"
    }],
    consideration: [{
      itemType: 2,
      token: "0xa6c46c07f7f1966d772e29049175ebba26262513",
      identifierOrCriteria: "999",
      startAmount: "1",
      endAmount: "1",
      recipient: config.walletAddress
    }],
    orderType: 2,
    startTime: Math.floor(Date.now() / 1000).toString(),
    endTime: (Math.floor(Date.now() / 1000) + 900).toString(),
    zoneHash: ethers.ZeroHash,
    salt: ethers.hexlify(ethers.randomBytes(32)),
    conduitKey: conduitKeys.Current,
    totalOriginalConsiderationItems: 1,
    counter: "0"
  };
  
  // Farklı kombinasyonları test et
  const testCombinations = [
    { zone: zones[0], orderType: 2, conduitKey: conduitKeys.Current },
    { zone: zones[1], orderType: 0, conduitKey: conduitKeys.Current },
    { zone: zones[0], orderType: 3, conduitKey: conduitKeys.Current },
  ];
  
  console.log('\nTest Kombinasyonları:');
  for (const combo of testCombinations) {
    console.log(`\n- Zone: ${combo.zone.slice(0,10)}..., OrderType: ${combo.orderType}, ConduitKey: ${combo.conduitKey.slice(0,10)}...`);
    
    // Parametreleri güncelle
    const params = { ...testOrderParams, ...combo };
    
    // Order hash hesapla
    const orderHash = calculateOrderHash(params);
    console.log(`  Order Hash: ${orderHash}`);
  }
  
  // 6. Abstract WETH kontrolü
  console.log('\n📋 Abstract WETH Kontrolü:');
  const abstractWeth = config.getWethAddress('abstract');
  console.log('WETH Address:', abstractWeth);
  
  try {
    const wethCode = await provider.getCode(abstractWeth);
    console.log('WETH Contract:', wethCode !== '0x' ? '✅ Deployed' : '❌ Not deployed');
    
    // WETH balance kontrolü
    const wethContract = new ethers.Contract(abstractWeth, ['function balanceOf(address) view returns (uint256)'], provider);
    const balance = await wethContract.balanceOf(config.walletAddress);
    console.log('Wallet WETH Balance:', ethers.formatEther(balance), 'WETH');
  } catch (error) {
    console.log('WETH Error:', error.message);
  }
  
  console.log('\n✅ Doğrulama Tamamlandı');
}

// CREATE2 ile conduit address hesaplama
async function calculateConduitAddress(deployer, conduitKey) {
  // Conduit bytecode hash (sabit)
  const CONDUIT_CREATION_CODE_HASH = '0x023d91d951c9bdd93dfe7c67e0c5e3c6285acd10336a83e6a04063d44090e705';
  
  // CREATE2 address = keccak256(0xff ++ deployer ++ salt ++ bytecode_hash)[12:]
  const salt = conduitKey;
  const encoded = ethers.solidityPacked(
    ['bytes1', 'address', 'bytes32', 'bytes32'],
    ['0xff', deployer, salt, CONDUIT_CREATION_CODE_HASH]
  );
  
  const hash = ethers.keccak256(encoded);
  return '0x' + hash.slice(26); // Son 20 byte
}

// Basit order hash hesaplama
function calculateOrderHash(params) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint8', 'uint256', 'uint256', 'bytes32', 'bytes32', 'bytes32', 'uint256'],
    [
      params.offerer,
      params.zone,
      params.orderType,
      params.startTime,
      params.endTime,
      params.zoneHash,
      params.salt,
      params.conduitKey,
      params.counter
    ]
  );
  return ethers.keccak256(encoded);
}

validateParams().catch(console.error);