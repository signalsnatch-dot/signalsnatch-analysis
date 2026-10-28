import fs from 'fs';
import path from 'path';
import {
  TradeSignal,
  Candle,
  MilestoneHit,
  Milestone2Hit,
  TradeMilestoneAnalysis,
  DrawdownAnalysis,
  TradeGroup5Min,
} from '../types/trade.ts';
import { UpstoxApiService } from './upstoxApi.ts';
import { Command1Service } from './command1Service.ts';
import { getInstrumentLotSize, isNseFoInstrument } from '../config/instrumentConfig.ts';

export interface Command2Options {
  versionFilters?: string[]; // e.g. ['ULTRA', 'UBER'] or specific version names
  useAllVersions?: boolean;
  marketDataDir?: string;
  outputReportsDir?: string;
  volumeTradesOnly?: boolean; // Default true (Filter volume-based trades)
}

export interface Command2Progress {
  currentIndex: number;
  totalTrades: number;
  currentTradeName: string;
  currentVersion: string;
  message: string;
}

export interface DateDayM1Breakdown {
  periodKey: string; // e.g. "2026-10-27" or "Tuesday"
  totalTrades: number;
  uberTotal: number;
  uberTpCount: number; // M1 is TP (Loss for Uber)
  uberSlCount: number; // M1 is SL (Goal/Success for Uber)
  uberWinRate: number;
  ultraTotal: number;
  ultraTpCount: number; // M1 is TP (Goal/Success for Ultra)
  ultraSlCount: number; // M1 is SL (Loss for Ultra)
  ultraWinRate: number;
  overallWinRate: number;
}

export interface ClassifiedTicksSummary {
  bracket: string; // e.g. "< 50", "50 - 100", "100 - 250", "250 - 500", "> 500"
  count: number;
  percentage: number;
  avgTimeTakenFormatted: string;
  avgTicks: number;
}

export interface LossTradeDetail {
  instrument: string;
  name: string;
  version: string;
  dateStr: string;
  type: string;
  entry: number;
  goalMilestone: 'SL' | 'TP';
  adverseMilestone: 'SL' | 'TP';
  entryTimeIST: string;
  m1HitTimeIST: string; // TP time for Uber, SL time for non-Uber
  m1Type: 'SL' | 'TP';
  durationFormatted: string;
  maxLossMultiple: number;
  lossBeforeEntryReturn: number;
  slCrossCount: number;
  tpCrossCount: number;
  entryCrossCount: number;
  ticks: number;
}

export interface Command2Summary {
  totalTradesAnalyzed: number;
  totalVolumeTradesFiltered: number;
  successCount: number;
  lossCount: number;
  overallWinRatePercentage: number;
  uberSuccessRate: {
    totalUber: number;
    uberSuccessCount: number; // M1 hit SL
    uberLossCount: number; // M1 hit TP
    uberSuccessPercentage: number;
  };
  ultraSuccessRate: {
    totalUltra: number;
    ultraSuccessCount: number; // M1 hit TP
    ultraLossCount: number; // M1 hit SL
    ultraSuccessPercentage: number;
  };
  m1Hits: {
    tpCount: number;
    slCount: number;
    bothCount: number;
    neitherCount: number;
    tpPercentage: number;
    slPercentage: number;
  };
  m2Hits: {
    achievedSameDayCount: number;
    achievedMultiDayCount: number;
    pendingCount: number;
    sameDayPercentage: number;
    multiDayPercentage: number;
    pendingPercentage: number;
  };
  averages: {
    avgCandlesToM1: number;
    avgTimeMsToM1: number;
    avgTimeM1Formatted: string;
    avgM1Ticks: number; // Average ticks (volume / threshold with NSE_FO lotSize applied)
    avgTimeMsToM2: number;
    avgTimeM2Formatted: string;
    avgM2Ticks: number;
    avgMaxLossMultiple: number; // e.g. 2.4x
    avgLossMultipleBeforeEntryReturn: number;
  };
  totalGroupsCount: number;
  dateBreakdowns: DateDayM1Breakdown[];
  dayOfWeekBreakdowns: DateDayM1Breakdown[];
  classifiedTicks: ClassifiedTicksSummary[];
  lossTrades: LossTradeDetail[];
}

export interface Command2Result {
  analyses: TradeMilestoneAnalysis[];
  groups5Min: TradeGroup5Min[];
  summary: Command2Summary;
  reportCsvPath?: string;
}

export class Command2Service {
  private apiService: UpstoxApiService;
  private marketDataDir: string;
  private reportsDir: string;

  constructor(options?: {
    apiService?: UpstoxApiService;
    marketDataDir?: string;
    reportsDir?: string;
  }) {
    this.apiService = options?.apiService || new UpstoxApiService();
    this.marketDataDir = options?.marketDataDir || './market_data';
    this.reportsDir = options?.reportsDir || './reports';
  }

  /**
   * Check if a trade matches the version filter
   */
  static matchesVersion(tradeVersion: string, filters?: string[], useAll?: boolean): boolean {
    if (useAll) return true;
    if (!filters || filters.length === 0) {
      return /ultra|uber/i.test(tradeVersion);
    }
    const upper = tradeVersion.toUpperCase();
    return filters.some((f) => upper.includes(f.toUpperCase()));
  }

  /**
   * Check if a version is Uber (for which M1 target/goal is SL)
   */
  static isUberVersion(version: string): boolean {
    return /uber/i.test(version);
  }

  /**
   * Load 1-minute candles for an instrument on a given date (from CSV cache first to support expired contracts!)
   */
  async getCandlesForDay(instrumentKey: string, dateStr: string): Promise<Candle[]> {
    const safeName = Command1Service.safeFilename(instrumentKey);
    const csvPath = path.join(this.marketDataDir, dateStr, `${safeName}.csv`);

    // 1. Try reading from CSV on disk (supports expired contracts!)
    if (fs.existsSync(csvPath)) {
      const candles = UpstoxApiService.loadCandlesFromCsv(csvPath);
      if (candles.length > 0) return candles;
    }

    // 2. Fallback to API directly
    try {
      const candles = await this.apiService.fetch1MinCandles(instrumentKey, dateStr);
      if (candles.length > 0) {
        UpstoxApiService.saveCandlesToCsv(candles, csvPath);
      }
      return candles;
    } catch {
      return [];
    }
  }

