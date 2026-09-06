const TaskManager = require('./src/taskManager');
const api = require('./src/api');

// TaskManager instance'ını al
const taskManager = new TaskManager();

// Token offers durumunu kontrol et
console.log('\n=== Token Offers Debug ===');
console.log('tokenOffers objesi:', taskManager.tokenOffers);
console.log('Anahtarlar:', Object.keys(taskManager.tokenOffers));

// Contract address'i kontrol et
const contractAddress = '0xbe9371326f91345777b04394448c23e2bfeaa826';
const tokenId = '896';
const expectedKey1 = `${contractAddress}-${tokenId}`;
const expectedKey2 = `gemesis-${tokenId}`;

console.log('\nBeklenen key formatları:');
console.log('Format 1:', expectedKey1);
console.log('Format 2:', expectedKey2);

// Tüm keyleri kontrol et
console.log('\nMevcut keyler:');
Object.keys(taskManager.tokenOffers).forEach(key => {
  console.log(`- ${key}`);
  console.log(`  Değer:`, taskManager.tokenOffers[key]);
});

// CollectionOfferMonitorV2'nin beklediği format
console.log('\nCollectionOfferMonitorV2 key formatı:');
console.log(`const tokenKey = \`\${contractAddress}-\${tokenId}\`;`);
console.log(`Oluşan key: ${contractAddress}-${tokenId}`);