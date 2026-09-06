require('dotenv').config();

// Varsayılan yapılandırma ayarları
const config = {
  // API ve Ağ Ayarları
  apiKey: process.env.OPENSEA_API_KEY,
  apiKeys: [
    process.env.OPENSEA_API_KEY,
    process.env.OPENSEA_API_KEY_2,
    process.env.OPENSEA_API_KEY_3
  ].filter(key => key && !key.includes('YOUR_')),
  privateKey: process.env.PRIVATE_KEY,
  walletAddress: process.env.WALLET_ADDRESS,
  network: process.env.NETWORK || 'testnet',
  rpcUrl: process.env.RPC_URL,
  rpcUrls: [
    process.env.RPC_URL,
    process.env.RPC_URL_2,
    process.env.RPC_URL_3
  ].filter(url => url && url.includes('http')),
  
  // Get RPC URL by chain
  getRpcUrl: function(chain) {
    if (chain === 'abstract') {
      return this.abstractRpcUrls[0];
    }
    return this.rpcUrls[0] || this.rpcUrl;
  },
  
  // Get chain ID by chain name
  getChainId: function(chain) {
    return this.chainIds[chain] || 1;
  },
  
  // Get WETH address by chain
  getWethAddress: function(chain) {
    return this.wethAddresses[chain] || this.wethAddresses.ethereum;
  },
  
  // Get Seaport zone by chain
  getSeaportZone: function(chain) {
    return this.seaportZones[chain] || this.seaportZones.ethereum;
  },
  wethContractAddress: process.env.WETH_CONTRACT_ADDRESS,
  
  // Görev Yönetimi
  tasks: {},
  activeTasks: [],
  
  // OpenSea API Endpoint'leri
  apiBaseUrl: 'https://api.opensea.io',
  seaportAddress: '0x0000000000000068f116a894984e2db1123eb395', // OpenSea API v2 tarafından kabul edilen ikinci protocol address
  testMode: false, // Test modu - gerçek işlem yapmaz
  
  // Chain-specific WETH addresses
  wethAddresses: {
    ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    polygon: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    sepolia: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    abstract: '0x3439153EB7AF838Ad19d56E1571FBD09333C2809'
  },
  
  // Chain-specific Seaport zones
  seaportZones: {
    ethereum: '0x000056F7000000EcE9003ca63978907a00FFD100',
    polygon: '0x000056F7000000EcE9003ca63978907a00FFD100',
    sepolia: '0x000056F7000000EcE9003ca63978907a00FFD100',
    abstract: '0x000056F7000000EcE9003ca63978907a00FFD100' // Seaport 1.6 zone - tüm chainler için aynı
  },
  
  // Chain IDs
  chainIds: {
    ethereum: 1,
    polygon: 137,
    sepolia: 11155111,
    abstract: 2741
  },
  
  // Abstract RPC URLs
  abstractRpcUrls: [
    process.env.ABSTRACT_RPC_URL || 'https://api.mainnet.abs.xyz',
    process.env.ABSTRACT_RPC_URL_2 || 'https://abstract.drpc.org',
    process.env.ABSTRACT_RPC_URL_3 || 'https://api.mainnet.abs.xyz'
  ],
  
  // Stream API Support by Chain
  streamSupport: {
    ethereum: true,
    polygon: true,
    sepolia: true,
    abstract: false // Abstract chain Stream API desteklemiyor
  },
  
  // Abstract Chain Specific Settings
  abstractChain: {
    name: 'abstract',
    id: 2741,
    wethAddress: '0x3439153EB7AF838Ad19d56E1571FBD09333C2809',
    seaportZone: '0x000056F7000000EcE9003ca63978907a00FFD100',
    seaportAddress: '0x0000000000000068f116a894984e2db1123eb395',
    usePolling: true, // Stream API yerine polling kullan
    pollingInterval: 30000, // 30 saniye
    supportedFeatures: {
      stream: false,
      rest: true,
      websocket: false
    }
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
    minPrice: 0.002, // OpenSea minimum 5 USD requirement
    maxPrice: 0.005,
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

// Wallet address validation - Private key'den wallet address türet
const { ethers } = require('ethers');
try {
  const wallet = new ethers.Wallet(config.privateKey);
  const derivedAddress = wallet.address;
  
  // ENS ismi kontrolü
  if (config.walletAddress && !ethers.isAddress(config.walletAddress)) {
    console.warn(`⚠️ WALLET_ADDRESS bir ENS ismi gibi görünüyor: ${config.walletAddress}`);
    config.walletAddress = derivedAddress;
  }
  
  // Wallet address yoksa veya uyuşmuyorsa düzelt
  if (!config.walletAddress || config.walletAddress.toLowerCase() !== derivedAddress.toLowerCase()) {
    if (config.walletAddress) {
      console.warn(`⚠️ Wallet address uyuşmazlığı - Private key'den türetilen kullanılacak`);
    }
    config.walletAddress = derivedAddress;
  }
} catch (error) {
  console.error('❌ Wallet validation hatası:', error.message);
}

module.exports = config;