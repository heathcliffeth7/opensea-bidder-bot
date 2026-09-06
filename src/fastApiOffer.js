const axios = require('axios');
const { ethers } = require('ethers');
const config = require('../config');

class FastApiOffer {
  constructor() {
    this.apiClient = axios.create({
      baseURL: 'https://api.opensea.io',
      headers: {
        'X-API-KEY': config.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 5000 // 5 saniye timeout
    });
  }

  /**
   * OpenSea V2 API ile hızlı teklif oluştur
   * NOT: Bu endpoint dokümante edilmemiş, reverse engineering ile bulundu
   */
  async createQuickOffer(chain, contractAddress, tokenId, offerPriceETH, expirationMinutes = 15) {
    try {
      console.log('🚀 Hızlı API teklifi hazırlanıyor...');
      const startTime = Date.now();
      
      // Parametreleri hazırla
      const offerWei = ethers.parseEther(offerPriceETH.toString()).toString();
      const expirationTime = Math.floor(Date.now() / 1000) + (expirationMinutes * 60);
      
      // POST /api/v2/orders/ethereum/seaport/offers
      const payload = {
        parameters: {
          offerer: config.walletAddress,
          offer: [{
            itemType: 1, // ERC20
            token: config.wethContractAddress,
            identifierOrCriteria: "0",
            startAmount: offerWei,
            endAmount: offerWei
          }],
          consideration: [{
            itemType: 2, // ERC721
            token: contractAddress,
            identifierOrCriteria: tokenId.toString(),
            startAmount: "1",
            endAmount: "1",
            recipient: config.walletAddress
          }],
          startTime: Math.floor(Date.now() / 1000).toString(),
          endTime: expirationTime.toString(),
          orderType: 1, // PARTIAL_OPEN
          zone: "0x000056F7000000EcE9003ca63978907a00FFD100", // Seaport 1.6 zone
          zoneHash: ethers.ZeroHash,
          salt: ethers.hexlify(ethers.randomBytes(32)),
          conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
          totalOriginalConsiderationItems: 1,
          counter: "0"
        },
        protocol_address: "0x0000000000000068f116a894984e2db1123eb395" // Seaport v1.5
      };
      
      // İmza için provider ve signer lazım
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const wallet = new ethers.Wallet(config.privateKey, provider);
      
      // EIP-712 imza
      const domain = {
        name: "Seaport",
        version: "1.5",
        chainId: 1,
        verifyingContract: "0x0000000000000068f116a894984e2db1123eb395"
      };
      
      const types = {
        OrderComponents: [
          { name: "offerer", type: "address" },
          { name: "zone", type: "address" },
          { name: "offer", type: "OfferItem[]" },
          { name: "consideration", type: "ConsiderationItem[]" },
          { name: "orderType", type: "uint8" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "zoneHash", type: "bytes32" },
          { name: "salt", type: "uint256" },
          { name: "conduitKey", type: "bytes32" },
          { name: "totalOriginalConsiderationItems", type: "uint256" }
        ],
        OfferItem: [
          { name: "itemType", type: "uint8" },
          { name: "token", type: "address" },
          { name: "identifierOrCriteria", type: "uint256" },
          { name: "startAmount", type: "uint256" },
          { name: "endAmount", type: "uint256" }
        ],
        ConsiderationItem: [
          { name: "itemType", type: "uint8" },
          { name: "token", type: "address" },
          { name: "identifierOrCriteria", type: "uint256" },
          { name: "startAmount", type: "uint256" },
          { name: "endAmount", type: "uint256" },
          { name: "recipient", type: "address" }
        ]
      };
      
      const signature = await wallet.signTypedData(domain, types, payload.parameters);
      payload.signature = signature;
      
      console.log('📤 API isteği gönderiliyor...');
      
      // API çağrısı - OpenSea formatında
      const openSeaPayload = {
        criteria: {
          collection: { slug: "gemesis" },
          contract: { address: contractAddress },
          trait: null,
          encoded_token_ids: [tokenId.toString()]
        },
        protocol_data: payload,
        maker: config.walletAddress,
        price: {
          currency: "WETH",
          decimals: 18,
          value: offerWei
        },
        quantity: 1,
        expiration_time: expirationTime
      };
      
      const response = await this.apiClient.post(
        `/api/v2/orders/${chain}/seaport/offers`,
        openSeaPayload
      );
      
      const elapsed = Date.now() - startTime;
      console.log(`✅ Teklif ${elapsed}ms'de oluşturuldu!`);
      
      return {
        success: true,
        orderHash: response.data.order_hash || response.data.hash,
        elapsed: elapsed,
        response: response.data
      };
      
    } catch (error) {
      console.error('❌ Hızlı API teklifi hatası:', error.response?.data || error.message);
      
      // Eğer bu endpoint çalışmazsa, build endpoint'ini dene
      if (error.response?.status === 404) {
        return this.createOfferViaBuildEndpoint(chain, contractAddress, tokenId, offerPriceETH);
      }
      
      throw error;
    }
  }
  
  /**
   * Alternatif: Build endpoint kullan
   */
  async createOfferViaBuildEndpoint(chain, contractAddress, tokenId, offerPriceETH) {
    try {
      console.log('🔄 Build endpoint deneniyor...');
      
      const payload = {
        offerer: config.walletAddress,
        quantity: 1,
        criteria: {
          collection: { slug: "gemesis" }, // Collection slug gerekli
          contract: { address: contractAddress },
          encoded_token_ids: [tokenId.toString()]
        },
        protocol_address: "0x0000000000000068f116a894984e2db1123eb395",
        offer_protection_enabled: true,
        collection_offer_price: {
          value: ethers.parseEther(offerPriceETH.toString()).toString(),
          decimals: 18,
          currency: "WETH"
        }
      };
      
      const response = await this.apiClient.post('/api/v2/offers/build', payload);
      
      console.log('✅ Build response alındı, imzalanıyor...');
      
      // Build response'u imzala ve gönder
      // ... (implementasyon gerekli)
      
      return response.data;
      
    } catch (error) {
      console.error('❌ Build endpoint hatası:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = FastApiOffer;