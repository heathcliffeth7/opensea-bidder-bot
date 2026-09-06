const api = require('../src/api');
const config = require('../config');

async function checkActiveOrders() {
  console.log('🔍 Aktif Order Kontrolü\n');
  
  try {
    // Abstract chain'e geç
    await api.switchChain('abstract');
    console.log('Chain: Abstract');
    console.log('Wallet:', config.walletAddress);
    
    // Wallet için aktif order'ları kontrol et
    console.log('\n📋 Aktif order\'ları kontrol ediliyor...');
    
    // OpenSea API v2 - orders endpoint
    const response = await api.makeRequest('GET', '/api/v2/orders/abstract/seaport/offers', null, {
      offerer: config.walletAddress,
      limit: 50
    });
    
    if (response && response.orders) {
      console.log(`\n✅ ${response.orders.length} adet aktif order bulundu:\n`);
      
      response.orders.forEach((order, index) => {
        console.log(`${index + 1}. Order:`);
        console.log(`   - Hash: ${order.order_hash}`);
        console.log(`   - Token: ${order.protocol_data?.parameters?.consideration?.[0]?.token || 'N/A'}`);
        console.log(`   - Token ID: ${order.protocol_data?.parameters?.consideration?.[0]?.identifierOrCriteria || 'N/A'}`);
        console.log(`   - Price: ${order.current_price || order.price?.value || 'N/A'} wei`);
        console.log(`   - Created: ${order.created_date || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('❌ Hiç aktif order bulunamadı.');
    }
    
  } catch (error) {
    console.error('Hata:', error.message);
    if (error.response && error.response.data) {
      console.log('API yanıtı:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  process.exit(0);
}

checkActiveOrders();