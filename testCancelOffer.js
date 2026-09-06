const api = require('./src/api');

async function testCancelOffer() {
  try {
    console.log('=== Mevcut Teklifleri İptal Et ===\n');
    
    const chain = 'abstract';
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenId = 588;
    
    // Mevcut teklifleri kontrol et
    console.log('Mevcut teklifler kontrol ediliyor...');
    const response = await api.makeRequest('GET', `/api/v2/orders/${chain}/seaport/offers`, null, {
      asset_contract_address: contractAddress,
      token_ids: tokenId,
      maker: api.wallet.address
    });
    
    if (response && response.orders && response.orders.length > 0) {
      console.log(`\n${response.orders.length} adet aktif teklif bulundu!`);
      
      for (const order of response.orders) {
        console.log(`\nOrder Hash: ${order.order_hash}`);
        console.log(`Fiyat: ${order.current_price}`);
        
        try {
          // Teklifi iptal et
          console.log('Teklif iptal ediliyor...');
          const cancelResult = await api.cancelOffer(chain, order.order_hash);
          console.log('İptal sonucu:', cancelResult);
        } catch (error) {
          console.error('İptal hatası:', error.message);
        }
      }
    } else {
      console.log('Aktif teklif bulunamadı.');
    }
    
  } catch (error) {
    console.error('\nHata:', error.message);
  }
  
  process.exit(0);
}

testCancelOffer();