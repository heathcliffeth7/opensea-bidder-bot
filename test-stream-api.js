const StreamClient = require('./src/streamClient');
const config = require('./config');

async function testStreamAPI() {
  console.log('🧪 Stream API Test Başlatılıyor...\n');
  
  // Ethereum için stream client oluştur
  console.log('📡 Ethereum Stream Client oluşturuluyor...');
  const ethStream = new StreamClient();
  
  // Connection event listener'ları ekle
  ethStream.on('connected', () => {
    console.log('✅ Stream API başarıyla bağlandı!');
  });
  
  ethStream.on('disconnected', ({ code, reason }) => {
    console.log(`❌ Stream API bağlantısı kesildi - Code: ${code}, Reason: ${reason}`);
  });
  
  ethStream.on('error', (error) => {
    console.error('❌ Stream API hatası:', error.message);
  });
  
  // Message handler
  ethStream.on('message', (message) => {
    if (message.event && !message.event.startsWith('phx_')) {
      console.log('\n📨 Mesaj alındı:', JSON.stringify(message, null, 2));
    }
  });
  
  // Bağlan
  ethStream.connect('ethereum');
  
  // 5 saniye bekle
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Bir collection'a subscribe ol
  console.log('\n📡 Collection subscription test...');
  ethStream.onCollectionOffer('gemesis', (event) => {
    console.log('\n🎉 Collection offer event alındı!', event);
  });
  
  // 30 saniye bekle (heartbeat gönderilmesini görmek için)
  console.log('\n⏳ 30 saniye bekleniyor (heartbeat test)...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Bağlantıyı kapat
  console.log('\n🔌 Bağlantı kapatılıyor...');
  ethStream.disconnect();
  
  console.log('\n✅ Test tamamlandı!');
}

testStreamAPI().catch(console.error);