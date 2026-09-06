const AbstractStreamClient = require('./abstractStreamClient');
const EventEmitter = require('events');

/**
 * Abstract chain için client yönetici
 * Sadece Stream API kullanır
 */
class AbstractClientManager extends EventEmitter {
  constructor() {
    super();
    this.streamClient = null;
    this.collections = new Set();
    this.isConnected = false;
  }

  /**
   * Client'ı başlat
   */
  async initialize(apiKey) {
    console.log('\n🔧 Abstract Chain Stream Client başlatılıyor...');
    console.log('🔍 OpenSea Stream API Abstract desteği test ediliyor...');
    
    this.streamClient = new AbstractStreamClient();
    
    // Stream client event'lerini yönlendir
    this.streamClient.on('connected', (info) => {
      console.log('✅ Abstract Stream API başarıyla bağlandı!');
      this.isConnected = true;
      this.emit('connected', info);
    });
    
    this.streamClient.on('disconnected', (event) => {
      console.log('⚠️ Abstract Stream API bağlantısı kesildi');
      if (event && event.code === 1011) {
        console.log('🔄 Code 1011 - Farklı parametrelerle yeniden denenecek...');
      }
      this.isConnected = false;
      this.emit('disconnected', event);
    });
    
    this.streamClient.on('error', (error) => {
      console.error('❌ Abstract Stream hatası:', error);
      this.emit('error', error);
    });
    
    // Offer event'lerini yönlendir
    this.streamClient.on('offer_received', (offerData) => {
      this.emit('offer_received', offerData);
    });
    
    // Collection offer event'lerini yönlendir - sadece collection slug bazlı
    // NOT: Genel collection_offer event'ini yönlendirmiyoruz, çünkü bu duplicate'e sebep oluyor
    
    // Collection offer event'lerini dinle ve yönlendir
    // Pengztracted için özel listener
    this.streamClient.on('collection_offer_pengztracted-abstract', (eventData) => {
      console.log(`🔄 [AbstractManager] collection_offer_pengztracted-abstract event'i yönlendiriliyor...`);
      this.emit('collection_offer_pengztracted-abstract', eventData);
    });
    
    // Stream client'ı başlat
    await this.streamClient.initialize(apiKey);
  }

  /**
   * Collection'a subscribe ol
   */
  subscribeToCollection(collectionSlug) {
    if (!this.streamClient) {
      console.error('❌ Stream client henüz başlatılmadı!');
      return;
    }
    
    console.log(`[AbstractManager] ${collectionSlug} collection'ına subscribe olunuyor...`);
    console.log(`[AbstractManager] Chain: abstract, ID: 2741`);
    this.streamClient.subscribeToCollection(collectionSlug);
    this.collections.add(collectionSlug);
  }

  /**
   * Collection'dan unsubscribe ol
   */
  unsubscribeFromCollection(collectionSlug) {
    if (!this.streamClient) {
      return;
    }
    
    console.log(`[AbstractManager] ${collectionSlug} collection'ından unsubscribe olunuyor...`);
    this.streamClient.unsubscribeFromCollection(collectionSlug);
    this.collections.delete(collectionSlug);
  }

  /**
   * Tüm collection'lardan unsubscribe ol
   */
  unsubscribeAll() {
    for (const collection of this.collections) {
      this.unsubscribeFromCollection(collection);
    }
  }

  /**
   * Bağlantıyı kapat
   */
  disconnect() {
    if (this.streamClient) {
      this.streamClient.disconnect();
      this.streamClient = null;
    }
    
    this.collections.clear();
    this.isConnected = false;
    console.log('🛑 Abstract Client Manager kapatıldı');
  }
  
  /**
   * Connect metodu - uyumluluk için
   */
  connect() {
    console.log('[AbstractManager] connect() çağrıldı - initialize ile zaten başlatıldı');
    // AbstractClientManager initialize ile başlatılır, connect gerekmez
  }

  /**
   * Event listener sayısını döndür - Stream API uyumluluğu için
   */
  listenerCount(eventName) {
    // Event listener'lar bu sınıf üzerinde (EventEmitter) tutuluyor
    return super.listenerCount(eventName);
  }
  