  /**
   * Helper to sum candle volumes strictly between entry timestamp and hit timestamp,
   * prorating boundary candles based on seconds elapsed.
   * FOR NSE_FO INSTRUMENTS: volume is divided by lotSize before summing and dividing by threshold!
   */
  static calculateVolumeAndTicks(
    candles: Candle[],
    startCandleIdx: number,
    hitCandleIdx: number,
    entryTimeMs: number,
    hitTimeMs: number,
    threshold: number,
    lotSize: number = 1
  ): { volumeSum: number; ticks: number } {
    if (candles.length === 0 || startCandleIdx < 0 || hitCandleIdx < startCandleIdx) {
      return { volumeSum: 0, ticks: 0 };
    }

    let volumeSum = 0;
    const safeThreshold = threshold > 0 ? threshold : 1;
    const safeLotSize = lotSize > 0 ? lotSize : 1;

    if (startCandleIdx === hitCandleIdx) {
      // Entry and hit in the same minute
      const candle = candles[startCandleIdx];
      const entrySec = Math.floor((entryTimeMs % 60000) / 1000);
      const hitSec = Math.min(59, Math.max(entrySec + 1, Math.floor((hitTimeMs % 60000) / 1000)));
      const fraction = Math.max(0.1, (hitSec - entrySec) / 60);
      const adjustedVol = candle.volume / safeLotSize;
      volumeSum = Math.round(adjustedVol * fraction);
    } else {
      // Multiple candles
      // 1. Entry candle fraction (from entry second to end of minute)
      const entryCandle = candles[startCandleIdx];
      const entrySec = Math.floor((entryTimeMs % 60000) / 1000);
      const entryFraction = Math.max(0.1, (60 - entrySec) / 60);
      volumeSum += Math.round((entryCandle.volume / safeLotSize) * entryFraction);

      // 2. Full intermediate candles
      for (let i = startCandleIdx + 1; i < hitCandleIdx; i++) {
        volumeSum += Math.round(candles[i].volume / safeLotSize);
      }

      // 3. Hit candle fraction (from start of minute to hit second)
      const hitCandle = candles[hitCandleIdx];
      const hitSec = Math.max(1, Math.floor((hitTimeMs % 60000) / 1000));
      const hitFraction = Math.min(1.0, Math.max(0.1, hitSec / 60));
      volumeSum += Math.round((hitCandle.volume / safeLotSize) * hitFraction);
    }

    const ticks = parseFloat((volumeSum / safeThreshold).toFixed(2));
    return { volumeSum, ticks };
  }

