const config = require('../config');
const api = require('./api');
const { parseTaskCommand, parseTimeToMs, formatPrice } = require('../utils/helpers');
const { ethers } = require('ethers');
const CollectionOfferMonitorV2 = require('./collectionOfferMonitorV2');
const UltraFastBidder = require('./ultraFastBidder');
const OffChainOffer = require('./offChainOffer');
const BatchTokenProcessor = require('./batchTokenProcessor');
const { getAbstractContractAddress } = require('./abstractCollections');

/**
 * Görev yönetimi için sınıf
 */
class TaskManager {
  constructor() {
    this.api = api; // API instance'ı sakla
    this.tasks = {};
    this.activeTasks = [];
    this.taskIntervals = {};
    this.lastOfferTime = {}; // Task bazında son teklif zamanı
    this.tokenOffers = {}; // Token bazında aktif tekliflerimiz { "contractAddress-tokenId": { price, taskName, expirationTime } }
    this.tokenListeners = {}; // Token bazında dinleyiciler
    this.collectionMonitor = new CollectionOfferMonitorV2(api, this);
    this.offChainOffer = new OffChainOffer(); // Off-chain (gas ücretsiz) teklif sistemi
    this.ultraFastBidder = new UltraFastBidder(api); // Ultra hızlı paralel teklif sistemi
    this.batchProcessor = new BatchTokenProcessor(api); // Batch token işleyici
    
    // Her 5 dakikada bir süresi dolan teklifleri temizle
    setInterval(() => {
      this._cleanupExpiredTokenOffers();
    }, 5 * 60 * 1000);
  }

  /**
   * Yeni bir görev oluştur
   * @param {string} taskName - Görev adı
   */
  createTask(taskName) {
    if (this.tasks[taskName]) {
      return { success: false, message: `"${taskName}" adında bir görev zaten var.` };
    }
    
    this.tasks[taskName] = {
      name: taskName,
      settings: { ...config.defaultOfferSettings },
      isActive: false,
      isBusy: false, // Görev şu anda çalışıyor mu?
      lastRun: null,
      createdAt: new Date(),
      status: 'created',
      lastOfferPrice: null, // Görevin son teklif fiyatı
      lastOfferTime: null, // Görevin son teklif zamanı
      offerExpirationTime: null // Görev teklifinin bitiş zamanı
    };
    
    return { 
      success: true, 
      message: `"${taskName}" adlı görev başarıyla oluşturuldu.`,
      task: this.tasks[taskName]
    };
  }

  /**
   * Görev ayarlarını belirle
   * @param {string} taskName - Görev adı
   * @param {object} settings - Görev ayarları
   */
  setTaskSettings(taskName, settings) {
    if (!this.tasks[taskName]) {
      return { success: false, message: `"${taskName}" adında bir görev bulunamadı.` };
    }
    
    // Mevcut ayarları güncelle
    this.tasks[taskName].settings = {
      ...this.tasks[taskName].settings,
      ...settings
    };
    
    // Görev durumunu güncelle
    this.tasks[taskName].status = 'configured';
    
    return { 
      success: true, 
      message: `"${taskName}" görevinin ayarları güncellendi.`,
      task: this.tasks[taskName]
    };
  }

  /**
   * Görevi başlat
   * @param {string} taskName - Görev adı
   */
  startTask(taskName) {
    if (!this.tasks[taskName]) {
      return { success: false, message: `"${taskName}" adında bir görev bulunamadı.` };
    }
    
    const task = this.tasks[taskName];
    
    if (task.isActive) {
      return { success: false, message: `"${taskName}" görevi zaten çalışıyor.` };
    }
    
    // Gerekli ayarların varlığını kontrol et
    const requiredSettings = ['chain', 'collection', 'minPrice', 'maxPrice', 'type', 'offerTime'];
    const missingSettings = requiredSettings.filter(setting => !task.settings[setting]);
    
    if (missingSettings.length > 0) {
      return { 
        success: false, 
        message: `"${taskName}" görevi için gerekli ayarlar eksik: ${missingSettings.join(', ')}`
      };
    }
    
    // Görevi aktif olarak işaretle
    task.isActive = true;
    task.status = 'running';
    task.lastRun = new Date();
    task.listenerSetup = false; // Listener setup'ı her zaman sıfırla
    
    // Collection offer task ise mevcut listener'ı temizle
    if (task.settings.type === 'collectionoffer' && this.collectionMonitor) {
      console.log(`🧹 Mevcut listener temizleniyor: ${task.settings.collection}`);
      this.collectionMonitor.removeCollection(task.settings.collection);
    }
    
    // Token offer task ise token listener'ları temizle
    if (task.settings.type === 'tokenoffer') {
      console.log(`🧹 Token listener'ları temizleniyor: ${task.settings.collection}`);
      // Bu task'a ait token listener'ları temizle
      Object.keys(this.tokenListeners).forEach(key => {
        if (key.startsWith(`${task.settings.collection}-`)) {
          delete this.tokenListeners[key];
        }
      });
    }
    
    this.activeTasks.push(taskName);
    
    // Görev türüne göre işlemi başlat
    this._executeTask(taskName);
    
    // Artık interval kullanmıyoruz, görev kendi kendini yönetecek
    
    return { 
      success: true, 
      message: `"${taskName}" görevi başlatıldı.`,
      task: this.tasks[taskName]
    };
  }

  /**
   * Görevi durdur
   * @param {string} taskName - Görev adı
   */
  stopTask(taskName) {
    if (!this.tasks[taskName]) {
      return { success: false, message: `"${taskName}" adında bir görev bulunamadı.` };
    }
    
    const task = this.tasks[taskName];
    
    if (!task.isActive) {
      return { success: false, message: `"${taskName}" görevi zaten durdurulmuş.` };
    }
    
    // Görevi pasif olarak işaretle
    task.isActive = false;
    task.status = 'stopped';
    task.listenerSetup = false; // Listener'ı sıfırla
    this.activeTasks = this.activeTasks.filter(name => name !== taskName);
    
    // Collection listener'ı kaldır
    if (task.settings.type === 'collectionoffer' && this.collectionMonitor) {
      this.collectionMonitor.removeCollection(task.settings.collection);
      console.log(`📡 Collection listener kaldırıldı: ${task.settings.collection}`);
    }
    
    // Artık interval kullanmıyoruz, görev otomatik olarak duracak
    
    return { 
      success: true, 
      message: `"${taskName}" görevi durduruldu.`,
      task: this.tasks[taskName]
    };
  }

  /**
   * Görev ayarlarını göster
   * @param {string} taskName - Görev adı
   */
  getTaskSettings(taskName) {
    if (!this.tasks[taskName]) {
      return { success: false, message: `"${taskName}" adında bir görev bulunamadı.` };
    }
    
    return { 
      success: true, 
      task: this.tasks[taskName]
    };
  }

  /**
   * Tüm görevleri listele
   */
  listAllTasks() {
    const taskList = Object.keys(this.tasks).map(taskName => ({
      name: taskName,
      status: this.tasks[taskName].status,
      isActive: this.tasks[taskName].isActive,
      type: this.tasks[taskName].settings.type,
      collection: this.tasks[taskName].settings.collection,
      lastRun: this.tasks[taskName].lastRun
    }));
    
    return { 
      success: true, 
      tasks: taskList,
      activeCount: this.activeTasks.length,
      totalCount: taskList.length
    };
  }

  /**
   * Görevi yürüt
   * @private
   * @param {string} taskName - Görev adı
   */
  async _executeTask(taskName) {
    const task = this.tasks[taskName];
    
    // Eğer görev çalışıyorsa (busy), yeni çalıştırmayı atla
    if (task.isBusy) {
      console.log(`"${taskName}" görevi hala çalışıyor, yeni çalıştırma atlandı.`);
      return;
    }
    
    console.log(`"${taskName}" görevi yürütülüyor...`);
    task.isBusy = true; // Görevi meşgul olarak işaretle
    
    try {
      const { chain, collection, type } = task.settings;
      
      // İlk çalıştırmada stream listener'ları kur
      if (!task.streamListenersSetup) {
        await this.setupStreamListeners(task);
        task.streamListenersSetup = true;
      }
      
      // Görev türüne göre teklif ver
      switch (type.toLowerCase()) {
        case config.offerTypes.TOKEN_OFFER:
          await this._executeTokenOffer(task);
          break;
          
        case config.offerTypes.CRITERIA_OFFER:
          await this._executeCriteriaOffer(task);
          break;
          
        case config.offerTypes.COLLECTION_OFFER:
          await this._executeCollectionOffer(task);
          break;
          
        default:
          console.error(`Bilinmeyen görev türü: ${type}`);
          task.status = 'error';
          task.isBusy = false;
          return;
      }
      
      // Son çalışma zamanını güncelle
      task.lastRun = new Date();
      console.log(`"${taskName}" görevi başarıyla tamamlandı.`);
      
      // Görev tamamlandı, loopTime'a göre bir sonraki çalıştırmayı planla
      task.isBusy = false;
      
      // Eğer görev hala aktifse ve loopTime ayarlanmışsa
      if (task.isActive && task.settings.loopTime !== undefined && task.settings.loopTime !== null) {
        if (task.settings.loopTime === 0) {
          // loopTime 0 ise hemen tekrar çalıştır (minimum 5 saniye bekle)
          console.log(`"${taskName}" görevi 5 saniye sonra tekrar çalıştırılacak (loopTime: 0)`);
          setTimeout(() => {
            if (task.isActive) {
              this._executeTask(taskName);
            }
          }, 5000);
        } else if (task.settings.loopTime > 0) {
          // loopTime > 0 ise belirtilen süre sonra çalıştır
          console.log(`"${taskName}" görevi ${task.settings.loopTime}ms sonra tekrar çalıştırılacak`);
          setTimeout(() => {
            if (task.isActive) {
              this._executeTask(taskName);
            }
          }, task.settings.loopTime);
        }
      }
      
    } catch (error) {
      console.error(`"${taskName}" görevi yürütülürken hata oluştu:`, error);
      task.status = 'error';
      task.isBusy = false; // Hata durumunda da busy flag'ini temizle
    }
  }

