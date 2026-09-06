const api = require('./src/api');

async function checkBalance() {
  console.log('Wallet bakiyeleri kontrol ediliyor...\n');
  
  // Hangi chain için kontrol yapacağımızı belirle
  const chain = process.argv[2] || 'ethereum'; // Varsayılan ethereum
  
  try {
    // Eğer farklı bir chain belirtildiyse, önce SDK'yı o chain için başlat
    if (chain !== 'ethereum') {
      console.log(`Chain değiştiriliyor: ${chain}`);
      await api.switchChain(chain);
      // Chain değişiminden sonra biraz bekle
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const balances = await api.checkBalances();
    
    console.log('📊 BAKIM BİLGİLERİ:');
    console.log('================');
    console.log(`💰 ETH Bakiyesi: ${balances.eth.formatted} ETH`);
    console.log(`💎 WETH Bakiyesi: ${balances.weth.formatted} WETH`);
    console.log('\nWallet Adresi:', balances.walletAddress);
    console.log('Network:', chain);
    console.log('Chain ID:', api.currentChain || chain);
    
    if (parseFloat(balances.weth.formatted) < 0.001) {
      console.log('\n⚠️ UYARI: WETH bakiyeniz çok düşük!');
      console.log('OpenSea\'de teklif verebilmek için WETH\'e ihtiyacınız var.');
      console.log('\n💡 ETH\'inizi WETH\'e dönüştürmek için:');
      console.log('1. https://app.uniswap.org adresine gidin');
      console.log('2. ETH -> WETH swap yapın');
      console.log('3. Ya da doğrudan WETH kontratı üzerinden wrap edin');
    }
    
    if (parseFloat(balances.eth.formatted) < 0.01) {
      console.log('\n⚠️ UYARI: ETH bakiyeniz gas ücretleri için yetersiz olabilir!');
    }
    
  } catch (error) {
    console.error('Bakiye kontrolü sırasında hata:', error);
    console.error('Hata detayı:', error.message);
  }
  
  process.exit(0);
}

// Kullanım bilgisi
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('\n📖 KULLANIM:');
  console.log('node check_balance.js [chain]');
  console.log('\nChain seçenekleri:');
  console.log('- ethereum (varsayılan)');
  console.log('- polygon');
  console.log('- abstract');
  console.log('- sepolia');
  console.log('\nÖrnek:');
  console.log('node check_balance.js abstract');
  process.exit(0);
}

// Birkaç saniye bekle SDK başlasın
setTimeout(checkBalance, 2000);