/**
 * Abstract chain koleksiyon contract address mapping
 * Collection slug -> Contract address
 */
const ABSTRACT_COLLECTIONS = {
  // Pengztracted koleksiyonu
  'pengztracted-abstract': '0xa6C46c07F7f1966D772E29049175EBBa26262513',
  
  // Diğer Abstract koleksiyonları buraya eklenebilir
  // Örnek:
  // 'abstract-punks': '0x1234567890123456789012345678901234567890',
  // 'abstract-apes': '0x0987654321098765432109876543210987654321',
  
  // Not: Yeni koleksiyon eklemek için:
  // 1. Collection slug'ı OpenSea'den alın (URL'deki isim)
  // 2. Contract address'i Abstract explorer'dan alın
  // 3. Yukarıdaki formatta ekleyin
};

/**
 * Collection slug'a göre contract address al
 * @param {string} collectionSlug - Koleksiyon slug'ı
 * @returns {string|null} - Contract address veya null
 */
function getAbstractContractAddress(collectionSlug) {
  return ABSTRACT_COLLECTIONS[collectionSlug] || null;
}

/**
 * Contract address'e göre collection slug al
 * @param {string} contractAddress - Contract address
 * @returns {string|null} - Collection slug veya null
 */
function getAbstractCollectionSlug(contractAddress) {
  const address = contractAddress.toLowerCase();
  for (const [slug, addr] of Object.entries(ABSTRACT_COLLECTIONS)) {
    if (addr.toLowerCase() === address) {
      return slug;
    }
  }
  return null;
}

module.exports = {
  ABSTRACT_COLLECTIONS,
  getAbstractContractAddress,
  getAbstractCollectionSlug
};