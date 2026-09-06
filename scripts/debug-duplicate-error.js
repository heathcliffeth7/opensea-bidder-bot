require('dotenv').config({ path: '../.env' });
const { ethers } = require('ethers');
const axios = require('axios');

/**
 * Duplicate order hatasını debug et
 */
async function debugDuplicateError() {
  console.log('🔍 Duplicate Order Debug\n');
  
  const config = {
    apiKey: process.env.OPENSEA_API_KEY,
    privateKey: process.env.PRIVATE_KEY,
    walletAddress: process.env.WALLET_ADDRESS
  };
  
  // Abstract chain provider
  const provider = new ethers.JsonRpcProvider(process.env.ABSTRACT_RPC_URL || 'https://api.mainnet.abs.xyz');
  const wallet = new ethers.Wallet(config.privateKey, provider);
  
  try {
    // 1. Mevcut counter değerini kontrol et
    console.log('1️⃣ On-chain counter kontrolü...');
    const seaportAbi = ['function getCounter(address offerer) view returns (uint256)'];
    const seaportContract = new ethers.Contract(
      '0x0000000000000068f116a894984e2db1123eb395',
      seaportAbi,
      provider
    );
    
    const currentCounter = await seaportContract.getCounter(wallet.address);
    console.log('On-chain counter:', currentCounter.toString());
    
    // 2. Mevcut aktif teklifleri kontrol et
    console.log('\n2️⃣ Mevcut teklifler kontrol ediliyor...');
    try {
      const response = await axios.get(
        `https://api.opensea.io/api/v2/orders/abstract/seaport/offers?maker=${wallet.address}&limit=50`,
        {
          headers: { 'X-API-KEY': config.apiKey }
        }
      );
      
      console.log(`Aktif teklif sayısı: ${response.data.orders?.length || 0}`);
      
      if (response.data.orders && response.data.orders.length > 0) {
        console.log('\nAktif teklifler:');
        response.data.orders.forEach((order, index) => {
          console.log(`\n${index + 1}. Teklif:`);
          console.log(`- Order hash: ${order.order_hash}`);
          console.log(`- Collection: ${order.criteria?.collection?.slug}`);
          console.log(`- Token ID: ${order.criteria?.encoded_token_ids}`);
          console.log(`- Fiyat: ${order.price?.value} (${order.price?.currency})`);
          console.log(`- Counter: ${order.protocol_data?.parameters?.counter}`);
          console.log(`- Bitiş: ${new Date(order.protocol_data?.parameters?.endTime * 1000).toLocaleString()}`);
        });
      }
    } catch (error) {
      console.error('Teklifler alınamadı:', error.message);
    }
    
    // 3. Token #16 için mevcut teklifleri kontrol et
    console.log('\n3️⃣ Token #16 için teklifler...');
    try {
      const tokenResponse = await axios.get(
        'https://api.opensea.io/api/v2/offers/collection/pengztracted-abstract/nfts/16/best',
        {
          headers: { 'X-API-KEY': config.apiKey }
        }
      );
      
      if (tokenResponse.data) {
        console.log('En yüksek teklif:');
        console.log('- Fiyat:', tokenResponse.data.price?.value, tokenResponse.data.price?.currency);
        console.log('- Teklif sahibi:', tokenResponse.data.protocol_data?.parameters?.offerer);
        console.log('- Order hash:', tokenResponse.data.order_hash);
      }
    } catch (error) {
      console.log('Token için teklif yok veya hata:', error.message);
    }
    
    // 4. Test offer oluştur
    console.log('\n4️⃣ Test offer denemesi...');
    const testParams = {
      contractAddress: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      tokenId: '16',
      priceInETH: '0.01',
      durationMinutes: 15
    };
    
    const now = Math.floor(Date.now() / 1000);
    const orderParams = {
      offerer: wallet.address,
      zone: "0x000056F7000000EcE9003ca63978907a00FFD100",
      offer: [{
        itemType: 1,
        token: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809",
        identifierOrCriteria: "0",
        startAmount: ethers.parseEther(testParams.priceInETH).toString(),
        endAmount: ethers.parseEther(testParams.priceInETH).toString()
      }],
      consideration: [
        {
          itemType: 2,
          token: testParams.contractAddress,
          identifierOrCriteria: testParams.tokenId,
          startAmount: "1",
          endAmount: "1",
          recipient: wallet.address
        },
        {
          itemType: 1,
          token: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809",
          identifierOrCriteria: "0",
          startAmount: (ethers.parseEther(testParams.priceInETH) * 50n / 10000n).toString(),
          endAmount: (ethers.parseEther(testParams.priceInETH) * 50n / 10000n).toString(),
          recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
        }
      ],
      orderType: 3,
      startTime: now.toString(),
      endTime: (now + testParams.durationMinutes * 60).toString(),
      zoneHash: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
      totalOriginalConsiderationItems: 2,
      counter: currentCounter.toString() // On-chain counter kullan
    };
    
    console.log('\nKullanılan parametreler:');
    console.log('- Counter:', orderParams.counter);
    console.log('- Salt:', orderParams.salt);
    console.log('- Token ID:', testParams.tokenId);
    
    // İmzala
    const domain = {
      name: "Seaport",
      version: "1.6",
      chainId: 2741,
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
    
    const signature = await wallet.signTypedData(domain, types, orderParams);
    
    // API'ye gönder
    const payload = {
      parameters: orderParams,
      signature: signature,
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    };
    
    console.log('\n📤 API\'ye gönderiliyor...');
    
    try {
      const response = await axios.post(
        'https://api.opensea.io/api/v2/orders/abstract/seaport/offers',
        payload,
        {
          headers: {
            'X-API-KEY': config.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('✅ Başarılı!');
      console.log('Response:', response.data);
    } catch (error) {
      console.error('❌ API Hatası:', error.response?.data?.errors || error.message);
      
      if (error.response?.data?.errors?.[0]?.includes('duplicate')) {
        console.log('\n🔍 Duplicate order analizi:');
        console.log('- Muhtemel sebep: Bu token için zaten aktif bir teklifiniz var');
        console.log('- Çözüm 1: Mevcut teklifi iptal edin');
        console.log('- Çözüm 2: Counter\'ı artırın');
        console.log('- Çözüm 3: Farklı bir token ID deneyin');
      }
    }
    
  } catch (error) {
    console.error('❌ Genel hata:', error.message);
  }
}

debugDuplicateError();