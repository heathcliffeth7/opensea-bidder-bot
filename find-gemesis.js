const api = require('./src/api');

async function findGemesis() {
  const possibleSlugs = [
    'gemesis',
    'gemesis-official',
    'thegemesis',
    'gemesis-nft',
    'gemesisnft',
    'genuine-undead', // Belki bu?
    'genesis-creepz',
    'genesis-box'
  ];
  
  console.log('Gemesis koleksiyonu aranıyor...\n');
  
  for (const slug of possibleSlugs) {
    try {
      const info = await api.getCollectionInfo(slug);
      console.log(`✅ BULUNDU: ${slug}`);
      console.log(`   Contract: ${info.contractAddress}`);
      console.log(`   Name: ${info.name}\n`);
      
      // Gemesis ile ilgili gibi görünüyorsa
      if (info.name && info.name.toLowerCase().includes('geme')) {
        console.log(`🎯 Bu muhtemelen aradığınız koleksiyon!`);
        break;
      }
    } catch (error) {
      console.log(`❌ ${slug} - Bulunamadı`);
    }
  }
  
  console.log('\n💡 İpucu: OpenSea\'de koleksiyonun URL\'sine bakın.');
  console.log('Örnek: https://opensea.io/collection/[SLUG-BURAYA]');
}

findGemesis().catch(console.error);