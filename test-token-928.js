require('dotenv').config();
process.env.CHAIN = 'abstract';

const AbstractStreamClient = require('./src/abstractStreamClient');

async function testToken928() {
  console.log('🧪 Token 928 Test - Abstract Chain');
  
  const client = new AbstractStreamClient();
  
  client.on('connected', () => {
    console.log('\n✅ WebSocket bağlandı!');
    
    // Pengztracted collection'a subscribe ol
    console.log('\n📡 Collection subscription başlatılıyor...');
    client.subscribeToCollection('pengztracted-abstract');
  });
  
  // Item offer event'lerini dinle
  client.on('item_received_offer', (data) => {
    console.log('\n🎯🎯🎯 TOKEN OFFER ALGILANDI! 🎯🎯🎯');
    console.log('Token ID:', data.tokenId);
    console.log('Collection:', data.collection);
    console.log('Price:', data.price, 'wei');
    console.log('Maker:', data.maker);
    
    if (data.tokenId === '928') {
      console.log('\n🔥🔥🔥 TOKEN 928 TEKLİF ALDI! 🔥🔥🔥');
    }
  });
  
  // Collection offer event'lerini de dinle
  client.on('collection_offer', (data) => {
    console.log('\n💎 Collection offer algılandı');
    console.log('Collection:', data.collection);
    console.log('Price:', data.price, 'wei');
  });
  
  // Bağlantıyı başlat
  await client.initialize(process.env.OPENSEA_API_KEY);
  
  console.log('\n⏳ Token 928 teklifleri bekleniyor...');
  console.log('💡 Başka bir cüzdandan token 928\'e teklif atın');
}

testToken928().catch(console.error);