  /**
   * Evaluate a single trade's milestones with multi-day M1 & M2 resolution,
   * NSE_FO lotSize adjustment in volume/ticks, Uber vs Ultra targets,
   * adverse excursion drawdown, and crossings tracking.
   */
  async evaluateTrade(trade: TradeSignal): Promise<TradeMilestoneAnalysis> {
    const dateStr = UpstoxApiService.toISTDate(trade.timestamp);
    const entryIst = UpstoxApiService.toISTString(trade.timestamp);
    const isBuy = trade.type === 'BUY_STOP';
    const isUber = Command2Service.isUberVersion(trade.version);

    // Lot Size calculation: For NSE_FO, Upstox volume is in shares/units, so divide by lotSize
    const isNseFo = isNseFoInstrument(trade.instrument);
    const lotSize = isNseFo ? getInstrumentLotSize(trade.instrument, trade.name) : 1;

    // Target / Goal definitions:
    // Uber: Goal is SL (Hitting SL as M1 is SUCCESS). Hitting TP as M1 is LOSS.
    // Ultra/Others: Goal is TP (Hitting TP as M1 is SUCCESS). Hitting SL as M1 is LOSS.
    const expectedTarget: 'TP' | 'SL' = isUber ? 'SL' : 'TP';

    // Planned risk unit scale for adverse excursion:
    // For Uber: Adverse direction is towards TP! Scale is |entry - tp|
    // For Non-Uber: Adverse direction is towards SL! Scale is |entry - sl|
    const plannedRisk = isUber
      ? Math.abs(trade.entry - trade.tp) || 1
      : Math.abs(trade.entry - trade.sl) || 1;

    // Load 1-minute candles for the entry day
    const dayCandles = await this.getCandlesForDay(trade.instrument, dateStr);

    const defaultDrawdown: DrawdownAnalysis = {
      plannedRisk: parseFloat(plannedRisk.toFixed(2)),
      maxAdversePoints: 0,
      maxLossMultiple: 0,
      maxLossBeforeEntryReturn: 0,
      lossMultipleBeforeEntryReturn: 0,
      slCrossCount: 0,
      tpCrossCount: 0,
      entryCrossCount: 0,
      drawdownTicks: 0,
      drawdownTimeFormatted: '0 days 0h 0m 0s',
    };

    if (!dayCandles || dayCandles.length === 0) {
      return {
        trade,
        entryIst,
        dateStr,
        matchedVersionFilter: true,
        candlesFoundForDay: 0,
        expectedTarget,
        isSuccess: false,
        milestone1: null,
        milestone2: null,
        drawdown: defaultDrawdown,
        status: 'NO_CANDLE_DATA',
        lotSizeUsed: lotSize,
        isVolumeTrade: trade.threshold > 0,
      };
    }

    // Active candle timeline starts from entry timestamp
    const tradeEntryMs = trade.timestamp;
    const startIndex = dayCandles.findIndex((c) => c.timeMs + 60_000 >= tradeEntryMs);
    const candidateCandles = startIndex >= 0 ? dayCandles.slice(startIndex) : dayCandles;
    const effectiveStartIdx = startIndex >= 0 ? startIndex : 0;

    let milestone1: MilestoneHit | null = null;
    let milestone2: Milestone2Hit | null = null;
    let m1CandleLocalIndex = -1;

    // Crossings & Drawdown Tracking
    let slCrossCount = 0;
    let tpCrossCount = 0;
    let entryCrossCount = 0;

    let maxAdversePoints = 0;
    let maxLossBeforeEntryReturn = 0;
    let hasReturnedToEntry = false;
    let drawdownVolume = 0;
    let drawdownCandlesCount = 0;

    // Helper to evaluate candle for crossings & adverse excursions
    const processCandleExcursion = (candle: Candle, candleIdx: number) => {
      // 1. Crossings (price spanned through the level)
      if (candle.low <= trade.sl && candle.high >= trade.sl) slCrossCount++;
      if (candle.low <= trade.tp && candle.high >= trade.tp) tpCrossCount++;
      if (candle.low <= trade.entry && candle.high >= trade.entry) entryCrossCount++;

      // 2. Adverse price movement relative to goal:
      let adverseDistance = 0;
      let isInAdverse = false;

      if (isUber) {
        // Goal is SL. Adverse is in TP direction!
        if (isBuy) {
          // BUY_STOP: TP is above entry. Adverse movement is price going UP towards TP!
          adverseDistance = Math.max(0, candle.high - trade.entry);
          isInAdverse = candle.close > trade.entry;
        } else {
          // SELL_STOP: TP is below entry. Adverse movement is price going DOWN towards TP!
          adverseDistance = Math.max(0, trade.entry - candle.low);
          isInAdverse = candle.close < trade.entry;
        }
      } else {
        // Non-Uber: Goal is TP. Adverse is in SL direction!
        if (isBuy) {
          // BUY_STOP: SL is below entry. Adverse movement is price going DOWN towards SL!
          adverseDistance = Math.max(0, trade.entry - candle.low);
          isInAdverse = candle.close < trade.entry;
        } else {
          // SELL_STOP: SL is above entry. Adverse movement is price going UP towards SL!
          adverseDistance = Math.max(0, candle.high - trade.entry);
          isInAdverse = candle.close > trade.entry;
        }
      }

      if (adverseDistance > maxAdversePoints) {
        maxAdversePoints = adverseDistance;
      }

      // Track excursion before price first returns to entry level
      if (!hasReturnedToEntry) {
        if (adverseDistance > maxLossBeforeEntryReturn) {
          maxLossBeforeEntryReturn = adverseDistance;
        }
        // Check if price returned to entry after initial bar
        if (candleIdx > 0 && candle.low <= trade.entry && candle.high >= trade.entry) {
          hasReturnedToEntry = true;
        }
      }

      if (isInAdverse) {
        drawdownVolume += Math.round(candle.volume / lotSize);
        drawdownCandlesCount++;
      }
    };

    // Scan intraday candles for Milestone 1 & 2
    for (let i = 0; i < candidateCandles.length; i++) {
      const candle = candidateCandles[i];
      const globalCandleIdx = effectiveStartIdx + i;

      processCandleExcursion(candle, i);

      const hitTP = isBuy ? candle.high >= trade.tp : candle.low <= trade.tp;
      const hitSL = isBuy ? candle.low <= trade.sl : candle.high >= trade.sl;

      if (!milestone1) {
        if (hitTP && hitSL) {
          const distToSL = Math.abs(candle.open - trade.sl);
          const distToTP = Math.abs(candle.open - trade.tp);
          const inferredFirst = distToSL < distToTP ? 'SL' : 'TP';
          const hitTimeMs = candle.timeMs;
          const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
            dayCandles,
            effectiveStartIdx,
            globalCandleIdx,
            tradeEntryMs,
            hitTimeMs,
            trade.threshold,
            lotSize
          );

          milestone1 = {
            type: inferredFirst,
            candleIndex: i,
            candleTimestamp: candle.timestamp,
            candleTimeMs: candle.timeMs,
            candlesCount: i + 1,
            daysElapsed: 0,
            timeTakenMs: Math.max(0, candle.timeMs - tradeEntryMs),
            timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, candle.timeMs - tradeEntryMs)),
            cumulativeVolume: volumeSum,
            ticks,
            hitPrice: inferredFirst === 'SL' ? trade.sl : trade.tp,
            hitDate: dateStr,
          };
          m1CandleLocalIndex = i;
        } else if (hitSL) {
          const hitTimeMs = candle.timeMs;
          const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
            dayCandles,
            effectiveStartIdx,
            globalCandleIdx,
            tradeEntryMs,
            hitTimeMs,
            trade.threshold,
            lotSize
          );

