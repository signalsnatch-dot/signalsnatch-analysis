import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Target,
  ShieldAlert,
  BarChart2,
  Eye,
} from 'lucide-react';
import { TradeSignal, TradeMilestoneAnalysis } from '../types/trade.ts';
import { UpstoxApiService } from '../services/upstoxApi.ts';

interface LiveTrackerPanelProps {
  onOpenChart: (analysis: TradeMilestoneAnalysis) => void;
  initialTrades?: TradeSignal[];
}

export const LiveTrackerPanel: React.FC<LiveTrackerPanelProps> = ({
  onOpenChart,
  initialTrades = [],
}) => {
  const [isLiveActive, setIsLiveActive] = useState(true);
  const [pollIntervalSec, setPollIntervalSec] = useState<number>(5);
  const [targetUrl] = useState('http://13.232.16.180:8000/signals_today_2026-10-28.json');

  // Live state
  const [lastPollTime, setLastPollTime] = useState<string>('');
  const [pollCount, setPollCount] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [isServerOffline, setIsServerOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Raw & Processed data
  const [liveTrades, setLiveTrades] = useState<TradeSignal[]>(initialTrades);
  const [liveAnalyses, setLiveAnalyses] = useState<TradeMilestoneAnalysis[]>([]);
  const [previousTradesCount, setPreviousTradesCount] = useState(initialTrades.length);
  const [newTradesAlert, setNewTradesAlert] = useState<number>(0);

  // Version filter for live pipeline
  const [selectedVersions] = useState<string[]>(['ULTRA', 'UBER']);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Active Date for Live Tracker (Defaults to current IST date)
  const [selectedDate, setSelectedDate] = useState<string>(UpstoxApiService.toISTDate(Date.now()));
  const [volumeOnly, setVolumeOnly] = useState(true);

  // Evaluate milestones by calling the backend Command 2 endpoint
  const evaluateTradesMilestones = async (tradesToAnalyze: TradeSignal[]) => {
    try {
      const res = await fetch('/api/command2/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trades: tradesToAnalyze,
          versionFilters: selectedVersions,
          useAllVersions: false,
          volumeTradesOnly: volumeOnly,
        }),
      });
      const data = await res.json();
      if (data.result?.analyses && Array.isArray(data.result.analyses)) {
        setLiveAnalyses(data.result.analyses);
      }
    } catch (e) {
      console.error('Error evaluating live milestones:', e);
    }
  };

  // Core polling function
  const pollLiveData = async () => {
    if (isPolling) return;
    setIsPolling(true);
    setErrorMessage(null);

    const todayIST = selectedDate || UpstoxApiService.toISTDate(Date.now());
    const pollUrl = targetUrl.includes('signals_today_')
      ? targetUrl.replace(/signals_today_\d{4}-\d{2}-\d{2}\.json/, `signals_today_${todayIST}.json`)
      : targetUrl;

    try {
      const res = await fetch(`/api/live/poll?url=${encodeURIComponent(pollUrl)}`);
      const data = await res.json();

      setPollCount((prev) => prev + 1);
      setLastPollTime(data.polledAtIST || UpstoxApiService.toISTString(Date.now()));

      if (data.offline) {
        setIsServerOffline(true);
        setErrorMessage(data.error || 'Remote signals server offline. Retrying automatically in background...');
      } else if (data.success && Array.isArray(data.trades)) {
        setIsServerOffline(false);
        const incomingTrades: TradeSignal[] = data.trades;

        // Requirement 5: Only trades belonging to current date should be dynamically fetched & listed
        const dateFilteredTrades = incomingTrades.filter((t) => {
          const tDate = UpstoxApiService.toISTDate(t.timestamp);
          return tDate === todayIST;
        });

        // Filter volume-based trades only (Requirement 4)
        const finalLiveTrades = volumeOnly
          ? dateFilteredTrades.filter((t) => t && t.threshold > 0 && t.bar_type !== 'price')
          : dateFilteredTrades;

        // Check if new trades arrived
        if (finalLiveTrades.length > previousTradesCount && previousTradesCount > 0) {
          const diff = finalLiveTrades.length - previousTradesCount;
          setNewTradesAlert(diff);
          setTimeout(() => setNewTradesAlert(0), 4000);
        }
        setPreviousTradesCount(finalLiveTrades.length);
        setLiveTrades(finalLiveTrades);

        // Run Command 2 milestone pipeline on the incoming live trades
        await evaluateTradesMilestones(finalLiveTrades);
      } else {
        setErrorMessage(data.error || 'Invalid response from live poll');
      }
    } catch (err: unknown) {
      setIsServerOffline(true);
      setErrorMessage(err instanceof Error ? err.message : 'Network error during live poll');
    } finally {
      setIsPolling(false);
    }
  };

  // Setup interval polling
  useEffect(() => {
    if (isLiveActive) {
      pollLiveData();
      timerRef.current = setInterval(pollLiveData, pollIntervalSec * 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isLiveActive, pollIntervalSec, targetUrl, selectedVersions]);

  // Initial computation if trades already present
  useEffect(() => {
    if (liveTrades.length > 0 && liveAnalyses.length === 0) {
      evaluateTradesMilestones(liveTrades);
    }
  }, [liveTrades]);

  // Derived live KPI statistics
  const totalAnalyzed = liveAnalyses.length;
  const wins = liveAnalyses.filter((a) => a.isSuccess).length;
  const winRate = totalAnalyzed > 0 ? ((wins / totalAnalyzed) * 100).toFixed(1) : '0.0';

  const analysesWithM1 = liveAnalyses.filter((a) => a.milestone1 !== null);
  const avgM1Ticks =
    analysesWithM1.length > 0
      ? (analysesWithM1.reduce((acc, a) => acc + (a.milestone1?.ticks || 0), 0) / analysesWithM1.length).toFixed(1)
      : '0.0';

  const m2Hits = liveAnalyses.filter((a) => a.milestone2 && a.milestone2.type !== 'PENDING').length;
  const avgM2Ticks =
    m2Hits > 0
      ? (
          liveAnalyses
            .filter((a) => a.milestone2 && a.milestone2.type !== 'PENDING')
            .reduce((acc, a) => acc + (a.milestone2?.ticks || 0), 0) / m2Hits
        ).toFixed(1)
      : '0.0';

  const analysesWithDrawdown = liveAnalyses.filter((a) => a.drawdown && a.drawdown.maxLossMultiple > 0);
  const maxAdverseDrawdown =
    analysesWithDrawdown.length > 0
      ? Math.max(...analysesWithDrawdown.map((a) => a.drawdown.maxLossMultiple)).toFixed(1)
      : '1.0';

  return (
    <div className="space-y-6">
      {/* Live Pipeline Top Controls Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold transition ${
                  isLiveActive && !isServerOffline
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                    : isServerOffline
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Radio className={`w-5 h-5 ${isLiveActive && !isServerOffline ? 'animate-pulse' : ''}`} />
              </div>
              {isLiveActive && !isServerOffline && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Live Pipeline Tracker</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isLiveActive && !isServerOffline
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : isServerOffline
                      ? 'bg-amber-950 text-amber-300 border-amber-800'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {isLiveActive && !isServerOffline
                    ? `POLLING EVERY ${pollIntervalSec}s`
                    : isServerOffline
                    ? 'OFFLINE (RETRYING)'
                    : 'PAUSED'}
                </span>
                {newTradesAlert > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 animate-bounce">
                    +{newTradesAlert} NEW TRADES
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Target: <span className="text-cyan-400">{targetUrl}</span>
              </p>
            </div>
          </div>

          {/* Action buttons & interval */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Interval selector */}
            <div className="flex items-center gap-1 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400 font-medium">Interval:</span>
              {[3, 5, 10].map((sec) => (
                <button
                  key={sec}
                  onClick={() => setPollIntervalSec(sec)}
                  className={`px-2 py-0.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    pollIntervalSec === sec
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>

            {/* Toggle Start / Pause */}
            <button
              onClick={() => setIsLiveActive((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                isLiveActive
                  ? 'bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
              }`}
            >
              {isLiveActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isLiveActive ? 'Pause Polling' : 'Resume Live'}</span>
            </button>

            {/* Manual Poll Now */}
            <button
              onClick={pollLiveData}
              disabled={isPolling}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold transition cursor-pointer border border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Poll Now</span>
            </button>
          </div>
        </div>

        {/* Status Line */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800 gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <span>
              Total Polls: <strong className="text-slate-200 font-mono">{pollCount}</strong>
            </span>
            <span>
              Last Polled: <strong className="text-cyan-400 font-mono">{lastPollTime || 'Never'}</strong>
            </span>
            <span>
              Live Signals in Stream: <strong className="text-slate-200 font-mono">{liveTrades.length}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Filtering:</span>
            {['ULTRA', 'UBER'].map((v) => (
              <span
                key={v}
                className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800"
              >
                {v}
              </span>
            ))}
          </div>
        </div>

        {/* Offline Alert Notice */}
        {isServerOffline && (
          <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-2xl flex items-center gap-3 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex-1">
              <strong>Remote link is offline or unreachable:</strong> {errorMessage}. The live tracker will keep retrying every {pollIntervalSec}s. Existing data and candle calculations remain available.
            </div>
          </div>
        )}
      </div>

      {/* Live KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Live Win Rate (M1)</span>
            <Target className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{winRate}%</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {wins} hits of {totalAnalyzed} Ultra/Uber trades
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Avg M1 Speed Ticks</span>
            <BarChart2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">{avgM1Ticks}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">volumeSum / threshold</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>M2 Hit Follow-through</span>
            <TrendingUp className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-400 mt-1">
            {totalAnalyzed > 0 ? ((m2Hits / totalAnalyzed) * 100).toFixed(1) : '0'}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {m2Hits} achieved M2 (avg {avgM2Ticks} ticks)
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Max Adverse Loss Multiple</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{maxAdverseDrawdown}x</div>
          <div className="text-[11px] text-slate-500 mt-0.5">drawdown multiple before target</div>
        </div>
      </div>

      {/* Live Signals & Milestones Stream Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Live Trade Milestone Analysis</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {liveAnalyses.length} trades
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              Evaluated strictly with 1-min Upstox candle data, volumeSum / threshold ticks, and IST timestamps.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase font-mono tracking-wider">
              <tr>
                <th className="py-3 px-3">Trade / Version</th>
                <th className="py-3 px-3">Signal IST Time</th>
                <th className="py-3 px-3">Entry / SL / TP</th>
                <th className="py-3 px-3">Milestone 1</th>
                <th className="py-3 px-3">M1 Time / Ticks</th>
                <th className="py-3 px-3">Milestone 2</th>
                <th className="py-3 px-3">Adverse Excursion</th>
                <th className="py-3 px-3 text-right">Chart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 font-mono">
              {liveAnalyses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-sans">
                    No Ultra/Uber trades currently available in stream. Waiting for live polling...
                  </td>
                </tr>
              ) : (
                liveAnalyses.map((analysis, aIdx) => {
                  const { trade, milestone1, milestone2, drawdown } = analysis;
                  const isUltra = trade.version?.toUpperCase() === 'ULTRA';
                  const isUber = trade.version?.toUpperCase() === 'UBER';

                  return (
                    <tr
                      key={`${trade.instrument}_${trade.timestamp}_${aIdx}`}
                      className="hover:bg-slate-800/40 transition"
                    >
                      {/* Version & Instrument */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isUltra
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : isUber
                                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {trade.version}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              trade.type === 'BUY'
                                ? 'bg-emerald-950 text-emerald-400'
                                : 'bg-rose-950 text-rose-400'
                            }`}
                          >
                            {trade.type}
                          </span>
                        </div>
                        <div className="text-white font-semibold text-xs mt-1 truncate max-w-[160px]" title={trade.instrument}>
                          {trade.instrument}
                        </div>
                      </td>

                      {/* Signal Time */}
                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        <div>{trade.ist || UpstoxApiService.toISTString(trade.timestamp)}</div>
                        <div className="text-slate-500 text-[10px]">Bar #{trade.barNumber}</div>
                      </td>

                      {/* Prices */}
                      <td className="py-3 px-3">
                        <div className="text-slate-200">
                          Entry: <span className="text-white font-bold">{trade.entry}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span className="text-rose-400">SL: {trade.sl}</span>
                          <span className="text-emerald-400">TP: {trade.tp}</span>
                        </div>
                      </td>

                      {/* Milestone 1 */}
                      <td className="py-3 px-3">
                        {!milestone1 || analysis.status === 'NEITHER_HIT_YET' ? (
                          <span className="px-2 py-0.5 rounded bg-slate-800/80 text-amber-300 border border-slate-700 text-[10px] font-semibold flex items-center gap-1.5 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                            <span>PENDING (Waiting for {analysis.expectedTarget})</span>
                          </span>
                        ) : (
                          <div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 w-fit ${
                                analysis.isSuccess
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}
                            >
                              {analysis.isSuccess ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <XCircle className="w-3 h-3 text-rose-400" />
                              )}
                              <span>{milestone1.type} HIT ({analysis.isSuccess ? 'WIN' : 'ADVERSE'})</span>
                            </span>
                            <div className="text-[10px] text-slate-400 mt-1">
                              {milestone1.candlesCount} candle(s) • day +{milestone1.daysElapsed}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* M1 Time & Ticks */}
                      <td className="py-3 px-3">
                        {milestone1 ? (
                          <>
                            <div className="text-cyan-400 font-semibold">{milestone1.timeTakenFormatted}</div>
                            <div className="text-[11px] text-amber-400">
                              <strong>{milestone1.ticks}</strong> ticks{' '}
                              <span className="text-slate-500 text-[10px]">({milestone1.cumulativeVolume?.toLocaleString()} vol)</span>
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* Milestone 2 */}
                      <td className="py-3 px-3">
                        {milestone2 && milestone2.type !== 'PENDING' ? (
                          <div>
                            <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-bold">
                              {milestone2.type} HIT
                            </span>
                            <div className="text-[11px] text-cyan-400 mt-1">
                              {milestone2.timeTakenFormatted}
                            </div>
                            <div className="text-[10px] text-amber-400">
                              {milestone2.ticks} ticks ({milestone2.daysElapsed}d)
                            </div>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                            {milestone2?.type || 'M2'} PENDING
                          </span>
                        )}
                      </td>

                      {/* Drawdown */}
                      <td className="py-3 px-3 text-[11px]">
                        <div className="text-rose-400 font-semibold">
                          Max Loss: {drawdown.maxLossMultiple}x
                        </div>
                        <div className="text-slate-400 text-[10px]">
                          To Entry: {drawdown.lossMultipleBeforeEntryReturn}x • SL cross: {drawdown.slCrossCount}x
                        </div>
                      </td>

                      {/* Chart launcher */}
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => onOpenChart(analysis)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-sans font-semibold border border-indigo-500/30 transition cursor-pointer flex items-center gap-1 ml-auto"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View Candle</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
