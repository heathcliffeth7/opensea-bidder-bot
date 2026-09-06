const api = require('../src/api');
const config = require('../config');

async function checkExistingOffers() {
  console.log('🔍 Mevcut Offer\'ları Kontrol Et\n');
  
  try {
    // Abstract chain'e geç
    await api.switchChain('abstract');
    console.log('Chain: Abstract');
    console.log('Wallet:', config.walletAddress);
    
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenId = '16';
    
    console.log('\n📋 Token Bilgileri:');
    console.log('Contract:', contractAddress);
    console.log('Token ID:', tokenId);
    
    // 1. Token için mevcut offer'ları kontrol et
    console.log('\n🔎 Token için mevcut offer\'lar sorgulanıyor...');
    
    try {
      // OpenSea API v2 - Get offers endpoint
      const offersResponse = await api.makeRequest(
        'GET',
        `/api/v2/offers?asset_contract_address=${contractAddress}&token_ids=${tokenId}&limit=50`
      );
      
      console.log('\n📊 Mevcut Offer Sayısı:', offersResponse.offers?.length || 0);
      
      if (offersResponse.offers && offersResponse.offers.length > 0) {
        console.log('\n📋 Offer Detayları:');
        
        offersResponse.offers.forEach((offer, index) => {
          console.log(`\n--- Offer ${index + 1} ---`);
          console.log('Order Hash:', offer.order_hash);
          console.log('Maker:', offer.maker?.address);
          console.log('Price:', offer.price?.current?.value, offer.price?.current?.currency);
          console.log('Created:', new Date(offer.created_date).toLocaleString());
          console.log('Expiration:', new Date(offer.expiration_date).toLocaleString());
          console.log('Status:', offer.order_type);
          
          // Bizim wallet'tan mı kontrol et
          if (offer.maker?.address?.toLowerCase() === config.walletAddress.toLowerCase()) {
            console.log('⚠️ BU BİZİM OFFER!');
          }
        });
        
        // En yüksek offer'ı bul
        const highestOffer = offersResponse.offers.reduce((max, offer) => {
          const currentPrice = parseFloat(offer.price?.current?.value || 0);
          const maxPrice = parseFloat(max.price?.current?.value || 0);
          return currentPrice > maxPrice ? offer : max;
        });
        
        console.log('\n💰 En Yüksek Offer:');
        console.log('Price:', highestOffer.price?.current?.value, highestOffer.price?.current?.currency);
        console.log('Maker:', highestOffer.maker?.address);
        
        // Bizim offer'larımızı filtrele
        const ourOffers = offersResponse.offers.filter(
          offer => offer.maker?.address?.toLowerCase() === config.walletAddress.toLowerCase()
        );
        
        if (ourOffers.length > 0) {
          console.log(`\n⚠️ ${ourOffers.length} adet bizim offer'ımız var!`);
          console.log('Duplicate hatası bundan kaynaklanıyor olabilir.');
          
          ourOffers.forEach((offer, index) => {
            console.log(`\nBizim Offer ${index + 1}:`);
            console.log('Order Hash:', offer.order_hash);
            console.log('Price:', offer.price?.current?.value);
            console.log('Created:', new Date(offer.created_date).toLocaleString());
            console.log('Expires:', new Date(offer.expiration_date).toLocaleString());
          });
        }
      } else {
        console.log('✅ Bu token için aktif offer bulunamadı.');
      }
      
    } catch (error) {
      console.error('Offer sorgulama hatası:', error.message);
      
      // Alternatif endpoint dene
      console.log('\n🔄 Alternatif endpoint deneniyor...');
      
      try {
        const singleAssetResponse = await api.makeRequest(
          'GET',
          `/api/v2/orders/abstract/seaport/offers?asset_contract_address=${contractAddress}&token_ids=${tokenId}`
        );
        
        console.log('Alternatif Response:', JSON.stringify(singleAssetResponse, null, 2));
      } catch (altError) {
        console.log('Alternatif endpoint de başarısız:', altError.message);
      }
    }
    
    // 2. Bizim wallet'tan tüm offer'ları kontrol et
    console.log('\n\n🔎 Wallet\'tan tüm offer\'lar sorgulanıyor...');
    
    try {
      const walletOffersResponse = await api.makeRequest(
        'GET',
        `/api/v2/orders/abstract/seaport/offers?maker=${config.walletAddress}&limit=50`
      );
      
      console.log('Wallet Offer Sayısı:', walletOffersResponse.orders?.length || 0);
      
      if (walletOffersResponse.orders && walletOffersResponse.orders.length > 0) {
        console.log('\n📋 Wallet Offer\'ları:');
        walletOffersResponse.orders.forEach((order, index) => {
          console.log(`\n--- Order ${index + 1} ---`);
          console.log('Order Hash:', order.order_hash);
          console.log('Created:', new Date(order.created_date).toLocaleString());
          console.log('Status:', order.cancelled ? 'CANCELLED' : 'ACTIVE');
        });
      }
    } catch (walletError) {
      console.log('Wallet offer sorgulama hatası:', walletError.message);
    }
    
    // 3. Çözüm önerileri
    console.log('\n\n💡 ÇÖZÜM ÖNERİLERİ:');
    console.log('1. Mevcut offer\'ları iptal et (counter artırarak)');
    console.log('2. Farklı bir token ID\'ye offer at');
    console.log('3. Collection offer veya criteria offer kullan');
    console.log('4. Offer expire olmasını bekle');
    console.log('5. OpenSea API cache temizlenmesini bekle (5-10 dakika)');
    
  } catch (error) {
    console.error('Genel hata:', error.message);
  }
  
  process.exit(0);
}

checkExistingOffers();