  /**
   * Token teklifi ver
   * @private
   * @param {object} task - Görev nesnesi
   */
  async _executeTokenOffer(task) {
    const { chain, collection, minPrice, maxPrice, offerTime, tokenIds, counterbidEnabled } = task.settings;
    
    console.log(`\n🎯 === TOKEN OFFER TASK SETTINGS ===`);
    console.log(`Task: ${task.name}`);
    console.log(`Chain: ${chain}`);
    console.log(`Collection: ${collection}`);
    console.log(`Counter-bid Enabled: ${counterbidEnabled}`);
    console.log(`Counter-bid Amount: ${task.settings.counterbidAmount || 'N/A'}`);
    console.log(`High Offer Skip: ${task.settings.highOfferSkip}`);
    console.log(`Token Count: ${(tokenIds || []).length}`);
    
    // Artık sadece tokenIds kullanılıyor (index.js'de tokenIdList -> tokenIds dönüşümü yapıldı)
    const tokensToProcess = tokenIds;
    
    if (!tokensToProcess || tokensToProcess.length === 0) {
      throw new Error('Token teklifi için tokenId listesi gerekli.');
    }
    
    // Collection slug'dan contract address'i al
    console.log(`Collection bilgileri alınıyor: ${collection}`);
    let contractAddress;
    let collectionInfo;
    try {
      collectionInfo = await api.getCollectionInfo(collection);
      contractAddress = collectionInfo.contractAddress;
      console.log(`Contract address: ${contractAddress}`);
    } catch (error) {
      console.error(`Collection bilgileri alınamadı: ${collection}`, error.message || error);
      
      // HTML hatası genellikle koleksiyon bulunamadığını gösterir
      if (error.message && error.message.includes('html')) {
        console.error(`\n❌ "${collection}" koleksiyonu OpenSea'de bulunamadı!`);
        console.log('💡 İpucu: Koleksiyon slug\'ının doğru olduğundan emin olun.');
        console.log('Örnek koleksiyonlar: doodles-official, azuki, pudgypenguins, clonex');
      }
      
      throw new Error(`${collection} için contract address bulunamadı`);
    }
    
    console.log(`${tokensToProcess.length} adet token için teklif veriliyor...`);
    
    // YENİ: Batch processor kullan (her zaman, API key sayısına bakmadan)
    console.log(`\n🚀 BATCH TOKEN PROCESSOR AKTİF 🚀`);
    console.log(`Optimizasyon: Token'lar batch'ler halinde işlenecek`);
    
    try {
      // Aktif teklifleri kontrol et ve filtreleme yap
      const tokensToOffer = [];
      for (const tokenId of tokensToProcess) {
        const currentTokenKey = `${collection}-${tokenId}`;
        const existingOffer = this.tokenOffers[currentTokenKey];
        const now = Date.now();
        
        // Aktif teklif kontrolü
        if (existingOffer && existingOffer.expirationTime > now) {
          console.log(`Token #${tokenId}: Aktif teklif var, atlanıyor (${Math.round((existingOffer.expirationTime - now) / 1000)}s kaldı)`);
          continue;
        }
        
        tokensToOffer.push(tokenId);
      }
      
      if (tokensToOffer.length === 0) {
        console.log('Teklif verilecek token bulunamadı (hepsi için aktif teklif var).');
        return;
      }
      
      console.log(`${tokensToOffer.length} token için teklif verilecek.`);
      
      // Fire & forget modunda listener'lar teklif ile paralel kurulacak
      // Listener önceden kurulması kaldırıldı - teklif anında paralel kurulacak
      if (counterbidEnabled) {
        console.log(`\n🎯 Counter-bid listener'lar tekliflerle paralel kurulacak`);
        
        // Counter-bid modunda, mevcut aktif tekliflerimiz için de listener kur
        console.log(`\n📡 Mevcut aktif teklifler için listener kuruluyor...`);
        for (const tokenId of tokensToProcess) {
          const currentTokenKey = `${collection}-${tokenId}`;
          const existingOffer = this.tokenOffers[currentTokenKey];
          
          if (existingOffer && existingOffer.expirationTime > now && !this.tokenListeners[currentTokenKey]) {
            console.log(`📡 Token #${tokenId} için mevcut teklif var, listener kuruluyor...`);
            this._setupTokenOfferListener(task, chain, collection, tokenId)
              .then(() => {
                this.tokenListeners[currentTokenKey] = true;
                console.log(`✅ Counter-bid listener kuruldu: ${currentTokenKey}`);
              })
              .catch(err => {
                console.error(`❌ Counter-bid listener kurulumu başarısız: ${err.message}`);
              });
          }
        }
      }
      
      // Fire & forget success callback ekle
      task.onFireAndForgetSuccess = (tokenId, price) => {
        console.log(`\n🎯 Fire & forget success callback: Token #${tokenId}, Price: ${formatPrice(price)} ETH`);
        
        const currentTokenKey = `${collection}-${tokenId}`;
        
        // Token offer'a kaydet
        this.tokenOffers[currentTokenKey] = {
          price: price,
          taskName: task.name,
          expirationTime: Date.now() + offerTime,
          chain: chain,
          contractAddress: contractAddress
        };
        console.log(`✔️ Token offer kaydedildi: ${currentTokenKey}`);
        
        // Counter-bid listener kur (eğer daha önce kurulmamışsa)
        if (counterbidEnabled && !this.tokenListeners[currentTokenKey]) {
          console.log(`📡 Counter-bid listener kuruluyor...`);
          this._setupTokenOfferListener(task, chain, collection, tokenId)
            .then(() => {
              this.tokenListeners[currentTokenKey] = true;
              console.log(`✅ Counter-bid listener kuruldu: ${currentTokenKey}`);
            })
            .catch(err => {
              console.error(`❌ Counter-bid listener kurulumu başarısız: ${err.message}`);
            });
        }
      };
      
      // Batch processor ile teklifleri ver
      const results = await this.batchProcessor.processBatch(task, tokensToOffer, contractAddress, offerTime);
      
      // Başarılı teklifleri kaydet
      let successCount = 0;
      for (const result of results) {
        if (result.success) {
          // Fire & forget durumunu kontrol et
          if (result.status === 'fire_and_forget') {
            console.log(`🔥 Token #${result.tokenId}: Fire & forget modunda`);
            
            // Fire & forget modunda bile counterbid listener kur
            if (counterbidEnabled) {
              const currentTokenKey = `${collection}-${result.tokenId}`;
              console.log(`\n🎯 Fire & forget token için counterbid listener kuruluyor`);
              console.log(`Token Key: ${currentTokenKey}`);
              console.log(`Listener var mı?: ${!!this.tokenListeners[currentTokenKey]}`);
              
              if (!this.tokenListeners[currentTokenKey]) {
                // Fire & forget için asenkron listener kurulumu
                this._setupTokenOfferListener(task, chain, collection, result.tokenId)
                  .then(() => {
                    this.tokenListeners[currentTokenKey] = true;
                    console.log(`✅ Fire & forget token #${result.tokenId} için listener kuruldu!`);
                  })
                  .catch(err => {
                    console.error(`❌ Fire & forget listener hatası: ${err.message}`);
                  });
              }
            }
            
            successCount++; // Yine de başarılı say
            continue; // tokenOffers'a ekleme, diğer işlemlere devam et
          }
          
          // Price kontrolü - price yoksa ekleme
          if (result.price === undefined || result.price === null) {
            console.log(`⚠️ Token #${result.tokenId}: Price bilgisi yok - tokenOffers'a eklenmeyecek`);
            continue;
          }
          
          const currentTokenKey = `${collection}-${result.tokenId}`;
          this.tokenOffers[currentTokenKey] = {
            price: result.price,
            taskName: task.name,
            expirationTime: Date.now() + offerTime,
            chain: chain,
            contractAddress: contractAddress
          };
          
          // Counterbid dinleyicisi kur - paralel
          if (counterbidEnabled && !this.tokenListeners[currentTokenKey]) {
            this._setupTokenOfferListener(task, chain, collection, result.tokenId)
              .then(() => {
                this.tokenListeners[currentTokenKey] = true;
                console.log(`✅ Listener kuruldu: ${currentTokenKey}`);
              })
              .catch(err => {
                console.error(`❌ Listener kurulumu başarısız: ${err.message}`);
              });
          }
          
          successCount++;
        }
      }
      
      console.log(`\n✅ Token teklif görevi tamamlandı: ${successCount}/${tokensToOffer.length} başarılı`);
      
    } catch (error) {
      console.error('Batch token processing hatası:', error);
      console.log('Standart yönteme geçiliyor...');
      
      // Hata durumunda eski yöntemi kullan
      await this._executeTokenOfferStandard(task, tokensToProcess, contractAddress, offerTime);
    }
  }
  
