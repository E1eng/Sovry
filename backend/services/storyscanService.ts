import axios from 'axios';
import config from '../config/env';

class StoryscanService {
  private baseURL: string;
  private apiKey: string;

  constructor() {
    this.baseURL = config.storyscanApi.baseUrl;
    this.apiKey = config.storyscanApi.apiKey;
    if (!this.apiKey) {
      console.warn('⚠️ STORYSCAN_API_KEY not found in environment variables');
    }
  }

  async getIPPrice(): Promise<number | null> {
    try {
      const response = await axios.get(`${this.baseURL}/api/v2/stats`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      });

      if (response.data?.coin_price) return parseFloat(response.data.coin_price);
      if (response.data?.tokenPrice) return parseFloat(response.data.tokenPrice);
      if (response.data?.price) return parseFloat(response.data.price);

      console.warn('⚠️ No price data found in Storyscan response');
      return null;
    } catch (error: any) {
      console.error('❌ Failed to fetch IP price from Storyscan:', error?.message || error);
      return null;
    }
  }

  async getIPPriceWithFallback(): Promise<number | null> {
    const price = await this.getIPPrice();
    if (price !== null) return price;

    const rawFallback = config.pricing?.ipPriceFallbackUsd || '';
    const fallbackPrice = rawFallback ? parseFloat(rawFallback) : NaN;
    if (Number.isFinite(fallbackPrice) && fallbackPrice > 0) {
      console.warn(`⚠️ Using configured IP_PRICE_FALLBACK_USD: $${fallbackPrice}`);
      return fallbackPrice;
    }
    return null;
  }

  async testConnection(): Promise<boolean> {
    try {
      await axios.get(`${this.baseURL}/api/v2/stats`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 5_000,
      });
      return true;
    } catch (error: any) {
      console.error('❌ Storyscan API connection failed:', error?.message || error);
      return false;
    }
  }
}

const storyscanService = new StoryscanService();
export default storyscanService;
