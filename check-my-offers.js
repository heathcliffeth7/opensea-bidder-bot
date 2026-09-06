const axios = require('axios');
const config = require('./config');

async function checkMyOffers() {
  try {
    const apiClient = axios.create({
      baseURL: 'https://api.opensea.io',
      headers: {
        'X-API-KEY': config.apiKey,
        'Accept': 'application/json'
      }
    });

    console.log('\n📋 Aktif teklifleriniz kontrol ediliyor...');
    console.log(`Wallet: ${config.walletAddress}\n`);

    // Aktif teklifleri al
    const response = await apiClient.get('/api/v2/orders/ethereum/seaport/offers', {
      params: {
        maker: config.walletAddress,
        limit: 50
      }
    });

    const orders = response.data.orders || [];
    console.log(`Toplam aktif teklif: ${orders.length}\n`);

    // Her teklifi analiz et
    orders.forEach((order, index) => {
      console.log(`\n=== Teklif #${index + 1} ===`);
      console.log(`Order Hash: ${order.order_hash}`);
      console.log(`Protocol Address: ${order.protocol_address}`);
      console.log(`Order Type: ${order.order_type}`);
      console.log(`Fiyat: ${order.current_price / 1e18} ETH`);
      console.log(`Oluşturma: ${order.created_date}`);
      console.log(`Bitiş: ${order.closing_date}`);
      
      // Protocol data'yı kontrol et
      if (order.protocol_data?.parameters) {
        const params = order.protocol_data.parameters;
        console.log(`\nProtocol Parameters:`);
        console.log(`- Counter: ${params.counter}`);
        console.log(`- OrderType: ${params.orderType}`);
        console.log(`- Zone: ${params.zone}`);
        console.log(`- Salt: ${params.salt?.substring(0, 10)}...`);
        
        // Token bilgisi
        if (params.consideration?.[0]) {
          const consideration = params.consideration[0];
          console.log(`\nToken:`);
          console.log(`- Contract: ${consideration.token}`);
          console.log(`- Token ID: ${consideration.identifierOrCriteria}`);
        }
      }
      
      // Off-chain mi on-chain mi?
      const isOffChain = order.protocol_data?.parameters?.counter === 0 || 
                         order.protocol_data?.parameters?.counter === "0";
      console.log(`\n🔍 Teklif Tipi: ${isOffChain ? 'OFF-CHAIN (Gas ücretsiz)' : 'ON-CHAIN (Gas ücretli)'}`);
    });

  } catch (error) {
    console.error('Hata:', error.message);
    if (error.response) {
      console.error('API yanıtı:', error.response.data);
    }
  }
}

checkMyOffers();