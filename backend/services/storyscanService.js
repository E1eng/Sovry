const axios = require('axios');
const config = require('../config/env');

class StoryscanService {
  constructor() {
    this.baseURL = config.storyscanApi.baseUrl;
    this.apiKey = config.storyscanApi.apiKey;
    if (!this.apiKey) {
      console.warn('⚠️ STORYSCAN_API_KEY not found in environment variables');
    }
  }

  /**
   * Get IP token price from Storyscan API
   * @returns {Promise<number>} IP price in USD
   */
  async getIPPrice() {
    try {
      console.log('🔍 Fetching IP price from Storyscan...');
      
      const response = await axios.get(`${this.baseURL}/api/v2/stats`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      // Check for coin_price (the actual field returned by the API)
      if (response.data && response.data.coin_price) {
        const ipPrice = parseFloat(response.data.coin_price);
        console.log(`✅ IP price from Storyscan: $${ipPrice}`);
        return ipPrice;
      }

      // Fallback if coin_price not in expected format
      if (response.data && response.data.tokenPrice) {
        const ipPrice = parseFloat(response.data.tokenPrice);
        console.log(`✅ IP price from Storyscan (fallback): $${ipPrice}`);
        return ipPrice;
      }

      // Another fallback field
      if (response.data && response.data.price) {
        const ipPrice = parseFloat(response.data.price);
        console.log(`✅ IP price from Storyscan (fallback 2): $${ipPrice}`);
        return ipPrice;
      }

      console.warn('⚠️ No price data found in Storyscan response');
      console.log('📊 Storyscan response:', JSON.stringify(response.data, null, 2));
      return null;
    } catch (error) {
      console.error('❌ Failed to fetch IP price from Storyscan:', error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      
      return null;
    }
  }

  /**
   * Get cached IP price with fallback
   * @returns {Promise<number>} IP price in USD
   */
  async getIPPriceWithFallback() {
    const price = await this.getIPPrice();
    
    if (price !== null) {
      return price;
    }

    const rawFallback = config.pricing && config.pricing.ipPriceFallbackUsd ? config.pricing.ipPriceFallbackUsd : '';
    const fallbackPrice = rawFallback ? parseFloat(rawFallback) : NaN;
    if (Number.isFinite(fallbackPrice) && fallbackPrice > 0) {
      console.warn(`⚠️ Using configured IP_PRICE_FALLBACK_USD: $${fallbackPrice}`);
      return fallbackPrice;
    }

    return null;
  }

  /**
   * Test Storyscan API connection
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      const response = await axios.get(`${this.baseURL}/api/v2/stats`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      console.log('✅ Storyscan API connection successful');
      return true;
    } catch (error) {
      console.error('❌ Storyscan API connection failed:', error.message);
      return false;
    }
  }
}

module.exports = new StoryscanService();
