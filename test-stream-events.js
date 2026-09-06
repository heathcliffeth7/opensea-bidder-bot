const StreamClient = require('./src/streamClient');
const config = require('./config');

async function testStreamEvents() {
  console.log('🧪 Stream API Event Test Başlatılıyor...\n');
  
  // Ethereum için stream client oluştur
  console.log('📡 Ethereum Stream Client oluşturuluyor...');
  const ethStream = new StreamClient();
  
  // Tüm mesajları dinle
  ethStream.on('message', (message) => {
    const { event, topic, payload } = message;
    
    // Sadece offer ile ilgili event'leri göster
    if (event && (event.includes('offer') || event.includes('bid'))) {
      console.log('\n🎯 === OFFER EVENT ===');
      console.log('Event:', event);
      console.log('Topic:', topic);
      
      const data = payload?.payload || payload;
      if (data) {
        console.log('Collection:', data.collection?.slug);
        console.log('Token ID:', data.item?.nft_id?.split('/').pop());
        console.log('Price:', data.base_price);
        console.log('Maker:', data.maker?.address);
      }
    }
  });
  
  // Bağlan
  ethStream.connect('ethereum');
  
  // 2 saniye bekle
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Gemesis koleksiyonuna subscribe ol
  console.log('\n📡 Gemesis collection\'a subscribe olunuyor...');
  ethStream.joinChannel('collection:gemesis');
  
  // 60 saniye dinle
  console.log('\n⏳ 60 saniye event dinleniyor...');
  await new Promise(resolve => setTimeout(resolve, 60000));
  
  // Bağlantıyı kapat
  console.log('\n🔌 Bağlantı kapatılıyor...');
  ethStream.disconnect();
  
  console.log('\n✅ Test tamamlandı!');
}

testStreamEvents().catch(console.error);