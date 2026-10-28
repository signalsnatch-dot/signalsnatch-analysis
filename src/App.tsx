import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  BarChart3,
  Database,
  Download,
  ArrowRight,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  Play,
  Terminal,
  ExternalLink,
  Globe,
} from 'lucide-react';

import { TradeSignal, DayInstrumentAccumulation, TradeMilestoneAnalysis } from './types/trade.ts';
import { Command1Service, Command1Result } from './services/command1Service.ts';
import { Command2Service, Command2Result } from './services/command2Service.ts';
import { UpstoxApiService } from './services/upstoxApi.ts';

import { Navbar } from './components/Navbar.tsx';
import { KpiCards } from './components/KpiCards.tsx';
import { Command1Panel } from './components/Command1Panel.tsx';
import { Command2Panel } from './components/Command2Panel.tsx';
import { LiveTrackerPanel } from './components/LiveTrackerPanel.tsx';
import { CandleChartModal } from './components/CandleChartModal.tsx';
import { SignalsManagerModal } from './components/SignalsManagerModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { MarketDataManagerModal } from './components/MarketDataManagerModal.tsx';

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'command1' | 'command2' | 'live' | 'signals'>('overview');
  const [trades, setTrades] = useState<TradeSignal[]>([]);
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [availableInstruments, setAvailableInstruments] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [dayAccumulations, setDayAccumulations] = useState<DayInstrumentAccumulation[]>([]);

  // Execution Results
  const [cmd1Result, setCmd1Result] = useState<Command1Result | null>(null);
  const [cmd2Result, setCmd2Result] = useState<Command2Result | null>(null);
  const [isCmd1Running, setIsCmd1Running] = useState(false);
  const [isCmd2Running, setIsCmd2Running] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [chartAnalysis, setChartAnalysis] = useState<TradeMilestoneAnalysis | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSignalsManagerOpen, setIsSignalsManagerOpen] = useState(false);
  const [isMarketDataModalOpen, setIsMarketDataModalOpen] = useState(false);

  // Load trades from backend
  const loadTradesData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/signals/data');
      const data = await res.json();
      if (Array.isArray(data.trades)) {
        setTrades(data.trades);
        setAvailableVersions(data.versions || []);
        setAvailableInstruments(data.instruments || []);
        setAvailableDates(data.dates || []);
        const accs = Command1Service.accumulateInstruments(data.trades);
        setDayAccumulations(accs);
      }
    } catch (err) {
      console.error('Failed to load trades:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTradesData();
  }, [loadTradesData]);

  // Run Command 1
  const handleRunCommand1 = async () => {
    if (trades.length === 0) return;
    setIsCmd1Running(true);
    try {
      const res = await fetch('/api/command1/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades }),
      });
      const data = await res.json();
      if (data.result) {
        setCmd1Result(data.result);
      }
    } catch (err) {
      console.error('Error running Command 1:', err);
    } finally {
      setIsCmd1Running(false);
    }
  };

  // Run Command 2
  const handleRunCommand2 = async (options: { versionFilters: string[]; useAllVersions: boolean; volumeTradesOnly?: boolean }) => {
    if (trades.length === 0) return;
    setIsCmd2Running(true);
    try {
      const res = await fetch('/api/command2/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trades,
          versionFilters: options.versionFilters,
          useAllVersions: options.useAllVersions,
          volumeTradesOnly: options.volumeTradesOnly !== false,
        }),
      });
      const data = await res.json();
      if (data.result) {
        setCmd2Result(data.result);
      }
    } catch (err) {
      console.error('Error running Command 2:', err);
    } finally {
      setIsCmd2Running(false);
    }
  };

  // Auto-run Command 2 on initial load if we have trades
  useEffect(() => {
    if (trades.length > 0 && !cmd2Result && !isCmd2Running) {
      handleRunCommand2({ versionFilters: ['ULTRA', 'UBER'], useAllVersions: false });
    }
  }, [trades]);

  const handleUploadTrades = async (uploadedTrades: TradeSignal[], filename: string) => {
    try {
      const res = await fetch('/api/signals/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, trades: uploadedTrades }),
      });
      const data = await res.json();
      if (data.success) {
        await loadTradesData();
        handleRunCommand2({ versionFilters: ['ULTRA', 'UBER'], useAllVersions: false });
      }
    } catch (err) {
      console.error('Error uploading trades:', err);
    }
  };

  const handleSaveToken = async (token: string) => {
    await fetch('/api/config/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  };

  const primaryDate = availableDates[0] || UpstoxApiService.toISTDate(Date.now());

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalTrades={trades.length}
        currentDate={primaryDate}
        hasMarketData={Boolean(cmd1Result)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenMarketDataModal={() => setIsMarketDataModalOpen(true)}
        onRefreshData={loadTradesData}
        isRefreshing={isRefreshing}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Hero Banner */}
            <div className="relative rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 p-8 shadow-xl overflow-hidden">
              <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Upstox 1-Minute Historical & Multi-Day Milestone Resolution</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                  Automated Trade Accumulation & Milestone Backtesting Engine
                </h1>
                <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                  Extracts instrument keys for every trading day, retrieves 1-minute OHLCV candle data into CSV, and resolves whether Stop Loss or Take Profit was achieved first. Tracks candle count, elapsed duration, cumulative volume, and volume-to-threshold ratios across intra-day and consecutive multi-day market sessions.
                </p>

                <div className="flex flex-wrap items-center gap-3 mt-6">
                  <button
                    onClick={() => setIsSignalsManagerOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer"
                  >
                    <Globe className="w-4 h-4" />
                    <span>Select from Remote Link (http://13.232.16.180:8000)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('command1')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition cursor-pointer"
                  >
                    <Database className="w-4 h-4 text-cyan-400" />
                    <span>Run Command 1 (Fetch CSVs)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('command2')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 font-semibold text-xs border border-slate-800 transition cursor-pointer"
                  >
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>View Command 2 (Milestones)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Pipeline Stage Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Step 1 Card */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:border-slate-700 transition">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                        1
                      </span>
                      <h3 className="font-bold text-white text-base">Command 1: 1-Min CSV Fetcher</h3>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      Ready
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Accumulates {availableInstruments.length} unique instrument keys across {availableDates.length} day(s), queries Upstox 1-minute historical data, and saves formatted CSV files with EMA20 and SMA indicators into <code className="text-cyan-400 font-mono">market_data/YYYY-MM-DD/</code>.
                  </p>

                  <div className="bg-slate-950 rounded-2xl p-4 border border-slate-850 space-y-2 mb-4 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Unique Instruments:</span>
                      <strong className="text-white font-mono">{availableInstruments.length}</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Trading Days:</span>
                      <strong className="text-white font-mono">{availableDates.join(', ') || primaryDate}</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Output Format:</span>
                      <strong className="text-cyan-400 font-mono">OHLCV + EMA20, SMA9, SMA21, Crossover</strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <span className="text-xs text-slate-500">CLI: <code className="text-slate-400">npm run command1</code></span>
                  <button
                    onClick={() => setActiveTab('command1')}
                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
                  >
                    <span>Open Panel</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Step 2 Card */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:border-slate-700 transition">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
                        2
                      </span>
                      <h3 className="font-bold text-white text-base">Command 2: Milestone & 5-Min Clustering</h3>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-950 text-indigo-400 border border-indigo-800">
                      Ultra / Uber
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Success goal: <strong className="text-emerald-400">TP for Ultra/Others</strong> vs <strong className="text-emerald-400">SL for Uber</strong>. Computes ticks (volume / threshold), multi-day M1 resolution, adverse loss multiples (e.g. 3.0x loss before target), and clusters 5-minute same-instrument trades to identify the winning version.
                  </p>

                  <div className="bg-slate-950 rounded-2xl p-4 border border-slate-850 space-y-2 mb-4 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Ticks Calculation:</span>
                      <strong className="text-amber-400 font-mono">Cumulative Vol / Threshold</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Drawdown Metric:</span>
                      <strong className="text-rose-400 font-mono">Max Adverse Loss Multiple (X.Xx)</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>5-Min Trade Clubbing:</span>
                      <strong className="text-purple-400 font-mono">Identifies Winning Version</strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <span className="text-xs text-slate-500">CLI: <code className="text-slate-400">npm run command2</code></span>
                  <button
                    onClick={() => setActiveTab('command2')}
                    className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition"
                  >
                    <span>Open Results</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* High-Level KPI Summary (if Command 2 has run) */}
            {cmd2Result && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-400" />
                    Latest Milestone Evaluation Metrics
                  </h3>
                  <button
                    onClick={() => setActiveTab('command2')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    View All {cmd2Result.analyses.length} Trades &rarr;
                  </button>
                </div>
                <KpiCards summary={cmd2Result.summary} totalLoadedTrades={trades.length} />
              </div>
            )}
          </div>
        )}

        {/* TAB 2: COMMAND 1 (ACCUMULATOR & 1-MIN CSVs) */}
        {activeTab === 'command1' && (
          <div className="animate-in fade-in duration-200">
            <Command1Panel
              dayAccumulations={dayAccumulations}
              onRunCommand1={handleRunCommand1}
              isRunning={isCmd1Running}
              lastResult={cmd1Result}
              onOpenMarketDataModal={() => setIsMarketDataModalOpen(true)}
              onSelectInstrumentToView={(instKey, date) => {
                // Give preference to Ultra/Uber trades first as required
                const matchingTrades = trades.filter(
                  (t) => t.instrument === instKey && UpstoxApiService.toISTDate(t.timestamp) === date
                );
                const trade =
                  matchingTrades.find((t) => ['ULTRA', 'UBER'].includes((t.version || '').toUpperCase())) ||
                  matchingTrades[0] ||
                  trades.find((t) => t.instrument === instKey);

                if (trade) {
                  const existingAnalysis = cmd2Result?.analyses.find(
                    (a) =>
                      a.trade.instrument === trade.instrument && a.trade.timestamp === trade.timestamp
                  );
                  if (existingAnalysis) {
                    setChartAnalysis(existingAnalysis);
                    return;
                  }

                  const isUber = /uber/i.test(trade.version || '');
                  setChartAnalysis({
                    trade,
                    entryIst: trade.ist || UpstoxApiService.toISTString(trade.timestamp),
                    dateStr: date,
                    matchedVersionFilter: true,
                    candlesFoundForDay: 0,
                    expectedTarget: isUber ? 'SL' : 'TP',
                    isSuccess: false,
                    milestone1: null,
                    milestone2: null,
                    drawdown: {
                      plannedRisk: Math.abs(trade.entry - trade.sl),
                      maxAdversePoints: 0,
                      maxLossMultiple: 0,
                      maxLossBeforeEntryReturn: 0,
                      lossMultipleBeforeEntryReturn: 0,
                      slCrossCount: 0,
                      tpCrossCount: 0,
                      entryCrossCount: 0,
                      drawdownTicks: 0,
                      drawdownTimeFormatted: '0 day(s) 00h 00m 00s',
                    },
                    status: 'NEITHER_HIT_YET',
                  });
                }
              }}
            />
          </div>
        )}

        {/* TAB 3: COMMAND 2 (SL VS TP MILESTONE RESOLUTION) */}
        {activeTab === 'command2' && (
          <div className="animate-in fade-in duration-200">
            <Command2Panel
              analyses={cmd2Result?.analyses || []}
              result={cmd2Result}
              onRunCommand2={handleRunCommand2}
              isRunning={isCmd2Running}
              availableVersions={availableVersions}
              totalLoadedTrades={trades.length}
              onSelectTradeForChart={(analysis) => setChartAnalysis(analysis)}
            />
          </div>
        )}

        {/* TAB 4: TRADES JSON & SIGNALS */}
        {activeTab === 'signals' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                  Loaded Trade Signals ({trades.length})
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Daily trade signals including Ultra, Uber, Loose, and Tier versions across Equity and Futures.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSignalsManagerOpen(true)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold shadow transition cursor-pointer"
                >
                  Remote Link / Upload JSON
                </button>
              </div>
            </div>

            {/* Signals Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3">#</th>
                      <th className="py-3 px-3">Version</th>
                      <th className="py-3 px-3">Asset Name</th>
                      <th className="py-3 px-3">Instrument Key</th>
                      <th className="py-3 px-3">Type</th>
                      <th className="py-3 px-3 text-right">Entry</th>
                      <th className="py-3 px-3 text-right">SL</th>
                      <th className="py-3 px-3 text-right">TP</th>
                      <th className="py-3 px-3 text-center">Thresh</th>
                      <th className="py-3 px-3">IST Time</th>
                      <th className="py-3 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200 font-mono text-[11px]">
                    {trades.slice(0, 100).map((t, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-indigo-300">{t.version}</td>
                        <td className="py-2.5 px-3 font-sans font-medium text-white">{t.name}</td>
                        <td className="py-2.5 px-3 text-cyan-300">{t.instrument}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.type === 'BUY_STOP' ? 'text-emerald-400 bg-emerald-950/60' : 'text-rose-400 bg-rose-950/60'
                            }`}
                          >
                            {t.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-white">{t.entry.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right text-rose-400">{t.sl.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right text-emerald-400">{t.tp.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-center text-amber-400">{t.threshold}</td>
                        <td className="py-2.5 px-3 text-slate-400">{t.ist || UpstoxApiService.toISTString(t.timestamp)}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              t.status === 'completed'
                                ? 'bg-emerald-950 text-emerald-400'
                                : t.status === 'active'
                                ? 'bg-blue-950 text-blue-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {trades.length > 100 && (
                <div className="p-3 text-center text-xs text-slate-500 border-t border-slate-800 bg-slate-950/40">
                  Showing first 100 of {trades.length} trade signals.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: LIVE TRACKER PIPELINE */}
        {activeTab === 'live' && (
          <LiveTrackerPanel
            initialTrades={trades}
            onOpenChart={(analysis) => setChartAnalysis(analysis)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Upstox Historical Trade Milestone Analyzer • Built with Vite, React, Express & TradingView Lightweight Charts
          </div>
          <div className="flex items-center gap-4">
            <span>Terminal CLI: <code className="text-slate-400 font-mono">npm run command1</code> / <code className="text-slate-400 font-mono">command2</code></span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <CandleChartModal
        analysis={chartAnalysis}
        allTrades={trades}
        onClose={() => setChartAnalysis(null)}
      />
      <SignalsManagerModal
        isOpen={isSignalsManagerOpen}
        onClose={() => setIsSignalsManagerOpen(false)}
        trades={trades}
        onUploadTrades={handleUploadTrades}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaveToken={handleSaveToken}
      />
      <MarketDataManagerModal
        isOpen={isMarketDataModalOpen}
        onClose={() => setIsMarketDataModalOpen(false)}
        onDataChanged={loadTradesData}
      />
    </div>
  );
}
