const axios = require('axios');
const { ethers } = require('ethers');
const config = require('./config');

async function deepCompareOffers() {
  try {
    console.log('\n🔬 Collection vs Token Offer - Derin Analiz\n');
    
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(config.privateKey, provider);
    const walletAddress = await wallet.getAddress();
    
    const apiClient = axios.create({
      baseURL: 'https://api.opensea.io',
      headers: {
        'X-API-KEY': config.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Önce mevcut teklifleri analiz edelim
    console.log('📋 Mevcut teklifler analiz ediliyor...\n');
    
    const response = await apiClient.get('/api/v2/orders/ethereum/seaport/offers', {
      params: {
        maker: walletAddress,
        limit: 50
      }
    });
    
    const orders = response.data.orders || [];
    
    // Teklifleri kategorize et
    const tokenOffers = [];
    const collectionOffers = [];
    const criteriaOffers = [];
    
    orders.forEach(order => {
      const params = order.protocol_data?.parameters;
      if (!params) return;
      
      const consideration = params.consideration?.[0];
      if (!consideration) return;
      
      // itemType'a göre kategorize et
      if (consideration.itemType === 2) {
        tokenOffers.push(order);
      } else if (consideration.itemType === 4) {
        // identifierOrCriteria 0 ise collection, değilse criteria
        if (consideration.identifierOrCriteria === "0") {
          collectionOffers.push(order);
        } else {
          criteriaOffers.push(order);
        }
      }
    });
    
    console.log(`Token Offers: ${tokenOffers.length}`);
    console.log(`Collection Offers: ${collectionOffers.length}`);
    console.log(`Criteria Offers: ${criteriaOffers.length}\n`);
    
    // Detaylı karşılaştırma
    if (tokenOffers.length > 0 && collectionOffers.length > 0) {
      console.log('🔍 DETAYLI KARŞILAŞTIRMA:\n');
      
      const tokenExample = tokenOffers[0];
      const collectionExample = collectionOffers[0];
      
      const tokenParams = tokenExample.protocol_data.parameters;
      const collectionParams = collectionExample.protocol_data.parameters;
      
      // Tüm parametreleri karşılaştır
      const compareFields = [
        'orderType',
        'zone',
        'zoneHash',
        'conduitKey',
        'counter',
        'totalOriginalConsiderationItems'
      ];
      
      console.log('PARAMETRELER:');
      compareFields.forEach(field => {
        const tokenValue = tokenParams[field];
        const collectionValue = collectionParams[field];
        const same = tokenValue === collectionValue;
        console.log(`${field}: ${same ? '✅ AYNI' : '❌ FARKLI'}`);
        if (!same) {
          console.log(`  Token: ${tokenValue}`);
          console.log(`  Collection: ${collectionValue}`);
        }
      });
      
      // Protocol address
      console.log(`\nprotocol_address: ${tokenExample.protocol_address === collectionExample.protocol_address ? '✅ AYNI' : '❌ FARKLI'}`);
      if (tokenExample.protocol_address !== collectionExample.protocol_address) {
        console.log(`  Token: ${tokenExample.protocol_address}`);
        console.log(`  Collection: ${collectionExample.protocol_address}`);
      }
      
      // Consideration detayı
      console.log('\nCONSIDERATION DETAYI:');
      console.log('Token Offer:');
      tokenParams.consideration.forEach((item, i) => {
        console.log(`  [${i}] itemType: ${item.itemType}, token: ${item.token.substring(0, 10)}...`);
      });
      console.log('Collection Offer:');
      collectionParams.consideration.forEach((item, i) => {
        console.log(`  [${i}] itemType: ${item.itemType}, token: ${item.token.substring(0, 10)}...`);
      });
      
      // Order metadata
      console.log('\nORDER METADATA:');
      console.log(`order_type: ${tokenExample.order_type === collectionExample.order_type ? '✅ AYNI' : '❌ FARKLI'}`);
      console.log(`side: ${tokenExample.side === collectionExample.side ? '✅ AYNI' : '❌ FARKLI'}`);
      
      // Özel alanlar
      console.log('\nÖZEL ALANLAR:');
      const tokenKeys = Object.keys(tokenExample);
      const collectionKeys = Object.keys(collectionExample);
      
      const uniqueToToken = tokenKeys.filter(k => !collectionKeys.includes(k));
      const uniqueToCollection = collectionKeys.filter(k => !tokenKeys.includes(k));
      
      if (uniqueToToken.length > 0) {
        console.log('Sadece Token Offer\'da olan alanlar:', uniqueToToken);
      }
      if (uniqueToCollection.length > 0) {
        console.log('Sadece Collection Offer\'da olan alanlar:', uniqueToCollection);
      }
    }
    
    // Yeni test: Farklı payload formatları
    console.log('\n\n🧪 YENİ TEST: Collection gibi token offer oluştur\n');
    
    const now = Math.floor(Date.now() / 1000);
    const offerWei = ethers.parseEther("0.002");
    const feeWei = offerWei * 50n / 10000n;
    
    // Test 1: criteria_proof ekle
    console.log('Test 1: criteria_proof ile token offer');
    const testPayload1 = {
      parameters: {
        offerer: walletAddress,
        offer: [{
          itemType: 1,
          token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          identifierOrCriteria: "0",
          startAmount: offerWei.toString(),
          endAmount: offerWei.toString()
        }],
        consideration: [
          {
            itemType: 2, // ERC721
            token: "0xbe9371326f91345777b04394448c23e2bfeaa826",
            identifierOrCriteria: "200",
            startAmount: "1",
            endAmount: "1",
            recipient: walletAddress
          },
          {
            itemType: 1,
            token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            identifierOrCriteria: "0",
            startAmount: feeWei.toString(),
            endAmount: feeWei.toString(),
            recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
          }
        ],
        startTime: now.toString(),
        endTime: (now + 900).toString(),
        orderType: 0, // FULL_OPEN gibi
        zone: "0x0000000000000000000000000000000000000000",
        zoneHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        salt: ethers.hexlify(ethers.randomBytes(32)),
        conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
        totalOriginalConsiderationItems: 2,
        counter: "0"
      },
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395",
      criteria_proof: [] // Collection offer'da olan alan
    };
    
    // İmzala ve gönder
    const domain = {
      name: "Seaport",
      version: "1.6",
      chainId: 1,
      verifyingContract: testPayload1.protocol_address
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
        { name: "counter", type: "uint256" }
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
    
    try {
      const signature = await wallet.signTypedData(domain, types, testPayload1.parameters);
      testPayload1.signature = signature;
      
      const result = await apiClient.post('/api/v2/orders/ethereum/seaport/offers', testPayload1);
      console.log('✅ Başarılı! Order hash:', result.data.order?.order_hash);
      console.log('BU TEKLİFİ TEST EDİN!\n');
    } catch (error) {
      console.log('❌ Başarısız:', error.response?.data?.errors?.[0] || error.message);
    }
    
  } catch (error) {
    console.error('Test hatası:', error.message);
  }
}

deepCompareOffers();