  /**
   * Token teklifi ver - Standart yöntem (yedek)
   * @private
   */
  async _executeTokenOfferStandard(task, tokensToProcess, contractAddress, offerTime) {
    const { chain, collection, counterbidEnabled } = task.settings;
    
    // Eğer birden fazla token varsa ve API key sayısı > 1 ise, ultra hızlı paralel sistem kullan
    if (tokensToProcess.length > 3 && config.apiKeys && config.apiKeys.length > 1) {
      console.log(`\n⚡ ULTRA HIZLI PARALEL TEKLİF SİSTEMİ AKTİF ⚡`);
      console.log(`${config.apiKeys.length} API key ile paralel işlem yapılacak`);
      
      // Teklif verilecek tokenları hazırla
      const tokensForBidding = [];
      
      for (const tokenId of tokensToProcess) {
        const currentTokenKey = `${collection}-${tokenId}`;
        const existingOffer = this.tokenOffers[currentTokenKey];
        const now = Date.now();
        
        // Aktif teklif kontrolü
        if (existingOffer && existingOffer.expirationTime > now) {
          console.log(`${collection} #${tokenId} için aktif teklif var, atlanıyor`);
          continue;
        }
        
        // En iyi teklifi al ve fiyat hesapla
        try {
          // Önce NFT'nin var olup olmadığını kontrol et
          try {
            const nftCheck = await api.getNFTInfo(chain, collection, tokenId);
            if (!nftCheck) {
              console.log(`Token #${tokenId} bulunamadı, atlanıyor`);
              continue;
            }
          } catch (checkError) {
            console.log(`Token #${tokenId} - ${checkError.message || 'bulunamadı'}, atlanıyor`);
            continue;
          }
          
          const bestOfferResponse = await api.getBestOfferForNFT(chain, collection, tokenId);
          let bestOffer = null;
          if (bestOfferResponse && bestOfferResponse.offer) {
            bestOffer = bestOfferResponse.offer;
          }
          
          // Token teklifleri için: En yüksek teklif zaten max price'ın üzerindeyse hiç teklif verme
          if (task.settings.type === config.offerTypes.TOKEN_OFFER && bestOffer) {
            let bestOfferPrice = 0;
            if (bestOffer.current_price) {
              bestOfferPrice = typeof bestOffer.current_price === 'string' && bestOffer.current_price.length > 10 ?
                parseFloat(ethers.formatEther(bestOffer.current_price)) : parseFloat(bestOffer.current_price);
            } else if (bestOffer.price) {
              if (typeof bestOffer.price === 'object' && bestOffer.price.amount) {
                bestOfferPrice = parseFloat(bestOffer.price.amount);
              } else {
                bestOfferPrice = parseFloat(bestOffer.price);
              }
            }
            
            if (bestOfferPrice > task.settings.maxPrice) {
              console.log(`Token #${tokenId}: En yüksek teklif (${formatPrice(bestOfferPrice)}) max price'ı (${formatPrice(task.settings.maxPrice)}) aşıyor, teklif verilmeyecek.`);
              continue;
            }
          }
          
          const offerPrice = this._calculateOfferPrice(task, bestOffer);
          
          // Özel -1 değerini kontrol et (max price aşımı)
          if (offerPrice === -1) {
            console.log(`Token #${tokenId}: Max price limiti nedeniyle teklif verilmeyecek.`);
            continue;
          }
          
          // highOfferSkip kontrolü
          if (task.settings.highOfferSkip && bestOffer && 
              bestOffer.protocol_data && bestOffer.protocol_data.parameters && 
              bestOffer.protocol_data.parameters.offerer && 
              bestOffer.protocol_data.parameters.offerer.toLowerCase() === config.walletAddress.toLowerCase()) {
            console.log(`En yüksek teklif zaten bizde, atlanıyor: ${collection} #${tokenId}`);
            continue;
          }
          
          tokensForBidding.push({
            collection: collection,
            contractAddress: contractAddress,
            tokenId: tokenId,
            price: offerPrice
          });
        } catch (error) {
          console.error(`Token bilgisi alınamadı: ${collection} #${tokenId}`, error.message);
          // HTML hatası veya bulunamadı hatası ise devam et
          if (error.message && (error.message.includes('html') || error.message.includes('bulunamadı') || error.message.includes('404'))) {
            console.log(`Token #${tokenId} atlanıyor...`);
          }
        }
      }
      
      if (tokensForBidding.length === 0) {
        console.log('Teklif verilecek token bulunamadı.');
        return;
      }
      
      console.log(`\n🚀 ${tokensForBidding.length} token için paralel teklif başlıyor...`);
      
      // Ultra hızlı paralel teklif ver
      const results = await this.ultraFastBidder.batchBidParallel(tokensForBidding);
      
      // Başarılı teklifleri kaydet
      let successCount = 0;
      for (const result of results) {
        if (result.success) {
          const currentTokenKey = `${collection}-${result.tokenId}`;
          this.tokenOffers[currentTokenKey] = {
            price: result.price,
            taskName: task.name,
            expirationTime: Date.now() + offerTime,
            chain: chain,
            contractAddress: collection
          };
          
          // Counterbid dinleyicisi kur - paralel
          if (counterbidEnabled && !this.tokenListeners[currentTokenKey]) {
            this._setupTokenOfferListener(task, chain, collection, result.tokenId)
              .then(() => {
                this.tokenListeners[currentTokenKey] = true;
                console.log(`✅ Listener kuruldu: ${currentTokenKey}`);
              })
              .catch(err => {
                console.error(`❌ Listener kurulumu başarısız: ${err.message}`);
              });
          }
          
          successCount++;
        }
      }
      
      console.log(`\n✅ Paralel teklif tamamlandı: ${successCount}/${tokensForBidding.length} başarılı`);
      console.log(`Toplam süre: ${results[results.length - 1]?.time || 0}ms`);
      
      // Başarısız olanları göster
      if (successCount < tokensForBidding.length) {
        console.log('\n❌ Başarısız teklifler:');
        results.filter(r => !r.success).forEach(r => {
          console.log(`- Token #${r.tokenId}: ${r.error}`);
        });
      }
      
      return;
    }
    
    // Tek token veya az sayıda token için normal yöntem
    let processedCount = 0;
    
    for (let i = 0; i < tokensToProcess.length; i++) {
      const tokenId = tokensToProcess[i];
      try {
        const currentTokenKey = `${collection}-${tokenId}`;
        
        // Bu token için mevcut teklifimizi kontrol et
        const existingOffer = this.tokenOffers[currentTokenKey];
        const now = Date.now();
        
        // Eğer aktif bir teklifimiz varsa ve süresi dolmamışsa
        if (existingOffer && existingOffer.expirationTime > now) {
          console.log(`${collection} #${tokenId} için aktif teklif var: ${formatPrice(existingOffer.price)} WETH`);
          console.log(`Kalan süre: ${Math.round((existingOffer.expirationTime - now) / 1000)} saniye`);
          
          // loopTime 0 ise ve highOfferSkip aktif değilse, mevcut teklifin durumunu kontrol et
          if (task.settings.loopTime === 0 && !task.settings.highOfferSkip) {
            // NFT'nin güncel tekliflerini kontrol et
            const nftResponse = await api.getNFT(chain, collection, tokenId);
            let hasOurOffer = false;
            
            if (nftResponse && nftResponse.nft && nftResponse.nft.orders) {
              const offers = nftResponse.nft.orders.filter(order => 
                order.type === 'bid' || order.type === 'english' || order.type === 'criteria'
              );
              
              // Bizim teklifimizi ara
              for (const offer of offers) {
                const offerMaker = offer.maker?.address || offer.protocol_data?.parameters?.offerer;
                if (offerMaker && offerMaker.toLowerCase() === config.walletAddress.toLowerCase()) {
                  hasOurOffer = true;
                  break;
                }
              }
            }
            
            if (!hasOurOffer) {
              console.log(`${collection} #${tokenId} için teklifimiz iptal edilmiş, yeni teklif verilecek.`);
              delete this.tokenOffers[currentTokenKey];
            } else {
              console.log(`Token ${i + 1}/${tokensToProcess.length}: #${tokenId} için aktif teklifimiz devam ediyor, atlanıyor.`);
              continue;
            }
          } else {
            // Normal durumda aktif teklif varsa atla
            continue;
          }
        }
        
        // NFT bilgilerini al
        let nftInfo;
        try {
          nftInfo = await api.getNFTInfo(chain, collection, tokenId);
          console.log(`\nToken ${i + 1}/${tokensToProcess.length}: #${tokenId} için teklif veriliyor...`);
          console.log(`NFT bilgileri alındı: ${collection} #${tokenId}`);
        } catch (nftError) {
          console.log(`⚠️ Token ${i + 1}/${tokensToProcess.length}: #${tokenId} - ${nftError.message || 'Hata oluştu'}`);
          console.log(`Token #${tokenId} atlanıyor...`);
          processedCount++;
          continue;
        }
        
        // En iyi teklifi kontrol et
        const bestOfferResponse = await api.getBestOfferForNFT(chain, collection, tokenId);
        console.log('En iyi teklif yanıtı:', JSON.stringify(bestOfferResponse));
        
        // API yanıtının yapısına göre en iyi teklifi al
        let bestOffer = null;
        if (bestOfferResponse && bestOfferResponse.offer) {
          bestOffer = bestOfferResponse.offer;
        }
        
        console.log(`En iyi teklif: ${bestOffer ? formatPrice(bestOffer.price) : 'Teklif yok'}`);
        
        // Token teklifleri için: En yüksek teklif zaten max price'ın üzerindeyse hiç teklif verme
        if (task.settings.type === config.offerTypes.TOKEN_OFFER && bestOffer) {
          let bestOfferPrice = 0;
          if (bestOffer.current_price) {
            bestOfferPrice = typeof bestOffer.current_price === 'string' && bestOffer.current_price.length > 10 ?
              parseFloat(ethers.formatEther(bestOffer.current_price)) : parseFloat(bestOffer.current_price);
          } else if (bestOffer.price) {
            if (typeof bestOffer.price === 'object' && bestOffer.price.amount) {
              bestOfferPrice = parseFloat(bestOffer.price.amount);
            } else {
              bestOfferPrice = parseFloat(bestOffer.price);
            }
          }
          
          if (bestOfferPrice > task.settings.maxPrice) {
            console.log(`Token ${i + 1}/${tokensToProcess.length}: En yüksek teklif (${formatPrice(bestOfferPrice)}) max price'ı (${formatPrice(task.settings.maxPrice)}) aşıyor, teklif verilmeyecek.`);
            processedCount++;
            continue;
          }
        }
        
        // Teklif fiyatını hesapla
        const offerPrice = this._calculateOfferPrice(task, bestOffer);
        
        // Özel -1 değerini kontrol et (max price aşımı)
        if (offerPrice === -1) {
          console.log(`Token ${i + 1}/${tokensToProcess.length}: Max price limiti nedeniyle teklif verilmeyecek.`);
          processedCount++;
          continue;
        }
        
        console.log(`Hesaplanan teklif fiyatı: ${formatPrice(offerPrice)} WETH`);
        
        // Eğer highOfferSkip etkinse ve zaten en yüksek teklif bizdeyse, atla
        if (task.settings.highOfferSkip && bestOffer && 
            bestOffer.protocol_data && bestOffer.protocol_data.parameters && 
            bestOffer.protocol_data.parameters.offerer && 
            bestOffer.protocol_data.parameters.offerer.toLowerCase() === config.walletAddress.toLowerCase()) {
          console.log(`Token ${i + 1}/${tokensToProcess.length}: En yüksek teklif zaten bizde, atlanıyor: ${collection} #${tokenId}`);
          continue;
        }
        
        // Teklif süresi hesapla
        const expirationTime = Date.now() + offerTime;
        
        // Off-chain teklif ver (gas ücretsiz)
        let offerResult;
        try {
          console.log(`🔐 Off-chain teklif veriliyor (gas ücretsiz)...`);
          
          // Contract address'i al
          let contractAddress = nftInfo?.asset_contract?.address;
          if (!contractAddress) {
            const collectionInfo = await api.getCollectionInfo(collection);
            contractAddress = collectionInfo?.contractAddress;
          }
          
          if (!contractAddress) {
            throw new Error('Contract address bulunamadı');
          }
          
          await this.offChainOffer.createOffChainOffer(
            contractAddress,
            tokenId,
            offerPrice.toString(),
            Math.floor((expirationTime - Date.now()) / 60000) // dakika cinsinden
          );
          
          console.log(`Token ${i + 1}/${tokensToProcess.length}: Off-chain teklif başarıyla oluşturuldu! Gas ücreti: 0`);
          console.log(`${collection} #${tokenId} - ${formatPrice(offerPrice)} WETH`);
          
        } catch (offChainError) {
          console.error('Off-chain teklif hatası:', offChainError.message);
          console.log('🔄 Yedek olarak on-chain sistem kullanılıyor...');
          
          // Yedek olarak eski sistemi kullan
          offerResult = await api.createTokenOffer(
            chain, 
            collection, 
            tokenId, 
            offerPrice, 
            expirationTime
          );
          
          console.log(`Token ${i + 1}/${tokensToProcess.length}: On-chain teklif oluşturuldu (yedek sistem)`);
          console.log(`${collection} #${tokenId} - ${formatPrice(offerPrice)} WETH`);
        }
        
        // Token teklifini kaydet
        this.tokenOffers[currentTokenKey] = {
          price: offerPrice,
          taskName: task.name,
          expirationTime: expirationTime,
          chain: chain,
          contractAddress: collection
        };
        
        // Eğer counterbid etkinse ve bu token için dinleyici yoksa kur
        if (counterbidEnabled) {
          console.log(`\n🔍 Counter-bid listener kontrolü:`);
          console.log(`Current Token Key: ${currentTokenKey}`);
          console.log(`Token Listeners:`, Object.keys(this.tokenListeners));
          console.log(`Listener var mı?: ${!!this.tokenListeners[currentTokenKey]}`);
          
          if (!this.tokenListeners[currentTokenKey]) {
            console.log(`📡 Yeni listener kurulacak!`);
            // Paralel listener kurulumu
            this._setupTokenOfferListener(task, chain, collection, tokenId)
              .then(() => {
                this.tokenListeners[currentTokenKey] = true;
                console.log(`✅ Token offer counterbid sistemi aktif - Stream dinleyicisi kuruldu.`);
              })
              .catch(err => {
                console.error(`❌ Listener kurulumu başarısız: ${err.message}`);
              });
          } else {
            console.log(`⚠️ Bu token için listener zaten var, atlanıyor.`);
          }
        }
        
        // API sınırlamalarını aşmamak için bekle - her token arasında
        // Batch içinde daha kısa bekleme süresi
        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms bekle
        
        processedCount++;
        console.log(`İlerleme: ${processedCount}/${tokensToProcess.length} token işlendi`);
        
      } catch (error) {
        console.error(`Token ${i + 1}/${tokensToProcess.length}: Token teklifi oluşturulurken hata: ${collection} #${tokenId}`, error.message || error);
        
        // HTML hatası token bulunamadığını gösterir
        if (error.message && (error.message.includes('html') || error.message.includes('bulunamadı') || error.message.includes('404'))) {
          console.log(`Token #${tokenId} koleksiyonda yok, atlanıyor...`);
        }
        
        processedCount++;
      }
    }
    
    console.log(`Token teklif görevi tamamlandı. Toplam ${processedCount}/${tokensToProcess.length} token işlendi.`);
  }

