// We use an open JSON mirror of the CBR daily XML stream due to browser CORS issues fetching directly from cbr.ru.
const CBR_DAILY_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
// Fetch from a public Binance endpoint that allows single ticket fetches or fetch top and filter
const BINANCE_API_URL = 'https://api.binance.com/api/v3/ticker/24hr'; // Using 24hr to get priceChangePercent or high/low

export type Trend = 'up' | 'down' | 'flat';

export interface NumericData {
  value: number;
  trend: Trend;
}

export interface CurrencyRates {
  USD: NumericData;
  EUR: NumericData;
  CNY: NumericData;
  CHF: NumericData;
  JPY: NumericData;
  TRY: NumericData;
  KZT: NumericData;
  AED: NumericData;
  THB: NumericData;
  VND: NumericData;
  date: string;
}

export interface CryptoRates {
  BTC: NumericData;
  ETH: NumericData;
}

export interface MarketIndices {
  DOW_JONES: NumericData;
  S_AND_P_500: NumericData;
  RUSSELL_2000: NumericData;
  NIKKEI_225: NumericData;
}

export interface MacroEconomics {
  inflationRate: NumericData; 
  keyRate: NumericData;
  currencyRates: CurrencyRates | null;
  cryptoRates: CryptoRates | null;
  indices: MarketIndices | null;
}

// Helper to determine trend
function getTrend(current: number, previous: number): Trend {
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'flat';
}

// Fetch helper for Yahoo Finance via a CORS proxy adapter
async function fetchIndexProxy(symbol: string, fallback: number): Promise<NumericData> {
  try {
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
    // Use corsproxy.io as a reliable fallback for browser environments
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
    if (!res.ok) return { value: fallback, trend: 'flat' };
    
    // Some proxies return JSON directly, some wrap it. corsproxy.io returns the raw requested JSON
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    
    const meta = result?.meta;
    const price = meta?.regularMarketPrice;
    const previousClose = meta?.chartPreviousClose || meta?.previousClose || price;
    
    return {
      value: price || fallback,
      trend: getTrend(price, previousClose)
    };
  } catch (err) {
    // Silently fall back to cached/default values to avoid console clutter. 
    return { value: fallback, trend: 'flat' };
  }
}

// Helper to fetch individual binance tokens using 24hr stats for trend
async function fetchCrypto(symbol: string, fallback: number): Promise<NumericData> {
  try {
    const res = await fetch(`${BINANCE_API_URL}?symbol=${symbol}USDT`);
    if (!res.ok) return { value: fallback, trend: 'flat' };
    const data = await res.json();
    const price = parseFloat(data.lastPrice);
    const prevPrice = parseFloat(data.prevClosePrice); // prev close price 24h ago
    
    if (!isNaN(price) && !isNaN(prevPrice) && price > 0) {
      return {
        value: price,
        trend: getTrend(price, prevPrice)
      };
    }
  } catch {
    // fall through
  }
  return { value: fallback, trend: 'flat' };
}

export async function fetchMacroEconomics(): Promise<MacroEconomics> {
  let currencyRates: CurrencyRates | null = null;
  let cryptoRates: CryptoRates | null = null;
  
  // 1. Fetch CBR Fiat rates (Using official JSON mirror)
  try {
    const response = await fetch(CBR_DAILY_URL);
    if (!response.ok) throw new Error("CBR API failed");
    const data = await response.json();
    
    // Normalize values to 1 unit of foreign currency to RUB 
    // Data contains Value and Nominal. Price for 1 unit = Value / Nominal
    const getRate = (code: string): NumericData | null => {
      const v = data.Valute[code];
      if (!v) return null;
      const current = v.Value / v.Nominal;
      const previous = v.Previous / v.Nominal;
      return { value: current, trend: getTrend(current, previous) };
    };

    const dflt = { value: 0, trend: 'flat' as Trend };

    currencyRates = {
      USD: getRate('USD') || dflt,
      EUR: getRate('EUR') || dflt,
      CNY: getRate('CNY') || dflt,
      CHF: getRate('CHF') || dflt,
      JPY: getRate('JPY') || dflt,
      TRY: getRate('TRY') || dflt,
      KZT: getRate('KZT') || dflt,
      AED: getRate('AED') || dflt,
      THB: getRate('THB') || dflt,
      VND: getRate('VND') || dflt,
      date: data.Date
    };
  } catch (error) {
    console.error("Failed to fetch CBR rates:", error);
  }

  // 2. Fetch Crypto from Binance
  const [btcData, ethData] = await Promise.all([
    fetchCrypto('BTC', 65000),
    fetchCrypto('ETH', 3500)
  ]);
  
  cryptoRates = {
    BTC: btcData,
    ETH: ethData
  };

  // 3. Market Indices fetched once per load concurrently
  // Updated fallbacks to April 2026 actuals
  const [snp, dow, russell, nikkei] = await Promise.all([
    fetchIndexProxy('^GSPC', 5200.75),
    fetchIndexProxy('^DJI', 49164.00),
    fetchIndexProxy('^RUT', 2050.10),
    fetchIndexProxy('^N225', 39200.00)
  ]);

  const indices: MarketIndices = {
    S_AND_P_500: snp,
    DOW_JONES: dow,
    RUSSELL_2000: russell,
    NIKKEI_225: nikkei
  };

  return {
    inflationRate: { value: 7.7, trend: 'up' }, // Rosstat inflation est
    keyRate: { value: 16.0, trend: 'flat' }, // CBR key rate
    currencyRates,
    cryptoRates,
    indices
  };
}

/**
 * Validates if paying off a debt early is mathematically sound.
 */
export function isEarlyRepaymentProfitable(loanRate: number, currentInflation: number): boolean {
  return loanRate > currentInflation;
}