          milestone1 = {
            type: 'SL',
            candleIndex: i,
            candleTimestamp: candle.timestamp,
            candleTimeMs: candle.timeMs,
            candlesCount: i + 1,
            daysElapsed: 0,
            timeTakenMs: Math.max(0, candle.timeMs - tradeEntryMs),
            timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, candle.timeMs - tradeEntryMs)),
            cumulativeVolume: volumeSum,
            ticks,
            hitPrice: trade.sl,
            hitDate: dateStr,
          };
          m1CandleLocalIndex = i;
        } else if (hitTP) {
          const hitTimeMs = candle.timeMs;
          const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
            dayCandles,
            effectiveStartIdx,
            globalCandleIdx,
            tradeEntryMs,
            hitTimeMs,
            trade.threshold,
            lotSize
          );

          milestone1 = {
            type: 'TP',
            candleIndex: i,
            candleTimestamp: candle.timestamp,
            candleTimeMs: candle.timeMs,
            candlesCount: i + 1,
            daysElapsed: 0,
            timeTakenMs: Math.max(0, candle.timeMs - tradeEntryMs),
            timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, candle.timeMs - tradeEntryMs)),
            cumulativeVolume: volumeSum,
            ticks,
            hitPrice: trade.tp,
            hitDate: dateStr,
          };
          m1CandleLocalIndex = i;
        }
      } else if (!milestone2 && i > m1CandleLocalIndex) {
        // Milestone 1 already hit, look for Milestone 2 in same day
        const target2 = milestone1.type === 'SL' ? 'TP' : 'SL';
        const hitTarget2 = target2 === 'TP' ? hitTP : hitSL;

        if (hitTarget2) {
          const hitTimeMs = candle.timeMs;
          const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
            dayCandles,
            effectiveStartIdx,
            globalCandleIdx,
            tradeEntryMs,
            hitTimeMs,
            trade.threshold,
            lotSize
          );

          milestone2 = {
            type: target2,
            achievedSameDay: true,
            candleIndex: i,
            candleTimestamp: candle.timestamp,
            hitDate: dateStr,
            candlesCount: i + 1,
            daysElapsed: 0,
            timeTakenMs: Math.max(0, candle.timeMs - tradeEntryMs),
            timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, candle.timeMs - tradeEntryMs)),
            cumulativeVolume: volumeSum,
            ticks,
            notes: `Achieved same day at candle #${i + 1}`,
          };
          break;
        }
      }
    }

    // MULTI-DAY MILESTONE TRACKING:
    // If M1 or M2 is not achieved on the entry day, scan consecutive days' high/low ranges day-by-day.
    // Once the target day is identified, fetch the 1-minute candles from entry date through that identified day,
    // and pinpoint the exact minute, volume ticks, and time!
    let fullMultiDayCandles: Candle[] = [...candidateCandles];
    const todayDate = UpstoxApiService.toISTDate(Date.now());
    let consecutiveDailyCandles: Candle[] = [];

    if (!milestone1 || (milestone1 && !milestone2)) {
      try {
        const nextDay = new Date(new Date(dateStr).getTime() + 86400000).toISOString().split('T')[0];
        consecutiveDailyCandles = await this.apiService.fetchDailyCandles(trade.instrument, nextDay, todayDate);
      } catch {
        consecutiveDailyCandles = [];
      }
    }

    // Multi-Day M1 Resolution
    if (!milestone1 && consecutiveDailyCandles.length > 0) {
      let targetDayDate: string | null = null;
      let dayCount = 0;

      for (const dayCandle of consecutiveDailyCandles) {
        dayCount++;
        const dDate = UpstoxApiService.toISTDate(dayCandle.timeMs);
        const hitDayTP = isBuy ? dayCandle.high >= trade.tp : dayCandle.low <= trade.tp;
        const hitDaySL = isBuy ? dayCandle.low <= trade.sl : dayCandle.high >= trade.sl;

        if (hitDayTP || hitDaySL) {
          targetDayDate = dDate;
          break;
        }
      }

      if (targetDayDate) {
        // Fetch 1-min candles from entry date through targetDayDate!
        const rangeCandles = await this.apiService.fetchCandleRange(trade.instrument, dateStr, targetDayDate);
        if (rangeCandles.length > 0) {
          fullMultiDayCandles = rangeCandles;
          const multiStartIdx = rangeCandles.findIndex((c) => c.timeMs + 60_000 >= tradeEntryMs);
          const activeRange = multiStartIdx >= 0 ? rangeCandles.slice(multiStartIdx) : rangeCandles;
          const baseIdx = multiStartIdx >= 0 ? multiStartIdx : 0;

          for (let k = 0; k < activeRange.length; k++) {
            const c = activeRange[k];
            processCandleExcursion(c, candidateCandles.length + k);

            const hitTP = isBuy ? c.high >= trade.tp : c.low <= trade.tp;
            const hitSL = isBuy ? c.low <= trade.sl : c.high >= trade.sl;

            if (hitTP || hitSL) {
              const hitType: 'TP' | 'SL' = hitTP && !hitSL ? 'TP' : 'SL';
              const hitTimeMs = c.timeMs;
              const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
                rangeCandles,
                baseIdx,
                baseIdx + k,
                tradeEntryMs,
                hitTimeMs,
                trade.threshold,
                lotSize
              );

              milestone1 = {
                type: hitType,
                candleIndex: k,
                candleTimestamp: c.timestamp,
                candleTimeMs: c.timeMs,
                candlesCount: candidateCandles.length + k + 1,
                daysElapsed: dayCount,
                timeTakenMs: Math.max(0, hitTimeMs - tradeEntryMs),
                timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, hitTimeMs - tradeEntryMs)),
                cumulativeVolume: volumeSum,
                ticks,
                hitPrice: hitType === 'TP' ? trade.tp : trade.sl,
                hitDate: targetDayDate,
              };
              m1CandleLocalIndex = k;
              break;
            }
          }
        }
      }
    }

    // Multi-Day M2 Resolution (Milestone 1 reached, scanning for Milestone 2)
    if (milestone1 && !milestone2 && consecutiveDailyCandles.length > 0) {
      const target2 = milestone1.type === 'SL' ? 'TP' : 'SL';
      let targetM2DayDate: string | null = null;
      let dayCount = milestone1.daysElapsed;

      for (let d = milestone1.daysElapsed; d < consecutiveDailyCandles.length; d++) {
        const dayCandle = consecutiveDailyCandles[d];
        dayCount++;
        const dDate = UpstoxApiService.toISTDate(dayCandle.timeMs);
        const hitDayTarget2 = target2 === 'TP'
          ? (isBuy ? dayCandle.high >= trade.tp : dayCandle.low <= trade.tp)
          : (isBuy ? dayCandle.low <= trade.sl : dayCandle.high >= trade.sl);

        if (hitDayTarget2) {
          targetM2DayDate = dDate;
          break;
        }
      }

      if (targetM2DayDate) {
        // Fetch 1m candles through targetM2DayDate
        const rangeCandles = await this.apiService.fetchCandleRange(trade.instrument, dateStr, targetM2DayDate);
        if (rangeCandles.length > 0) {
          fullMultiDayCandles = rangeCandles;
          const multiStartIdx = rangeCandles.findIndex((c) => c.timeMs + 60_000 >= tradeEntryMs);
          const activeRange = multiStartIdx >= 0 ? rangeCandles.slice(multiStartIdx) : rangeCandles;
          const baseIdx = multiStartIdx >= 0 ? multiStartIdx : 0;

          // Locate M1 candle index in range
          const m1IdxInRange = activeRange.findIndex((c) => c.timeMs >= milestone1!.candleTimeMs);
          const searchStart = m1IdxInRange >= 0 ? m1IdxInRange + 1 : 0;

          for (let m = searchStart; m < activeRange.length; m++) {
            const c = activeRange[m];
            processCandleExcursion(c, candidateCandles.length + m);

            const hitTP = isBuy ? c.high >= trade.tp : c.low <= trade.tp;
            const hitSL = isBuy ? c.low <= trade.sl : c.high >= trade.sl;
            const hitTarget2 = target2 === 'TP' ? hitTP : hitSL;

            if (hitTarget2) {
              const hitTimeMs = c.timeMs;
              const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
                rangeCandles,
                baseIdx,
                baseIdx + m,
                tradeEntryMs,
                hitTimeMs,
                trade.threshold,
                lotSize
              );

              milestone2 = {
                type: target2,
                achievedSameDay: false,
                hitDate: targetM2DayDate,
                candleIndex: m,
                candleTimestamp: c.timestamp,
                candlesCount: candidateCandles.length + m + 1,
                daysElapsed: dayCount,
                timeTakenMs: Math.max(0, hitTimeMs - tradeEntryMs),
                timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, hitTimeMs - tradeEntryMs)),
                cumulativeVolume: volumeSum,
                ticks,
                notes: `Achieved on day +${dayCount} (${targetM2DayDate})`,
              };
              break;
            }
          }
        }
      }
    }

    // If M2 still not hit, mark as PENDING
    if (milestone1 && !milestone2) {
      const target2 = milestone1.type === 'SL' ? 'TP' : 'SL';
      const daysElapsed = milestone1.daysElapsed;
      const elapsedMs = Math.max(0, Date.now() - tradeEntryMs);

      milestone2 = {
        type: 'PENDING',
        achievedSameDay: false,
        daysElapsed,
        timeTakenMs: elapsedMs,
        timeTakenFormatted: `Pending (${UpstoxApiService.formatDurationDaysHours(elapsedMs)})`,
        cumulativeVolume: milestone1.cumulativeVolume,
        ticks: milestone1.ticks,
        notes: `Target ${target2} pending up to current date (${todayDate})`,
      };
    }

    // DRAWDOWN AND LOSS MULTIPLIER (Clarification #3)
    // For Uber: SL is goal. If TP is hit first as M1, this trade is a LOSS. Max loss is in TP direction vs planned risk |entry-tp|.
    // For Non-Uber: TP is goal. If SL is hit first as M1, this trade is a LOSS. Max loss is in SL direction vs planned risk |entry-sl|.
    const isSuccess = milestone1 ? milestone1.type === expectedTarget : false;
    const isLossTrade = milestone1 ? !isSuccess : false;

    // Loss multiples:
    const maxLossMultiple = plannedRisk > 0 ? parseFloat((maxAdversePoints / plannedRisk).toFixed(2)) : 0;
    const lossMultipleBeforeEntryReturn = plannedRisk > 0 ? parseFloat((maxLossBeforeEntryReturn / plannedRisk).toFixed(2)) : 0;

    let lossEntryTimeFormatted: string | undefined;
    let lossM1TimeFormatted: string | undefined;
    let lossDurationFormatted: string | undefined;

    if (isLossTrade && milestone1) {
      lossEntryTimeFormatted = entryIst;
      lossM1TimeFormatted = UpstoxApiService.toISTString(milestone1.candleTimeMs);
      lossDurationFormatted = milestone1.timeTakenFormatted;
    }

    const drawdown: DrawdownAnalysis = {
      plannedRisk: parseFloat(plannedRisk.toFixed(2)),
      maxAdversePoints: parseFloat(maxAdversePoints.toFixed(2)),
      maxLossMultiple,
      maxLossBeforeEntryReturn: parseFloat(maxLossBeforeEntryReturn.toFixed(2)),
      lossMultipleBeforeEntryReturn,
      slCrossCount,
      tpCrossCount,
      entryCrossCount,
      drawdownTicks: trade.threshold > 0 ? parseFloat((drawdownVolume / trade.threshold).toFixed(2)) : 0,
      drawdownTimeFormatted: UpstoxApiService.formatDurationDaysHours(drawdownCandlesCount * 60000),
      lossEntryTimeFormatted,
      lossM1TimeFormatted,
      lossDurationFormatted,
    };

    let status: TradeMilestoneAnalysis['status'] = 'NEITHER_HIT_YET';
    if (milestone1 && milestone2 && milestone2.type !== 'PENDING') {
      status = 'COMPLETED_BOTH';
    } else if (milestone1) {
      status = 'COMPLETED_M1_M2_PENDING';
    }

    return {
      trade,
      entryIst,
      dateStr,
      matchedVersionFilter: true,
      candlesFoundForDay: candidateCandles.length,
      expectedTarget,
      isSuccess,
      milestone1,
      milestone2,
      drawdown,
      status,
      multiDayCandles: fullMultiDayCandles.length > 0 ? fullMultiDayCandles : candidateCandles,
      lotSizeUsed: lotSize,
      isVolumeTrade: trade.threshold > 0,
    };
  }

  /**
   * Group trades for same instrument within 5 minutes into single groups
   */
  static groupTrades5Min(analyses: TradeMilestoneAnalysis[]): TradeGroup5Min[] {
    const groups: TradeGroup5Min[] = [];

    // Group by instrument & date first
    const instDateMap = new Map<string, TradeMilestoneAnalysis[]>();
    for (const a of analyses) {
      const key = `${a.trade.instrument}_${a.dateStr}`;
      if (!instDateMap.has(key)) {
        instDateMap.set(key, []);
      }
      instDateMap.get(key)!.push(a);
    }

    for (const [, items] of instDateMap.entries()) {
      // Sort trades by timestamp ascending
      items.sort((a, b) => a.trade.timestamp - b.trade.timestamp);

      let currentCluster: TradeMilestoneAnalysis[] = [];
      let clusterStartTime = 0;

      for (const item of items) {
        if (currentCluster.length === 0) {
          currentCluster.push(item);
          clusterStartTime = item.trade.timestamp;
        } else {
          // If within 5 minutes (300,000 ms) of cluster start
          if (item.trade.timestamp - clusterStartTime <= 300_000) {
            currentCluster.push(item);
          } else {
            groups.push(Command2Service.build5MinGroup(currentCluster));
            currentCluster = [item];
            clusterStartTime = item.trade.timestamp;
          }
        }
      }

      if (currentCluster.length > 0) {
        groups.push(Command2Service.build5MinGroup(currentCluster));
      }
    }

    // Sort groups by timestamp
    groups.sort((a, b) => a.firstTimestamp - b.firstTimestamp);
    return groups;
  }

  private static build5MinGroup(trades: TradeMilestoneAnalysis[]): TradeGroup5Min {
    const first = trades[0];
    const last = trades[trades.length - 1];

    const versions = Array.from(new Set(trades.map((t) => t.trade.version)));
    let uberSuccessCount = 0;
    let ultraSuccessCount = 0;

    for (const a of trades) {
      if (a.isSuccess) {
        if (Command2Service.isUberVersion(a.trade.version)) {
          uberSuccessCount++;
        } else {
          ultraSuccessCount++;
        }
      }
    }

    const hasSuccess = trades.some((t) => t.isSuccess);

    // Identify which version played out best to success:
    let winningVersion: string | null = null;
    let winningReason = 'Neither version achieved success';

    const successfulTrades = trades.filter((t) => t.isSuccess);
    if (successfulTrades.length > 0) {
      successfulTrades.sort((a, b) => {
        const ticksA = a.milestone1?.ticks ?? 999999;
        const ticksB = b.milestone1?.ticks ?? 999999;
        return ticksA - ticksB;
      });

      const winner = successfulTrades[0];
      winningVersion = winner.trade.version;
      winningReason = `${winningVersion} won: hit ${winner.milestone1?.type} in ${winner.milestone1?.ticks} ticks (${winner.milestone1?.candlesCount} candles, ${winner.milestone1?.timeTakenFormatted})`;
    } else {
      trades.sort((a, b) => a.drawdown.maxLossMultiple - b.drawdown.maxLossMultiple);
      winningReason = `No target hit; ${trades[0].trade.version} had lower drawdown (${trades[0].drawdown.maxLossMultiple}x)`;
    }

    const startIst = first.entryIst.split(',')[1]?.trim() || '';
    const endIst = last.entryIst.split(',')[1]?.trim() || '';
    const timeRangeFormatted = startIst === endIst ? startIst : `${startIst} - ${endIst}`;

    return {
      groupId: `GRP_${Command1Service.safeFilename(first.trade.instrument)}_${first.trade.timestamp}`,
      instrument: first.trade.instrument,
      name: first.trade.name || first.trade.instrument,
      dateStr: first.dateStr,
      firstTimestamp: first.trade.timestamp,
      lastTimestamp: last.trade.timestamp,
      timeRangeFormatted,
      trades,
      versions,
      winningVersion,
      winningReason,
      hasSuccess,
      uberSuccessCount,
      ultraSuccessCount,
    };
  }

  /**
   * Group all trades of an instrument on a date into distinct setups outside 5-minute windows
   */
  static getDistinctInstrumentSetups(allTrades: TradeSignal[], instrumentKey: string, dateStr: string): TradeSignal[] {
    const matching = allTrades.filter(
      (t) => t.instrument === instrumentKey && UpstoxApiService.toISTDate(t.timestamp) === dateStr
    );
    if (matching.length === 0) return [];

    matching.sort((a, b) => a.timestamp - b.timestamp);

    const clusters: TradeSignal[][] = [];
    let current: TradeSignal[] = [];
    let clusterStart = 0;

    for (const t of matching) {
      if (current.length === 0) {
        current.push(t);
        clusterStart = t.timestamp;
      } else {
        if (t.timestamp - clusterStart <= 300_000) {
          current.push(t);
        } else {
          clusters.push(current);
          current = [t];
          clusterStart = t.timestamp;
        }
      }
    }
    if (current.length > 0) clusters.push(current);

    // From each cluster, pick the preferred trade (prioritizing Ultra / Uber versions!)
    return clusters.map((cluster) => {
      const preferred = cluster.find((t) => /ultra|uber/i.test(t.version));
      return preferred || cluster[0];
    });
  }

  /**
   * Execute Command 2 across a list of trades
   */
  async execute(
    trades: TradeSignal[],
    options?: Command2Options,
    onProgress?: (p: Command2Progress) => void
  ): Promise<Command2Result> {
    const filters = options?.versionFilters;
    const useAll = options?.useAllVersions ?? false;
    const volumeOnly = options?.volumeTradesOnly !== false; // Default true: Filter only volume based trades

    // 1. Filter only volume based trades from JSON (Requirement 4)
    let processedInput = trades;
    let filteredOutCount = 0;
    if (volumeOnly) {
      processedInput = trades.filter((t) => t && t.threshold > 0 && t.bar_type !== 'price');
      filteredOutCount = trades.length - processedInput.length;
    }

    // 2. Filter trades by version
    const filteredTrades = processedInput.filter((t) =>
      Command2Service.matchesVersion(t.version, filters, useAll)
    );

    const analyses: TradeMilestoneAnalysis[] = [];
    const total = filteredTrades.length;

    for (let i = 0; i < total; i++) {
      const trade = filteredTrades[i];
      onProgress?.({
        currentIndex: i + 1,
        totalTrades: total,
        currentTradeName: trade.name,
        currentVersion: trade.version,
        message: `Analyzing trade ${i + 1}/${total}: ${trade.name} (${trade.version})...`,
      });

      const analysis = await this.evaluateTrade(trade);
      analyses.push(analysis);

      if (i % 5 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    }

    // Compute Summary Statistics
    let tp1Count = 0;
    let sl1Count = 0;
    let both1Count = 0;
    let neither1Count = 0;

    let m2SameDay = 0;
    let m2MultiDay = 0;
    let m2Pending = 0;

    let sumCandlesM1 = 0;
    let sumTimeM1 = 0;
    let sumTicksM1 = 0;
    let countM1 = 0;

    let sumTimeM2 = 0;
    let sumTicksM2 = 0;
    let countM2Achieved = 0;

    let sumMaxLossMultiple = 0;
    let sumLossMultipleBeforeEntry = 0;

    let totalUber = 0;
    let uberSuccessCount = 0;
    let uberLossCount = 0;

    let totalUltra = 0;
    let ultraSuccessCount = 0;
    let ultraLossCount = 0;

    let totalSuccessCount = 0;

    const lossTrades: LossTradeDetail[] = [];

    // Maps for Date and Day-of-week breakdown
    const dateMap = new Map<string, TradeMilestoneAnalysis[]>();
    const dayMap = new Map<string, TradeMilestoneAnalysis[]>();

    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const a of analyses) {
      const isUber = Command2Service.isUberVersion(a.trade.version);
      if (isUber) {
        totalUber++;
        if (a.isSuccess) {
          uberSuccessCount++;
        } else {
          uberLossCount++;
        }
      } else {
        totalUltra++;
        if (a.isSuccess) {
          ultraSuccessCount++;
        } else {
          ultraLossCount++;
        }
      }

      if (a.isSuccess) totalSuccessCount++;

      sumMaxLossMultiple += a.drawdown.maxLossMultiple;
      sumLossMultipleBeforeEntry += a.drawdown.lossMultipleBeforeEntryReturn;

      if (a.milestone1) {
        countM1++;
        sumCandlesM1 += a.milestone1.candlesCount;
        sumTimeM1 += a.milestone1.timeTakenMs;
        sumTicksM1 += a.milestone1.ticks;

        if (a.milestone1.type === 'TP') tp1Count++;
        else if (a.milestone1.type === 'SL') sl1Count++;
        else both1Count++;
      } else {
        neither1Count++;
      }

      if (a.milestone2) {
        if (a.milestone2.type !== 'PENDING') {
          countM2Achieved++;
          sumTimeM2 += a.milestone2.timeTakenMs;
          sumTicksM2 += a.milestone2.ticks;
          if (a.milestone2.achievedSameDay) {
            m2SameDay++;
          } else {
            m2MultiDay++;
          }
        } else {
          m2Pending++;
        }
      }

      // Record Loss Trades Detail (Requirement 3)
      if (!a.isSuccess && a.milestone1) {
        lossTrades.push({
          instrument: a.trade.instrument,
          name: a.trade.name,
          version: a.trade.version,
          dateStr: a.dateStr,
          type: a.trade.type,
          entry: a.trade.entry,
          goalMilestone: a.expectedTarget,
          adverseMilestone: a.expectedTarget === 'TP' ? 'SL' : 'TP',
          entryTimeIST: a.entryIst,
          m1HitTimeIST: a.drawdown.lossM1TimeFormatted || UpstoxApiService.toISTString(a.milestone1.candleTimeMs),
          m1Type: a.milestone1.type as 'SL' | 'TP',
          durationFormatted: a.milestone1.timeTakenFormatted,
          maxLossMultiple: a.drawdown.maxLossMultiple,
          lossBeforeEntryReturn: a.drawdown.lossMultipleBeforeEntryReturn,
          slCrossCount: a.drawdown.slCrossCount,
          tpCrossCount: a.drawdown.tpCrossCount,
          entryCrossCount: a.drawdown.entryCrossCount,
          ticks: a.milestone1.ticks,
        });
      }

      // Group for Date and Day-of-week breakdown
      if (!dateMap.has(a.dateStr)) dateMap.set(a.dateStr, []);
      dateMap.get(a.dateStr)!.push(a);

      const dObj = new Date(a.dateStr);
      const dayName = isNaN(dObj.getDay()) ? 'Unknown' : DAYS[dObj.getDay()];
      if (!dayMap.has(dayName)) dayMap.set(dayName, []);
      dayMap.get(dayName)!.push(a);
    }

    // Helper to compute Period Breakdowns (Date / Day of Week)
    const computeBreakdown = (map: Map<string, TradeMilestoneAnalysis[]>): DateDayM1Breakdown[] => {
      const results: DateDayM1Breakdown[] = [];
      for (const [key, items] of map.entries()) {
        let uTotal = 0;
        let uTp = 0;
        let uSl = 0;
        let altTotal = 0;
        let altTp = 0;
        let altSl = 0;
        let succ = 0;

        for (const item of items) {
          if (item.isSuccess) succ++;
          const isU = Command2Service.isUberVersion(item.trade.version);
          const m1Type = item.milestone1?.type;

          if (isU) {
            uTotal++;
            if (m1Type === 'TP') uTp++; // Loss for Uber
            if (m1Type === 'SL') uSl++; // Win for Uber
          } else {
            altTotal++;
            if (m1Type === 'TP') altTp++; // Win for Ultra
            if (m1Type === 'SL') altSl++; // Loss for Ultra
          }
        }

        results.push({
          periodKey: key,
          totalTrades: items.length,
          uberTotal: uTotal,
          uberTpCount: uTp,
          uberSlCount: uSl,
          uberWinRate: uTotal > 0 ? (uSl / uTotal) * 100 : 0,
          ultraTotal: altTotal,
          ultraTpCount: altTp,
          ultraSlCount: altSl,
          ultraWinRate: altTotal > 0 ? (altTp / altTotal) * 100 : 0,
          overallWinRate: items.length > 0 ? (succ / items.length) * 100 : 0,
        });
      }
      return results;
    };

    const dateBreakdowns = computeBreakdown(dateMap).sort((a, b) => b.periodKey.localeCompare(a.periodKey));
    const dayOfWeekBreakdowns = computeBreakdown(dayMap);

    // Classified Ticks Summary (<50, 50-100, 100-250, 250-500, >500)
    const tickBrackets = [
      { label: '< 50 ticks', min: 0, max: 50 },
      { label: '50 - 100 ticks', min: 50, max: 100 },
      { label: '100 - 250 ticks', min: 100, max: 250 },
      { label: '250 - 500 ticks', min: 250, max: 500 },
      { label: '> 500 ticks', min: 500, max: Infinity },
    ];

    const classifiedTicks: ClassifiedTicksSummary[] = tickBrackets.map((b) => {
      const matched = analyses.filter((a) => {
        const t = a.milestone1?.ticks ?? -1;
        return t >= b.min && t < b.max;
      });
      const count = matched.length;
      const pct = analyses.length > 0 ? (count / analyses.length) * 100 : 0;
      const sumMs = matched.reduce((acc, curr) => acc + (curr.milestone1?.timeTakenMs || 0), 0);
      const sumT = matched.reduce((acc, curr) => acc + (curr.milestone1?.ticks || 0), 0);

      return {
        bracket: b.label,
        count,
        percentage: parseFloat(pct.toFixed(1)),
        avgTimeTakenFormatted: count > 0 ? UpstoxApiService.formatDurationDaysHours(sumMs / count) : '-',
        avgTicks: count > 0 ? parseFloat((sumT / count).toFixed(1)) : 0,
      };
    });

    // Build 5-minute clubbed groups
    const groups5Min = Command2Service.groupTrades5Min(analyses);

    const summary: Command2Summary = {
      totalTradesAnalyzed: analyses.length,
      totalVolumeTradesFiltered: filteredOutCount,
      successCount: totalSuccessCount,
      lossCount: analyses.length - totalSuccessCount,
      overallWinRatePercentage: analyses.length > 0 ? (totalSuccessCount / analyses.length) * 100 : 0,
      uberSuccessRate: {
        totalUber,
        uberSuccessCount,
        uberLossCount,
        uberSuccessPercentage: totalUber > 0 ? (uberSuccessCount / totalUber) * 100 : 0,
      },
      ultraSuccessRate: {
        totalUltra,
        ultraSuccessCount,
        ultraLossCount,
        ultraSuccessPercentage: totalUltra > 0 ? (ultraSuccessCount / totalUltra) * 100 : 0,
      },
      m1Hits: {
        tpCount: tp1Count,
        slCount: sl1Count,
        bothCount: both1Count,
        neitherCount: neither1Count,
        tpPercentage: analyses.length > 0 ? (tp1Count / analyses.length) * 100 : 0,
        slPercentage: analyses.length > 0 ? (sl1Count / analyses.length) * 100 : 0,
      },
      m2Hits: {
        achievedSameDayCount: m2SameDay,
        achievedMultiDayCount: m2MultiDay,
        pendingCount: m2Pending,
        sameDayPercentage: analyses.length > 0 ? (m2SameDay / analyses.length) * 100 : 0,
        multiDayPercentage: analyses.length > 0 ? (m2MultiDay / analyses.length) * 100 : 0,
        pendingPercentage: analyses.length > 0 ? (m2Pending / analyses.length) * 100 : 0,
      },
      averages: {
        avgCandlesToM1: countM1 > 0 ? parseFloat((sumCandlesM1 / countM1).toFixed(1)) : 0,
        avgTimeMsToM1: countM1 > 0 ? sumTimeM1 / countM1 : 0,
        avgTimeM1Formatted: countM1 > 0 ? UpstoxApiService.formatDurationDaysHours(sumTimeM1 / countM1) : '0 days 0h 0m 0s',
        avgM1Ticks: countM1 > 0 ? parseFloat((sumTicksM1 / countM1).toFixed(2)) : 0,
        avgTimeMsToM2: countM2Achieved > 0 ? sumTimeM2 / countM2Achieved : 0,
        avgTimeM2Formatted: countM2Achieved > 0 ? UpstoxApiService.formatDurationDaysHours(sumTimeM2 / countM2Achieved) : '0 days 0h 0m 0s',
        avgM2Ticks: countM2Achieved > 0 ? parseFloat((sumTicksM2 / countM2Achieved).toFixed(2)) : 0,
        avgMaxLossMultiple: analyses.length > 0 ? parseFloat((sumMaxLossMultiple / analyses.length).toFixed(2)) : 0,
        avgLossMultipleBeforeEntryReturn: analyses.length > 0 ? parseFloat((sumLossMultipleBeforeEntry / analyses.length).toFixed(2)) : 0,
      },
      totalGroupsCount: groups5Min.length,
      dateBreakdowns,
      dayOfWeekBreakdowns,
      classifiedTicks,
      lossTrades,
    };

    // Save CSV Report
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(this.reportsDir, `milestone_analysis_${timestampStr}.csv`);
    Command2Service.saveAnalysisCsv(analyses, reportPath);

    return {
      analyses,
      groups5Min,
      summary,
      reportCsvPath: reportPath,
    };
  }

  /**
   * Export analyses array to CSV format with ticks and drawdown metrics
   */
  static saveAnalysisCsv(analyses: TradeMilestoneAnalysis[], filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const headers = [
      'version',
      'instrument',
      'name',
      'type',
      'entry',
      'sl',
      'tp',
      'threshold',
      'lot_size',
      'trade_timestamp',
      'trade_ist',
      'expected_target',
      'is_success',
      'm1_hit_type',
      'm1_hit_date',
      'm1_days_elapsed',
      'm1_candles_count',
      'm1_time_taken',
      'm1_ticks',
      'm2_hit_type',
      'm2_achieved_same_day',
      'm2_hit_date',
      'm2_days_elapsed',
      'm2_time_taken',
      'm2_ticks',
      'max_loss_multiple',
      'loss_multiple_before_entry_return',
      'sl_cross_count',
      'tp_cross_count',
      'entry_cross_count',
      'loss_entry_time',
      'loss_m1_time',
      'drawdown_ticks',
      'drawdown_time',
      'm2_notes',
    ];

    const escapeCsv = (val: unknown): string => {
      if (val === undefined || val === null) return '';
      const s = String(val);
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows = analyses.map((a) => {
      const t = a.trade;
      const m1 = a.milestone1;
      const m2 = a.milestone2;
      const dd = a.drawdown;

      return [
        t.version,
        t.instrument,
        t.name,
        t.type,
        t.entry,
        t.sl,
        t.tp,
        t.threshold,
        a.lotSizeUsed || 1,
        t.timestamp,
        a.entryIst,
        a.expectedTarget,
        a.isSuccess ? 'SUCCESS' : 'LOSS_ADVERSE',
        m1?.type || 'NEITHER',
        m1?.hitDate || a.dateStr,
        m1?.daysElapsed ?? '',
        m1?.candlesCount ?? '',
        m1?.timeTakenFormatted || '',
        m1 ? m1.ticks.toFixed(2) : '',
        m2?.type || 'NOT_REACHED',
        m2 ? (m2.achievedSameDay ? 'YES' : 'NO') : '',
        m2?.hitDate || '',
        m2?.daysElapsed ?? '',
        m2?.timeTakenFormatted || '',
        m2 ? m2.ticks.toFixed(2) : '',
        `${dd.maxLossMultiple.toFixed(2)}x`,
        `${dd.lossMultipleBeforeEntryReturn.toFixed(2)}x`,
        dd.slCrossCount,
        dd.tpCrossCount,
        dd.entryCrossCount,
        dd.lossEntryTimeFormatted || '',
        dd.lossM1TimeFormatted || '',
        dd.drawdownTicks.toFixed(2),
        dd.drawdownTimeFormatted,
        m2?.notes || '',
      ].map(escapeCsv).join(',');
    });

    fs.writeFileSync(filePath, [headers.join(','), ...rows].join('\n') + '\n', 'utf-8');
  }
}
