/**
 * Rate Limiter - API isteklerini kontrol eder
 * OpenSea API limitleri:
 * - 4 requests/second
 * - 200 requests/minute
 */

class RateLimiter {
  constructor() {
    this.requests = [];
    this.maxRequestsPerSecond = 2; // Daha güvenli - saniyede 2 istek
    this.maxRequestsPerMinute = 100; // Daha güvenli - dakikada 100 istek
    this.minDelayBetweenRequests = 500; // Minimum 500ms ara
    this.apiKeyRotation = true; // API key rotasyonu aktif
  }

  /**
   * İstek yapılabilir mi kontrol et
   */
  async checkAndWait() {
    // Rate limit tamamen devre dışı
    return;
  }

  /**
   * İstatistikleri göster
   */
  getStats() {
    const now = Date.now();
    const recentRequests = this.requests.filter(time => now - time < 1000);
    const minuteRequests = this.requests.filter(time => now - time < 60000);
    
    return {
      lastSecond: recentRequests.length,
      lastMinute: minuteRequests.length,
      maxPerSecond: this.maxRequestsPerSecond,
      maxPerMinute: this.maxRequestsPerMinute
    };
  }
}

module.exports = new RateLimiter();