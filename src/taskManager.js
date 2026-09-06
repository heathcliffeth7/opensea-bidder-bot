const config = require('../config');
const api = require('./api');
const { parseTaskCommand, parseTimeToMs, formatPrice } = require('../utils/helpers');
const { ethers } = require('ethers');

/**
 * Görev yönetimi için sınıf
 */
class TaskManager {
  constructor() {
    this.tasks = {};
    this.activeTasks = [];
    this.taskIntervals = {};
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
      lastRun: null,
      createdAt: new Date(),
      status: 'created'
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
    this.activeTasks.push(taskName);
    
    // Görev türüne göre işlemi başlat
    this._executeTask(taskName);
    
    // Döngü zamanı ayarlanmışsa, periyodik olarak çalıştır
    if (task.settings.loopTime > 0) {
      this.taskIntervals[taskName] = setInterval(() => {
        this._executeTask(taskName);
      }, task.settings.loopTime);
    }
    
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
    this.activeTasks = this.activeTasks.filter(name => name !== taskName);
    
    // Varsa interval'i temizle
    if (this.taskIntervals[taskName]) {
      clearInterval(this.taskIntervals[taskName]);
      delete this.taskIntervals[taskName];
    }
    
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
    console.log(`"${taskName}" görevi yürütülüyor...`);
    
    try {
      const { chain, collection, type } = task.settings;
      
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
          return;
      }
      
      // Son çalışma zamanını güncelle
      task.lastRun = new Date();
      console.log(`"${taskName}" görevi başarıyla tamamlandı.`);
      
    } catch (error) {
      console.error(`"${taskName}" görevi yürütülürken hata oluştu:`, error);
      task.status = 'error';
    }
  }

  /**
   * Token teklifi ver
   * @private
   * @param {object} task - Görev nesnesi
   */
  async _executeTokenOffer(task) {
    const { chain, collection, minPrice, maxPrice, offerTime, tokenIds, counterbidEnabled } = task.settings;
    
    if (!tokenIds || tokenIds.length === 0) {
      throw new Error('Token teklifi için tokenId listesi gerekli.');
    }
    
    console.log(`${tokenIds.length} adet token için teklif veriliyor...`);
    
    for (const tokenId of tokenIds) {
      try {
        // NFT bilgilerini al
        const nftInfo = await api.getNFTInfo(chain, collection, tokenId);
        console.log(`NFT bilgileri alındı: ${collection} #${tokenId}`);
        
        // En iyi teklifi kontrol et
        const bestOfferResponse = await api.getBestOfferForNFT(chain, collection, tokenId);
        console.log('En iyi teklif yanıtı:', JSON.stringify(bestOfferResponse));
        
        // API yanıtının yapısına göre en iyi teklifi al
        let bestOffer = null;
        if (bestOfferResponse && bestOfferResponse.offer) {
          bestOffer = bestOfferResponse.offer;
        }
        
        console.log(`En iyi teklif: ${bestOffer ? formatPrice(bestOffer.price) : 'Teklif yok'}`);
        
        // Teklif fiyatını hesapla
        const offerPrice = this._calculateOfferPrice(task, bestOffer);
        console.log(`Hesaplanan teklif fiyatı: ${formatPrice(offerPrice)} WETH`);
        
        // Eğer highOfferSkip etkinse ve zaten en yüksek teklif bizdeyse, atla
        if (task.settings.highOfferSkip && bestOffer && 
            bestOffer.protocol_data && bestOffer.protocol_data.parameters && 
            bestOffer.protocol_data.parameters.offerer && 
            bestOffer.protocol_data.parameters.offerer.toLowerCase() === config.walletAddress.toLowerCase()) {
          console.log(`En yüksek teklif zaten bizde, atlanıyor: ${collection} #${tokenId}`);
          continue;
        }
        
        // Teklif süresi hesapla
        const expirationTime = Date.now() + offerTime;
        
        // Teklif ver
        const offerResult = await api.createTokenOffer(
          chain, 
          collection, 
          tokenId, 
          offerPrice, 
          expirationTime
        );
        
        console.log(`Teklif başarıyla oluşturuldu:`, offerResult);
        console.log(`${collection} #${tokenId} - ${formatPrice(offerPrice)} WETH`);
        
        // Eğer counterbid etkinse, Stream API ile yeni teklifleri dinle
        if (counterbidEnabled) {
          this._setupTokenOfferListener(task, chain, collection, tokenId);
        }
        
        // API sınırlamalarını aşmamak için bekle
        await new Promise(resolve => setTimeout(resolve, config.requestDelay));
        
      } catch (error) {
        console.error(`Token teklifi oluşturulurken hata: ${collection} #${tokenId}`, error);
      }
    }
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
      chain, collection, minPrice, maxPrice, offerTime, 
      trait, traitValue, counterbidEnabled, counterbidAmount
    } = task.settings;
    
    if (!trait || !traitValue) {
      throw new Error('Criteria teklifi için trait ve traitValue gerekli.');
    }
    
    try {
      console.log(`Trait teklifi veriliyor: ${collection} - ${trait}:${traitValue}`);
      
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
      
      console.log(`Trait teklifi başarıyla oluşturuldu:`, offerResult);
      console.log(`${collection} - ${trait}:${traitValue} - ${formatPrice(offerPrice)} WETH`);
      
      // Eğer counterbid etkinse, Stream API ile yeni teklifleri dinle
      if (counterbidEnabled) {
        this._setupTraitOfferListener(task, chain, collection, trait, traitValue);
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
    const { chain, collection, minPrice, maxPrice, offerTime, counterbidEnabled } = task.settings;
    
    try {
      console.log(`Koleksiyon teklifi veriliyor: ${collection}`);
      
      // Koleksiyon için en iyi teklifi kontrol et
      const collectionOffersResponse = await api.getCollectionOffers(chain, collection);
      console.log('Koleksiyon teklifleri yanıtı:', JSON.stringify(collectionOffersResponse));
      
      // API yanıtının yapısına göre en iyi teklifi al
      let bestOffer = null;
      if (collectionOffersResponse && collectionOffersResponse.offers && collectionOffersResponse.offers.length > 0) {
        bestOffer = collectionOffersResponse.offers[0];
      }
      
      console.log(`En iyi koleksiyon teklifi: ${bestOffer ? formatPrice(bestOffer.price) : 'Teklif yok'}`);
      
      // Teklif fiyatını hesapla
      const offerPrice = this._calculateOfferPrice(task, bestOffer);
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
      
      // Teklif ver
      const offerResult = await api.createCollectionOffer(
        chain, 
        collection, 
        offerPrice, 
        expirationTime
      );
      
      console.log(`Koleksiyon teklifi başarıyla oluşturuldu:`, offerResult);
      console.log(`${collection} - ${formatPrice(offerPrice)} WETH`);
      
      // Eğer counterbid etkinse, Stream API ile yeni teklifleri dinle
      if (counterbidEnabled) {
        this._setupCollectionOfferListener(task, chain, collection);
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
      
      console.log(`Mevcut fiyat: ${currentPrice}`);
      
      // Counterbid miktarını ekle
      let newPrice = currentPrice + parseFloat(counterbidAmount || 0);
      console.log(`Counterbid sonrası fiyat: ${newPrice}`);
      
      // Maksimum fiyat kontrolü
      if (maxPrice && newPrice > maxPrice) {
        console.log(`Fiyat maksimum sınırı (${maxPrice}) aşıyor, ayarlanıyor...`);
        newPrice = maxPrice;
      }
      
      // Minimum fiyat kontrolü
      if (minPrice && newPrice < minPrice) {
        console.log(`Fiyat minimum sınırın (${minPrice}) altında, ayarlanıyor...`);
        newPrice = minPrice;
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
        const offerAddress = event.payload.protocol_data.parameters.offerer.toLowerCase();
        if (offerAddress === config.walletAddress.toLowerCase()) {
          console.log(`Kendi teklifimiz algılandı, işlem yapılmayacak.`);
          return;
        }
        
        console.log(`Yeni trait teklifi algılandı: ${collection} - ${traitType}:${traitValue}`);
        console.log(`Teklif sahibi: ${offerAddress}`);
        console.log(`Teklif fiyatı: ${formatPrice(event.payload.price)} WETH`);
        
        // Counterbid yapabilir miyiz kontrol et
        if (task.settings.counterbidEnabled) {
          // Mevcut teklifi al
          const currentOffer = {
            price: event.payload.price
          };
          
          // Yeni teklif fiyatını hesapla
          const newPrice = this._calculateOfferPrice(task, currentOffer);
          
          // Maksimum fiyatı aşıp aşmadığını kontrol et
          if (newPrice > task.settings.maxPrice) {
            console.log(`Hesaplanan fiyat (${formatPrice(newPrice)}) maksimum fiyatı (${formatPrice(task.settings.maxPrice)}) aşıyor. Teklif verilmeyecek.`);
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
  _setupCollectionOfferListener(task, chain, collection) {
    const taskName = task.name;
    console.log(`${taskName} görevi için koleksiyon teklif dinleyicisi kuruluyor...`);
    
    // Stream API ile koleksiyon tekliflerini dinle
    api.listenToCollectionOffers(chain, collection, async (event) => {
      // Görev hala aktif mi kontrol et
      if (!this.tasks[taskName] || !this.tasks[taskName].isActive) {
        console.log(`${taskName} görevi artık aktif değil, dinleyici durdurulacak.`);
        api.stopListener(`collection-offer-${collection}`);
        return;
      }
      
      try {
        // Gelen teklif bizim mi kontrol et
        const offerAddress = event.payload.protocol_data.parameters.offerer.toLowerCase();
        if (offerAddress === config.walletAddress.toLowerCase()) {
          console.log(`Kendi teklifimiz algılandı, işlem yapılmayacak.`);
          return;
        }
        
        console.log(`Yeni koleksiyon teklifi algılandı: ${collection}`);
        console.log(`Teklif sahibi: ${offerAddress}`);
        console.log(`Teklif fiyatı: ${formatPrice(event.payload.price)} WETH`);
        
        // Counterbid yapabilir miyiz kontrol et
        if (task.settings.counterbidEnabled) {
          // Mevcut teklifi al
          const currentOffer = {
            price: event.payload.price
          };
          
          // Yeni teklif fiyatını hesapla
          const newPrice = this._calculateOfferPrice(task, currentOffer);
          
          // Maksimum fiyatı aşıp aşmadığını kontrol et
          if (newPrice > task.settings.maxPrice) {
            console.log(`Hesaplanan fiyat (${formatPrice(newPrice)}) maksimum fiyatı (${formatPrice(task.settings.maxPrice)}) aşıyor. Teklif verilmeyecek.`);
            return;
          }
          
          console.log(`Counterbid yapılıyor: ${formatPrice(newPrice)} WETH`);
          
          // Teklif süresi hesapla
          const expirationTime = Date.now() + task.settings.offerTime;
          
          // Teklif ver
          const offerResult = await api.createCollectionOffer(
            chain, 
            collection, 
            newPrice, 
            expirationTime
          );
          
          console.log(`Counterbid başarıyla oluşturuldu:`, offerResult);
          console.log(`${collection} - ${formatPrice(newPrice)} WETH`);
        }
      } catch (error) {
        console.error(`Counterbid işlemi sırasında hata oluştu:`, error);
      }
    });
  }
  
  /**
   * Token teklifi için dinleyici kur
   * @private
   * @param {object} task - Görev nesnesi
   * @param {string} chain - Blockchain zinciri
   * @param {string} contractAddress - Kontrat adresi
   * @param {string} tokenId - Token ID
   */
  _setupTokenOfferListener(task, chain, contractAddress, tokenId) {
    const taskName = task.name;
    console.log(`${taskName} görevi için token teklif dinleyicisi kuruluyor...`);
    
    // Stream API ile token tekliflerini dinle
    api.listenToItemOffers(chain, contractAddress, tokenId, async (event) => {
      // Görev hala aktif mi kontrol et
      if (!this.tasks[taskName] || !this.tasks[taskName].isActive) {
        console.log(`${taskName} görevi artık aktif değil, dinleyici durdurulacak.`);
        api.stopListener(`item-received-offer-${contractAddress}-${tokenId}`);
        return;
      }
      
      try {
        // Gelen teklif bizim mi kontrol et
        const offerAddress = event.payload.protocol_data.parameters.offerer.toLowerCase();
        if (offerAddress === config.walletAddress.toLowerCase()) {
          console.log(`Kendi teklifimiz algılandı, işlem yapılmayacak.`);
          return;
        }
        
        console.log(`Yeni token teklifi algılandı: ${contractAddress} #${tokenId}`);
        console.log(`Teklif sahibi: ${offerAddress}`);
        console.log(`Teklif fiyatı: ${formatPrice(event.payload.price)} WETH`);
        
        // Counterbid yapabilir miyiz kontrol et
        if (task.settings.counterbidEnabled) {
          // Mevcut teklifi al
          const currentOffer = {
            price: event.payload.price
          };
          
          // Yeni teklif fiyatını hesapla
          const newPrice = this._calculateOfferPrice(task, currentOffer);
          
          // Maksimum fiyatı aşıp aşmadığını kontrol et
          if (newPrice > task.settings.maxPrice) {
            console.log(`Hesaplanan fiyat (${formatPrice(newPrice)}) maksimum fiyatı (${formatPrice(task.settings.maxPrice)}) aşıyor. Teklif verilmeyecek.`);
            return;
          }
          
          console.log(`Counterbid yapılıyor: ${formatPrice(newPrice)} WETH`);
          
          // Teklif süresi hesapla
          const expirationTime = Date.now() + task.settings.offerTime;
          
          // Teklif ver
          const offerResult = await api.createTokenOffer(
            chain, 
            contractAddress, 
            tokenId, 
            newPrice, 
            expirationTime
          );
          
          console.log(`Counterbid başarıyla oluşturuldu:`, offerResult);
          console.log(`${contractAddress} #${tokenId} - ${formatPrice(newPrice)} WETH`);
        }
      } catch (error) {
        console.error(`Counterbid işlemi sırasında hata oluştu:`, error);
      }
    });
  }
}

module.exports = new TaskManager();
