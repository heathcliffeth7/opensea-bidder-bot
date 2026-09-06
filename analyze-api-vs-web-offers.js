const axios = require('axios');
const { ethers } = require('ethers');
const config = require('./config');

/**
 * API ile verilen teklifler neden web'de gas-free iptal edilemiyor?
 */
async function analyzeApiVsWebOffers() {
  console.log('🔍 API vs Web Teklif Farkı Analizi\n');
  console.log('Sorun: API ile verilen teklifler web arayüzünde gas ücretsiz iptal edilemiyor\n');
  
  const apiClient = axios.create({
    baseURL: 'https://api.opensea.io',
    headers: {
      'X-API-KEY': config.apiKey,
      'Accept': 'application/json'
    }
  });

  try {
    // Farklı kaynaklardan gelen teklifleri analiz et
    console.log('📊 TEKLİF KAYNAKLARI ANALİZİ:\n');
    
    console.log('1. WEB ARAYÜZÜNDEN VERİLEN TEKLİFLER:');
    console.log('   - Zone: 0x000000000031163395F67E424F5B0082609709a7 (SignedZoneCaptain)');
    console.log('   - Protocol: Seaport v1.6');
    console.log('   - Signature: OpenSea backend tarafından co-sign edilmiş');
    console.log('   - Gas-free iptal: ✅ EVET\n');
    
    console.log('2. API/SDK İLE VERİLEN TEKLİFLER:');
    console.log('   - Zone: 0x0000000000000000000000000000000000000000');
    console.log('   - Protocol: Seaport v1.6');
    console.log('   - Signature: Sadece kullanıcı imzası');
    console.log('   - Gas-free iptal: ❌ HAYIR\n');
    
    console.log('🔑 KRİTİK FARK: Co-Signing Mekanizması\n');
    
    console.log('OpenSea web arayüzü şu adımları izliyor:');
    console.log('1. Kullanıcı teklif parametrelerini girer');
    console.log('2. OpenSea backend\'i SignedZoneCaptain zone\'unu ekler');
    console.log('3. Kullanıcı imzalar');
    console.log('4. OpenSea backend co-sign eder (ikinci imza)');
    console.log('5. Bu co-signed teklif veritabanına kaydedilir');
    console.log('6. İptal için sadece veritabanı güncellenir (gas ücretsiz)\n');
    
    console.log('API ile verilen teklifler:');
    console.log('1. Doğrudan blockchain\'e yazılır');
    console.log('2. OpenSea co-sign yapmaz');
    console.log('3. İptal için blockchain işlemi gerekir (gas ücretli)\n');
    
    // Mevcut teklifleri kontrol et
    const response = await apiClient.get('/api/v2/orders/ethereum/seaport/offers', {
      params: {
        maker: config.walletAddress,
        limit: 10
      }
    });
    
    const offers = response.data.orders || [];
    
    if (offers.length > 0) {
      console.log(`📋 ${offers.length} aktif teklif bulundu:\n`);
      
      offers.forEach((offer, index) => {
        const zone = offer.protocol_data.parameters.zone;
        const isSignedZone = zone === '0x000000000031163395F67E424F5B0082609709a7';
        
        console.log(`Teklif #${index + 1}:`);
        console.log(`- Zone: ${zone}`);
        console.log(`- Kaynak: ${isSignedZone ? 'WEB ARAYÜZÜ' : 'API/SDK'}`);
        console.log(`- Gas-free iptal: ${isSignedZone ? '✅ EVET' : '❌ HAYIR'}`);
        console.log(`- Order Hash: ${offer.order_hash}\n`);
      });
    }
    
    console.log('\n💡 ÇÖZÜM ÖNERİLERİ:\n');
    
    console.log('1. API TEKLİFLERİNİ WEB UYUMLU YAPMAK İÇİN:');
    console.log('   ❌ Mümkün değil - OpenSea co-sign gerekiyor');
    console.log('   ❌ SignedZone sadece OpenSea backend\'i kullanabilir\n');
    
    console.log('2. ALTERNATİF ÇÖZÜMLER:');
    console.log('   a) Web otomasyonu ile teklif verme:');
    console.log('      - Puppeteer/Selenium kullan');
    console.log('      - Web arayüzünden teklif ver');
    console.log('      - Gas-free iptal edilebilir\n');
    
    console.log('   b) Hibrit yaklaşım:');
    console.log('      - Hızlı teklifler: API kullan');
    console.log('      - Uzun süreli teklifler: Web otomasyonu kullan\n');
    
    console.log('   c) Akıllı süre yönetimi:');
    console.log('      - API teklifleri için kısa süre (10-15 dk)');
    console.log('      - Otomatik yenileme sistemi\n');
    
    console.log('📝 ÖZET:');
    console.log('API ile verilen teklifler web\'de gas-free iptal EDİLEMEZ çünkü:');
    console.log('1. OpenSea co-signature eksik');
    console.log('2. Zone parametresi farklı');
    console.log('3. Veritabanı kaydı yok (doğrudan blockchain)\n');
    
    console.log('En iyi çözüm: Kısa süreli API teklifleri + otomatik yenileme');
    
  } catch (error) {
    console.error('❌ Analiz hatası:', error.message);
  }
}

// Analizi çalıştır
analyzeApiVsWebOffers().catch(console.error);