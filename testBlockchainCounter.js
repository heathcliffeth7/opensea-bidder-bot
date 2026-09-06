const { ethers } = require('ethers');
const config = require('./config');

async function testBlockchainCounter() {
  try {
    console.log('=== Blockchain Counter Test ===\n');
    
    // Provider oluştur
    const provider = new ethers.JsonRpcProvider(config.getRpcUrl('abstract'));
    
    // Seaport kontratı
    const seaportAddress = config.seaportAddress;
    console.log('Seaport Address:', seaportAddress);
    console.log('Wallet Address:', config.walletAddress);
    
    // Seaport ABI - sadece getCounter fonksiyonu
    const seaportInterface = new ethers.Interface([
      'function getCounter(address offerer) view returns (uint256)'
    ]);
    
    // getCounter çağrısı
    const data = seaportInterface.encodeFunctionData('getCounter', [config.walletAddress]);
    
    const result = await provider.call({
      to: seaportAddress,
      data: data
    });
    
    const counter = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], result)[0];
    console.log('\nBlockchain Counter:', counter.toString());
    
    // Sonraki counter
    const nextCounter = counter + 1n;
    console.log('Next Counter:', nextCounter.toString());
    
  } catch (error) {
    console.error('\nHata:', error.message);
  }
}

testBlockchainCounter();