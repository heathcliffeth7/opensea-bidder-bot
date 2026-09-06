const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('../config');

class OpenSeaStreamClient extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.subscriptions = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    this.isConnected = false;
    this.pingInterval = null;
  }

  /**
   * WebSocket bağlantısını başlat
   */
  connect(chainName = 'ethereum') {
    // Chain bilgisini parametre olarak al ve sakla
    this.chainName = chainName;
    console.log('\n[StreamClient] Chain kontrolü:');
    console.log('- Parametre chainName:', chainName);
    
    // Abstract chain için de Stream API'yi deneyeceğiz
    if (chainName === 'abstract') {
      console.log('\n🔧 Abstract chain algılandı, Stream API bağlantısı deneniyor...');
      console.log('🔍 Farklı URL formatları ve parametreler test edilecek');
      console.log('⚠️ NOT: Eğer başarısız olursa api.js\'deki AbstractClientManager kullanılmalı');
    }
    
    const network = config.network === 'mainnet' ? 'mainnet' : 'testnet';
    // Phoenix framework için doğru URL formatı
    const baseUrl = network === 'mainnet' 
      ? 'wss://stream.openseabeta.com' 
      : 'wss://testnets-stream.openseabeta.com';
    
    // OpenSea Stream API için doğru connection string formatı
    const wsUrl = `${baseUrl}/socket/websocket?token=${config.apiKey}`;
    
    console.log('\n🔌 OpenSea Stream API WebSocket bağlantısı kuruluyor...');
    console.log(`URL: ${wsUrl}`);
    console.log(`Network: ${network}`);
    console.log(`Chain: ${chainName}`);
    console.log(`API Key: ${config.apiKey ? config.apiKey.substring(0, 8) + '...' : 'YOK'}`);
    
    // Debug için bağlantı parametrelerini detaylı logla
    console.log('Bağlantı parametreleri:', {
      url: wsUrl,
      chain: chainName,
      apiKey: config.apiKey
    });
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.on('open', () => {
      console.log('✅ WebSocket bağlantısı açıldı!');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // İlk bağlantıda heartbeat göndermiyoruz
      // Phoenix WebSocket ilk olarak channel join bekler
      
      // Ping/pong için interval başlat
      this.startPingInterval();
      
      // Mevcut subscription'ları yeniden kur
      this.resubscribeAll();
      
      this.emit('connected');
    });
    
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('Mesaj parse hatası:', error);
      }
    });
    
    this.ws.on('error', (error) => {
      console.error('❌ WebSocket hatası:', error.message);
      this.emit('error', error);
    });
    
    this.ws.on('close', (code, reason) => {
      console.log(`\n🔴 WebSocket bağlantısı kapandı!`);
      console.log(`Code: ${code}`);
      console.log(`Reason: ${reason || 'Belirtilmemiş'}`);
      console.log(`Zaman: ${new Date().toLocaleString()}`);
      
      this.isConnected = false;
      this.stopPingInterval();
      
      // Code 1011 için özel handling
      if (code === 1011) {
        console.log('\n⚠️ Code 1011 - Server going away hatası!');
        // Bağlantı sırasında gönderilen chainName parametresini kullan
        if (this.chainName === 'abstract') {
          console.log('📌 Abstract chain için farklı URL/format deneniyor...');
          console.log('🔄 URL parametreleri ve topic formatları değiştiriliyor.');
        }
      }
      
      // Otomatik yeniden bağlan
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`\n🔄 ${this.reconnectDelay/1000} saniye sonra yeniden bağlanılacak...`);
        console.log(`Deneme: ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        setTimeout(() => {
          console.log(`\n🔄 Yeniden bağlanma denemesi ${this.reconnectAttempts}...`);
          this.connect(this.chainName); // Chain parametresini koru
        }, this.reconnectDelay);
      } else {
        console.log(`\n❌ Maksimum yeniden bağlanma denemesi aşıldı!`);
        console.log(`Bot'u yeniden başlatmanız gerekebilir.`);
      }
      
      this.emit('disconnected', { code, reason });
    });
  }

  /**
   * Phoenix channel'a katıl
   */
  joinChannel(topic) {
    const ref = Date.now();
    
    const joinMessage = {
      topic: topic,
      event: 'phx_join',
      payload: {},
      ref: ref
    };
    
    console.log(`📡 Channel'a katılınıyor: ${topic}`);
    this.send(joinMessage);
    
    // Subscription'ı kaydet
    this.subscriptions.set(topic, { ref, joined: false });
    
    return ref;
  }

  /**
   * Token offer'larını dinle
   */
  subscribeTokenOffers(collectionSlugOrContract, tokenId, callback) {
    // Parametreleri kontrol et
    if (!collectionSlugOrContract || !tokenId || !callback) {
      console.error('❌ subscribeTokenOffers: Eksik parametreler!', {
        collection: collectionSlugOrContract,
        tokenId: tokenId,
        hasCallback: !!callback
      });
      return null;
    }
    
    const chainName = this.chainName || 'ethereum'; // Saklanan chain bilgisini kullan
    const topic = `collection:${collectionSlugOrContract}`;
    
    console.log(`📡 Token offer subscription - Topic: ${topic}, Token ID: ${tokenId}`);
    console.log(`Chain: ${chainName}`);
    
    // Önce collection channel'a katıl
    if (!this.subscriptions.has(topic)) {
      this.joinChannel(topic);
    }
    
    // Event listener ekle - hem collection hem de token ID ile
    const eventName = `token_offer_${collectionSlugOrContract}_${tokenId}`;
    this.on(eventName, callback);
    
    console.log(`✅ Token offer listener eklendi: ${collectionSlugOrContract} #${tokenId}`);
    console.log(`Event name: ${eventName}`);
    
    return eventName;
  }

  /**
   * Mesajları işle
   */
  handleMessage(message) {
    const { topic, event, payload, ref } = message;
    
    // Phoenix ve heartbeat mesajlarını sessizce geç
    // Diğer event'leri de loglamayı durdur
    
    
    // Phoenix system mesajları
    if (topic === 'phoenix' && event === 'phx_reply') {
      return;
    }
    
    // Channel join onayı
    if (event === 'phx_reply' && payload?.status === 'ok') {
      const subscription = Array.from(this.subscriptions.entries())
        .find(([_, sub]) => sub.ref === ref);
      
      if (subscription) {
        subscription[1].joined = true;
        console.log(`✅ Channel'a başarıyla katıldı: ${subscription[0]}`);
      }
      return;
    }
    
    
    // OpenSea Stream API event tipleri - item_received_offer'ı da ekledik
    const offerEvents = ['item_received_offer', 'item_received_bid', 'offer', 'bid', 'collection_offer', 'trait_offer'];
    
    // Token offer event'lerini loglamayı durdur - collectionOfferMonitorV2 zaten gerekeni loglayacak
    
    // Offer event'lerini kontrol et
    if (event && offerEvents.includes(event) && payload) {
      const itemData = payload.payload || payload;
      
      // Collection offer event'i
      if (event === 'collection_offer' && topic.startsWith('collection:')) {
        const collectionSlug = topic.replace('collection:', '').replace('abstract:', '');
        const eventName = `collection_offer_${collectionSlug}`;
        this.emit(eventName, message);
        return;
      }
      
      // Trait offer event'i
      if (event === 'trait_offer') {
        const collectionSlug = topic.replace('collection:', '').replace('abstract:', '');
        const eventName = `events_${collectionSlug}_trait_offer`;
        this.emit(eventName, message);
        return;
      }
      
      // Token/Item offer event'leri
      if (event === 'item_received_offer' || event === 'item_received_bid' || event === 'offer' || event === 'bid' || event === 'item_offer') {
        // Token ID'yi farklı yerlerden almayı dene
        let tokenId = null;
        let contractAddress = null;
        let collectionSlug = null;
        
        // Önce topic'ten collection bilgisini al
        if (topic.startsWith('collection:')) {
          // Topic formatı: collection:slug veya collection:contract_address olabilir
          const topicValue = topic.replace('collection:', '');
          
          // Abstract prefix'ini kaldır
          const cleanTopicValue = topicValue.replace('abstract:', '');
          
          // Eğer 0x ile başlıyorsa contract address, değilse slug
          if (cleanTopicValue.startsWith('0x')) {
            contractAddress = cleanTopicValue;
          } else {
            collectionSlug = cleanTopicValue;
            // Slug ise, payload'dan contract address'i almayı dene
            if (itemData.item?.nft_id) {
              const parts = itemData.item.nft_id.split('/');
              if (parts.length > 2 && parts[1].startsWith('0x')) {
                contractAddress = parts[1];
              }
            }
          }
        }
        
        // Token ID'yi bul - farklı yolları dene
        if (itemData.item?.nft_id) {
          const parts = itemData.item.nft_id.split('/');
          tokenId = parts[parts.length - 1];
          
          // Contract address'i de nft_id'den al
          if (!contractAddress && parts.length > 2) {
            contractAddress = parts[1];
          }
        } else if (itemData.asset?.token_id) {
          tokenId = itemData.asset.token_id.toString();
        } else if (itemData.protocol_data?.parameters?.consideration?.[0]?.identifierOrCriteria) {
          tokenId = itemData.protocol_data.parameters.consideration[0].identifierOrCriteria.toString();
        } else if (itemData.token_id) {
          tokenId = itemData.token_id.toString();
        }
        
        // Contract address'i payload'dan da almayı dene
        if (!contractAddress && itemData.asset?.asset_contract?.address) {
          contractAddress = itemData.asset.asset_contract.address;
        }
        
        // Eğer collectionSlug yoksa payload'dan al
        if (!collectionSlug && itemData.collection?.slug) {
          collectionSlug = itemData.collection.slug;
        }
        
        if (tokenId) {
          // Event'leri sessizce emit et, log gösterme
          if (contractAddress) {
            const eventName1 = `token_offer_${contractAddress}_${tokenId}`;
            this.emit(eventName1, message);
          }
          
          if (collectionSlug) {
            const eventName2 = `token_offer_${collectionSlug}_${tokenId}`;
            this.emit(eventName2, message);
          }
        }
      }
    }
    
    // Genel event emit - TÜM mesajlar için
    this.emit('message', message);
  }

  /**
   * WebSocket üzerinden mesaj gönder
   */
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Ping/pong interval başlat
   */
  startPingInterval() {
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        const heartbeatMessage = {
          topic: 'phoenix',
          event: 'heartbeat',
          payload: {},
          ref: Date.now()
        };
        // Heartbeat'i sessizce gönder
        this.send(heartbeatMessage);
      }
    }, 30000); // 30 saniyede bir ping
  }

  /**
   * Ping/pong interval durdur
   */
  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Collection offer'larını dinle
   */
  onCollectionOffer(collectionSlug, callback) {
    // Parametreleri kontrol et
    if (!collectionSlug || !callback) {
      console.error('❌ onCollectionOffer: Eksik parametreler!', {
        collection: collectionSlug,
        hasCallback: !!callback
      });
      return null;
    }
    
    const chainName = this.chainName || 'ethereum'; // Saklanan chain bilgisini kullan
    const topic = `collection:${collectionSlug}`;
    
    // Collection channel'a katıl
    if (!this.subscriptions.has(topic)) {
      this.joinChannel(topic);
    }
    
    // Event listener ekle
    const eventName = `collection_offer_${collectionSlug}`;
    this.on(eventName, callback);
    
    console.log(`✅ Collection offer listener eklendi: ${collectionSlug} (${chainName})`);
    
    return eventName;
  }
  
  /**
   * Item offer'larını dinle
   */
  onItemReceivedOffer(contractAddress, tokenId, callback) {
    return this.subscribeTokenOffers(contractAddress, tokenId, callback);
  }
  
  /**
   * Genel event'leri dinle
   */
  onEvents(collectionSlug, eventTypes, callback) {
    // Parametreleri kontrol et
    if (!collectionSlug || !eventTypes || !callback) {
      console.error('❌ onEvents: Eksik parametreler!', {
        collection: collectionSlug,
        eventTypes: eventTypes,
        hasCallback: !!callback
      });
      return null;
    }
    
    const chainName = this.chainName || 'ethereum'; // Saklanan chain bilgisini kullan
    const topic = `collection:${collectionSlug}`;
    
    // Collection channel'a katıl
    if (!this.subscriptions.has(topic)) {
      this.joinChannel(topic);
    }
    
    // Event listener ekle
    const eventName = `events_${collectionSlug}_${eventTypes.join('_')}`;
    this.on(eventName, callback);
    
    console.log(`✅ Events listener eklendi: ${collectionSlug} - ${eventTypes.join(', ')} (${chainName})`);
    
    return eventName;
  }

  /**
   * Tüm subscription'ları yeniden kur
   */
  resubscribeAll() {
    for (const [topic, subscription] of this.subscriptions) {
      if (!subscription.joined && topic && topic !== 'collection:undefined') {
        this.joinChannel(topic);
      }
    }
  }

  /**
   * Bağlantıyı kapat
   */
  disconnect() {
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.subscriptions.clear();
  }

  /**
   * Listener'ı kaldır
   */
  unsubscribe(eventName) {
    this.removeAllListeners(eventName);
    console.log(`🛑 Listener kaldırıldı: ${eventName}`);
  }
  
  /**
   * Bağlantı durumunu kontrol et
   */
  get connected() {
    return this.isConnected;
  }
}

module.exports = OpenSeaStreamClient;