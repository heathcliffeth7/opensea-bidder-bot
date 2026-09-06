const api = require('../src/api');
const config = require('../config');
const { ethers } = require('ethers');

async function cancelAllOrders() {
  console.log('🚫 Tüm Order\'ları İptal Et\n');
  
  try {
    // Abstract chain'e geç
    await api.switchChain('abstract');
    console.log('Chain: Abstract');
    console.log('Wallet:', config.walletAddress);
    
    // Blockchain üzerinden counter'ı artırarak tüm order'ları iptal et
    const provider = api.provider;
    const wallet = new ethers.Wallet(config.privateKey, provider);
    
    // Seaport contract ABI (sadece incrementCounter fonksiyonu)
    const seaportAbi = [
      'function incrementCounter() returns (uint256 newCounter)'
    ];
    
    // Abstract için Seaport adresi
    const seaportAddress = '0x0000000000000068f116a894984e2db1123eb395';
    
    const seaportContract = new ethers.Contract(seaportAddress, seaportAbi, wallet);
    
    console.log('\n🔄 Counter artırılarak tüm order\'lar iptal ediliyor...');
    
    // Counter'ı artır - bu tüm önceki order'ları geçersiz kılar
    const tx = await seaportContract.incrementCounter();
    console.log('Transaction hash:', tx.hash);
    console.log('Transaction onaylanıyor...');
    
    await tx.wait();
    console.log('✅ Transaction onaylandı!');
    
    console.log('\n🎉 Tüm order\'lar başarıyla iptal edildi!');
    console.log('Artık yeni order\'lar oluşturabilirsiniz.');
    
  } catch (error) {
    console.error('Hata:', error.message);
  }
  
  process.exit(0);
}

cancelAllOrders();