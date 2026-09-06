const { ethers } = require('ethers');
const config = require('../config');

async function forceCounterIncrement() {
  console.log('🔧 ULTRATHINK - Force Counter Increment\n');
  
  try {
    const provider = new ethers.JsonRpcProvider(config.getRpcUrl('abstract'));
    const wallet = new ethers.Wallet(config.privateKey, provider);
    
    // Seaport contract
    const seaportAddress = '0x0000000000000068f116a894984e2db1123eb395';
    const seaportAbi = [
      'function getCounter(address offerer) view returns (uint256)',
      'function incrementCounter() returns (uint256 newCounter)'
    ];
    
    const seaportContract = new ethers.Contract(seaportAddress, seaportAbi, wallet);
    
    // Mevcut counter'ı al
    console.log('📊 Mevcut counter değeri alınıyor...');
    const currentCounter = await seaportContract.getCounter(wallet.address);
    console.log('Mevcut counter:', currentCounter.toString());
    
    // Counter'ı 10 kez artır (tüm cache'i temizlemek için)
    console.log('\n🔄 Counter 10 kez artırılıyor...');
    for (let i = 0; i < 10; i++) {
      try {
        console.log(`\n📈 Artırma ${i + 1}/10...`);
        const tx = await seaportContract.incrementCounter({
          gasLimit: 100000,
          maxFeePerGas: ethers.parseUnits('2', 'gwei'),
          maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei')
        });
        
        console.log('TX Hash:', tx.hash);
        const receipt = await tx.wait();
        console.log('✅ Başarılı! Gas kullanımı:', receipt.gasUsed.toString());
        
        // Kısa bekleme
        await new Promise(r => setTimeout(r, 2000));
      } catch (error) {
        console.log('❌ Hata:', error.message);
      }
    }
    
    // Yeni counter'ı kontrol et
    const newCounter = await seaportContract.getCounter(wallet.address);
    console.log('\n✅ Yeni counter:', newCounter.toString());
    console.log('🎯 Artış miktarı:', (newCounter - currentCounter).toString());
    
    console.log('\n💡 ŞİMDİ YENİ OFFER DENEYİN!');
    console.log('Counter artırıldı, OpenSea cache temizlendi.');
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
  }
  
  process.exit(0);
}

forceCounterIncrement();