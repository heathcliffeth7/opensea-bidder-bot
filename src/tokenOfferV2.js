const { ethers } = require('ethers');
const config = require('../config');

class TokenOfferV2 {
  constructor(api) {
    this.api = api;
  }

  /**
   * Token offer'ı collection offer gibi orderType 2 ile oluştur
   * Bu sayede offchain iptal edilebilir olacak
   */
  async createOffchainCancellableTokenOffer(contractAddress, tokenId, price, expirationTime) {
    try {
      console.log('Offchain iptal edilebilir token offer oluşturuluyor...');
      console.log(`Contract: ${contractAddress}, Token: ${tokenId}, Fiyat: ${price} ETH`);
      
      // Seaport order parametreleri - Collection offer'a benzer ama token specific
      const orderParameters = {
        offerer: config.walletAddress,
        zone: "0x000056F7000000EcE9003ca63978907a00FFD100", // Seaport 1.6 zone
        offer: [
          {
            itemType: 1, // ERC20 (WETH)
            token: config.wethContractAddress,
            identifierOrCriteria: "0",
            startAmount: ethers.parseEther(price.toString()).toString(),
            endAmount: ethers.parseEther(price.toString()).toString()
          }
        ],
        consideration: [
          {
            itemType: 2, // ERC721
            token: contractAddress,
            identifierOrCriteria: tokenId.toString(),
            startAmount: "1",
            endAmount: "1",
            recipient: config.walletAddress
          },
          // OpenSea fee - %0.5 (5/1000)
          {
            itemType: 1, // ERC20
            token: config.wethContractAddress,
            identifierOrCriteria: "0",
            startAmount: (ethers.parseEther(price.toString()) * 5n / 1000n).toString(), // 0.5% fee
            endAmount: (ethers.parseEther(price.toString()) * 5n / 1000n).toString(),
            recipient: "0x0000a26b00c1F0DF003000390027140000fAa719" // OpenSea fee recipient
          },
          // Creator fee - %5 (50/1000)
          {
            itemType: 1, // ERC20
            token: config.wethContractAddress,
            identifierOrCriteria: "0",
            startAmount: (ethers.parseEther(price.toString()) * 50n / 1000n).toString(), // 5% creator fee
            endAmount: (ethers.parseEther(price.toString()) * 50n / 1000n).toString(),
            recipient: config.walletAddress // Şimdilik kendi adresimiz, normalde creator adresi olmalı
          }
        ],
        orderType: 3, // PARTIAL_RESTRICTED - Token offer için standart
        startTime: Math.floor(Date.now() / 1000).toString(),
        endTime: Math.floor(expirationTime / 1000).toString(),
        zoneHash: ethers.ZeroHash,
        salt: ethers.hexlify(ethers.randomBytes(32)),
        conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
        totalOriginalConsiderationItems: 3, // NFT + OpenSea fee + Creator fee
        counter: "0"
      };
      
      // İmzala
      const signature = await this.api._signOrder(orderParameters, 'ethereum');
      
      // API payload - collection offer formatında ama single token için
      const payload = {
        criteria: {
          collection: {
            slug: await this._getCollectionSlugFromContract(contractAddress)
          },
          encoded_token_ids: tokenId.toString() // Tek token için
        },
        protocol_data: {
          parameters: orderParameters,
          signature: signature
        },
        protocol_address: config.seaportAddress
      };
      
      // API'ye gönder
      const response = await this.api.makeRequest('POST', '/api/v2/offers', payload);
      
      console.log('Token offer başarıyla oluşturuldu (orderType 2):', response);
      return response;
      
    } catch (error) {
      console.error('Token offer oluşturma hatası:', error);
      
      // Hata detayları
      if (error.response) {
        console.error('API yanıtı:', error.response.data);
      }
      
      throw error;
    }
  }
  
  /**
   * Contract address'ten collection slug al
   */
  async _getCollectionSlugFromContract(contractAddress) {
    try {
      // API'den contract bilgilerini al
      const response = await this.api.makeRequest('GET', `/api/v2/chain/ethereum/contract/${contractAddress}`);
      return response.collection;
    } catch (error) {
      console.error('Collection slug alınamadı:', error);
      // Fallback olarak contract address'i döndür
      return contractAddress;
    }
  }
  
  /**
   * OpenSea formatında token offer oluştur
   */
  async createOpenSeaFormattedTokenOffer(collectionSlug, tokenId, price, expirationTime) {
    try {
      console.log('OpenSea formatında token offer oluşturuluyor...');
      
      // Collection bilgilerini al
      const collectionInfo = await this.api.getCollectionInfo(collectionSlug);
      const contractAddress = collectionInfo.contractAddress;
      
      // OpenSea'nin beklediği format
      const payload = {
        asset: {
          contract: contractAddress,
          tokenId: tokenId.toString()
        },
        quantity: 1,
        paymentToken: config.wethContractAddress,
        pricePerUnit: {
          unit: "ether",
          value: price.toString()
        },
        expirationTime: Math.floor(expirationTime / 1000)
      };
      
      // v2/offers endpoint'ini kullan
      const response = await this.api.makeRequest('POST', '/api/v2/offers', payload);
      
      console.log('OpenSea token offer başarıyla oluşturuldu:', response);
      return response;
      
    } catch (error) {
      console.error('OpenSea token offer hatası:', error);
      
      // Farklı endpoint dene
      if (error.status === 400) {
        console.log('v2/offers başarısız, farklı format deneniyor...');
        
        // Alternatif format
        const altPayload = {
          protocol_data: {
            kind: "seaport-v1.6",
            offer: {
              token: tokenId.toString(),
              contract: contractAddress,
              price: ethers.parseEther(price.toString()).toString(),
              expiration: Math.floor(expirationTime / 1000)
            }
          }
        };
        
        return this.api.makeRequest('POST', '/api/v2/orders/ethereum/seaport/offers', altPayload);
      }
      
      throw error;
    }
  }
}

module.exports = TokenOfferV2;