const { ethers } = require('ethers');
const config = require('../config');

/**
 * Basit token offer oluşturucu
 * OpenSea v2 API için optimize edilmiş
 */
class SimpleTokenOffer {
  constructor(api) {
    this.api = api;
  }

  async createOffer(contractAddress, tokenId, price, expirationMinutes = 15, chain = 'ethereum') {
    try {
      console.log('🎯 Basit token offer oluşturuluyor...');
      
      // Collection slug'ı al
      let collectionSlug;
      try {
        const response = await this.api.makeRequest('GET', `/api/v2/chain/${chain}/contract/${contractAddress}`);
        collectionSlug = response.collection;
        console.log(`Collection slug: ${collectionSlug}`);
      } catch (e) {
        // Collection bulunamazsa hata fırlat
        throw new Error(`Collection bulunamadı: ${contractAddress}`);
      }
      
      // OpenSea v2 API - Basit format
      const payload = {
        criteria: {
          collection: {
            slug: collectionSlug
          },
          contract: {
            address: contractAddress
          },
          token: {
            token_id: tokenId.toString()
          }
        },
        maker: {
          address: config.walletAddress
        },
        price: {
          currency: "WETH",
          amount: price.toString()
        },
        quantity: 1,
        expiration_minutes: expirationMinutes
      };
      
      console.log('Token offer payload:', JSON.stringify(payload, null, 2));
      
      // Teklif oluştur
      const response = await this.api.makeRequest('POST', '/api/v2/orders/ethereum/seaport/offers', payload);
      
      if (response && response.order) {
        console.log('✅ Token offer başarıyla oluşturuldu!');
        return {
          success: true,
          order_hash: response.order.order_hash,
          order: response.order
        };
      }
      
      throw new Error('Beklenmeyen API yanıtı');
      
    } catch (error) {
      console.error('Token offer hatası:', error.message);
      
      // 400 hatası detaylarını göster
      if (error.response && error.response.status === 400) {
        console.error('API Hata Detayı:', JSON.stringify(error.response.data, null, 2));
      }
      
      throw error;
    }
  }
}

module.exports = SimpleTokenOffer;