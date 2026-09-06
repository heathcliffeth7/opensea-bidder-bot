const { OpenSeaStreamClient } = require('@opensea/stream-js');
const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('../config');

// WebSocket'i global yap
global.WebSocket = WebSocket;

class StreamAPIClient extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isConnected = false;
  }

  connect() {
    try {
      console.log('\n🚀 OpenSea Stream API (Resmi SDK) başlatılıyor...');
      
      // Network seçimi
      const network = config.network === 'mainnet' ? 'mainnet' : 'testnet';
      const chainName = process.env.CHAIN || 'ethereum';
      
      console.log('Network:', network);
      console.log('Chain:', chainName);
      console.log('API Key:', config.apiKey ? 'Mevcut' : 'YOK');
      
      // OpenSea Stream Client oluştur
      this.client = new OpenSeaStreamClient({
        token: config.apiKey,
        network: network === 'mainnet' ? 'mainnet' : 'testnet',
        connectOptions: {
          transport: WebSocket
        },
        onError: (error) => {
          console.error('❌ Stream API hatası:', error);
          this.emit('error', error);
        }
      });
      
      // Bağlantı durumunu takip et ve TÜM eventleri logla
      this.client.onEvents('*', ['*'], (event) => {
        // İlk event geldiğinde bağlantı başarılı demektir
        if (!this.isConnected) {
          this.isConnected = true;
          console.log('✅ Stream API bağlantısı kuruldu!');
          this.emit('connected');
        }
        
        // DEBUG: Tüm gelen eventleri logla
        console.log('\n🔍 [STREAM DEBUG] Yeni event yakalandı:');
        console.log('Event Type:', event.event_type);
        console.log('Collection:', event.collection?.slug);
        if (event.payload?.item?.token_id || event.payload?.token_id) {
          console.log('Token ID:', event.payload?.item?.token_id || event.payload?.token_id);
        }
        console.log('Chain:', event.chain);
        console.log('Full Event:', JSON.stringify(event).substring(0, 500));
      });
      
      console.log('Stream client oluşturuldu, bağlantı bekleniyor...');
      
      // Bağlantıyı hemen aktif say (Stream API async çalışıyor)
      setTimeout(() => {
        if (!this.isConnected) {
          this.isConnected = true;
          console.log('✅ Stream API bağlantısı kuruldu! (timeout)');
          this.emit('connected');
        }
      }, 1000);
      
    } catch (error) {
      console.error('❌ Stream API başlatma hatası:', error);
      this.emit('error', error);
    }
  }
  
  /**
   * Collection offer'larını dinle
   */
  onCollectionOffer(collectionSlug, callback) {
    if (!this.client) {
      console.error('❌ Stream client henüz başlatılmamış!');
      return;
    }
    
    // Abstract chain için collection slug düzenlemesi
    const chainName = process.env.CHAIN || 'ethereum';
    let adjustedSlug = collectionSlug;
    
    if (chainName === 'abstract') {
      // Abstract chain için özel format kullan - : ile ayır
      adjustedSlug = `abstract:${collectionSlug}`;
      console.log(`📡 Abstract Collection offer dinleyicisi ekleniyor: ${adjustedSlug}`);
    } else {
      console.log(`📡 Collection offer dinleyicisi ekleniyor: ${collectionSlug}`);
    }
    
    // Collection offer event'lerini dinle
    this.client.onEvents(adjustedSlug, ['collection_offer'], (event) => {
      console.log(`\n🎉 === YENİ KOLEKSİYON TEKLİFİ ===`);
      console.log(`Koleksiyon: ${collectionSlug} (${chainName})`);
      console.log(`Event:`, JSON.stringify(event, null, 2));
      
      callback(event);
    });
    
    return `collection_offer_${collectionSlug}`;
  }
  
  /**
   * Item (token) offer'larını dinle
   */
  onItemReceivedOffer(collectionSlug, tokenId, callback) {
    if (!this.client) {
      console.error('❌ Stream client henüz başlatılmamış!');
      return;
    }
    
    // Abstract chain için collection slug düzenlemesi
    const chainName = process.env.CHAIN || 'ethereum';
    let adjustedSlug = collectionSlug;
    
    if (chainName === 'abstract') {
      // Abstract chain için özel format kullan - : ile ayır
      adjustedSlug = `abstract:${collectionSlug}`;
      console.log(`📡 Abstract Item offer dinleyicisi ekleniyor: ${adjustedSlug} #${tokenId}`);
    } else {
      console.log(`📡 Item offer dinleyicisi ekleniyor: ${collectionSlug} #${tokenId}`);
    }
    
    // Item offer event'lerini dinle
    console.log(`\n[DEBUG] onItemReceivedOffer çağrılıyor:`);
    console.log(`- adjustedSlug: ${adjustedSlug}`);
    console.log(`- tokenId: ${tokenId}`);
    console.log(`- tokenId type: ${typeof tokenId}`);
    
    try {
      this.client.onItemReceivedOffer(adjustedSlug, tokenId.toString(), (event) => {
        console.log(`\n🎉 === YENİ TOKEN TEKLİFİ ===`);
        console.log(`Token: ${collectionSlug} #${tokenId} (${chainName})`);
        console.log(`Event:`, JSON.stringify(event, null, 2));
        
        callback(event);
      });
      
      console.log(`✅ onItemReceivedOffer listener başarıyla kuruldu`);
    } catch (error) {
      console.error(`❌ onItemReceivedOffer hatası:`, error);
    }
    
    // Ayrıca genel events dinleyicisi de ekle
    this.client.onEvents(adjustedSlug, ['item_received_bid', 'item_received_offer'], (event) => {
      if (event.payload?.item?.token_id === tokenId.toString() || 
          event.payload?.token_id === tokenId.toString()) {
        console.log(`\n🎯 === TOKEN BID/OFFER EVENT ===`);
        console.log(`Token: ${collectionSlug} #${tokenId} (${chainName})`);
        console.log(`Event Type: ${event.event_type}`);
        console.log(`Event:`, JSON.stringify(event, null, 2));
        
        callback(event);
      }
    });
    
    return `item_offer_${collectionSlug}_${tokenId}`;
  }
  
  /**
   * Trait offer'larını dinle
   */
  onEvents(collectionSlug, eventTypes, callback) {
    if (!this.client) {
      console.error('❌ Stream client henüz başlatılmamış!');
      return;
    }
    
    // Abstract chain için collection slug düzenlemesi
    const chainName = process.env.CHAIN || 'ethereum';
    let adjustedSlug = collectionSlug;
    
    if (chainName === 'abstract') {
      // Abstract chain için özel format kullan - : ile ayır
      adjustedSlug = `abstract:${collectionSlug}`;
      console.log(`📡 Abstract Event dinleyicisi ekleniyor: ${adjustedSlug} - ${eventTypes.join(', ')}`);
    } else {
      console.log(`📡 Event dinleyicisi ekleniyor: ${collectionSlug} - ${eventTypes.join(', ')}`);
    }
    
    this.client.onEvents(adjustedSlug, eventTypes, (event) => {
      console.log(`\n🎉 === YENİ EVENT ===`);
      console.log(`Koleksiyon: ${collectionSlug} (${chainName})`);
      console.log(`Event tipi: ${event.event_type}`);
      console.log(`Event:`, JSON.stringify(event, null, 2));
      
      callback(event);
    });
    
    return `events_${collectionSlug}_${eventTypes.join('_')}`;
  }
  
  /**
   * Bağlantı durumunu kontrol et
   */
  get connected() {
    return this.isConnected;
  }
  
  /**
   * Bağlantıyı kapat
   */
  disconnect() {
    if (this.client) {
      console.log('🔌 Stream API bağlantısı kapatılıyor...');
      this.client.disconnect();
      this.client = null;
      this.isConnected = false;
    }
  }
}

module.exports = StreamAPIClient;