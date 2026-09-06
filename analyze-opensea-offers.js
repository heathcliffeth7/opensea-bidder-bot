const axios = require('axios');

async function analyzeOpenSeaOffers() {
  console.log('\n🔍 OpenSea Web vs API Teklif Analizi\n');
  
  // OpenSea'nin farklı protocol address'leri
  const protocols = {
    'Seaport 1.5': '0x00000000000000adc04c56bf30ac9d3c0aaf14dc',
    'Seaport 1.6': '0x0000000000000068f116a894984e2db1123eb395',
    'Seaport 1.6 (Yeni)': '0x00000000006687982678b03100b9bdc8be440814',
    'SignedZoneCaptain (SIP-7)': '0x000000000031163395F67E424F5B0082609709a7'
  };
  
  console.log('🏛️ OpenSea Protocol Adresleri:');
  for (const [name, address] of Object.entries(protocols)) {
    console.log(`${name}: ${address}`);
  }
  
  console.log('\n📋 Önemli Farklar:\n');
  
  console.log('1. WEB\'DEN VERİLEN TEKLİFLER (Gas-free iptal):');
  console.log('   - SIP-7 signature sistemi kullanır');
  console.log('   - SignedZoneCaptain contract üzerinden');
  console.log('   - OpenSea sunucusu imza sağlar');
  console.log('   - İptal için sunucu imza vermeyi durdurur');
  console.log('   - Gas ücreti YOK\n');
  
  console.log('2. API\'DEN VERİLEN TEKLİFLER (Mevcut sistem):');
  console.log('   - Standart Seaport protokolü');
  console.log('   - Direkt kullanıcı imzası');
  console.log('   - İptal için on-chain transaction gerekli');
  console.log('   - Gas ücreti VAR\n');
  
  console.log('3. ÇÖZÜM ÖNERİLERİ:');
  console.log('   a) OpenSea\'nin yeni API endpoint\'lerini kullan');
  console.log('   b) SIP-7 destekli teklif sistemi implement et');
  console.log('   c) Web\'den reverse engineering yap\n');
  
  // Test için farklı endpoint'ler
  console.log('🔧 Test Edilecek Endpoint\'ler:\n');
  
  const endpoints = [
    '/api/v2/offers/build',
    '/api/v2/offers/post',
    '/api/v3/offers',
    '/v2/offers/build',
    '/v2/listings/build',
    '/api/v2/orders/ethereum/seaport/listings',
    '/api/v2/orders/ethereum/signed-zone/offers'
  ];
  
  console.log('Muhtemel yeni endpoint\'ler:');
  endpoints.forEach(ep => console.log(`- ${ep}`));
  
  console.log('\n📝 Sonuç:');
  console.log('API\'den verilen teklifler eski sistemi kullanıyor.');
  console.log('Web arayüzü SIP-7 ile yeni sistemi kullanıyor.');
  console.log('Gas-free iptal için yeni API endpoint\'leri gerekli.\n');
}

analyzeOpenSeaOffers();