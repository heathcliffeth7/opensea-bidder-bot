/**
 * Yardımcı fonksiyonlar
 */

/**
 * Komut metnini ayrıştırır ve parametreleri çıkarır
 * @param {string} command - Ayrıştırılacak komut metni
 * @returns {object} - Ayrıştırılmış parametreler
 */
function parseTaskCommand(command) {
  // Örnek: ethereum:opepen-edition minprice:0.001 maxprice:0.003 type:criteriaoffer trait:Edition size:Four offertime:15min looptime:0min counterbid on 0.0001 highofferskip:on itemlimit:1
  
  const result = {};
  
  // Koleksiyon bilgisini ayrıştır (chain:collection)
  const collectionMatch = command.match(/([a-zA-Z0-9]+):([a-zA-Z0-9\-_]+)/);
  if (collectionMatch) {
    result.chain = collectionMatch[1];
    result.collection = collectionMatch[2];
    
    // Chain doğrulama
    const validChains = ['ethereum', 'polygon', 'sepolia', 'abstract'];
    if (!validChains.includes(result.chain.toLowerCase())) {
      console.warn(`⚠️ Bilinmeyen chain: ${result.chain}. Desteklenen chainler: ${validChains.join(', ')}`);
    }
  }
  
  // Minimum fiyatı ayrıştır
  const minPriceMatch = command.match(/minprice\s*:\s*([0-9.]+)/i);
  if (minPriceMatch) {
    result.minPrice = parseFloat(minPriceMatch[1]);
  }
  
  // Maksimum fiyatı ayrıştır
  const maxPriceMatch = command.match(/maxprice\s*:\s*([0-9.]+)/i);
  if (maxPriceMatch) {
    result.maxPrice = parseFloat(maxPriceMatch[1]);
  }
  
  // Teklif türünü ayrıştır
  const typeMatch = command.match(/type\s*:\s*(tokenoffer|criteriaoffer|collectionoffer)/i);
  if (typeMatch) {
    result.type = typeMatch[1].toLowerCase();
  }
  
  // Trait bilgilerini ayrıştır (eğer varsa)
  const traitMatch = command.match(/trait\s*:\s*([^\s]+)\s+traitvalue\s*:\s*([^\s]+)/i);
  if (traitMatch) {
    result.trait = traitMatch[1].trim();
    result.traitValue = traitMatch[2].trim();
  }
  
  // Teklif süresini ayrıştır - 15min, 1hr, 1d formatlarını destekler
  const offerTimeMatch = command.match(/offertime\s*:\s*([0-9]+)(min|mins|hr|hrs|hour|hours|d|day|days|s|sec|secs|m|h)?/i);
  if (offerTimeMatch) {
    const value = parseInt(offerTimeMatch[1]);
    const unit = offerTimeMatch[2] ? offerTimeMatch[2].toLowerCase() : 'min';
    result.offerTime = parseTimeToMs(value, unit);
  }
  
  // Döngü süresini ayrıştır - 0min, 1hr, 1d formatlarını destekler
  const loopTimeMatch = command.match(/looptime\s*:\s*([0-9]+)(min|mins|hr|hrs|hour|hours|d|day|days|s|sec|secs|m|h)?/i);
  if (loopTimeMatch) {
    const value = parseInt(loopTimeMatch[1]);
    const unit = loopTimeMatch[2] ? loopTimeMatch[2].toLowerCase() : 'min';
    result.loopTime = parseTimeToMs(value, unit);
  }
  
  // Counterbid ayarlarını ayrıştır
  const counterbidMatch = command.match(/counterbid\s+(on|off)(\s+([0-9.]+))?/i);
  if (counterbidMatch) {
    result.counterbidEnabled = counterbidMatch[1].toLowerCase() === 'on';
    if (counterbidMatch[3]) {
      result.counterbidAmount = parseFloat(counterbidMatch[3]);
    }
  }
  
  // HighOfferSkip ayarını ayrıştır
  const highOfferSkipMatch = command.match(/highofferskip\s*:\s*(on|off)/i);
  if (highOfferSkipMatch) {
    result.highOfferSkip = highOfferSkipMatch[1].toLowerCase() === 'on';
  }
  
  // ItemLimit ayarını ayrıştır
  const itemLimitMatch = command.match(/itemlimit\s*:?\s*([0-9]+)/i);
  if (itemLimitMatch) {
    result.itemLimit = parseInt(itemLimitMatch[1]);
  }
  
  // TokenID'leri ayrıştır (eğer varsa)
  const tokenIdMatch = command.match(/tokenid['"]?s\s*:?\s*([a-zA-Z0-9\-_.]+)/i);
  if (tokenIdMatch) {
    // Dosya adı verilmişse, dosyadan token ID'leri oku
    result.tokenIdsFile = tokenIdMatch[1];
  }
  
  // TokenIDList parametresini ayrıştır (virgülle ayrılmış token ID'ler)
  const tokenIdListMatch = command.match(/tokenidlist\s*:\s*([0-9,\s]+)/i);
  if (tokenIdListMatch) {
    // Virgülle ayrılmış token ID'leri array'e çevir
    result.tokenIdList = tokenIdListMatch[1]
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);
  }
  
  return result;
}

/**
 * Zaman değerini milisaniyeye dönüştürür
 * @param {number} value - Zaman değeri
 * @param {string} unit - Zaman birimi (s, m, h, d, min, hour, day)
 * @returns {number} - Milisaniye cinsinden zaman
 */
function parseTimeToMs(value, unit = 'min') {
  switch (unit.toLowerCase()) {
    case 's':
    case 'sec':
    case 'secs':
      return value * 1000;
    case 'm':
    case 'min':
    case 'mins':
      return value * 60 * 1000;
    case 'h':
    case 'hr':
    case 'hrs':
    case 'hour':
    case 'hours':
      return value * 60 * 60 * 1000;
    case 'd':
    case 'day':
    case 'days':
      return value * 24 * 60 * 60 * 1000;
    default:
      return value * 60 * 1000; // Varsayılan olarak dakika
  }
}

/**
 * Fiyatı formatlı bir şekilde döndürür
 * @param {object|number} price - Fiyat nesnesi veya sayı
 * @returns {string} - Formatlanmış fiyat
 */
function formatPrice(price) {
  if (!price) return '0';
  
  if (typeof price === 'number') {
    return price.toFixed(6);
  }
  
  if (typeof price === 'string') {
    // Wei formatında string ise ETH'e çevir
    const priceNum = parseFloat(price);
    if (priceNum > 1000000) { // Wei formatında
      return (priceNum / 1e18).toFixed(6);
    }
    return priceNum.toFixed(6);
  }
  
  if (price.amount) {
    return parseFloat(price.amount).toFixed(6);
  }
  
  if (price.value) {
    const priceNum = parseFloat(price.value);
    if (priceNum > 1000000) { // Wei formatında
      return (priceNum / 1e18).toFixed(6);
    }
    return priceNum.toFixed(6);
  }
  
  return '0';
}

/**
 * Token ID'leri dosyadan okur
 * @param {string} filePath - Dosya yolu
 * @returns {string[]} - Token ID'leri
 */
async function readTokenIdsFromFile(filePath) {
  const fs = require('fs').promises;
  
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch (error) {
    console.error(`Dosya okuma hatası (${filePath}):`, error);
    return [];
  }
}

/**
 * Belirtilen süre kadar bekler
 * @param {number} ms - Milisaniye cinsinden bekleme süresi
 * @returns {Promise} - Bekleme promise'i
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  parseTaskCommand,
  parseTimeToMs,
  formatPrice,
  readTokenIdsFromFile,
  sleep
};