  /**
   * Stream API yoksa alternatif olarak item offer event'ini simüle et
   */
  simulateItemOfferEvent(collectionSlug, tokenId, contractAddress) {
    // Bu metod sadece Stream API tamamen başarısız olursa kullanılacak
    console.log('[AbstractManager] WARNING: Stream API başarısız, event simülasyonu yapılıyor...');
    // Bu kısmı şimdilik boş bırakıyoruz, Stream API'yi denemek istiyoruz
  }

  /**
   * Item offer'larını dinle - StreamClient uyumluluğu için
   */
  onItemReceivedOffer(collectionSlug, tokenId, callback) {
    if (!this.streamClient) {
      console.error('❌ Stream client henüz başlatılmadı!');
      return null;
    }
    
    console.log(`[AbstractManager] Item offer dinleyicisi ekleniyor: ${collectionSlug} #${tokenId}`);
    
    // Token offer subscription'ı ekle
    this.streamClient.subscribeToTokenOffers(collectionSlug, tokenId);
    
    // Event listener'ı ekle - sadece token-specific event'i dinle
    const eventKey = `token_offer_${collectionSlug}_${tokenId}`;
    const contractKey = `token_offer_0xa6C46c07F7f1966D772E29049175EBBa26262513_${tokenId}`;
    
    // Event handler - duplicate kontrolü CollectionOfferMonitorV2'de yapılacak
    const eventHandler = (event) => {
      // Event'in bu token için olup olmadığını kontrol et
      let eventTokenId = tokenId.toString();
      if (event.payload && event.payload.payload) {
        const payload = event.payload.payload;
        eventTokenId = payload.item?.nft_id?.split('/')?.pop() || tokenId.toString();
      }
      
      if (eventTokenId === tokenId.toString()) {
        console.log(`[AbstractManager] Event işleniyor: ${collectionSlug} #${tokenId}`);
        callback(event);
      }
    };
    
    // Sadece contract-based event'i dinle (daha güvenilir)
    this.streamClient.on(contractKey, eventHandler);
    
    return eventKey;
  }
  
  /**
   * Collection offer'larını dinle
   */
  onCollectionOffer(collectionSlug, callback) {
    if (!this.streamClient) {
      console.error('❌ Stream client henüz başlatılmadı!');
      return null;
    }
    
    console.log(`[AbstractManager] Collection offer dinleyicisi ekleniyor: ${collectionSlug}`);
    
    // Collection subscription'ı ekle
    this.subscribeToCollection(collectionSlug);
    
    // Event listener'ı ekle
    const eventKey = `collection_offer_${collectionSlug}`;
    this.streamClient.on(eventKey, callback);
    
    // Genel collection_offer event'ini de dinle
    this.streamClient.on('collection_offer', (event) => {
      if (event.payload && event.payload.collection && 
          event.payload.collection.slug === collectionSlug) {
        callback(event);
      }
    });
    
    return eventKey;
  }
  
  /**
   * Event dinleyicilerini kaldır
   */
  unsubscribe(eventKey) {
    if (this.streamClient) {
      this.streamClient.removeAllListeners(eventKey);
    }
  }
  
  /**
   * Genel event'leri dinle
   */
  onEvents(collectionSlug, eventTypes, callback) {
    if (!this.streamClient) {
      console.error('❌ Stream client henüz başlatılmadı!');
      return null;
    }
    
    console.log(`[AbstractManager] Event dinleyicisi ekleniyor: ${collectionSlug} - ${eventTypes.join(', ')}`);
    
    // Collection subscription'ı ekle
    this.subscribeToCollection(collectionSlug);
    
    // Her event tipi için listener ekle
    eventTypes.forEach(eventType => {
      this.streamClient.on(eventType, (event) => {
        if (event.payload && event.payload.collection && 
            event.payload.collection.slug === collectionSlug) {
          callback(event);
        }
      });
    });
    
    const eventKey = `events_${collectionSlug}_${eventTypes.join('_')}`;
    return eventKey;
  }
  
  /**
   * Client durumu
   */
  getStatus() {
    return {
      connected: this.isConnected,
      collections: Array.from(this.collections),
      mode: 'stream'
    };
  }
}

module.exports = AbstractClientManager;