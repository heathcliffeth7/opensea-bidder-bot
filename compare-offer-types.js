const axios = require('axios');
const { ethers } = require('ethers');
const config = require('./config');

async function compareOfferTypes() {
  try {
    console.log('\n🔍 Offer Tipleri Karşılaştırması\n');
    
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

    const now = Math.floor(Date.now() / 1000);
    const offerWei = ethers.parseEther("0.002");
    const feeWei = offerWei * 50n / 10000n;

    // 1. TOKEN OFFER
    console.log('📍 1. TOKEN OFFER (Gas ücretli iptal)');
    const tokenOfferParams = {
      offerer: walletAddress,
      offer: [{
        itemType: 1, // ERC20
        token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        identifierOrCriteria: "0",
        startAmount: offerWei.toString(),
        endAmount: offerWei.toString()
      }],
      consideration: [
        {
          itemType: 2, // ERC721 - Specific token
          token: "0xbe9371326f91345777b04394448c23e2bfeaa826",
          identifierOrCriteria: "106", // Specific token ID
          startAmount: "1",
          endAmount: "1",
          recipient: walletAddress
        },
        {
          itemType: 1, // Fee
          token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          identifierOrCriteria: "0",
          startAmount: feeWei.toString(),
          endAmount: feeWei.toString(),
          recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
        }
      ],
      startTime: now.toString(),
      endTime: (now + 900).toString(),
      orderType: 1, // PARTIAL_OPEN
      zone: "0x0000000000000000000000000000000000000000",
      zoneHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
      totalOriginalConsiderationItems: 2,
      counter: "0"
    };

    // 2. COLLECTION OFFER
    console.log('\n📍 2. COLLECTION OFFER (Gas ücretsiz iptal?)');
    const collectionOfferParams = {
      offerer: walletAddress,
      offer: [{
        itemType: 1, // ERC20
        token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        identifierOrCriteria: "0",
        startAmount: offerWei.toString(),
        endAmount: offerWei.toString()
      }],
      consideration: [
        {
          itemType: 4, // ERC721_WITH_CRITERIA - Collection
          token: "0xbe9371326f91345777b04394448c23e2bfeaa826",
          identifierOrCriteria: "0", // Any token in collection
          startAmount: "1",
          endAmount: "1",
          recipient: walletAddress
        },
        {
          itemType: 1, // Fee
          token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          identifierOrCriteria: "0",
          startAmount: feeWei.toString(),
          endAmount: feeWei.toString(),
          recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
        }
      ],
      startTime: now.toString(),
      endTime: (now + 900).toString(),
      orderType: 1, // Aynı
      zone: "0x0000000000000000000000000000000000000000", // Aynı
      zoneHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
      totalOriginalConsiderationItems: 2,
      counter: "0"
    };

    // 3. CRITERIA OFFER (Trait)
    console.log('\n📍 3. CRITERIA OFFER (Gas ücretsiz iptal?)');
    const criteriaOfferParams = {
      offerer: walletAddress,
      offer: [{
        itemType: 1, // ERC20
        token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        identifierOrCriteria: "0",
        startAmount: offerWei.toString(),
        endAmount: offerWei.toString()
      }],
      consideration: [
        {
          itemType: 4, // ERC721_WITH_CRITERIA - Trait
          token: "0xbe9371326f91345777b04394448c23e2bfeaa826",
          identifierOrCriteria: "0", // Criteria hash will be added
          startAmount: "1",
          endAmount: "1",
          recipient: walletAddress
        },
        {
          itemType: 1, // Fee
          token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          identifierOrCriteria: "0",
          startAmount: feeWei.toString(),
          endAmount: feeWei.toString(),
          recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
        }
      ],
      startTime: now.toString(),
      endTime: (now + 900).toString(),
      orderType: 1, // Aynı
      zone: "0x0000000000000000000000000000000000000000", // Aynı
      zoneHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
      totalOriginalConsiderationItems: 2,
      counter: "0"
    };

    console.log('\n📊 KARŞILAŞTIRMA:');
    console.log('\nTEK FARK: consideration itemType');
    console.log('- Token Offer: itemType = 2 (ERC721)');
    console.log('- Collection/Criteria: itemType = 4 (ERC721_WITH_CRITERIA)');
    console.log('\nDiğer tüm parametreler AYNI!');

    // Test edelim
    console.log('\n\n🧪 TEST: Token offer\'ı itemType 4 ile deneyelim');
    
    const modifiedTokenOffer = {
      ...tokenOfferParams,
      consideration: [
        {
          itemType: 4, // ERC721_WITH_CRITERIA olarak değiştir
          token: "0xbe9371326f91345777b04394448c23e2bfeaa826",
          identifierOrCriteria: "107", // Token ID
          startAmount: "1",
          endAmount: "1",
          recipient: walletAddress
        },
        tokenOfferParams.consideration[1] // Fee aynı
      ]
    };

    // İmzala
    const domain = {
      name: "Seaport",
      version: "1.6",
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

    const signature = await wallet.signTypedData(domain, types, modifiedTokenOffer);

    const payload = {
      parameters: modifiedTokenOffer,
      signature: signature,
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    };

    try {
      const response = await apiClient.post('/api/v2/orders/ethereum/seaport/offers', payload);
      console.log('\n✅ BAŞARILI! itemType 4 ile token offer oluşturuldu!');
      console.log('Order hash:', response.data.order?.order_hash);
      console.log('\n🎯 BU TEKLİFİ OPENSEA\'DE İPTAL EDİP GAS ÜCRETİ İSTEYİP İSTEMEDİĞİNE BAKIN!');
    } catch (error) {
      console.log('\n❌ Başarısız:', error.response?.data);
    }

  } catch (error) {
    console.error('Test hatası:', error.message);
  }
}

compareOfferTypes();