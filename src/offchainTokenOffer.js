const { ethers } = require('ethers');
const config = require('../config');

/**
 * Token offer'ı collection offer mantığıyla oluştur
 * Bu sayede offchain iptal edilebilir olacak
 */
class OffchainTokenOffer {
  constructor(api) {
    this.api = api;
  }

  async createOffchainCancellableTokenOffer(contractAddress, tokenId, price, expirationTime) {
    try {
      console.log('Offchain iptal edilebilir token offer oluşturuluyor...');
      
      // Collection slug'ı al
      let collectionSlug;
      try {
        const response = await this.api.makeRequest('GET', `/api/v2/chain/ethereum/contract/${contractAddress}`);
        collectionSlug = response.collection;
      } catch (e) {
        console.log('Collection slug alınamadı, devam ediliyor...');
        collectionSlug = contractAddress;
      }
      
      // 1. Önce build endpoint'ini kullan
      console.log('1. Build offer endpoint\'i deneniyor...');
      try {
        const buildPayload = {
          offerer: config.walletAddress,
          quantity: 1,
          criteria: {
            collection: { slug: collectionSlug }
          },
          protocol_address: config.seaportAddress,
          offer_protection_enabled: true // Offchain iptal için
        };
        
        const buildResponse = await this.api.makeRequest('POST', '/api/v2/offers/build', buildPayload);
        
        if (buildResponse && buildResponse.partialParameters) {
          console.log('Build başarılı, teklif oluşturuluyor...');
          
          // İmzala
          const signature = await this.api._signOrder(buildResponse.partialParameters, 'ethereum');
          
          // Teklifi gönder
          const offerPayload = {
            criteria: {
              collection: { slug: collectionSlug }
            },
            protocol_data: {
              parameters: buildResponse.partialParameters,
              signature: signature
            },
            protocol_address: config.seaportAddress
          };
          
          const offerResponse = await this.api.makeRequest('POST', '/api/v2/offers', offerPayload);
          console.log('✅ Token offer başarıyla oluşturuldu (offchain iptal edilebilir)');
          return offerResponse;
        }
      } catch (buildError) {
        console.log('Build endpoint başarısız:', buildError.message);
      }
      
      // 2. Alternatif: Collection offer endpoint'ini single token için kullan
      console.log('2. Collection offer yöntemi deneniyor...');
      
      // Collection offer gibi ama tek token için - SignedZone kullan
      const orderParameters = {
        offerer: config.walletAddress,
        zone: "0x000056F7000000EcE9003ca63978907a00FFD100", // Seaport 1.6 zone - gas-free iptal için
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
            itemType: 2, // ERC721 - token offer için 2 kullanılmalı
            token: contractAddress,
            identifierOrCriteria: tokenId.toString(),
            startAmount: "1",
            endAmount: "1",
            recipient: config.walletAddress
          },
          // OpenSea fee
          {
            itemType: 1,
            token: config.wethContractAddress,
            identifierOrCriteria: "0",
            startAmount: (ethers.parseEther(price.toString()) * 25n / 10000n).toString(), // 0.25% fee
            endAmount: (ethers.parseEther(price.toString()) * 25n / 10000n).toString(),
            recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
          }
        ],
        orderType: 2, // FULL_RESTRICTED - SignedZone için gerekli
        startTime: Math.floor(Date.now() / 1000).toString(),
        endTime: Math.floor(expirationTime / 1000).toString(),
        zoneHash: ethers.ZeroHash, // SignedZone için zero hash
        salt: ethers.hexlify(ethers.randomBytes(32)),
        conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
        totalOriginalConsiderationItems: 2,
        counter: "0"
      };
      
      // İmzala
      const signature = await this.api._signOrder(orderParameters, 'ethereum');
      
      // Token offer için doğru format - encoded_token_ids kullanma
      const payload = {
        protocol_data: {
          parameters: orderParameters,
          signature: signature
        },
        protocol_address: config.seaportAddress
      };
      
      const response = await this.api.makeRequest('POST', '/api/v2/offers', payload);
      console.log('✅ Token offer başarıyla oluşturuldu (collection offer yöntemiyle)');
      return response;
      
    } catch (error) {
      console.error('Offchain token offer hatası:', error);
      throw error;
    }
  }
}

module.exports = OffchainTokenOffer;