  /**
   * Criteria teklifi ver (trait bazlı)
   * @private
   * @param {object} task - Görev nesnesi
   */
  async _executeCriteriaOffer(task) {
    console.log(`[DEBUG] _executeCriteriaOffer for task: ${task.name}`);
    console.log(`[DEBUG] Task settings: ${JSON.stringify(task.settings, null, 2)}`);
    const { 
      chain, collection, offerTime, 
      trait, traitValue, counterbidEnabled
    } = task.settings;
    
    if (!trait || !traitValue) {
      throw new Error('Criteria teklifi için trait ve traitValue gerekli.');
    }
    
    try {
      console.log(`Trait teklifi veriliyor: ${collection} - ${trait}:${traitValue}`);
      
      // Aktif teklifimizi kontrol et
      const now = Date.now();
      if (task.offerExpirationTime && task.offerExpirationTime > now) {
        console.log(`${collection} - ${trait}:${traitValue} için aktif trait teklifi var: ${formatPrice(task.lastOfferPrice)} WETH`);
        console.log(`Kalan süre: ${Math.round((task.offerExpirationTime - now) / 1000)} saniye`);
        
        // loopTime 0 ise ve highOfferSkip aktif değilse, mevcut teklifin durumunu kontrol et
        if (task.settings.loopTime === 0 && !task.settings.highOfferSkip) {
          // Trait tekliflerini kontrol et
          const traitOffersResponse = await api.getTraitOffers(chain, collection, trait, traitValue);
          let hasOurOffer = false;
          
          if (traitOffersResponse && traitOffersResponse.offers) {
            for (const offer of traitOffersResponse.offers) {
              const offerMaker = offer.maker?.address || offer.protocol_data?.parameters?.offerer;
              if (offerMaker && offerMaker.toLowerCase() === config.walletAddress.toLowerCase()) {
                hasOurOffer = true;
                break;
              }
            }
          }
          
          if (!hasOurOffer) {
            console.log(`${collection} - ${trait}:${traitValue} için trait teklifimiz iptal edilmiş, yeni teklif verilecek.`);
            task.offerExpirationTime = null;
            task.lastOfferPrice = null;
          } else {
            console.log(`${collection} - ${trait}:${traitValue} için aktif trait teklifimiz devam ediyor, atlanıyor.`);
            return;
          }
        } else {
          // Normal durumda aktif teklif varsa atla
          return;
        }
      }
      
      // Trait için en iyi teklifi kontrol et
      const traitOffersResponse = await api.getTraitOffers(chain, collection, trait, traitValue);
      console.log('Trait teklifleri yanıtı:', JSON.stringify(traitOffersResponse));
      
      // API yanıtının yapısına göre en iyi teklifi al
      let bestOffer = null;
      if (traitOffersResponse && traitOffersResponse.offers && traitOffersResponse.offers.length > 0) {
        bestOffer = traitOffersResponse.offers[0];
      }
      
      console.log(`En iyi trait teklifi: ${bestOffer ? formatPrice(bestOffer.price) : 'Teklif yok'}`);
      
      // Teklif fiyatını hesapla
      const offerPrice = this._calculateOfferPrice(task, bestOffer);
      
      // Özel -1 değerini kontrol et (max price aşımı)
      if (offerPrice === -1) {
        console.log(`Trait teklifi: Max price limiti nedeniyle teklif verilmeyecek.`);
        return;
      }
      
      console.log(`Hesaplanan teklif fiyatı: ${formatPrice(offerPrice)} WETH`);
      
      // Eğer highOfferSkip etkinse ve zaten en yüksek teklif bizdeyse, atla
      if (task.settings.highOfferSkip && bestOffer && 
          bestOffer.protocol_data && bestOffer.protocol_data.parameters && 
          bestOffer.protocol_data.parameters.offerer && 
          bestOffer.protocol_data.parameters.offerer.toLowerCase() === config.walletAddress.toLowerCase()) {
        console.log(`En yüksek trait teklifi zaten bizde, atlanıyor: ${collection} - ${trait}:${traitValue}`);
        return;
      }
      
      // Teklif süresi hesapla
      const expirationTime = Date.now() + offerTime;
      
      // Teklif ver
      const offerResult = await api.createCriteriaOffer(
        chain, 
        collection, 
        trait, 
        traitValue, 
        offerPrice, 
        expirationTime
      );
      
      // Göreve teklif bilgilerini kaydet
      task.lastOfferPrice = offerPrice;
      task.lastOfferTime = Date.now();
      task.offerExpirationTime = expirationTime;
      
      console.log(`Trait teklifi başarıyla oluşturuldu:`, offerResult);
      console.log(`${collection} - ${trait}:${traitValue} - ${formatPrice(offerPrice)} WETH`);
      
      // Eğer counterbid etkinse, Stream API ile yeni teklifleri dinle
      if (counterbidEnabled) {
        this._setupTraitOfferListener(task, chain, collection, trait, traitValue);
        console.log(`Trait offer counterbid sistemi aktif - Stream dinleyicisi kuruldu.`);
      }
      
    } catch (error) {
      console.error(`Trait teklifi oluşturulurken hata: ${collection} - ${trait}:${traitValue}`, error);
      throw error;
    }
  }

