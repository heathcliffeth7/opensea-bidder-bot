const { ethers } = require('ethers');
const config = require('./config');

async function testAbstractRPC() {
  console.log('\n🧪 Abstract RPC Bağlantı Testi');
  console.log('==============================\n');
  
  try {
    // Abstract RPC URL
    const abstractRpcUrl = config.abstractRpcUrls[0];
    console.log('📡 RPC URL:', abstractRpcUrl);
    
    // Provider oluştur
    console.log('\n🔌 Provider oluşturuluyor...');
    const provider = new ethers.JsonRpcProvider(abstractRpcUrl);
    
    // Network bilgilerini al
    console.log('\n🌐 Network bilgileri alınıyor...');
    const network = await provider.getNetwork();
    console.log('- Chain ID:', network.chainId.toString());
    console.log('- Network adı:', network.name || 'Abstract');
    
    // Block numarası al
    console.log('\n📦 Son block bilgisi alınıyor...');
    const blockNumber = await provider.getBlockNumber();
    console.log('- Son block numarası:', blockNumber);
    
    // Wallet oluştur
    console.log('\n👛 Wallet bilgileri:');
    const wallet = new ethers.Wallet(config.privateKey, provider);
    console.log('- Wallet adresi:', wallet.address);
    console.log('- Beklenen adres:', config.walletAddress);
    console.log('- Adresler eşleşiyor mu?', wallet.address.toLowerCase() === config.walletAddress.toLowerCase());
    
    // ETH bakiyesi kontrol et
    console.log('\n💰 ETH bakiyesi kontrol ediliyor...');
    const ethBalance = await provider.getBalance(wallet.address);
    const ethBalanceInEth = ethers.formatEther(ethBalance);
    console.log('- ETH bakiyesi (wei):', ethBalance.toString());
    console.log('- ETH bakiyesi:', ethBalanceInEth, 'ETH');
    
    // WETH bakiyesi kontrol et
    console.log('\n💎 WETH bakiyesi kontrol ediliyor...');
    const wethAddress = config.getWethAddress('abstract');
    console.log('- WETH kontrat adresi:', wethAddress);
    
    const wethAbi = [
      'function balanceOf(address owner) view returns (uint256)',
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)'
    ];
    
    const wethContract = new ethers.Contract(wethAddress, wethAbi, provider);
    
    // WETH token bilgileri
    try {
      const tokenName = await wethContract.name();
      const tokenSymbol = await wethContract.symbol();
      const tokenDecimals = await wethContract.decimals();
      console.log('- Token adı:', tokenName);
      console.log('- Token sembolü:', tokenSymbol);
      console.log('- Token decimals:', tokenDecimals);
    } catch (e) {
      console.log('- Token bilgileri alınamadı:', e.message);
    }
    
    // WETH bakiyesi
    const wethBalance = await wethContract.balanceOf(wallet.address);
    const wethBalanceInEth = ethers.formatEther(wethBalance);
    console.log('- WETH bakiyesi (wei):', wethBalance.toString());
    console.log('- WETH bakiyesi:', wethBalanceInEth, 'WETH');
    
    // Özet
    console.log('\n📊 ÖZET:');
    console.log('========');
    console.log(`✅ Abstract RPC bağlantısı başarılı!`);
    console.log(`✅ Chain ID: ${network.chainId} (Beklenen: 2741)`);
    console.log(`✅ ETH Bakiyesi: ${ethBalanceInEth} ETH`);
    console.log(`✅ WETH Bakiyesi: ${wethBalanceInEth} WETH`);
    
  } catch (error) {
    console.error('\n❌ RPC test hatası:', error);
    console.error('Hata tipi:', error.code || 'Bilinmiyor');
    console.error('Hata mesajı:', error.message);
    
    if (error.code === 'NETWORK_ERROR') {
      console.error('\n💡 Çözüm önerileri:');
      console.error('1. RPC URL\'nin doğru olduğundan emin olun');
      console.error('2. İnternet bağlantınızı kontrol edin');
      console.error('3. Farklı bir RPC URL deneyin:', config.abstractRpcUrls[1]);
    }
  }
}

// Testi başlat
testAbstractRPC();