const { ethers } = require('ethers');
const config = require('./config');

async function checkActiveOffers() {
  console.log('=== AKTİF TEKLİFLER KONTROL EDİLİYOR ===\n');
  
  const headers = {
    'X-API-KEY': config.apiKey,
    'Accept': 'application/json'
  };
  
  // Test için birkaç gemesis token'ı kontrol et
  const tokens = [
    { contract: '0xbe9371326f91345777b04394448c23e2bfeaa826', tokenId: '447' },
    { contract: '0xbe9371326f91345777b04394448c23e2bfeaa826', tokenId: '1005' },
    { contract: '0xbe9371326f91345777b04394448c23e2bfeaa826', tokenId: '8896' }
  ];
  
  for (const token of tokens) {
    console.log(`\n📍 Kontrol ediliyor: gemesis #${token.tokenId}`);
    
    try {
      const response = await fetch(`https://api.opensea.io/api/v2/offers/collection/${token.contract}/nfts/${token.tokenId}`, {
        headers
      });
      
      const data = await response.json();
      
      if (data.offers && data.offers.length > 0) {
        console.log(`Toplam teklif sayısı: ${data.offers.length}`);
        
        // İlk 3 teklifi göster
        data.offers.slice(0, 3).forEach((offer, index) => {
          const priceETH = ethers.formatEther(offer.price.value);
          const isOurOffer = offer.maker.address.toLowerCase() === config.walletAddress.toLowerCase();
          
          console.log(`\nTeklif #${index + 1}:`);
          console.log(`- Fiyat: ${priceETH} WETH`);
          console.log(`- Teklif sahibi: ${offer.maker.address}`);
          console.log(`- Bizim teklifimiz mi: ${isOurOffer ? '✅ EVET' : '❌ HAYIR'}`);
          console.log(`- Order hash: ${offer.order_hash}`);
          console.log(`- Oluşturulma: ${new Date(offer.created_date).toLocaleString()}`);
        });
      } else {
        console.log('Bu token için aktif teklif yok.');
      }
    } catch (error) {
      console.error(`Hata (${token.tokenId}):`, error.message);
    }
  }
  
  console.log('\n\n=== KONTROL TAMAMLANDI ===');
}

checkActiveOffers().catch(console.error);