  /**
   * Koleksiyon teklifi ver
   * @private
   * @param {object} task - Görev nesnesi
   */
  async _executeCollectionOffer(task) {
    const { chain, collection, offerTime, counterbidEnabled } = task.settings;
    
    try {
      console.log(`Koleksiyon teklifi veriliyor: ${collection}`);
      console.log(`CounterBid Enabled: ${counterbidEnabled}`);
      
      // Stream listener'lar setupStreamListeners'da kuruldu
      // Burada tekrar kurulmasına gerek yok
      
      // Aktif teklifimizi kontrol et
      const now = Date.now();
      
      // loopTime 0 ise HER ZAMAN mevcut teklifin durumunu kontrol et
      if (task.settings.loopTime === 0) {
        console.log(`loopTime 0 - Koleksiyon tekliflerini kontrol ediyorum...`);
        const collectionOffersResponse = await api.getCollectionOffers(chain, collection);
        let hasOurOffer = false;
        
        if (collectionOffersResponse && collectionOffersResponse.offers) {
          for (const offer of collectionOffersResponse.offers) {
            const offerMaker = offer.maker?.address || offer.protocol_data?.parameters?.offerer;
            if (offerMaker && offerMaker.toLowerCase() === config.walletAddress.toLowerCase()) {
              hasOurOffer = true;
              console.log(`Mevcut teklifimiz bulundu: ${formatPrice(offer.price)} WETH`);
              
              // highOfferSkip kontrolü
              if (task.settings.highOfferSkip && collectionOffersResponse.offers[0] === offer) {
                console.log(`En yüksek teklif bizde, highOfferSkip aktif - atlanıyor.`);
                return;
              }
              break;
            }
          }
        }
        
        if (!hasOurOffer) {
          console.log(`${collection} için aktif teklifimiz YOK - yeni teklif verilecek.`);
          task.offerExpirationTime = null;
          task.lastOfferPrice = null;
        } else if (task.offerExpirationTime && task.offerExpirationTime > now) {
          console.log(`${collection} için aktif teklifimiz VAR ve süresi dolmamış.`);
          console.log(`Kalan süre: ${Math.round((task.offerExpirationTime - now) / 1000)} saniye`);
          return;
        }
      } else if (task.offerExpirationTime && task.offerExpirationTime > now) {
        // loopTime 0 değilse ve aktif teklif varsa atla
        console.log(`${collection} için aktif koleksiyon teklifi var: ${formatPrice(task.lastOfferPrice)} WETH`);
        console.log(`Kalan süre: ${Math.round((task.offerExpirationTime - now) / 1000)} saniye`);
        return;
      }
      
      // Koleksiyon için en iyi teklifi kontrol et
      const collectionOffersResponse = await api.getCollectionOffers(chain, collection);
      console.log('Koleksiyon teklifleri yanıtı:', JSON.stringify(collectionOffersResponse, null, 2));
      
      // API yanıtının yapısına göre en iyi teklifi al
      let bestOffer = null;
      if (collectionOffersResponse && collectionOffersResponse.offers && collectionOffersResponse.offers.length > 0) {
        bestOffer = collectionOffersResponse.offers[0];
        console.log(`[DEBUG] En yüksek teklif detayı:`, JSON.stringify(bestOffer, null, 2));
      }
      
      console.log(`En iyi koleksiyon teklifi: ${bestOffer ? formatPrice(bestOffer.price) : 'Teklif yok'}`);
      
      // Teklif fiyatını hesapla
      const offerPrice = this._calculateOfferPrice(task, bestOffer);
      
      // Özel -1 değerini kontrol et (max price aşımı)
      if (offerPrice === -1) {
        console.log(`Koleksiyon teklifi: Max price limiti nedeniyle teklif verilmeyecek.`);
        return;
      }
      
      console.log(`Hesaplanan teklif fiyatı: ${formatPrice(offerPrice)} WETH`);
      
      // Eğer highOfferSkip etkinse ve zaten en yüksek teklif bizdeyse, atla
      if (task.settings.highOfferSkip && bestOffer && 
          bestOffer.protocol_data && bestOffer.protocol_data.parameters && 
          bestOffer.protocol_data.parameters.offerer && 
          bestOffer.protocol_data.parameters.offerer.toLowerCase() === config.walletAddress.toLowerCase()) {
        console.log(`En yüksek koleksiyon teklifi zaten bizde, atlanıyor: ${collection}`);
        return;
      }
      
      // Teklif süresi hesapla
      const expirationTime = Date.now() + offerTime;
      console.log(`[DEBUG] TaskManager Collection expirationTime hesaplama:`);
      console.log(`[DEBUG] - Date.now(): ${Date.now()}`);
      console.log(`[DEBUG] - offerTime: ${offerTime}`);
      console.log(`[DEBUG] - expirationTime: ${expirationTime}`);
      
      // Teklif ver
      const offerResult = await api.createCollectionOffer(
        chain, 
        collection, 
        offerPrice, 
        expirationTime
      );
      
      // Göreve teklif bilgilerini kaydet
      task.lastOfferPrice = offerPrice;
      task.lastOfferTime = Date.now();
      task.offerExpirationTime = expirationTime;
      
      // Son teklif zamanını kaydet (counter-bid için)
      this.lastOfferTime[task.name] = Date.now();
      
      // Collection offers objesini güncelle - CollectionOfferMonitorV2 için gerekli
      if (!this.collectionOffers) {
        this.collectionOffers = {};
      }
      
      const collectionKey = `collection-${collection}`;
      this.collectionOffers[collectionKey] = {
        price: offerPrice,
        taskName: task.name,
        expirationTime: expirationTime,
        chain: chain,
        contractAddress: getAbstractContractAddress ? getAbstractContractAddress(collection) : null,
        orderHash: offerResult.orderHash || offerResult.order_hash
      };
      
      console.log(`Koleksiyon teklifi başarıyla oluşturuldu:`, offerResult);
      console.log(`${collection} - ${formatPrice(offerPrice)} WETH`);
      console.log(`collectionOffers güncellendi:`, this.collectionOffers[collectionKey]);
      
      // Eğer counterbid etkinse ve daha önce kurulmamışsa, Stream API ile yeni teklifleri dinle
      if (counterbidEnabled && !task.listenerSetup) {
        await this._setupCollectionOfferListener(task, chain, collection);
        task.listenerSetup = true;
        console.log(`Collection offer counterbid sistemi aktif - Stream dinleyicisi kuruldu.`);
      }
      
    } catch (error) {
      console.error(`Koleksiyon teklifi oluşturulurken hata: ${collection}`, error);
      throw error;
    }
  }

