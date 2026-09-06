const { ethers } = require('ethers');
const config = require('../config');

async function incrementCounter() {
  console.log('🔄 Counter Increment Script\n');
  
  // Abstract RPC'ye bağlan
  const rpcUrl = config.getRpcUrl('abstract');
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  
  console.log('Wallet:', wallet.address);
  console.log('Chain: Abstract (2741)');
  
  // Seaport contract
  const seaportAddress = '0x0000000000000068f116a894984e2db1123eb395';
  const seaportAbi = [
    'function getCounter(address offerer) view returns (uint256)',
    'function incrementCounter() returns (uint256 newCounter)'
  ];
  
  const seaport = new ethers.Contract(seaportAddress, seaportAbi, wallet);
  
  try {
    // Mevcut counter'ı al
    const currentCounter = await seaport.getCounter(wallet.address);
    console.log(`\nMevcut counter: ${currentCounter.toString()}`);
    
    // Counter'ı artır
    console.log('\n📈 Counter artırılıyor...');
    const tx = await seaport.incrementCounter();
    console.log('Transaction hash:', tx.hash);
    
    // Transaction'ın onaylanmasını bekle
    console.log('Transaction onaylanıyor...');
    const receipt = await tx.wait();
    console.log('✅ Transaction onaylandı!');
    
    // Yeni counter'ı kontrol et
    const newCounter = await seaport.getCounter(wallet.address);
    console.log(`\nYeni counter: ${newCounter.toString()}`);
    console.log(`Artış miktarı: ${(BigInt(newCounter) - BigInt(currentCounter)).toString()}`);
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
    if (error.data) {
      console.error('Hata detayı:', error.data);
    }
  }
}

incrementCounter().catch(console.error);