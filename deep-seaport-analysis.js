const axios = require('axios');
const { ethers } = require('ethers');
const config = require('./config');

/**
 * Seaport protokolü derinlemesine analizi
 * Collection offer vs Token offer farklarını bulma
 */
async function deepSeaportAnalysis() {
  console.log('🔬 SEAPORT PROTOKOL ANALİZİ\n');
  
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  
  // Seaport 1.6 ABI (ilgili fonksiyonlar)
  const seaportAbi = [
    // Order validation
    "function validate((address,address,(uint8,address,uint256,uint256,uint256)[],(uint8,address,uint256,uint256,uint256,address)[],uint8,uint256,uint256,bytes32,uint256,bytes32,uint256)[] orders) external returns (bool)",
    
    // Get order status
    "function getOrderStatus(bytes32 orderHash) external view returns (bool isValidated, bool isCancelled, uint256 totalFilled, uint256 totalSize)",
    
    // Counter functions
    "function getCounter(address offerer) external view returns (uint256 counter)",
    "function incrementCounter() external returns (uint256 newCounter)",
    
    // Order hash
    "function getOrderHash((address,address,(uint8,address,uint256,uint256,uint256)[],(uint8,address,uint256,uint256,uint256,address)[],uint8,uint256,uint256,bytes32,uint256,bytes32,uint256) orderComponents) external view returns (bytes32 orderHash)",
    
    // Information
    "function information() external view returns (string memory version, bytes32 domainSeparator, address conduitController)",
    "function name() external pure returns (string memory)",
    
    // Cancel functions
    "function cancel((address,address,(uint8,address,uint256,uint256,uint256)[],(uint8,address,uint256,uint256,uint256,address)[],uint8,uint256,uint256,bytes32,uint256,bytes32,uint256)[] orders) external returns (bool cancelled)"
  ];

  const seaportContract = new ethers.Contract(
    "0x0000000000000068f116a894984e2db1123eb395", // Seaport 1.6
    seaportAbi,
    provider
  );

  console.log('📝 SEAPORT 1.6 PROTOKOL BİLGİLERİ:\n');
  
  try {
    // Protokol bilgileri
    const [name, info, counter] = await Promise.all([
      seaportContract.name(),
      seaportContract.information(),
      seaportContract.getCounter(wallet.address)
    ]);
    
    console.log(`Name: ${name}`);
    console.log(`Version: ${info.version}`);
    console.log(`Domain Separator: ${info.domainSeparator}`);
    console.log(`Conduit Controller: ${info.conduitController}`);
    console.log(`Your Counter: ${counter}\n`);
    
  } catch (error) {
    console.log('Seaport bilgileri alınamadı:', error.message);
  }

  console.log('🔍 ITEMTYPE DETAYLI ANALİZ:\n');
  
  console.log('enum ItemType {');
  console.log('  NATIVE = 0,              // ETH');
  console.log('  ERC20 = 1,               // WETH, USDC vs');
  console.log('  ERC721 = 2,              // NFT (specific token)');
  console.log('  ERC1155 = 3,             // Semi-fungible');
  console.log('  ERC721_WITH_CRITERIA = 4,// NFT (collection/trait)');
  console.log('  ERC1155_WITH_CRITERIA = 5// Semi-fungible with criteria');
  console.log('}\n');

  console.log('📊 ORDERTYPE DETAYLI ANALİZ:\n');
  
  console.log('enum OrderType {');
  console.log('  FULL_OPEN = 0,           // Herkes doldurabilir, tam eşleşme');
  console.log('  PARTIAL_OPEN = 1,        // Herkes doldurabilir, kısmi OK');
  console.log('  FULL_RESTRICTED = 2,     // Zone kısıtlaması, tam eşleşme');
  console.log('  PARTIAL_RESTRICTED = 3,  // Zone kısıtlaması, kısmi OK');
  console.log('  CONTRACT = 4             // Sadece kontrat çağırabilir');
  console.log('}\n');

  console.log('🧩 CRITERIA MEKANİZMASI:\n');
  
  console.log('1. identifierOrCriteria alanı:');
  console.log('   - ItemType 2/3: Spesifik token ID');
  console.log('   - ItemType 4/5: Merkle root veya 0 (tüm collection)\n');
  
  console.log('2. Criteria Resolution:');
  console.log('   - Alıcı hangi NFT\'yi almak istediğini belirtir');
  console.log('   - Merkle proof ile doğrulama yapılır');
  console.log('   - Collection offer = "Bu collection\'dan herhangi bir NFT"\n');
  
  console.log('3. AdvancedOrder yapısı:');
  console.log('   - parameters: Temel order parametreleri');
  console.log('   - numerator/denominator: Kısmi doldurma için');
  console.log('   - signature: EIP-712 imza');
  console.log('   - extraData: Criteria proof ve diğer data\n');

  console.log('⚡ GAS OPTİMİZASYON FARKLARI:\n');
  
  console.log('Token Offer (ItemType 2):');
  console.log('- Basit validation');
  console.log('- Direkt token ID kontrolü');
  console.log('- Daha az gas (~120k)\n');
  
  console.log('Collection Offer (ItemType 4):');
  console.log('- Criteria validation');
  console.log('- Merkle proof doğrulama');
  console.log('- Daha fazla gas (~150k+)\n');

  console.log('🔐 ZONE MEKANİZMASI:\n');
  
  console.log('1. Zone = 0x0: Kısıtlama yok');
  console.log('2. Zone != 0x0: Zone kontratı doğrulama yapar');
  console.log('3. SignedZone: OpenSea\'nin özel zone kontratı');
  console.log('   - Extra signature doğrulama');
  console.log('   - SIP-7 standartı');
  console.log('   - Gas-free cancel (sadece web)\n');

  // API karşılaştırması
  console.log('📡 API ENDPOINT FARKLARI:\n');
  
  console.log('Token Offer:');
  console.log('POST /api/v2/orders/ethereum/seaport/offers');
  console.log('- parameters.consideration[0].itemType = 2');
  console.log('- parameters.consideration[0].identifierOrCriteria = "tokenId"\n');
  
  console.log('Collection Offer:');
  console.log('POST /api/v2/orders/ethereum/seaport/offers');
  console.log('- parameters.consideration[0].itemType = 4');
  console.log('- parameters.consideration[0].identifierOrCriteria = "0"');
  console.log('- criteria_proof gerekebilir\n');

  console.log('🎯 SONUÇ VE ÖNERİLER:\n');
  
  console.log('1. TEMEL FARK:');
  console.log('   - Token offer: Spesifik NFT\'ye teklif');
  console.log('   - Collection offer: Herhangi bir NFT\'ye teklif\n');
  
  console.log('2. TEKNİK FARKLAR:');
  console.log('   - ItemType: 2 vs 4');
  console.log('   - OrderType: Genelde 0 vs 1');
  console.log('   - Validation: Basit vs Criteria-based\n');
  
  console.log('3. GAS-FREE İPTAL DURUMU:');
  console.log('   ❌ Artık hiçbiri gas-free iptal edilemiyor');
  console.log('   - OpenSea bu özelliği kaldırmış');
  console.log('   - incrementCounter() en ekonomik yöntem\n');
  
  console.log('4. EN İYİ PRATİKLER:');
  console.log('   - Kısa süreli teklifler (15 dk)');
  console.log('   - Otomatik yenileme sistemi');
  console.log('   - Counter-bid stratejisi');
  console.log('   - Gerektiğinde incrementCounter()');
}

deepSeaportAnalysis();