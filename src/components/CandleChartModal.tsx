import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart2,
  ShieldAlert,
  Target,
  Info,
  Layers,
  Table as TableIcon,
  Download,
  Eye,
  Sliders,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  IChartApi,
} from 'lightweight-charts';
import { TradeMilestoneAnalysis, TradeSignal, Candle } from '../types/trade.ts';
import { UpstoxApiService } from '../services/upstoxApi.ts';
import { Command2Service } from '../services/command2Service.ts';

interface CandleChartModalProps {
  analysis: TradeMilestoneAnalysis | null;
  allTrades?: TradeSignal[];
  onClose: () => void;
}

export const CandleChartModal: React.FC<CandleChartModalProps> = ({
  analysis,
  allTrades = [],
  onClose,
}) => {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<'chart' | 'table'>('chart');

  // Toggle Visibility for Indicators & Levels
  const [showEMA20, setShowEMA20] = useState(true);
  const [showSMACrossover, setShowSMACrossover] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showTradeLevels, setShowTradeLevels] = useState(true);

  // Setup Selection for multiple trade setups (Clarification #2)
  const [selectedSetupIndex, setSelectedSetupIndex] = useState<number>(-1); // -1 means "All Setups"

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);

  // Distinct trade setups for this instrument outside 5-minute window
  const distinctSetups: TradeSignal[] = useMemo(() => {
    if (!analysis) return [];
    if (allTrades.length === 0) return [analysis.trade];
    const setups = Command2Service.getDistinctInstrumentSetups(
      allTrades,
      analysis.trade.instrument,
      analysis.dateStr
    );
    return setups.length > 0 ? setups : [analysis.trade];
  }, [analysis, allTrades]);

  // Active trade being analyzed
  const activeTrade = useMemo(() => {
    if (!analysis) return null;
    if (selectedSetupIndex >= 0 && distinctSetups[selectedSetupIndex]) {
      return distinctSetups[selectedSetupIndex];
    }
    return analysis.trade;
  }, [analysis, selectedSetupIndex, distinctSetups]);

  // Fetch candles with indicators
  useEffect(() => {
    if (!analysis) return;
    let isMounted = true;
    setLoading(true);

    // If already pre-computed on analysis result, load directly
    if (analysis.multiDayCandles && analysis.multiDayCandles.length > 0) {
      setCandles(analysis.multiDayCandles);
      setLoading(false);
      return;
    }

    const instrument = encodeURIComponent(analysis.trade.instrument);
    const date = analysis.dateStr;
    const endDate = analysis.milestone2?.hitDate || analysis.milestone1?.hitDate || date;
    const url = `/api/candles?instrument=${instrument}&date=${date}&endDate=${endDate}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          if (Array.isArray(data.candles)) {
            setCandles(data.candles);
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Error fetching candles:', err);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [analysis]);

  // Render TradingView lightweight-chart with IST time formatting (Clarification #3)
  useEffect(() => {
    if (!analysis || activeView !== 'chart' || loading || candles.length === 0 || !chartContainerRef.current) {
      return;
    }

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 440,
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(51, 65, 85, 0.25)' },
        horzLines: { color: 'rgba(51, 65, 85, 0.25)' },
      },
      crosshair: {
        vertLine: { color: '#6366f1', width: 1, style: 2 },
        horzLine: { color: '#6366f1', width: 1, style: 2 },
      },
      localization: {
        timeFormatter: (timestamp: number) => {
          const d = new Date(timestamp * 1000);
          return (
            d.toLocaleTimeString('en-GB', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            }) + ' IST'
          );
        },
        dateFormat: 'yyyy-MM-dd',
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return d.toLocaleTimeString('en-GB', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
        },
      },
    });
    chartInstanceRef.current = chart;

    // 1. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    const candleData = candles.map((c) => ({
      time: Math.floor(c.timeMs / 1000) as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(candleData);

    // 2. Volume Histogram Series
    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#6366f1',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      const volData = candles.map((c) => ({
        time: Math.floor(c.timeMs / 1000) as any,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)',
      }));
      volumeSeries.setData(volData);
    }

    // 3. EMA 20 Line Series
    if (showEMA20) {
      const emaSeries = chart.addSeries(LineSeries, {
        color: '#38bdf8', // Cyan
        lineWidth: 2,
        title: 'EMA 20',
      });
      const emaData = candles
        .filter((c) => c.ema20 !== undefined)
        .map((c) => ({
          time: Math.floor(c.timeMs / 1000) as any,
          value: c.ema20!,
        }));
      emaSeries.setData(emaData);
    }

    // 4. SMA Fast (9) & SMA Slow (21) Crossover
    if (showSMACrossover) {
      const smaFastSeries = chart.addSeries(LineSeries, {
        color: '#fbbf24', // Amber
        lineWidth: 1,
        title: 'SMA 9',
      });
      const smaFastData = candles
        .filter((c) => c.smaFast !== undefined)
        .map((c) => ({
          time: Math.floor(c.timeMs / 1000) as any,
          value: c.smaFast!,
        }));
      smaFastSeries.setData(smaFastData);

      const smaSlowSeries = chart.addSeries(LineSeries, {
        color: '#c084fc', // Purple
        lineWidth: 2,
        title: 'SMA 21',
      });
      const smaSlowData = candles
        .filter((c) => c.smaSlow !== undefined)
        .map((c) => ({
          time: Math.floor(c.timeMs / 1000) as any,
          value: c.smaSlow!,
        }));
      smaSlowSeries.setData(smaSlowData);
    }

    // 5. Distinct Trade Setups Price Lines: S1, S2, etc. (Clarification #2)
    if (showTradeLevels) {
      const setupsToRender =
        selectedSetupIndex >= 0 && distinctSetups[selectedSetupIndex]
          ? [distinctSetups[selectedSetupIndex]]
          : distinctSetups;

      setupsToRender.forEach((setupTrade, sIdx) => {
        const setupNum = selectedSetupIndex >= 0 ? selectedSetupIndex + 1 : sIdx + 1;
        const prefix = setupsToRender.length > 1 ? `S${setupNum}-` : '';

        // Entry Line
        candleSeries.createPriceLine({
          price: setupTrade.entry,
          color: sIdx === 0 ? '#38bdf8' : '#818cf8',
          lineWidth: 2,
          lineStyle: 0, // Solid
          axisLabelVisible: true,
          title: `${prefix}ENTRY: ${setupTrade.entry.toFixed(2)}`,
        });

        // Stop Loss Line
        candleSeries.createPriceLine({
          price: setupTrade.sl,
          color: '#f43f5e',
          lineWidth: 2,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `${prefix}SL: ${setupTrade.sl.toFixed(2)}`,
        });

        // Take Profit Line
        candleSeries.createPriceLine({
          price: setupTrade.tp,
          color: '#10b981',
          lineWidth: 2,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `${prefix}TP: ${setupTrade.tp.toFixed(2)}`,
        });
      });
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (container && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({ width: container.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [
    analysis,
    activeView,
    loading,
    candles,
    showEMA20,
    showSMACrossover,
    showVolume,
    showTradeLevels,
    selectedSetupIndex,
    distinctSetups,
  ]);

  if (!analysis || !activeTrade) return null;

  const t = activeTrade;
  const m1 = analysis.milestone1;
  const m2 = analysis.milestone2;
  const dd = analysis.drawdown;
  const isBuy = t.type === 'BUY_STOP';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/90">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-md ${
                isBuy
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-rose-950 text-rose-400 border border-rose-800'
              }`}
            >
              {isBuy ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">{t.name || t.instrument}</h3>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">
                  {t.version}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    analysis.isSuccess
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                  }`}
                >
                  {analysis.isSuccess ? '🏆 SUCCESS' : 'ADVERSE / LOSS'}
                </span>
                <span className="text-xs text-slate-400 font-mono">({t.instrument})</span>
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-3 mt-1 flex-wrap font-mono">
                <span>
                  Date: <strong className="text-white">{analysis.dateStr}</strong>
                </span>
                <span>
                  Entry: <strong className="text-sky-400">{t.entry.toFixed(2)}</strong>
                </span>
                <span>
                  SL: <strong className="text-rose-400">{t.sl.toFixed(2)}</strong>
                </span>
                <span>
                  TP: <strong className="text-emerald-400">{t.tp.toFixed(2)}</strong>
                </span>
                <span>
                  Threshold: <strong className="text-amber-400">{t.threshold}</strong>
                </span>
                <span className="text-slate-500">
                  Target Goal: <strong>{analysis.expectedTarget}</strong>
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Distinct Trade Setups Selector Bar (Clarification #2: S1, S2, etc.) */}
        {distinctSetups.length > 1 && (
          <div className="px-5 py-2.5 bg-indigo-950/30 border-b border-indigo-900/50 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-indigo-300 font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Multiple Setups Detected ({distinctSetups.length}):
              </span>
              <button
                onClick={() => setSelectedSetupIndex(-1)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  selectedSetupIndex === -1
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                All Setups (Overlay S1 & S2)
              </button>
              {distinctSetups.map((setup, idx) => {
                const sIst = UpstoxApiService.toISTString(setup.timestamp).split(',')[1]?.trim() || '';
                const isPref = /ultra|uber/i.test(setup.version);

                return (
                  <button
                    key={`${setup.timestamp}_${idx}`}
                    onClick={() => setSelectedSetupIndex(idx)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      selectedSetupIndex === idx
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Setup {idx + 1} ({sIst} - {setup.version}) {isPref && '★'}
                  </button>
                );
              })}
            </div>
            <span className="text-slate-400 text-[11px]">
              Setups outside 5-min window shown with S1-Entry/SL/TP & S2-Entry/SL/TP levels
            </span>
          </div>
        )}

        {/* Milestone & Drawdown Analysis Bar */}
        <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* M1 Hit */}
          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block mb-1">
              Milestone 1 First Hit
            </span>
            {m1 ? (
              <div>
                <span className={`font-bold ${m1.type === 'TP' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {m1.type} Hit
                </span>
                <span className="text-slate-300 ml-1.5">
                  in <strong className="text-amber-300 font-mono">{m1.ticks} ticks</strong> ({m1.candlesCount} candles)
                </span>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Time: <span className="text-slate-200">{m1.timeTakenFormatted}</span>
                </div>
              </div>
            ) : (
              <span className="text-slate-500 italic">Not achieved yet</span>
            )}
          </div>

          {/* M2 Follow-Through */}
          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block mb-1">
              Milestone 2 Follow-Through
            </span>
            {m2 ? (
              m2.type !== 'PENDING' ? (
                <div>
                  <span className={`font-bold ${m2.type === 'TP' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {m2.type} Hit
                  </span>
                  <span className="text-slate-300 ml-1.5">
                    in <strong className="text-amber-300 font-mono">{m2.ticks} ticks</strong>
                  </span>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {m2.achievedSameDay ? 'Same Day' : `Multi-Day (+${m2.daysElapsed}d)`} • {m2.timeTakenFormatted}
                  </div>
                </div>
              ) : (
                <div className="text-amber-400 font-medium">Pending consecutive days</div>
              )
            ) : (
              <span className="text-slate-500 italic">-</span>
            )}
          </div>

          {/* Drawdown Multiplier */}
          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block mb-1">
              Max Adverse Loss Multiple
            </span>
            <div>
              <span className="text-rose-400 font-extrabold text-sm font-mono">
                {dd.maxLossMultiple}x planned risk
              </span>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Before Entry Return: <strong className="text-amber-300 font-mono">{dd.lossMultipleBeforeEntryReturn}x</strong>
              </div>
            </div>
          </div>

          {/* Level Crossings */}
          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block mb-1">
              Level Crossings & Ticks
            </span>
            <div className="flex justify-between items-center text-slate-300 font-mono">
              <span>
                SL Crosses: <strong className="text-rose-400">{dd.slCrossCount}</strong>
              </span>
              <span>
                Entry Crosses: <strong className="text-sky-400">{dd.entryCrossCount}</strong>
              </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Drawdown Ticks: {dd.drawdownTicks} • Duration: {dd.drawdownTimeFormatted}
            </div>
          </div>
        </div>

        {/* View Switcher & Indicator Toggles Bar */}
        <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Chart vs Table Switch */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveView('chart')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                activeView === 'chart' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Interactive Candlestick Chart</span>
            </button>
            <button
              onClick={() => setActiveView('table')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                activeView === 'table' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Raw OHLCV + Indicators Table ({candles.length})</span>
            </button>
          </div>

          {/* Indicator Toggles */}
          {activeView === 'chart' && (
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showEMA20}
                  onChange={(e) => setShowEMA20(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-400" /> EMA 20
                </span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSMACrossover}
                  onChange={(e) => setShowSMACrossover(e.target.checked)}
                  className="rounded border-slate-700 text-amber-500 focus:ring-0"
                />
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> SMA Crossover (9/21)
                </span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showVolume}
                  onChange={(e) => setShowVolume(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-500 focus:ring-0"
                />
                <span>Volume</span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTradeLevels}
                  onChange={(e) => setShowTradeLevels(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span>Entry/SL/TP Levels</span>
              </label>
            </div>
          )}

          {/* Download CSV button */}
          <a
            href={`/api/download-csv?type=market_data&file=${encodeURIComponent(
              `${analysis.dateStr}/${analysis.trade.instrument.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`
            )}`}
            download
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Download CSV</span>
          </a>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
          {loading ? (
            <div className="h-96 flex flex-col items-center justify-center text-slate-400 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <p className="text-sm">Loading Upstox 1-minute candlestick data and indicators...</p>
            </div>
          ) : candles.length === 0 ? (
            <div className="h-96 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Info className="w-8 h-8 text-slate-600" />
              <p className="text-sm">No 1-minute candle data found for {analysis.dateStr}.</p>
              <p className="text-xs">Run Command 1 first to download the 1-minute CSVs.</p>
            </div>
          ) : activeView === 'chart' ? (
            <div className="space-y-3">
              <div
                ref={chartContainerRef}
                className="w-full rounded-2xl overflow-hidden border border-slate-800 bg-[#090d16]"
                style={{ height: '440px' }}
              />
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 px-2 font-mono">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-sky-400" /> Entry ({t.entry.toFixed(2)})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 border-t border-dashed border-rose-500" /> SL ({t.sl.toFixed(2)})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 border-t border-dashed border-emerald-500" /> TP ({t.tp.toFixed(2)})
                  </span>
                </div>
                <div>
                  Time Display: <strong className="text-cyan-400">Asia/Kolkata (IST)</strong> • Candles:{' '}
                  <strong>{candles.length}</strong> • Threshold: <strong className="text-amber-400">{t.threshold}</strong>
                </div>
              </div>
            </div>
          ) : (
            /* Table View with IST Time Formatting */
            <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto max-h-[460px]">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Time (IST)</th>
                      <th className="py-2.5 px-3 text-right">Open</th>
                      <th className="py-2.5 px-3 text-right">High</th>
                      <th className="py-2.5 px-3 text-right">Low</th>
                      <th className="py-2.5 px-3 text-right">Close</th>
                      <th className="py-2.5 px-3 text-right">Volume</th>
                      <th className="py-2.5 px-3 text-right text-sky-400">EMA 20</th>
                      <th className="py-2.5 px-3 text-right text-amber-400">SMA 9</th>
                      <th className="py-2.5 px-3 text-right text-purple-400">SMA 21</th>
                      <th className="py-2.5 px-3 text-center">Crossover</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {candles.map((c, cIdx) => {
                      const d = new Date(c.timeMs);
                      const istTime = d.toLocaleTimeString('en-GB', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false,
                      });

                      return (
                        <tr key={`${c.timestamp}_${cIdx}`} className="hover:bg-slate-900/60 transition">
                          <td className="py-2 px-3 text-cyan-300 whitespace-nowrap">{istTime} IST</td>
                          <td className="py-2 px-3 text-right text-white">{c.open.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-emerald-400">{c.high.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-rose-400">{c.low.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-white">{c.close.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-slate-400">{c.volume.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-sky-400">
                            {c.ema20 !== undefined ? c.ema20.toFixed(2) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-amber-400">
                            {c.smaFast !== undefined ? c.smaFast.toFixed(2) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-purple-400">
                            {c.smaSlow !== undefined ? c.smaSlow.toFixed(2) : '-'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {c.crossover === 'BULLISH' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                                BULL CROSS
                              </span>
                            )}
                            {c.crossover === 'BEARISH' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800">
                                BEAR CROSS
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
