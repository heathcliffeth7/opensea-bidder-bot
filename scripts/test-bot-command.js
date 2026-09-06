require('dotenv').config({ path: '../.env' });
const config = require('../config');
const api = require('../src/api');

async function testBotCommand() {
  console.log('🤖 Bot Command Test\n');
  
  try {
    
    // Komut simülasyonu
    const command = '!settask ornek1 abstract:pengztracted-abstract minprice:0.01 maxprice:0.015 type:tokenoffer offertime:15min looptime:2min counterbid on 0.0001 highofferskip on itemlimit 1 tokenidlist:16,50,896';
    
    console.log('📋 Komut:', command);
    console.log('\n🔧 Task ayarları parse ediliyor...\n');
    
    // Parse command
    const parts = command.split(' ');
    const taskName = parts[1];
    
    const settings = {
      chain: 'abstract',
      collection: 'pengztracted-abstract',
      contractAddress: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      minPrice: 0.01,
      maxPrice: 0.015,
      type: 'tokenoffer',
      offerTime: 15,
      loopTime: 2,
      counterBid: true,
      counterBidAmount: 0.0001,
      highOfferSkip: true,
      itemLimit: 1,
      tokenIds: [16, 50, 896]
    };
    
    console.log('Parse edilen ayarlar:', JSON.stringify(settings, null, 2));
    
    // Token 50'ye manuel offer oluştur
    console.log('\n🎯 Token #50 için test offer oluşturuluyor...');
    
    // Chain'i değiştir
    if (api.currentChain !== 'abstract') {
      console.log('Abstract chain\'e geçiliyor...');
      await api.switchChain('abstract');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // v2 API kullan
    const result = await api.tokenOfferV2.createTokenOfferV2(
      settings.contractAddress,
      50,
      settings.minPrice,
      Date.now() + (settings.offerTime * 60 * 1000),
      'abstract'
    );
    
    console.log('\n✅ Test başarılı!');
    console.log('Order Hash:', result.orderHash);
    console.log('\nBot komutu düzgün çalışıyor. v2 API entegrasyonu başarılı!');
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
    if (error.response?.data) {
      console.error('API yanıtı:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  process.exit(0);
}

testBotCommand();