const api = require('../src/api');
const config = require('../config');

async function checkAllWalletOffers() {
  console.log('🔍 Wallet\'taki Tüm Offer\'ları Kontrol Et\n');
  
  try {
    await api.switchChain('abstract');
    console.log('✅ Abstract chain\'e bağlandı');
    console.log('Wallet:', config.walletAddress);
    
    // 1. Tüm aktif offer'ları çek
    console.log('\n📋 Tüm Aktif Offer\'lar:');
    const allOffersResponse = await api.makeRequest(
      'GET',
      `/api/v2/orders/abstract/seaport/offers?maker=${config.walletAddress}&limit=50`
    );
    
    if (allOffersResponse.orders && allOffersResponse.orders.length > 0) {
      console.log(`\n⚠️ Toplam ${allOffersResponse.orders.length} aktif offer bulundu!\n`);
      
      // Koleksiyonlara göre grupla
      const offersByCollection = {};
      
      allOffersResponse.orders.forEach((order, index) => {
        const assetContract = order.maker_asset_bundle?.assets?.[0]?.asset_contract?.address || 'unknown';
        const tokenId = order.maker_asset_bundle?.assets?.[0]?.token_id || 'unknown';
        const collectionSlug = order.maker_asset_bundle?.assets?.[0]?.collection?.slug || 'unknown';
        
        if (!offersByCollection[collectionSlug]) {
          offersByCollection[collectionSlug] = [];
        }
        
        offersByCollection[collectionSlug].push({
          orderHash: order.order_hash,
          tokenId: tokenId,
          price: order.current_price ? (parseFloat(order.current_price) / 1e18).toFixed(4) : 'N/A',
          created: new Date(order.created_date).toLocaleString(),
          expires: order.expiration_date ? new Date(order.expiration_date).toLocaleString() : 'N/A'
        });
      });
      
      // Her koleksiyon için offer'ları listele
      Object.entries(offersByCollection).forEach(([collection, offers]) => {
        console.log(`\n📦 Collection: ${collection}`);
        console.log(`Offer Sayısı: ${offers.length}`);
        
        offers.forEach((offer, idx) => {
          console.log(`\n  Offer ${idx + 1}:`);
          console.log(`  - Token ID: ${offer.tokenId}`);
          console.log(`  - Price: ${offer.price} WETH`);
          console.log(`  - Hash: ${offer.orderHash}`);
          console.log(`  - Created: ${offer.created}`);
          console.log(`  - Expires: ${offer.expires}`);
        });
      });
      
      // pengztracted-abstract için özel kontrol
      const pengzOffers = offersByCollection['pengztracted-abstract'] || [];
      if (pengzOffers.length > 0) {
        console.log('\n⚠️ UYARI: pengztracted-abstract koleksiyonunda aktif offer\'larınız var!');
        console.log('Bu offer\'lar duplicate hatasına neden oluyor olabilir.');
        console.log('\n💡 ÇÖZÜM: Counter\'ı artırarak eski offer\'ları iptal edin:');
        console.log('node scripts/increment-counter.js');
      }
      
    } else {
      console.log('✅ Aktif offer bulunamadı');
    }
    
    // 2. Son 24 saatte oluşturulan offer'ları kontrol et
    console.log('\n\n📋 Son 24 Saatte Oluşturulan Offer\'lar:');
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    try {
      // Event'leri kontrol et
      const eventsResponse = await api.makeRequest(
        'GET',
        `/api/v2/events?account_address=${config.walletAddress}&event_type=offer&occurred_after=${oneDayAgo}&chain=abstract`
      );
      
      if (eventsResponse.asset_events && eventsResponse.asset_events.length > 0) {
        console.log(`\n${eventsResponse.asset_events.length} offer event bulundu`);
        
        eventsResponse.asset_events.forEach((event, idx) => {
          console.log(`\nEvent ${idx + 1}:`);
          console.log(`- Asset: ${event.asset?.name || 'N/A'} #${event.asset?.token_id || 'N/A'}`);
          console.log(`- Collection: ${event.asset?.collection?.slug || 'N/A'}`);
          console.log(`- Time: ${new Date(event.created_date).toLocaleString()}`);
        });
      } else {
        console.log('Son 24 saatte offer event\'i yok');
      }
    } catch (e) {
      console.log('Event sorgusu başarısız:', e.message);
    }
    
    // 3. Failed order'ları tahmin et
    console.log('\n\n📋 Muhtemel Failed Order Hash\'leri:');
    console.log('(OpenSea bunları cache\'lemiş olabilir)');
    
    const knownFailedHashes = [
      '0x7bf4a477d0a59365bee32d820ae2d55e9cdd511eb745019a14767502718d2737', // Token 16
      '0xfff58a4e595a0db327f3b4a5a6a524a7fdb3234e71417c6330ceac5dd42ff3f8', // Token 50
      '0x34c8e3f6618e88a11a2aa28bf45a02234f1e8960c4dc3ae4ec871f558e558e0b'  // Token 896
    ];
    
    knownFailedHashes.forEach(hash => {
      console.log(`- ${hash}`);
    });
    
    console.log('\n\n🎯 SONUÇ VE ÖNERİLER:');
    console.log('1. OpenSea bu wallet + collection için failed order\'ları cache\'lemiş');
    console.log('2. Cache süresi genelde 24-48 saat');
    console.log('3. Alternatif çözümler:');
    console.log('   a) Counter artırarak tüm eski order\'ları iptal et');
    console.log('   b) Farklı bir collection\'da test et'); 
    console.log('   c) 24 saat bekle');
    console.log('   d) Farklı wallet kullan');
    
  } catch (error) {
    console.error('\n❌ Hata:', error.message);
  }
  
  process.exit(0);
}

checkAllWalletOffers();