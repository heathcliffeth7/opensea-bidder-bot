require('dotenv').config();

// Varsayılan yapılandırma ayarları
const config = {
  // API ve Ağ Ayarları
  apiKey: process.env.OPENSEA_API_KEY,
  privateKey: process.env.PRIVATE_KEY,
  walletAddress: process.env.WALLET_ADDRESS,
  network: process.env.NETWORK || 'testnet',
  rpcUrl: process.env.RPC_URL,
  wethContractAddress: process.env.WETH_CONTRACT_ADDRESS,
  
  // Görev Yönetimi
  tasks: {},
  activeTasks: [],
  
  // OpenSea API Endpoint'leri
  apiBaseUrl: 'https://api.opensea.io',
  seaportAddress: '0x0000000000000068f116a894984e2db1123eb395', // OpenSea API v2 tarafından kabul edilen ikinci protocol address
  
  // Chain-specific WETH addresses
  wethAddresses: {
    ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    polygon: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    sepolia: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'
  },
  
  // Teklif Türleri
  offerTypes: {
    TOKEN_OFFER: 'tokenoffer',
    CRITERIA_OFFER: 'criteriaoffer',
    COLLECTION_OFFER: 'collectionoffer'
  },
  
  // Zaman Birimleri (milisaniye cinsinden)
  timeUnits: {
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000
  },
  
  // Varsayılan Teklif Ayarları
  defaultOfferSettings: {
    minPrice: 0.001,
    maxPrice: 0.003,
    offerTime: 15 * 60 * 1000, // 15 dakika (milisaniye cinsinden)
    loopTime: 0, // 0 dakika (milisaniye cinsinden)
    counterbidEnabled: true,
    counterbidAmount: 0.0001,
    highOfferSkip: true,
    itemLimit: 1
  },
  
  // API İstek Ayarları
  requestDelay: 2000, // 2 saniye (milisaniye cinsinden)
  maxRetries: 3,
  retryDelay: 5000 // 5 saniye (milisaniye cinsinden)
};

module.exports = config;