  /**
   * Teklif fiyatını hesapla
   * @private
   * @param {object} task - Görev nesnesi
   * @param {object} bestOffer - En iyi teklif
   * @returns {number} - Hesaplanan teklif fiyatı
   */
  _calculateOfferPrice(task, bestOffer) {
    console.log(`[DEBUG] _calculateOfferPrice for task: ${task.name}`);
    console.log(`[DEBUG] Initial task minPrice: ${task.settings.minPrice}, maxPrice: ${task.settings.maxPrice}, counterbidAmount: ${task.settings.counterbidAmount}`);
    const { minPrice, maxPrice, counterbidEnabled, counterbidAmount } = task.settings;
    
    console.log(`Hesaplama başlıyor - Min: ${minPrice}, Max: ${maxPrice}, Counterbid: ${counterbidEnabled}, Miktar: ${counterbidAmount}`);
    
    // Eğer counterbid etkinse ve mevcut bir teklif varsa
    if (counterbidEnabled && bestOffer) {
      console.log('Mevcut teklif:', JSON.stringify(bestOffer));
      let currentPrice = 0;
      
      // API yanıt formatına göre fiyatı al
      if (bestOffer.price) {
        if (typeof bestOffer.price === 'number') {
          currentPrice = bestOffer.price;
        } else if (bestOffer.price.amount) {
          currentPrice = parseFloat(bestOffer.price.amount);
        } else if (bestOffer.price.value) {
          currentPrice = parseFloat(bestOffer.price.value);
        } else if (bestOffer.current_price) {
          currentPrice = parseFloat(bestOffer.current_price);
        }
      }
      
      console.log(`Mevcut fiyat (wei): ${currentPrice}`);
      
      // Wei'den ETH'e çevir (eğer gerekiyorsa)
      let currentPriceInETH = currentPrice;
      if (currentPrice > 1000000) { // Wei format ise
        currentPriceInETH = currentPrice / 1e18;
        console.log(`Wei'den ETH'e çevrildi: ${currentPriceInETH}`);
      }
      
      // Counterbid miktarını ekle
      let newPrice = currentPriceInETH + parseFloat(counterbidAmount || 0);
      console.log(`Counterbid sonrası fiyat: ${newPrice}`);
      
      // OpenSea 4 decimal precision için round et
      newPrice = Math.round(newPrice * 10000) / 10000;
      console.log(`Precision düzeltmesi sonrası: ${newPrice}`);
      
      // Maksimum fiyat kontrolü
      if (maxPrice && newPrice > maxPrice) {
        console.log(`Counterbid sonucu (${newPrice}) max price'ı (${maxPrice}) aşıyor.`);
        console.log(`Bu token için teklif VERİLMEYECEK!`);
        return -1; // Özel değer: teklif vermeme durumu
      }
      
      console.log(`Son hesaplanan fiyat: ${newPrice}`);
      console.log(`[DEBUG] Calculated offer price: ${newPrice}`);
      return newPrice;
    }
    
    // Counterbid yoksa veya mevcut teklif yoksa minimum fiyatı kullan
    console.log(`Varsayılan minimum fiyat kullanılıyor: ${minPrice}`);
    const defaultPrice = minPrice;
    console.log(`[DEBUG] Calculated offer price (defaulting to minPrice): ${defaultPrice}`);
    return defaultPrice;
  }
  
  /**
   * Trait teklifi için dinleyici kur
   * @private
   * @param {object} task - Görev nesnesi
   * @param {string} chain - Blockchain zinciri
   * @param {string} collection - Koleksiyon slug'u
   * @param {string} traitType - Trait tipi
   * @param {string} traitValue - Trait değeri
   */
  _setupTraitOfferListener(task, chain, collection, traitType, traitValue) {
    const taskName = task.name;
    console.log(`${taskName} görevi için trait teklif dinleyicisi kuruluyor...`);
    
    // Stream API ile trait tekliflerini dinle
    api.listenToTraitOffers(chain, collection, traitType, traitValue, async (event) => {
      // Görev hala aktif mi kontrol et
      if (!this.tasks[taskName] || !this.tasks[taskName].isActive) {
        console.log(`${taskName} görevi artık aktif değil, dinleyici durdurulacak.`);
        api.stopListener(`trait-offer-${collection}-${traitType}-${traitValue}`);
        return;
      }
      
      try {
        // Gelen teklif bizim mi kontrol et
        const offerAddress = event.payload?.protocol_data?.parameters?.offerer?.toLowerCase() || 
                           event.payload?.maker?.address?.toLowerCase() || 
                           event.maker?.toLowerCase();
        
        if (!offerAddress) {
          console.log(`Teklif sahibi bilgisi bulunamadı, event atlanıyor.`);
          return;
        }
        
        if (offerAddress === config.walletAddress.toLowerCase()) {
          console.log(`Kendi teklifimiz algılandı, işlem yapılmayacak.`);
          return;
        }
        
        console.log(`\n🔔 === YENİ TRAIT TEKLİFİ ===`);
        console.log(`Koleksiyon: ${collection} - ${traitType}:${traitValue}`);
        console.log(`Teklif sahibi: ${offerAddress}`);
        console.log(`Stream event fiyatı: ${formatPrice(event.payload?.price || event.price)} WETH`);
        console.log(`Order hash: ${event.payload?.order_hash || event.order_hash}`);
        console.log(`Zaman: ${new Date().toLocaleString()}`);
        
        // Stream event'inin gerçek bir teklif olup olmadığını doğrula
        console.log('Stream event doğrulanıyor...');
        
        // Counterbid yapabilir miyiz kontrol et
        if (task.settings.counterbidEnabled) {
          // Cooldown kontrolü
          const now = Date.now();
          const lastOffer = this.lastOfferTime[taskName] || 0;
          const cooldownMs = 10 * 1000;
          
          if (now - lastOffer < cooldownMs) {
            console.log(`Cooldown aktif - son teklif ${Math.round((now - lastOffer) / 1000)}s önce atıldı, ${Math.round((cooldownMs - (now - lastOffer)) / 1000)}s beklenecek.`);
            return;
          }
          
          console.log(`Yeni trait teklifi algılandı, en güncel teklifi API'den alınıyor...`);
          
          // En güncel trait teklifini API'den al
          const traitOffersResponse = await api.getTraitOffers(chain, collection, traitType, traitValue);
          let bestOffer = null;
          let streamEventFound = false;
          
          if (traitOffersResponse && traitOffersResponse.offers && traitOffersResponse.offers.length > 0) {
            bestOffer = traitOffersResponse.offers[0]; // En yüksek teklif
            
            // Stream event'inin API'de olup olmadığını kontrol et
            for (const offer of traitOffersResponse.offers) {
              if (offer.order_hash === event.payload?.order_hash || 
                  offer.order_hash === event.order_hash) {
                streamEventFound = true;
                console.log('✅ Stream event API\'de doğrulandı');
                break;
              }
            }
          }
          
          if (!streamEventFound) {
            console.log('⚠️ Stream event API\'de bulunamadı - muhtemelen test/iptal edilmiş teklif');
            console.log(`Event order_hash: ${event.payload?.order_hash || event.order_hash}`);
            console.log('Counter-bid yapılmayacak.');
            return;
          }
          
          if (!bestOffer) {
            console.log(`Trait için mevcut teklif bulunamadı, counterbid yapılmayacak.`);
            return;
          }
          
          console.log(`En güncel trait teklifi: ${formatPrice(bestOffer.price)} WETH`);
          
          // Bizim mevcut teklifimizi bul
          let ourCurrentOffer = null;
          for (const offer of traitOffersResponse.offers) {
            const offerMaker = offer.maker?.address || offer.protocol_data?.parameters?.offerer;
            if (offerMaker && offerMaker.toLowerCase() === config.walletAddress.toLowerCase()) {
              ourCurrentOffer = offer;
              break;
            }
          }
          
          // Eğer bizim bir teklifimiz varsa, yeni teklifi bizimkiyle karşılaştır
          if (ourCurrentOffer) {
            // API'den gelen fiyat formatlarını düzgün işle
            let ourPrice = 0;
            let newOfferPrice = 0;
            
            // Bizim teklifimizin fiyatını al
            if (ourCurrentOffer.current_price) {
              // Wei formatında string olabilir
              if (typeof ourCurrentOffer.current_price === 'string' && ourCurrentOffer.current_price.length > 10) {
                ourPrice = parseFloat(ethers.formatEther(ourCurrentOffer.current_price));
              } else {
                ourPrice = parseFloat(ourCurrentOffer.current_price);
              }
            } else if (ourCurrentOffer.price) {
              if (typeof ourCurrentOffer.price === 'object' && ourCurrentOffer.price.amount) {
                ourPrice = parseFloat(ourCurrentOffer.price.amount);
              } else {
                ourPrice = parseFloat(ourCurrentOffer.price);
              }
            }
            
            // En yüksek teklifin fiyatını al
            if (bestOffer.current_price) {
              // Wei formatında string olabilir
              if (typeof bestOffer.current_price === 'string' && bestOffer.current_price.length > 10) {
                newOfferPrice = parseFloat(ethers.formatEther(bestOffer.current_price));
              } else {
                newOfferPrice = parseFloat(bestOffer.current_price);
              }
            } else if (bestOffer.price) {
              if (typeof bestOffer.price === 'object' && bestOffer.price.amount) {
                newOfferPrice = parseFloat(bestOffer.price.amount);
              } else {
                newOfferPrice = parseFloat(bestOffer.price);
              }
            }
            
            console.log(`Bizim mevcut teklifimiz: ${formatPrice(ourPrice)} WETH`);
            console.log(`Yeni gelen teklif: ${formatPrice(newOfferPrice)} WETH`);
            
            // Eğer yeni teklif bizimkinden düşük veya eşitse, counter-bid yapma
            if (newOfferPrice <= ourPrice) {
              console.log(`Yeni teklif (${formatPrice(newOfferPrice)}) bizim teklifimizden (${formatPrice(ourPrice)}) düşük veya eşit. Counter-bid yapılmayacak.`);
              return;
            }
            
            console.log(`Yeni teklif bizimkinden yüksek, counter-bid yapılacak.`);
          } else {
            console.log(`Bizim mevcut bir teklifimiz yok, yeni teklif verilecek.`);
          }
          
          // Yeni teklif fiyatını hesapla
          const newPrice = this._calculateOfferPrice(task, bestOffer);
          
          // Özel -1 değerini kontrol et (max price aşımı)
          if (newPrice === -1) {
            console.log(`Counterbid: Max price limiti nedeniyle teklif verilmeyecek.`);
            return;
          }
          
          console.log(`Counterbid yapılıyor: ${formatPrice(newPrice)} WETH`);
          
          // Teklif süresi hesapla
          const expirationTime = Date.now() + task.settings.offerTime;
          
          // Teklif ver
          const offerResult = await api.createCriteriaOffer(
            chain, 
            collection, 
            traitType, 
            traitValue, 
            newPrice, 
            expirationTime
          );
          
          // Son teklif zamanını kaydet
          this.lastOfferTime[taskName] = Date.now();
          
          console.log(`Counterbid başarıyla oluşturuldu:`, offerResult);
          console.log(`${collection} - ${traitType}:${traitValue} - ${formatPrice(newPrice)} WETH`);
        }
      } catch (error) {
        console.error(`Counterbid işlemi sırasında hata oluştu:`, error);
      }
    });
  }
  
