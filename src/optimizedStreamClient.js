const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('../config');

class OptimizedStreamClient extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.isConnected = false;
    this.subscriptions = new Map();
    this.ref = 0;
    this.heartbeatInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    
    // Phoenix protocol için
    this.HEARTBEAT_INTERVAL = 30000; // 30 saniye
    this.joinedChannels = new Set();
  }

  connect() {
    // Stream API URL - OpenSea dokümantasyonuna göre doğru format
    const apiKey = config.apiKey || config.apiKeys[0];
    const network = config.network === 'testnet' ? 'testnets' : '';
    const baseUrl = network ? 'wss://testnets-stream.openseabeta.com' : 'wss://stream.openseabeta.com';
    const wsUrl = `${baseUrl}/socket`;
    
    console.log('\n🔌 Optimized Stream Client bağlanıyor...');
    console.log(`URL: ${wsUrl.replace(apiKey, 'API_KEY_HIDDEN')}`);
    console.log('API Key uzunluğu:', apiKey?.length);
    console.log('API Key ilk 8 karakter:', apiKey?.substring(0, 8));
    
    // WebSocket options ile bağlan
    try {
      this.ws = new WebSocket(wsUrl, {
        handshakeTimeout: 30000, // 30 saniye timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://opensea.io',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        rejectUnauthorized: true
      });
    } catch (error) {
      console.error('❌ WebSocket oluşturma hatası:', error.message);
      setTimeout(() => this.connect(), 5000);
      return;
    }
    
    this.ws.on('open', () => {
      console.log('✅ WebSocket bağlantısı açıldı!');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Phoenix protokolü için ilk mesajlar
      console.log('🤝 Phoenix handshake başlatılıyor...');
      
      // Heartbeat başlat
      this.startHeartbeat();
      
      // Biraz bekle sonra kanalları kur
      setTimeout(() => {
        this.resubscribeAll();
        this.emit('connected');
      }, 1000);
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
      
      // 502 hatası özel durumu
      if (error.message && error.message.includes('502')) {
        console.log('⚠️ OpenSea Stream API geçici olarak kullanılamıyor (502 Bad Gateway)');
        console.log('🔄 Alternatif yöntem: Polling sistemi kullanılacak');
        this.emit('stream_unavailable');
      }
      
      this.emit('error', error);
    });
    
    this.ws.on('close', (code, reason) => {
      console.log(`\n🔴 WebSocket kapandı: Code ${code}`);
      console.log(`Reason: ${reason || 'Belirtilmemiş'}`);
      
      // Close code açıklamaları
      const closeReasons = {
        1000: 'Normal kapanma',
        1001: 'Endpoint gitti',
        1002: 'Protokol hatası',
        1003: 'Desteklenmeyen veri',
        1006: 'Anormal kapanma',
        1011: 'Internal server error - Authentication veya API key hatası olabilir',
        1015: 'TLS handshake hatası'
      };
      
      console.log(`Açıklama: ${closeReasons[code] || 'Bilinmeyen hata'}`);
      
      this.isConnected = false;
      this.stopHeartbeat();
      
      // Otomatik yeniden bağlan
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`🔄 ${this.reconnectDelay/1000}s sonra yeniden bağlanılacak...`);
        setTimeout(() => this.connect(), this.reconnectDelay);
      }
    });
  }

  /**
   * Phoenix heartbeat
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({
          topic: 'phoenix',
          event: 'heartbeat',
          payload: {},
          ref: this.ref++
        });
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Phoenix channel'a katıl
   */
  joinChannel(topic) {
    if (!this.isConnected) {
      console.log('⚠️ WebSocket bağlı değil, channel join ertelendi:', topic);
      return;
    }
    
    if (this.joinedChannels.has(topic)) {
      return; // Zaten katıldık
    }
    
    const joinMsg = {
      topic: topic,
      event: 'phx_join',
      payload: {},
      ref: this.ref++
    };
    
    console.log(`📡 Channel'a katılınıyor: ${topic}`);
    this.ws.send(JSON.stringify(joinMsg));
    this.joinedChannels.add(topic);
  }

  /**
   * Collection için item_received_bid dinle
   */
  listenToItemReceivedBids(collectionSlug) {
    const topic = `collection:${collectionSlug}`;
    this.joinChannel(topic);
  }

  /**
   * Collection offer'ları dinle
   */
  onCollectionOffer(collectionSlug, callback) {
    const topic = `collection:${collectionSlug}`;
    this.joinChannel(topic);
    
    // Callback'i sakla
    const eventKey = `collection_offer_${collectionSlug}`;
    if (!this.subscriptions.has(eventKey)) {
      this.subscriptions.set(eventKey, []);
    }
    this.subscriptions.get(eventKey).push(callback);
    
    return () => {
      // Unsubscribe fonksiyonu döndür
      const callbacks = this.subscriptions.get(eventKey);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Mesaj gönder
   */
  send(message) {
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Gelen mesajları işle
   */
  handleMessage(message) {
    const { topic, event, payload, ref } = message;
    
    // Phoenix system yanıtları
    if (event === 'phx_reply' && payload?.status === 'ok') {
      console.log(`✅ Channel başarıyla joined: ${topic}`);
      return;
    }
    
    if (event === 'phx_error') {
      console.error('❌ Phoenix hatası:', payload);
      return;
    }
    
    // item_received_bid eventleri
    if (event === 'item_received_bid' && topic.startsWith('collection:')) {
      const collectionSlug = topic.replace('collection:', '');
      const eventData = payload?.payload || payload;
      
      if (eventData?.item?.nft_id) {
        const tokenId = eventData.item.nft_id.split('/').pop();
        const price = parseInt(eventData.base_price) / 1e18;
        const maker = eventData.maker?.address;
        
        // Event emit et - log basmadan
        this.emit('item_received_bid', {
          collection: collectionSlug,
          tokenId: tokenId,
          price: price,
          priceWei: eventData.base_price,
          maker: maker,
          orderHash: eventData.order_hash,
          fullPayload: eventData
        });
        
        // Token-specific event
        this.emit(`bid_${collectionSlug}_${tokenId}`, eventData);
      }
    }
    
    // collection_offer eventleri
    if (event === 'collection_offer' && topic.startsWith('collection:')) {
      const collectionSlug = topic.replace('collection:', '');
      const eventData = payload?.payload || payload;
      const eventKey = `collection_offer_${collectionSlug}`;
      
      // Callback'leri çağır
      const callbacks = this.subscriptions.get(eventKey) || [];
      callbacks.forEach(callback => {
        try {
          callback(eventData);
        } catch (error) {
          console.error('Collection offer callback hatası:', error);
        }
      });
      
      // Genel event emit et
      this.emit('collection_offer', {
        collection: collectionSlug,
        price: eventData.base_price ? parseInt(eventData.base_price) / 1e18 : 0,
        priceWei: eventData.base_price,
        maker: eventData.maker?.address,
        orderHash: eventData.order_hash,
        fullPayload: eventData
      });
    }
    
    // Diğer eventler
    if (!event.startsWith('phx_')) {
      this.emit('message', message);
    }
  }

  /**
   * Yeniden bağlanınca kanalları restore et
   */
  resubscribeAll() {
    const channels = Array.from(this.joinedChannels);
    this.joinedChannels.clear();
    
    channels.forEach(channel => {
      setTimeout(() => this.joinChannel(channel), 100);
    });
  }

  /**
   * Bağlantıyı kapat
   */
  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
    this.isConnected = false;
    this.joinedChannels.clear();
  }
}

module.exports = OptimizedStreamClient;