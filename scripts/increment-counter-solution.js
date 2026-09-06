const { ethers } = require('ethers');
const config = require('../config');
const api = require('../src/api');

async function incrementCounterSolution() {
  console.log('🔧 Counter Artırma Çözümü\n');
  
  try {
    // Abstract chain'e bağlan
    await api.switchChain('abstract');
    console.log('✅ Abstract chain bağlantısı başarılı');
    
    // Seaport contract'ı ile etkileşim
    const seaportAddress = '0x0000000000000068f116a894984e2db1123eb395';
    const seaportAbi = [
      'function getCounter(address offerer) view returns (uint256)',
      'function incrementCounter() returns (uint256 newCounter)'
    ];
    
    const signer = api.getSigner();
    const seaportContract = new ethers.Contract(seaportAddress, seaportAbi, signer);
    
    // Mevcut counter'ı al
    const currentCounter = await seaportContract.getCounter(config.walletAddress);
    console.log('📊 Mevcut Counter:', currentCounter.toString());
    
    // Counter'ı artır
    console.log('\n📈 Counter artırılıyor...');
    const tx = await seaportContract.incrementCounter();
    console.log('📤 Transaction Hash:', tx.hash);
    
    // Transaction'ın onaylanmasını bekle
    console.log('⏳ Onay bekleniyor...');
    const receipt = await tx.wait();
    console.log('✅ Transaction onaylandı!');
    console.log('Block:', receipt.blockNumber);
    
    // Yeni counter'ı kontrol et
    const newCounter = await seaportContract.getCounter(config.walletAddress);
    console.log('\n📊 Yeni Counter:', newCounter.toString());
    
    console.log('\n✨ Counter başarıyla artırıldı!');
    console.log('Eski order\'lar artık geçersiz.');
    console.log('Yeni offer\'lar oluşturabilirsiniz.');
    
    return newCounter.toString();
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
    throw error;
  }
}

// Direkt çalıştır
if (require.main === module) {
  incrementCounterSolution()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = incrementCounterSolution;