  /**
   * Koleksiyon teklifi için dinleyici kur
   * @private
   * @param {object} task - Görev nesnesi
   * @param {string} chain - Blockchain zinciri
   * @param {string} collection - Koleksiyon slug'u
   */
  async _setupCollectionOfferListener(task, chain, collection) {
    const taskName = task.name;
    console.log(`\n🎯 === COLLECTION OFFER LISTENER SETUP ===`);
    console.log(`Task: ${taskName}`);
    console.log(`Chain: ${chain}`);
    console.log(`Collection: ${collection}`);
    console.log(`CounterBid Enabled: ${task.settings.counterbidEnabled}`);
    
    // Contract address al
    let contractAddress = null;
    
    try {
      // Abstract chain için özel handling
      if (chain === 'abstract') {
        contractAddress = getAbstractContractAddress(collection);
        if (!contractAddress) {
          const collectionInfo = await api.getCollectionInfo(collection);
          contractAddress = collectionInfo.contractAddress;
        }
      } else {
        // Diğer chainler için API'den al
        const collectionInfo = await api.getCollectionInfo(collection);
        contractAddress = collectionInfo.contractAddress;
      }
    } catch (error) {
      console.error(`Contract address alınamadı: ${error.message}`);
      // Contract address bulunamazsa collection slug kullan
      contractAddress = collection;
    }
    
    console.log(`Contract address: ${contractAddress}`);
    
    // CollectionOfferMonitorV2 üzerinden listener kur
    this.collectionMonitor.setupCollectionListener(task, contractAddress, null);
    console.log(`✅ CollectionOfferMonitorV2 üzerinden listener kuruldu`);
    
    // Collection offers kaydını başlat
    if (!this.collectionOffers) {
      this.collectionOffers = {};
    }
    
    return true;
  }
  
  /**
   * Süresi dolan token tekliflerini temizle
   * @private
   */
  _cleanupExpiredTokenOffers() {
    const now = Date.now();
    for (const tokenKey in this.tokenOffers) {
      const offer = this.tokenOffers[tokenKey];
      if (offer.expirationTime < now) {
        console.log(`Süresi dolan teklif temizlendi: ${tokenKey}`);
        delete this.tokenOffers[tokenKey];
        
        // Dinleyiciyi de durdur
        if (this.tokenListeners[tokenKey]) {
          const [contractAddress, tokenId] = tokenKey.split('-');
          api.stopListener(`item-received-offer-${contractAddress}-${tokenId}`);
          delete this.tokenListeners[tokenKey];
        }
      }
    }
  }

  /**
   * Token teklifi için dinleyici kur
   * @private
   * @param {object} task - Görev nesnesi
   * @param {string} chain - Blockchain zinciri
   * @param {string} collectionSlug - Koleksiyon slug'ı veya contract adresi
   * @param {string} tokenId - Token ID
   */
  async _setupTokenOfferListener(task, chain, collectionSlug, tokenId) {
    const taskName = task.name;
    console.log(`\n🎯 === TOKEN OFFER LISTENER SETUP ===`);
    console.log(`Task: ${taskName}`);
    console.log(`Chain: ${chain}`);
    console.log(`Collection: ${collectionSlug}`);
    console.log(`Token ID: ${tokenId}`);
    console.log(`Counter-bid enabled: ${task.settings.counterbidEnabled}`);
    
    // Collection slug'dan contract address'i al
    let contractAddress = collectionSlug;
    if (!collectionSlug.startsWith('0x')) {
      try {
        // Abstract chain için sabit mapping kullan
        if (chain === 'abstract' && collectionSlug === 'pengztracted-abstract') {
          contractAddress = '0xa6C46c07F7f1966D772E29049175EBBa26262513';
          console.log(`Abstract collection için sabit contract address kullanıldı: ${contractAddress}`);
        } else {
          const collectionInfo = await api.getCollectionInfo(collectionSlug);
          contractAddress = collectionInfo.contractAddress;
          console.log(`Collection slug'dan contract address alındı: ${contractAddress}`);
        }
      } catch (error) {
        console.error(`Collection bilgileri alınamadı: ${collectionSlug}`, error);
        return;
      }
    }
    
    // Stream API dinleyicisi kur - collectionSlug kullan, contractAddress değil!
    console.log(`\n📡 CollectionOfferMonitorV2.setupCollectionListener çağrılıyor...`);
    console.log(`Collection Slug: ${collectionSlug}`);
    console.log(`Contract Address: ${contractAddress}`);
    console.log(`Token ID: ${tokenId}`);
    console.log(`Task Type: ${task.settings.type}`);
    
    // IMPORTANT: collectionSlug kullan, contractAddress değil!
    // Çünkü tokenOffers key'leri collectionSlug-tokenId formatında
    this.collectionMonitor.setupCollectionListener(task, collectionSlug, tokenId);
    console.log(`✅ Stream API dinleyicisi kuruldu: ${collectionSlug} #${tokenId}`)
    
    // Token listener kaydını tut - collection slug ile kaydet (currentTokenKey ile aynı olmalı)
    const listenerTokenKey = `${collectionSlug}-${tokenId}`;
    this.tokenListeners[listenerTokenKey] = true;
    console.log(`📌 Token listener kaydedildi: ${listenerTokenKey}`);
    
    return;
  }
  
  /**
   * Task için stream listener'ları kur
   * @param {object} task - Task objesi
   */
  async setupStreamListeners(task) {
    const { type, collection, chain, counterbidEnabled } = task.settings;
    
    console.log(`\n🔧 Stream Listener Kurulumu - Task: ${task.name}`);
    console.log(`Type: ${type}, Collection: ${collection}, Chain: ${chain}`);
    console.log(`CounterBid: ${counterbidEnabled}`);
    
    // Sadece counterbid etkinse listener kur
    if (!counterbidEnabled) {
      console.log('CounterBid kapalı, listener kurulmayacak');
      return;
    }
    
    switch (type.toLowerCase()) {
      case config.offerTypes.COLLECTION_OFFER:
        // Collection offer için listener kur
        console.log('📡 Collection offer listener kuruluyor...');
        
        // Contract address al
        let contractAddress = null;
        if (chain === 'abstract') {
          contractAddress = getAbstractContractAddress(collection);
          if (!contractAddress) {
            try {
              const collectionInfo = await api.getCollectionInfo(collection);
              contractAddress = collectionInfo.contractAddress;
            } catch (error) {
              console.error(`Contract address alınamadı: ${error.message}`);
              return;
            }
          }
        }
        
        // CollectionMonitor üzerinden listener kur
        this.collectionMonitor.setupCollectionListener(task, contractAddress || collection, null);
        console.log('✅ Collection offer listener kuruldu');
        break;
        
      case config.offerTypes.TOKEN_OFFER:
        // Token offer listener'ları _executeTokenOffer içinde kurulacak
        console.log('📡 Token offer listener\'ları teklif anında kurulacak');
        break;
        
      case config.offerTypes.CRITERIA_OFFER:
        // Criteria offer için listener (ileride eklenecek)
        console.log('⚠️ Criteria offer listener henüz desteklenmiyor');
        break;
    }
  }
  
