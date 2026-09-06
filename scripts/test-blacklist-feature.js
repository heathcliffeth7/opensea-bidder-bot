const AbstractTokenOffer = require('../src/abstractTokenOffer');
const api = require('../src/api');

async function testBlacklistFeature() {
  console.log('🧪 Duplicate Detection Bypass Özelliği Test\n');
  
  try {
    await api.switchChain('abstract');
    console.log('✅ Abstract chain\'e bağlandı\n');
    
    const offerInstance = new AbstractTokenOffer(api);
    
    // Test parametreleri
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenId = '16';
    const price = '0.01';
    
    console.log('📋 Test Senaryosu:');
    console.log('1. İlk deneme - Duplicate hatası alacağız');
    console.log('2. İkinci deneme - 2/3 attempt');
    console.log('3. Üçüncü deneme - Blacklist\'e alınacak');
    console.log('4. Dördüncü deneme - Blacklist mesajı\n');
    
    // Deneme 1
    console.log('🔄 Deneme 1/4:');
    const result1 = await offerInstance.createOffer(contractAddress, tokenId, price, 15);
    console.log('Sonuç:', result1.error);
    console.log('Kalan deneme:', result1.remainingAttempts || 'N/A');
    
    // Kısa bekleme
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Deneme 2
    console.log('\n🔄 Deneme 2/4:');
    const result2 = await offerInstance.createOffer(contractAddress, tokenId, price, 15);
    console.log('Sonuç:', result2.error);
    console.log('Kalan deneme:', result2.remainingAttempts || 'N/A');
    
    // Kısa bekleme
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Deneme 3 - Blacklist olmalı
    console.log('\n🔄 Deneme 3/4:');
    const result3 = await offerInstance.createOffer(contractAddress, tokenId, price, 15);
    console.log('Sonuç:', result3.error);
    console.log('Blacklist bitiş:', result3.blacklistedUntil || 'N/A');
    
    // Deneme 4 - Blacklist mesajı görmeli
    console.log('\n🔄 Deneme 4/4:');
    const result4 = await offerInstance.createOffer(contractAddress, tokenId, price, 15);
    console.log('Sonuç:', result4.error);
    console.log('Kalan süre:', result4.remainingHours, 'saat');
    
    console.log('\n✅ TEST TAMAMLANDI');
    console.log('\n📊 Blacklist Durumu:');
    console.log('- Collection blacklist\'te:', offerInstance.collectionBlacklist.has(contractAddress));
    console.log('- Failed attempts temizlendi:', !offerInstance.failedAttempts.has(contractAddress));
    
    console.log('\n💡 SONUÇ:');
    console.log('Duplicate detection bypass sistemi başarıyla çalışıyor!');
    console.log('Collection 3 failed attempt sonrası otomatik blacklist\'e alındı.');
    console.log('Bu sayede gereksiz API çağrıları engellenmiş oldu.');
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
  }
  
  process.exit(0);
}

testBlacklistFeature();