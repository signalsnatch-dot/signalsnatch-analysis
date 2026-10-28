import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Candle } from '../types/trade.ts';
import { augmentCandlesWithIndicators } from './indicators.ts';

const UPSTOX_BASE_URL = 'https://api.upstox.com/v2';

export class UpstoxApiService {
  private accessToken: string | null = null;
  private cacheDir: string;

  constructor(options?: { accessToken?: string; cacheDir?: string }) {
    this.accessToken = options?.accessToken || process.env.UPSTOX_ACCESS_TOKEN || null;
    this.cacheDir = options?.cacheDir || './market_data';
  }

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  /**
   * Helper to format millisecond timestamp to IST date string YYYY-MM-DD
   */
  static toISTDate(ts: number): string {
    const d = new Date(ts);
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(d);
  }

  /**
   * Convert timestamp to full human-readable IST string
   */
  static toISTString(ts: number): string {
    const d = new Date(ts);
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
    return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year} ${parts.hour}:${parts.minute}:${parts.second} IST`;
  }

  /**
   * Format ms duration strictly into: "X day(s) Hh Mm Ss" as requested in clarification #4
   */
  static formatDurationDaysHours(ms: number): string {
    if (ms <= 0) return '0 days 0h 0m 0s';
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    const dayText = days === 1 ? '1 day' : `${days} days`;
    return `${dayText} ${hours}h ${minutes}m ${seconds}s`;
  }

  /**
   * Standard headers for Upstox API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  /**
   * Fetch 1-minute candle data for an instrument on a specific date.
   * If cached locally on disk in `market_data/`, ALWAYS reuse it first (Requirement 3).
   */
  async fetch1MinCandles(instrumentKey: string, dateStr: string): Promise<Candle[]> {
    const safeKey = instrumentKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    const localCsvPath = path.join(this.cacheDir, dateStr, `${safeKey}.csv`);

    // 1. If present on disk, reuse immediately (ensuring expired contracts still work!)
    if (fs.existsSync(localCsvPath)) {
      const cached = UpstoxApiService.loadCandlesFromCsv(localCsvPath);
      if (cached.length > 0) return cached;
    }

    const encodedKey = encodeURIComponent(instrumentKey);
    const todayIST = UpstoxApiService.toISTDate(Date.now());
    const isToday = dateStr === todayIST;

    const parseCandles = (rawCandles: (string | number)[][]): Candle[] => {
      const candles: Candle[] = rawCandles.map((arr) => {
        const timeIso = String(arr[0]);
        return {
          timestamp: timeIso,
          timeMs: new Date(timeIso).getTime(),
          open: Number(arr[1]),
          high: Number(arr[2]),
          low: Number(arr[3]),
          close: Number(arr[4]),
          volume: Number(arr[5] || 0),
          openInterest: Number(arr[6] || 0),
        };
      });

      const matchingDateCandles = candles.filter((c) => {
        const cDate = UpstoxApiService.toISTDate(c.timeMs);
        return cDate === dateStr;
      });

      matchingDateCandles.sort((a, b) => a.timeMs - b.timeMs);
      // Augment with EMA20, SMA9, SMA21, Crossover indicators
      return augmentCandlesWithIndicators(matchingDateCandles);
    };

    // 2. Try Intraday endpoint if it's today
    if (isToday) {
      try {
        const url = `${UPSTOX_BASE_URL}/historical-candle/intraday/${encodedKey}/1minute`;
        const res = await axios.get(url, { headers: this.getHeaders(), timeout: 10000 });
        if (res.data?.data?.candles && Array.isArray(res.data.data.candles) && res.data.data.candles.length > 0) {
          const parsed = parseCandles(res.data.data.candles);
          if (parsed.length > 0) {
            UpstoxApiService.saveCandlesToCsv(parsed, localCsvPath);
            return parsed;
          }
        }
      } catch {
        // Fallback to historical endpoint below
      }
    }

    // 3. Try Historical endpoint: /v2/historical-candle/{instrumentKey}/1minute/{to_date}/{from_date}
    try {
      const url = `${UPSTOX_BASE_URL}/historical-candle/${encodedKey}/1minute/${dateStr}/${dateStr}`;
      const res = await axios.get(url, { headers: this.getHeaders(), timeout: 10000 });
      if (res.data?.data?.candles && Array.isArray(res.data.data.candles)) {
        const parsed = parseCandles(res.data.data.candles);
        if (parsed.length > 0) {
          UpstoxApiService.saveCandlesToCsv(parsed, localCsvPath);
          return parsed;
        }
      }
    } catch {
      // Try single-date parameter fallback
    }

    try {
      const url = `${UPSTOX_BASE_URL}/historical-candle/${encodedKey}/1minute/${dateStr}`;
      const res = await axios.get(url, { headers: this.getHeaders(), timeout: 10000 });
      if (res.data?.data?.candles && Array.isArray(res.data.data.candles)) {
        const parsed = parseCandles(res.data.data.candles);
        if (parsed.length > 0) {
          UpstoxApiService.saveCandlesToCsv(parsed, localCsvPath);
          return parsed;
        }
      }
    } catch {
      // If historical failed and is not today, try intraday as a backup
      if (!isToday) {
        try {
          const url = `${UPSTOX_BASE_URL}/historical-candle/intraday/${encodedKey}/1minute`;
          const res = await axios.get(url, { headers: this.getHeaders(), timeout: 8000 });
          if (res.data?.data?.candles) {
            const parsed = parseCandles(res.data.data.candles);
            if (parsed.length > 0) {
              UpstoxApiService.saveCandlesToCsv(parsed, localCsvPath);
              return parsed;
            }
          }
        } catch {
          // Ignore
        }
      }
    }

    return [];
  }

  /**
   * Fetch daily candles for an instrument from `fromDate` to `toDate` (YYYY-MM-DD).
   * Used in Command 2 to track when Milestone 1 / Milestone 2 is hit on subsequent days.
   */
  async fetchDailyCandles(instrumentKey: string, fromDate: string, toDate: string): Promise<Candle[]> {
    const encodedKey = encodeURIComponent(instrumentKey);
    try {
      const url = `${UPSTOX_BASE_URL}/historical-candle/${encodedKey}/day/${toDate}/${fromDate}`;
      const res = await axios.get(url, { headers: this.getHeaders(), timeout: 10000 });
      if (res.data?.data?.candles && Array.isArray(res.data.data.candles)) {
        const candles: Candle[] = res.data.data.candles.map((arr: (string | number)[]) => {
          const timeIso = String(arr[0]);
          return {
            timestamp: timeIso,
            timeMs: new Date(timeIso).getTime(),
            open: Number(arr[1]),
            high: Number(arr[2]),
            low: Number(arr[3]),
            close: Number(arr[4]),
            volume: Number(arr[5] || 0),
            openInterest: Number(arr[6] || 0),
          };
        });
        candles.sort((a, b) => a.timeMs - b.timeMs);
        return augmentCandlesWithIndicators(candles);
      }
    } catch {
      try {
        const url = `${UPSTOX_BASE_URL}/historical-candle/${encodedKey}/day/${toDate}`;
        const res = await axios.get(url, { headers: this.getHeaders(), timeout: 10000 });
        if (res.data?.data?.candles && Array.isArray(res.data.data.candles)) {
          const candles: Candle[] = res.data.data.candles.map((arr: (string | number)[]) => {
            const timeIso = String(arr[0]);
            return {
              timestamp: timeIso,
              timeMs: new Date(timeIso).getTime(),
              open: Number(arr[1]),
              high: Number(arr[2]),
              low: Number(arr[3]),
              close: Number(arr[4]),
              volume: Number(arr[5] || 0),
              openInterest: Number(arr[6] || 0),
            };
          });
          candles.sort((a, b) => a.timeMs - b.timeMs);
          return augmentCandlesWithIndicators(candles);
        }
      } catch {
        // Return empty
      }
    }
    return [];
  }

  /**
   * Fetch 1-minute candles spanning across a range of consecutive days (startDate to endDate inclusive).
   * Reuses cached 1-minute CSVs for each date if present, or downloads them.
   */
  async fetchCandleRange(instrumentKey: string, startDateStr: string, endDateStr: string): Promise<Candle[]> {
    if (startDateStr === endDateStr) {
      return this.fetch1MinCandles(instrumentKey, startDateStr);
    }

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const allCandles: Candle[] = [];
    const curr = new Date(start);

    while (curr <= end) {
      const dStr = curr.toISOString().split('T')[0];
      try {
        const dayCandles = await this.fetch1MinCandles(instrumentKey, dStr);
        if (dayCandles && dayCandles.length > 0) {
          allCandles.push(...dayCandles);
        }
      } catch {
        // Ignore single day fetch failure
      }
      curr.setDate(curr.getDate() + 1);
    }

    allCandles.sort((a, b) => a.timeMs - b.timeMs);
    // Remove duplicates if any
    const uniqueCandles: Candle[] = [];
    const seenTimes = new Set<number>();
    for (const c of allCandles) {
      if (!seenTimes.has(c.timeMs)) {
        seenTimes.add(c.timeMs);
        uniqueCandles.push(c);
      }
    }

    return augmentCandlesWithIndicators(uniqueCandles);
  }

  /**
   * Save candles to CSV file including basic indicator columns
   */
  static saveCandlesToCsv(candles: Candle[], filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const header = 'timestamp,open,high,low,close,volume,open_interest,ema20,sma_fast,sma_slow,crossover';
    const rows = candles.map((c) =>
      [
        c.timestamp,
        c.open,
        c.high,
        c.low,
        c.close,
        c.volume,
        c.openInterest ?? 0,
        c.ema20 ?? '',
        c.smaFast ?? '',
        c.smaSlow ?? '',
        c.crossover || '',
      ].join(',')
    );

    fs.writeFileSync(filePath, [header, ...rows].join('\n') + '\n', 'utf-8');
  }

  /**
   * Load candles from a CSV file (recalculating indicators if not present)
   */
  static loadCandlesFromCsv(filePath: string): Candle[] {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length <= 1) return [];

    const candles: Candle[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 6) {
        const timeIso = parts[0].trim();
        candles.push({
          timestamp: timeIso,
          timeMs: new Date(timeIso).getTime(),
          open: parseFloat(parts[1]),
          high: parseFloat(parts[2]),
          low: parseFloat(parts[3]),
          close: parseFloat(parts[4]),
          volume: parseFloat(parts[5] || '0'),
          openInterest: parts[6] ? parseFloat(parts[6]) : 0,
          ema20: parts[7] && !isNaN(parseFloat(parts[7])) ? parseFloat(parts[7]) : undefined,
          smaFast: parts[8] && !isNaN(parseFloat(parts[8])) ? parseFloat(parts[8]) : undefined,
          smaSlow: parts[9] && !isNaN(parseFloat(parts[9])) ? parseFloat(parts[9]) : undefined,
          crossover: (parts[10]?.trim() as 'BULLISH' | 'BEARISH') || null,
        });
      }
    }

    candles.sort((a, b) => a.timeMs - b.timeMs);
    // Ensure indicators are populated
    return augmentCandlesWithIndicators(candles);
  }
}