  /**
   * Counter-bid event handler (CollectionOfferMonitor'dan çağrılır)
   */
  async _handleTokenOfferEvent(task, contractAddress, tokenId, event) {
    const taskName = task.name;
    
    // Görev hala aktif mi kontrol et
    if (!this.tasks[taskName] || !this.tasks[taskName].isActive) {
      console.log(`${taskName} görevi artık aktif değil.`);
      return;
    }
    
    try {
      // Event payload'ı al - CollectionOfferMonitorV2'den gelen format
      const offerData = event.payload?.payload || event.payload || event;
      
      // Gelen teklif bizim mi kontrol et
      const offerAddress = offerData.protocol_data?.parameters?.offerer?.toLowerCase() || 
                         offerData.maker?.address?.toLowerCase() ||
                         offerData.maker?.toLowerCase();
      
      if (!offerAddress) {
        console.log(`Teklif sahibi bilgisi bulunamadı, event atlanıyor.`);
        console.log('Debug - offerData:', JSON.stringify(offerData).substring(0, 200));
        return;
      }
      
      if (offerAddress === config.walletAddress.toLowerCase()) {
        console.log(`Kendi teklifimiz algılandı, işlem yapılmayacak.`);
        return;
      }
      
      // Fiyat bilgisini al
      const priceWei = offerData.base_price || '0';
      const priceETH = parseFloat(ethers.formatEther(priceWei));
      
      // Minimal doğrulama - sadece çok temel kontroller
      console.log('\n🔍 Stream Event Doğrulama:');
      
      // Sadece fiyat kontrolü - çok düşük teklifleri filtrele
      if (priceETH < 0.0001) {
        console.log(`❌ Teklif fiyatı çok düşük (${priceETH} ETH)`);
        return;
      }
      
      console.log('✅ Teklif geçerli görünüyor');
      
      console.log(`\n🔔 === YENİ TOKEN TEKLİFİ ===`);
      console.log(`Token: ${contractAddress} #${tokenId}`);
      console.log(`Teklif sahibi: ${offerAddress}`);
      
      console.log(`Stream event fiyatı: ${formatPrice(priceETH)} WETH`);
      console.log(`Order hash: ${offerData.order_hash}`);
      console.log(`Zaman: ${new Date().toLocaleString()}`);
      
      // Stream event'inin gerçek bir teklif olup olmadığını doğrula
      console.log('Stream event doğrulanıyor...');
      
      // Counterbid yapabilir miyiz kontrol et
      if (task.settings.counterbidEnabled) {
        // Cooldown kontrolü
        const now = Date.now();
        const lastOffer = this.lastOfferTime[taskName] || 0;
        const cooldownMs = 10 * 1000;
        
        if (now - lastOffer < cooldownMs) {
          console.log(`Cooldown aktif - son teklif ${Math.round((now - lastOffer) / 1000)}s önce atıldı, ${Math.round((cooldownMs - (now - lastOffer)) / 1000)}s beklenecek.`);
          return;
        }
        
        console.log(`Yeni token teklifi algılandı, en güncel teklifi API'den alınıyor...`);
        
        // En güncel token tekliflerini API'den al
        const nftResponse = await api.getNFT(task.settings.chain, contractAddress, tokenId);
        let allOffers = [];
        let streamEventFound = false;
        
        if (nftResponse && nftResponse.nft && nftResponse.nft.orders) {
          // Sadece offer tipindeki emirleri filtrele
          allOffers = nftResponse.nft.orders.filter(order => 
            order.type === 'bid' || order.type === 'english' || order.type === 'criteria'
          );
          
          // Stream event'inin API'de olup olmadığını kontrol et
          const eventOrderHash = offerData.order_hash;
          for (const offer of allOffers) {
            if (offer.order_hash === eventOrderHash) {
              streamEventFound = true;
              console.log('✅ Stream event API\'de doğrulandı');
              console.log(`Eşleşen order hash: ${offer.order_hash}`);
              break;
            }
          }
        }
        
        // API doğrulaması yerine Stream doğrulamasına güveniyoruz
        if (!streamEventFound) {
          console.log('ℹ️ Stream event API\'de henüz görünmüyor (normal - Stream daha hızlı)');
          // Stream doğrulamaları geçtiyse devam et
        }
        
        // Stream event'i var ama API'de henüz teklif görünmüyorsa devam et
        if (allOffers.length === 0 && !priceETH) {
          console.log(`Token için ne API'de ne de Stream event'te teklif bulunamadı, counterbid yapılmayacak.`);
          return;
        }
        
        // En yüksek teklifi bul - API'de yoksa Stream event'ten gelen fiyatı kullan
        let bestOfferPrice = 0;
        if (allOffers.length > 0) {
          const bestOffer = allOffers[0];
          bestOfferPrice = parseFloat(bestOffer.current_price);
          console.log(`API'den en yüksek teklif: ${formatPrice(bestOfferPrice)} WETH`);
        } else {
          // API'de teklif yoksa Stream event'ten gelen fiyatı kullan
          bestOfferPrice = priceETH;
          console.log(`Stream event'ten gelen fiyat kullanılıyor: ${formatPrice(bestOfferPrice)} WETH`);
        }
        
        // Bu token için kayıtlı teklifimizi kontrol et
        // tokenOffers'ta collection slug kullanılıyor, contract address değil!
        const collectionSlug = task.settings.collection;
        const listenerTokenKey = `${collectionSlug}-${tokenId}`;
        const contractTokenKey = `${contractAddress}-${tokenId}`;
        
        // Önce collection slug ile dene, yoksa contract address ile dene
        let ourTrackedOffer = this.tokenOffers[listenerTokenKey];
        if (!ourTrackedOffer) {
          ourTrackedOffer = this.tokenOffers[contractTokenKey];
          console.log(`Collection slug key bulunamadı, contract address deneniyor: ${contractTokenKey}`);
        }
        
        if (!ourTrackedOffer) {
          console.log(`Bu token için kayıtlı bir teklifimiz yok. Dinleyici durduruluyor.`);
          this.collectionMonitor.removeToken(contractAddress, tokenId);
          delete this.tokenListeners[listenerTokenKey];
          return;
        }
        
        // Bizim kayıtlı fiyatımız
        const ourPrice = ourTrackedOffer.price;
        
        console.log(`Bizim kayıtlı teklifimiz: ${formatPrice(ourPrice)} WETH`);
        console.log(`Yeni gelen en yüksek teklif: ${formatPrice(bestOfferPrice)} WETH`);
        
        // Eğer yeni teklif bizimkinden düşük veya eşitse, counter-bid yapma
        if (bestOfferPrice <= ourPrice) {
          console.log(`Yeni teklif (${formatPrice(bestOfferPrice)}) bizim teklifimizden (${formatPrice(ourPrice)}) düşük veya eşit. Counter-bid yapılmayacak.`);
          return;
        }
        
        // Token teklifleri için: En yüksek teklif max price'dan yüksekse counter-bid yapma
        if (task.settings.type === config.offerTypes.TOKEN_OFFER && bestOfferPrice > task.settings.maxPrice) {
          console.log(`En yüksek teklif (${formatPrice(bestOfferPrice)}) maksimum fiyatı (${formatPrice(task.settings.maxPrice)}) aşıyor. Token teklifleri için counter-bid yapılmayacak.`);
          return;
        }
        
        // En yüksek teklifin bizim olup olmadığını kontrol et (Stream event'ten gelen maker'ı kullan)
        const bestOfferMaker = offerAddress; // Zaten yukarıda kontrol edildi
        if (bestOfferMaker && bestOfferMaker.toLowerCase() === config.walletAddress.toLowerCase()) {
          console.log(`En yüksek teklif zaten bizim teklifimiz. Counter-bid yapılmayacak.`);
          return;
        }
        
        console.log(`Yeni teklif bizimkinden yüksek, counter-bid yapılacak.`)
        
        // En yüksek teklif zaten max price'ın üzerindeyse teklif verme
        if (bestOfferPrice > task.settings.maxPrice) {
          console.log(`En yüksek teklif (${formatPrice(bestOfferPrice)}) max price'ı (${formatPrice(task.settings.maxPrice)}) aşıyor, teklif verilmeyecek.`);
          return;
        }
        
        // Yeni teklif fiyatını hesapla - Stream event'ten gelen fiyatla
        const mockBestOffer = {
          price: bestOfferPrice,
          current_price: bestOfferPrice
        };
        const newPrice = this._calculateOfferPrice(task, mockBestOffer);
        
        // Özel -1 değerini kontrol et (max price aşımı)
        if (newPrice === -1) {
          console.log(`Counterbid: Max price limiti nedeniyle teklif verilmeyecek.`);
          return;
        }
        
        console.log(`Counterbid yapılıyor: ${formatPrice(newPrice)} WETH`);
        
        // Teklif süresi hesapla
        const expirationTime = Date.now() + task.settings.offerTime;
        
        // Teklif ver
        const offerResult = await api.createTokenOffer(
          task.settings.chain, 
          contractAddress, 
          tokenId, 
          newPrice, 
          expirationTime
        );
        
        // Son teklif zamanını kaydet
        this.lastOfferTime[taskName] = Date.now();
        
        // Token teklifini güncelle
        this.tokenOffers[listenerTokenKey] = {
          price: newPrice,
          taskName: taskName,
          expirationTime: expirationTime,
          chain: task.settings.chain,
          contractAddress: contractAddress
        };
        
        console.log(`Counterbid başarıyla oluşturuldu:`, offerResult);
        console.log(`${contractAddress} #${tokenId} - ${formatPrice(newPrice)} WETH`);
      }
    } catch (error) {
      console.error(`Counterbid işlemi sırasında hata oluştu:`, error);
    }
  }

  /**
   * Aktif token tekliflerini listele
   * @returns {object} Aktif token teklifleri
   */
  getActiveTokenOffers() {
    const now = Date.now();
    const activeOffers = {};
    
    for (const tokenKey in this.tokenOffers) {
      const offer = this.tokenOffers[tokenKey];
      if (offer.expirationTime > now) {
        activeOffers[tokenKey] = {
          ...offer,
          timeRemaining: Math.round((offer.expirationTime - now) / 1000) + ' saniye',
          hasListener: !!this.tokenListeners[tokenKey]
        };
      }
    }
    
    return activeOffers;
  }
}

module.exports = new TaskManager();
