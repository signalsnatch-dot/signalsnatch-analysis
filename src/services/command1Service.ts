import fs from 'fs';
import path from 'path';
import { TradeSignal, DayInstrumentAccumulation, Candle } from '../types/trade.ts';
import { UpstoxApiService } from './upstoxApi.ts';

export interface Command1Progress {
  currentDate: string;
  currentInstrument: string;
  completedCount: number;
  totalCount: number;
  message: string;
}

export interface Command1Result {
  days: {
    date: string;
    totalInstruments: number;
    totalTrades: number;
    downloadedCount: number;
    instruments: {
      instrumentKey: string;
      names: string[];
      tradeCount: number;
      candleCount: number;
      filePath: string;
      status: 'downloaded' | 'empty' | 'error';
      message?: string;
    }[];
  }[];
  totalCsvFiles: number;
  totalCandles: number;
  outputDirectory: string;
}

export class Command1Service {
  private apiService: UpstoxApiService;
  private outputDir: string;

  constructor(options?: { apiService?: UpstoxApiService; outputDir?: string }) {
    this.apiService = options?.apiService || new UpstoxApiService();
    this.outputDir = options?.outputDir || './market_data';
  }

  /**
   * Helper to convert instrument key to a safe filesystem filename
   * e.g. "NSE_FO|48964" -> "NSE_FO_48964"
   */
  static safeFilename(instrumentKey: string): string {
    return instrumentKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Group trades by day (IST YYYY-MM-DD)
   */
  static groupTradesByDay(trades: TradeSignal[]): Map<string, TradeSignal[]> {
    const dayMap = new Map<string, TradeSignal[]>();
    for (const t of trades) {
      const dateStr = UpstoxApiService.toISTDate(t.timestamp);
      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, []);
      }
      dayMap.get(dateStr)!.push(t);
    }
    return dayMap;
  }

  /**
   * Accumulate unique instruments for each day
   */
  static accumulateInstruments(trades: TradeSignal[]): DayInstrumentAccumulation[] {
    const dayMap = Command1Service.groupTradesByDay(trades);
    const accumulations: DayInstrumentAccumulation[] = [];

    for (const [date, dayTrades] of dayMap.entries()) {
      const instMap = new Map<string, { tradeCount: number; names: Set<string> }>();
      for (const t of dayTrades) {
        if (!instMap.has(t.instrument)) {
          instMap.set(t.instrument, { tradeCount: 0, names: new Set() });
        }
        const item = instMap.get(t.instrument)!;
        item.tradeCount++;
        if (t.name) item.names.add(t.name);
      }

      const instruments = Array.from(instMap.entries()).map(([k, val]) => ({
        instrumentKey: k,
        tradeCount: val.tradeCount,
        names: Array.from(val.names),
        csvDownloaded: false,
        candleCount: 0,
      }));

      accumulations.push({
        date,
        totalTrades: dayTrades.length,
        instruments,
      });
    }

    return accumulations;
  }

  /**
   * Execute Command 1:
   * Accumulate instrument keys for each day, fetch Upstox 1-minute data, and save CSVs.
   */
  async execute(
    trades: TradeSignal[],
    onProgress?: (p: Command1Progress) => void
  ): Promise<Command1Result> {
    const dayAccumulations = Command1Service.accumulateInstruments(trades);
    const resultDays: Command1Result['days'] = [];
    let totalCsvFiles = 0;
    let totalCandles = 0;

    // Calculate total operations for progress
    const totalInstruments = dayAccumulations.reduce((acc, d) => acc + d.instruments.length, 0);
    let completedCount = 0;

    for (const day of dayAccumulations) {
      const dateDir = path.join(this.outputDir, day.date);
      if (!fs.existsSync(dateDir)) {
        fs.mkdirSync(dateDir, { recursive: true });
      }

      const dayResultInstruments: Command1Result['days'][0]['instruments'] = [];
      let dayDownloaded = 0;

      for (const inst of day.instruments) {
        completedCount++;
        const safeName = Command1Service.safeFilename(inst.instrumentKey);
        const csvPath = path.join(dateDir, `${safeName}.csv`);

        onProgress?.({
          currentDate: day.date,
          currentInstrument: inst.instrumentKey,
          completedCount,
          totalCount: totalInstruments,
          message: `Fetching 1-min candles for ${inst.instrumentKey} (${inst.names[0] || ''}) on ${day.date}...`,
        });

        let candles: Candle[] = [];
        let status: 'downloaded' | 'empty' | 'error' = 'empty';
        let message = '';

        try {
          candles = await this.apiService.fetch1MinCandles(inst.instrumentKey, day.date);

          if (candles.length > 0) {
            UpstoxApiService.saveCandlesToCsv(candles, csvPath);
            status = 'downloaded';
            dayDownloaded++;
            totalCsvFiles++;
            totalCandles += candles.length;
            message = `Saved ${candles.length} candles`;
          } else {
            status = 'empty';
            message = '0 candles returned from Upstox for this date';
          }
        } catch (err: unknown) {
          status = 'error';
          message = err instanceof Error ? err.message : String(err);
        }

        dayResultInstruments.push({
          instrumentKey: inst.instrumentKey,
          names: inst.names,
          tradeCount: inst.tradeCount,
          candleCount: candles.length,
          filePath: csvPath,
          status,
          message,
        });

        // Small pause to be gentle to API rate limits
        await new Promise((resolve) => setTimeout(resolve, 80));
      }

      resultDays.push({
        date: day.date,
        totalInstruments: day.instruments.length,
        totalTrades: day.totalTrades,
        downloadedCount: dayDownloaded,
        instruments: dayResultInstruments,
      });
    }

    return {
      days: resultDays,
      totalCsvFiles,
      totalCandles,
      outputDirectory: this.outputDir,
    };
  }
}
