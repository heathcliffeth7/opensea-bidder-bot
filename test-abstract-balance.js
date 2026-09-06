const api = require('./src/api');
const config = require('./config');

async function testAbstractBalance() {
  console.log('\n🧪 Abstract Network Bakiye Test Scripti');
  console.log('=====================================\n');
  
  try {
    // Önce config bilgilerini göster
    console.log('📋 Konfigürasyon Bilgileri:');
    console.log('- Wallet adresi:', config.walletAddress);
    console.log('- Abstract RPC URL:', config.abstractRpcUrls[0]);
    console.log('- Abstract WETH adresi:', config.getWethAddress('abstract'));
    console.log('- Abstract Chain ID:', config.getChainId('abstract'));
    console.log('- Abstract Seaport Zone:', config.getSeaportZone('abstract'));
    
    // Abstract chain'e geç
    console.log('\n🔄 Abstract chain\'e geçiliyor...');
    const switchResult = await api.switchChain('abstract');
    console.log('Switch sonucu:', switchResult ? 'Başarılı' : 'Başarısız');
    
    // Biraz bekle
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Bakiye kontrolü yap
    console.log('\n💰 Abstract chain bakiye kontrolü yapılıyor...');
    const balances = await api.checkBalances();
    
    console.log('\n📊 Abstract Network Bakiye Sonuçları:');
    console.log('====================================');
    console.log(`💰 ETH Bakiyesi: ${balances.eth.formatted} ETH`);
    console.log(`   (Raw: ${balances.eth.raw} wei)`);
    console.log(`💎 WETH Bakiyesi: ${balances.weth.formatted} WETH`);
    console.log(`   (Raw: ${balances.weth.raw} wei)`);
    console.log(`\n📍 Wallet Adresi: ${balances.walletAddress}`);
    console.log(`🌐 Network: ${balances.network}`);
    console.log(`🔗 Chain ID: ${balances.chainId}`);
    
    // Beklenen değerlerle karşılaştır
    console.log('\n🔍 Beklenen vs Gerçek Değerler:');
    console.log('Beklenen ETH: 0.00203459711472821');
    console.log('Gerçek ETH:', balances.eth.formatted);
    console.log('Beklenen WETH: 0.020895772351407029');
    console.log('Gerçek WETH:', balances.weth.formatted);
    
    // Test diğer chainler
    console.log('\n\n🔄 Ethereum chain\'e geri dönülüyor...');
    await api.switchChain('ethereum');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const ethBalances = await api.checkBalances();
    console.log('\n📊 Ethereum Network Bakiye Sonuçları:');
    console.log('=====================================');
    console.log(`💰 ETH Bakiyesi: ${ethBalances.eth.formatted} ETH`);
    console.log(`💎 WETH Bakiyesi: ${ethBalances.weth.formatted} WETH`);
    console.log(`🌐 Network: ${ethBalances.network}`);
    console.log(`🔗 Chain ID: ${ethBalances.chainId}`);
    
  } catch (error) {
    console.error('\n❌ Test sırasında hata oluştu:', error);
    console.error('Hata detayı:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
  }
  
  process.exit(0);
}

// Test'i başlat
setTimeout(testAbstractBalance, 2000);