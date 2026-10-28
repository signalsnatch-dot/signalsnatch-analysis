import { Candle } from '../types/trade.ts';

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(prices: number[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(prices.length).fill(undefined);
  if (prices.length < period) return result;

  // Initial SMA as the seed
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  let currentEMA = sum / period;
  result[period - 1] = parseFloat(currentEMA.toFixed(4));

  const multiplier = 2 / (period + 1);

  for (let i = period; i < prices.length; i++) {
    currentEMA = (prices[i] - currentEMA) * multiplier + currentEMA;
    result[i] = parseFloat(currentEMA.toFixed(4));
  }

  return result;
}

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(prices: number[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(prices.length).fill(undefined);
  if (prices.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  result[period - 1] = parseFloat((sum / period).toFixed(4));

  for (let i = period; i < prices.length; i++) {
    sum += prices[i] - prices[i - period];
    result[i] = parseFloat((sum / period).toFixed(4));
  }

  return result;
}

/**
 * Augment a list of candles with EMA20, SMA9 (Fast), SMA21 (Slow), and crossover detection
 */
export function augmentCandlesWithIndicators(candles: Candle[]): Candle[] {
  if (candles.length === 0) return candles;

  const closes = candles.map((c) => c.close);
  const ema20 = calculateEMA(closes, 20);
  const smaFast = calculateSMA(closes, 9);
  const smaSlow = calculateSMA(closes, 21);

  return candles.map((c, i) => {
    let crossover: 'BULLISH' | 'BEARISH' | null = null;
    if (
      i > 0 &&
      smaFast[i] !== undefined &&
      smaSlow[i] !== undefined &&
      smaFast[i - 1] !== undefined &&
      smaSlow[i - 1] !== undefined
    ) {
      const prevFast = smaFast[i - 1]!;
      const prevSlow = smaSlow[i - 1]!;
      const currFast = smaFast[i]!;
      const currSlow = smaSlow[i]!;

      if (prevFast <= prevSlow && currFast > currSlow) {
        crossover = 'BULLISH';
      } else if (prevFast >= prevSlow && currFast < currSlow) {
        crossover = 'BEARISH';
      }
    }

    return {
      ...c,
      ema20: ema20[i],
      smaFast: smaFast[i],
      smaSlow: smaSlow[i],
      crossover,
    };
  });
}
