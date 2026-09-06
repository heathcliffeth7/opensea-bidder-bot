const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');
const { ethers } = require('ethers');
const config = require('../config');

async function testAllSolutions() {
  console.log('🔬 TÜM DUPLICATE ÇÖZÜM YÖNTEMLERİ TEST EDİLİYOR\n');
  
  const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
  const tokenId = '16'; // Problemli token
  const price = '0.01';
  
  try {
    await api.switchChain('abstract');
    console.log('✅ Abstract chain bağlantısı başarılı\n');
    
    // 1. Mevcut counter'ı kontrol et
    console.log('1️⃣ MEVCUT DURUM KONTROLÜ');
    console.log('========================');
    
    const seaportAbi = [
      'function getCounter(address offerer) view returns (uint256)',
      'function incrementCounter() returns (uint256)'
    ];
    
    const seaportContract = new ethers.Contract(
      '0x0000000000000068f116a894984e2db1123eb395',
      seaportAbi,
      api.provider
    );
    
    const currentCounter = await seaportContract.getCounter(config.walletAddress);
    console.log('📊 Mevcut Counter:', currentCounter.toString());
    
    // Mevcut offer'ları kontrol et
    try {
      const offers = await api.makeRequest(
        'GET',
        `/api/v2/orders/abstract/seaport/offers?asset_contract_address=${contractAddress}&token_ids=${tokenId}&maker=${config.walletAddress}`
      );
      
      console.log(`📋 Token #${tokenId} için aktif offer sayısı:`, offers.orders?.length || 0);
      
      if (offers.orders && offers.orders.length > 0) {
        console.log('\n🔍 Aktif Offer Detayları:');
        offers.orders.forEach((order, i) => {
          console.log(`\nOffer ${i+1}:`);
          console.log('- Hash:', order.order_hash);
          console.log('- Counter:', order.protocol_data?.parameters?.counter || 'N/A');
          console.log('- Created:', new Date(order.created_date).toLocaleString());
        });
      }
    } catch (e) {
      console.log('Offer listesi alınamadı:', e.message);
    }
    
    // 2. Yöntem 1: Counter'ı artır ve yeni offer oluştur
    console.log('\n\n2️⃣ YÖNTEM 1: COUNTER ARTIRMA');
    console.log('==============================');
    
    const userResponse = await new Promise(resolve => {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      readline.question('Counter\'ı artırmak ister misiniz? (y/n): ', (answer) => {
        readline.close();
        resolve(answer.toLowerCase() === 'y');
      });
    });
    
    if (userResponse) {
      try {
        console.log('\n🔧 Counter artırılıyor...');
        const signer = api.getSigner();
        const seaportWithSigner = new ethers.Contract(
          '0x0000000000000068f116a894984e2db1123eb395',
          seaportAbi,
          signer
        );
        
        const tx = await seaportWithSigner.incrementCounter();
        console.log('📤 TX Hash:', tx.hash);
        console.log('⏳ Onay bekleniyor...');
        const receipt = await tx.wait();
        console.log('✅ Counter artırıldı! Block:', receipt.blockNumber);
        
        const newCounter = await seaportContract.getCounter(config.walletAddress);
        console.log('📊 Yeni Counter:', newCounter.toString());
        
        // Yeni offer dene
        console.log('\n🎯 Yeni counter ile offer deneniyor...');
        const abstractOffer = new AbstractTokenOffer(api);
        const result = await abstractOffer.createOffer(contractAddress, tokenId, price, 15);
        
        if (result.success) {
          console.log('✅ BAŞARILI! Order Hash:', result.order_hash);
          return;
        } else {
          console.log('❌ Hala hata alıyoruz:', result.error);
        }
        
      } catch (error) {
        console.log('❌ Counter artırma hatası:', error.message);
      }
    }
    
    // 3. Yöntem 2: Farklı token ID dene
    console.log('\n\n3️⃣ YÖNTEM 2: FARKLI TOKEN ID');
    console.log('==============================');
    
    const alternativeTokens = ['50', '896', '123', '456'];
    console.log('Alternatif token ID\'ler:', alternativeTokens.join(', '));
    
    for (const altToken of alternativeTokens) {
      console.log(`\n🔄 Token #${altToken} deneniyor...`);
      
      try {
        const abstractOffer = new AbstractTokenOffer(api);
        const result = await abstractOffer.createOffer(contractAddress, altToken, price, 15);
        
        if (result.success) {
          console.log('✅ BAŞARILI! Token:', altToken);
          console.log('Order Hash:', result.order_hash);
          break;
        } else {
          console.log('❌ Başarısız:', result.error);
        }
      } catch (e) {
        console.log('❌ Hata:', e.message);
      }
      
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // 4. Yöntem 3: Collection offer
    console.log('\n\n4️⃣ YÖNTEM 3: COLLECTION OFFER');
    console.log('==============================');
    console.log('Collection offer tüm koleksiyon için geçerli bir tekliftir.');
    console.log('node scripts/collection-offer-solution.js ile deneyebilirsiniz.');
    
    // 5. Öneriler
    console.log('\n\n📋 ÖZET VE ÖNERİLER');
    console.log('===================');
    console.log('\n✨ En etkili çözüm: Counter artırmak');
    console.log('   - Eski tüm order\'lar iptal olur');
    console.log('   - Yeni order\'lar sorunsuz oluşturulur');
    console.log('\n🔄 Alternatif: Farklı token ID\'ler kullanmak');
    console.log('   - Bazı token\'lar cache\'lenmiş olabilir');
    console.log('   - Farklı token\'larla başarı şansı yüksek');
    console.log('\n📦 Collection offer kullanmak');
    console.log('   - Tek bir offer ile tüm koleksiyona teklif');
    console.log('   - Token bazlı cache problemini aşar');
    
  } catch (error) {
    console.error('Test hatası:', error.message);
  }
  
  process.exit(0);
}

testAllSolutions();