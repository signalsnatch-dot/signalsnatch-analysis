import React, { useState, useMemo } from 'react';
import {
  Activity,
  Download,
  Search,
  Clock,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Eye,
  RefreshCw,
  Sparkles,
  Layers,
  Calendar,
  ShieldAlert,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  BarChart2,
  SlidersHorizontal,
} from 'lucide-react';
import { TradeMilestoneAnalysis, TradeGroup5Min } from '../types/trade.ts';
import {
  Command2Result,
  DateDayM1Breakdown,
  LossTradeDetail,
  ClassifiedTicksSummary,
} from '../services/command2Service.ts';
import { KpiCards } from './KpiCards.tsx';

interface Command2PanelProps {
  analyses: TradeMilestoneAnalysis[];
  result: Command2Result | null;
  onRunCommand2: (options: { versionFilters: string[]; useAllVersions: boolean; volumeTradesOnly?: boolean }) => Promise<void>;
  isRunning: boolean;
  availableVersions: string[];
  totalLoadedTrades: number;
  onSelectTradeForChart: (analysis: TradeMilestoneAnalysis) => void;
}

export const Command2Panel: React.FC<Command2PanelProps> = ({
  analyses,
  result,
  onRunCommand2,
  isRunning,
  availableVersions,
  totalLoadedTrades,
  onSelectTradeForChart,
}) => {
  const [viewMode, setViewMode] = useState<'individual' | 'breakdown' | 'loss_trades' | 'ticks_speed' | 'groups'>('individual');
  const [versionPreset, setVersionPreset] = useState<'ultra_uber' | 'ultra' | 'uber' | 'all' | 'custom'>('ultra_uber');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'BUY_STOP' | 'SELL_STOP'>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'SUCCESS' | 'LOSS'>('ALL');
  const [m2Filter, setM2Filter] = useState<'ALL' | 'SAME_DAY' | 'MULTI_DAY' | 'PENDING'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  // Breakdown & Loss filters
  const [breakdownType, setBreakdownType] = useState<'date' | 'dayOfWeek'>('date');
  const [lossVersionFilter, setLossVersionFilter] = useState<'ALL' | 'UBER' | 'ULTRA'>('ALL');
  const [onlyVolumeTrades, setOnlyVolumeTrades] = useState<boolean>(true);

  // Handle Preset Clicks
  const handlePresetSelect = (preset: 'ultra_uber' | 'ultra' | 'uber' | 'all') => {
    setVersionPreset(preset);
    let filters: string[] = [];
    let useAll = false;

    if (preset === 'ultra_uber') {
      filters = ['ULTRA', 'UBER'];
    } else if (preset === 'ultra') {
      filters = ['ULTRA'];
    } else if (preset === 'uber') {
      filters = ['UBER'];
    } else if (preset === 'all') {
      useAll = true;
    }

    onRunCommand2({
      versionFilters: filters,
      useAllVersions: useAll,
      volumeTradesOnly: onlyVolumeTrades,
    });
  };

  // Filter individual analyses on client side
  const filteredAnalyses = useMemo(() => {
    return analyses.filter((item) => {
      const t = item.trade;
      const s = searchTerm.toLowerCase();

      const matchesSearch =
        t.name?.toLowerCase().includes(s) ||
        t.instrument.toLowerCase().includes(s) ||
        t.version.toLowerCase().includes(s);

      const matchesDir = directionFilter === 'ALL' || t.type === directionFilter;
      const matchesOutcome =
        outcomeFilter === 'ALL' ||
        (outcomeFilter === 'SUCCESS' && item.isSuccess) ||
        (outcomeFilter === 'LOSS' && !item.isSuccess);

      const matchesM2 =
        m2Filter === 'ALL' ||
        (m2Filter === 'SAME_DAY' && item.milestone2?.achievedSameDay) ||
        (m2Filter === 'MULTI_DAY' && item.milestone2 && !item.milestone2.achievedSameDay && item.milestone2.type !== 'PENDING') ||
        (m2Filter === 'PENDING' && item.milestone2?.type === 'PENDING');

      return matchesSearch && matchesDir && matchesOutcome && matchesM2;
    });
  }, [analyses, searchTerm, directionFilter, outcomeFilter, m2Filter]);

  // Filter 5-minute groups
  const groups5Min = result?.groups5Min || [];
  const filteredGroups = useMemo(() => {
    return groups5Min.filter((g) => {
      const s = searchTerm.toLowerCase();
      return (
        g.name.toLowerCase().includes(s) ||
        g.instrument.toLowerCase().includes(s) ||
        g.versions.some((v) => v.toLowerCase().includes(s))
      );
    });
  }, [groups5Min, searchTerm]);

  // Summary data
  const summary = result?.summary;
  const breakdowns = breakdownType === 'date' ? summary?.dateBreakdowns || [] : summary?.dayOfWeekBreakdowns || [];
  const rawLossTrades = summary?.lossTrades || [];

  const filteredLossTrades = useMemo(() => {
    return rawLossTrades.filter((lt) => {
      const s = searchTerm.toLowerCase();
      const matchesSearch =
        lt.name.toLowerCase().includes(s) ||
        lt.instrument.toLowerCase().includes(s) ||
        lt.version.toLowerCase().includes(s);

      const matchesVer =
        lossVersionFilter === 'ALL' ||
        (lossVersionFilter === 'UBER' && /uber/i.test(lt.version)) ||
        (lossVersionFilter === 'ULTRA' && !/uber/i.test(lt.version));

      return matchesSearch && matchesVer;
    });
  }, [rawLossTrades, searchTerm, lossVersionFilter]);

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 rounded-md bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-bold text-xs">
              2
            </span>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Command 2: Milestone Resolution, Drawdowns & Multi-Day Analytics
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                NSE_FO Lot Size Adjusted
              </span>
            </h2>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Success definitions: <strong className="text-emerald-400">TP for Ultra/Others</strong> vs{' '}
            <strong className="text-purple-400">SL for Uber</strong> (TP is loss for Uber). Scans 1-minute data across entry date and consecutive days. Ticks are computed by dividing candle volume by NSE_FO instrument lot size, summed, and divided by trade threshold.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {result?.reportCsvPath && (
            <a
              href={`/api/download-csv?type=report&file=${encodeURIComponent(result.reportCsvPath)}`}
              download
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export CSV Report</span>
            </a>
          )}
          <button
            onClick={() => handlePresetSelect(versionPreset === 'custom' ? 'ultra_uber' : versionPreset)}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-indigo-600/20 transition cursor-pointer"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Evaluating Milestones...</span>
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                <span>Run Command 2</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <KpiCards summary={result?.summary || null} totalLoadedTrades={totalLoadedTrades} />

      {/* Navigation View Switcher Tabs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto w-full md:w-auto">
          <button
            onClick={() => setViewMode('individual')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              viewMode === 'individual'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Individual Trades ({filteredAnalyses.length})</span>
          </button>

          <button
            onClick={() => setViewMode('breakdown')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              viewMode === 'breakdown'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Date & Day Breakdown</span>
          </button>

          <button
            onClick={() => setViewMode('loss_trades')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              viewMode === 'loss_trades'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-400 hover:text-rose-300'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Loss Trades In-Depth ({rawLossTrades.length})</span>
          </button>

          <button
            onClick={() => setViewMode('ticks_speed')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              viewMode === 'ticks_speed'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-amber-400 hover:text-amber-300'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Speed & Ticks</span>
          </button>

          <button
            onClick={() => setViewMode('groups')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              viewMode === 'groups'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>5-Min Clubbed Groups ({filteredGroups.length})</span>
          </button>
        </div>

        {/* Global Search Box */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search symbol, version, instrument..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Preset Toolbar & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Version Presets */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Presets:
            </span>
            <button
              onClick={() => handlePresetSelect('ultra_uber')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                versionPreset === 'ultra_uber'
                  ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Ultra & Uber (Default)
            </button>
            <button
              onClick={() => handlePresetSelect('ultra')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                versionPreset === 'ultra' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Ultra Only
            </button>
            <button
              onClick={() => handlePresetSelect('uber')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                versionPreset === 'uber' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Uber Only
            </button>
            <button
              onClick={() => handlePresetSelect('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                versionPreset === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              All Versions ({availableVersions.length})
            </button>
          </div>

          {/* Volume Filter Toggle (Requirement 4) */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 font-medium cursor-pointer bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
              <input
                type="checkbox"
                checked={onlyVolumeTrades}
                onChange={(e) => {
                  setOnlyVolumeTrades(e.target.checked);
                  onRunCommand2({
                    versionFilters: versionPreset === 'ultra_uber' ? ['ULTRA', 'UBER'] : versionPreset === 'ultra' ? ['ULTRA'] : versionPreset === 'uber' ? ['UBER'] : [],
                    useAllVersions: versionPreset === 'all',
                    volumeTradesOnly: e.target.checked,
                  });
                }}
                className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
              />
              <span>Volume-Based Trades Only (threshold &gt; 0)</span>
            </label>
          </div>
        </div>

        {/* Granular Filters for Individual View */}
        {viewMode === 'individual' && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-800 text-xs">
            <span className="text-slate-500">Outcome:</span>
            <div className="bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex">
              {(['ALL', 'SUCCESS', 'LOSS'] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setOutcomeFilter(o)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    outcomeFilter === o ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {o === 'ALL' ? 'All' : o === 'SUCCESS' ? 'Success (Wins)' : 'Loss / Adverse'}
                </button>
              ))}
            </div>

            <span className="text-slate-500 ml-2">Type:</span>
            <div className="bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex">
              {(['ALL', 'BUY_STOP', 'SELL_STOP'] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => setDirectionFilter(dir)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    directionFilter === dir ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {dir === 'ALL' ? 'All' : dir === 'BUY_STOP' ? 'BUY' : 'SELL'}
                </button>
              ))}
            </div>

            <span className="text-slate-500 ml-2">Milestone 2:</span>
            <div className="bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex">
              {(['ALL', 'SAME_DAY', 'MULTI_DAY', 'PENDING'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setM2Filter(m)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    m2Filter === m ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m === 'ALL' ? 'All' : m === 'SAME_DAY' ? 'Same Day' : m === 'MULTI_DAY' ? 'Multi-Day' : 'Pending'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* VIEW 1: DATE & DAY BREAKDOWN (Requirement 3) */}
      {viewMode === 'breakdown' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm space-y-4">
          <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                Categorized Date & Day-of-Week M1 Analytics
              </h3>
              <p className="text-xs text-slate-400">
                Breakdown of Milestone 1 outcomes as TP vs SL for Uber and Ultra versions separately with classified win rates.
              </p>
            </div>

            <div className="bg-slate-900 p-0.5 rounded-lg border border-slate-700 flex text-xs">
              <button
                onClick={() => setBreakdownType('date')}
                className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                  breakdownType === 'date' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Group by Date
              </button>
              <button
                onClick={() => setBreakdownType('dayOfWeek')}
                className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                  breakdownType === 'dayOfWeek' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Group by Day of Week
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 font-sans">{breakdownType === 'date' ? 'Date' : 'Day of Week'}</th>
                  <th className="py-3 px-3 text-center">Total Trades</th>
                  {/* Uber Section */}
                  <th className="py-3 px-3 bg-purple-950/20 text-purple-300 text-center font-sans">
                    Uber Total
                  </th>
                  <th className="py-3 px-3 bg-purple-950/20 text-emerald-400 text-center font-sans">
                    Uber M1=SL (Win)
                  </th>
                  <th className="py-3 px-3 bg-purple-950/20 text-rose-400 text-center font-sans">
                    Uber M1=TP (Loss)
                  </th>
                  <th className="py-3 px-3 bg-purple-950/20 text-purple-300 text-right font-sans">
                    Uber Win Rate
                  </th>
                  {/* Ultra Section */}
                  <th className="py-3 px-3 bg-indigo-950/20 text-indigo-300 text-center font-sans">
                    Ultra Total
                  </th>
                  <th className="py-3 px-3 bg-indigo-950/20 text-emerald-400 text-center font-sans">
                    Ultra M1=TP (Win)
                  </th>
                  <th className="py-3 px-3 bg-indigo-950/20 text-rose-400 text-center font-sans">
                    Ultra M1=SL (Loss)
                  </th>
                  <th className="py-3 px-3 bg-indigo-950/20 text-indigo-300 text-right font-sans">
                    Ultra Win Rate
                  </th>
                  <th className="py-3 px-4 text-right font-sans">Overall Win %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {breakdowns.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-500 font-sans">
                      No breakdown data available. Run Command 2 to calculate analytics.
                    </td>
                  </tr>
                ) : (
                  breakdowns.map((b, idx) => (
                    <tr key={`${b.periodKey}_${idx}`} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-semibold text-white font-sans flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        <span>{b.periodKey}</span>
                      </td>
                      <td className="py-3 px-3 text-center text-slate-300">{b.totalTrades}</td>
                      {/* Uber */}
                      <td className="py-3 px-3 text-center text-purple-300 bg-purple-950/10 font-bold">{b.uberTotal}</td>
                      <td className="py-3 px-3 text-center text-emerald-400 bg-purple-950/10">{b.uberSlCount}</td>
                      <td className="py-3 px-3 text-center text-rose-400 bg-purple-950/10">{b.uberTpCount}</td>
                      <td className="py-3 px-3 text-right bg-purple-950/10 font-bold text-purple-300">
                        {b.uberTotal > 0 ? `${b.uberWinRate.toFixed(1)}%` : '-'}
                      </td>
                      {/* Ultra */}
                      <td className="py-3 px-3 text-center text-indigo-300 bg-indigo-950/10 font-bold">{b.ultraTotal}</td>
                      <td className="py-3 px-3 text-center text-emerald-400 bg-indigo-950/10">{b.ultraTpCount}</td>
                      <td className="py-3 px-3 text-center text-rose-400 bg-indigo-950/10">{b.ultraSlCount}</td>
                      <td className="py-3 px-3 text-right bg-indigo-950/10 font-bold text-indigo-300">
                        {b.ultraTotal > 0 ? `${b.ultraWinRate.toFixed(1)}%` : '-'}
                      </td>
                      {/* Overall */}
                      <td className="py-3 px-4 text-right font-bold">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] ${
                            b.overallWinRate >= 50
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {b.overallWinRate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: LOSS TRADES IN-DEPTH (Requirement 3) */}
      {viewMode === 'loss_trades' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm space-y-4">
          <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                Loss Trades In-Depth Analysis
              </h3>
              <p className="text-xs text-slate-400">
                Detailed metrics for adverse trades: for Uber, TP hit is loss; for Ultra/others, SL hit is loss. Reports exact signal entry time, adverse milestone hit time, and return excursions.
              </p>
            </div>

            {/* Version Filter for Loss Trades */}
            <div className="bg-slate-900 p-0.5 rounded-lg border border-slate-700 flex text-xs">
              {(['ALL', 'UBER', 'ULTRA'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setLossVersionFilter(v)}
                  className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                    lossVersionFilter === v ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {v === 'ALL' ? 'All Losses' : v === 'UBER' ? 'Uber Losses (M1=TP)' : 'Ultra Losses (M1=SL)'}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3 font-sans">Instrument / Version</th>
                  <th className="py-3 px-3 text-right">Entry Price</th>
                  <th className="py-3 px-3 text-center">Goal vs Adverse M1</th>
                  <th className="py-3 px-3 text-slate-300">Signal Entry Time (IST)</th>
                  <th className="py-3 px-3 text-rose-300">Loss Milestone Hit Time (IST)</th>
                  <th className="py-3 px-3 text-cyan-300">Time to Loss</th>
                  <th className="py-3 px-3 text-right">Max Loss Multiple</th>
                  <th className="py-3 px-3 text-right text-amber-300">Before Return</th>
                  <th className="py-3 px-3 text-slate-400">Crossings (SL/TP/Entry)</th>
                  <th className="py-3 px-3 text-center font-sans">Chart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredLossTrades.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-500 font-sans">
                      No loss trades recorded matching the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredLossTrades.map((lt, idx) => {
                    const isUber = /uber/i.test(lt.version);
                    const matchedAnalysis = analyses.find(
                      (a) => a.trade.instrument === lt.instrument && a.dateStr === lt.dateStr
                    );

                    return (
                      <tr key={`${lt.instrument}_${lt.entryTimeIST}_${idx}`} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isUber
                                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                  : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                              }`}
                            >
                              {lt.version}
                            </span>
                            <span
                              className={`px-1 py-0.5 rounded text-[10px] font-bold ${
                                lt.type === 'BUY_STOP' ? 'text-emerald-400 bg-emerald-950' : 'text-rose-400 bg-rose-950'
                              }`}
                            >
                              {lt.type === 'BUY_STOP' ? 'BUY' : 'SELL'}
                            </span>
                          </div>
                          <div className="font-semibold text-white font-sans truncate max-w-[160px]" title={lt.name}>
                            {lt.name || lt.instrument}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right text-white font-bold">{lt.entry.toFixed(2)}</td>

                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-slate-400 text-[10px]">Goal:</span>
                            <span className="text-emerald-400 font-bold">{lt.goalMilestone}</span>
                            <span className="text-slate-600">→</span>
                            <span className="text-rose-400 font-bold">{lt.m1Type} Hit</span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-slate-300 whitespace-nowrap">{lt.entryTimeIST}</td>

                        <td className="py-3 px-3 text-rose-300 font-bold whitespace-nowrap">
                          {lt.m1HitTimeIST}
                        </td>

                        <td className="py-3 px-3 text-cyan-400 whitespace-nowrap">{lt.durationFormatted}</td>

                        <td className="py-3 px-3 text-right font-bold text-rose-400">
                          {lt.maxLossMultiple.toFixed(2)}x
                        </td>

                        <td className="py-3 px-3 text-right font-bold text-amber-300">
                          {lt.lossBeforeEntryReturn.toFixed(2)}x
                        </td>

                        <td className="py-3 px-3 text-[11px] text-slate-400 whitespace-nowrap">
                          SL: <span className="text-rose-400">{lt.slCrossCount}</span> • TP:{' '}
                          <span className="text-emerald-400">{lt.tpCrossCount}</span> • Entry:{' '}
                          <span className="text-cyan-400">{lt.entryCrossCount}</span>
                        </td>

                        <td className="py-3 px-3 text-center">
                          {matchedAnalysis && (
                            <button
                              onClick={() => onSelectTradeForChart(matchedAnalysis)}
                              className="p-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 transition cursor-pointer"
                              title="View Multi-Day 1-min Candle Chart with Hit Date"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: SPEED & CLASSIFIED TICKS (Requirement 3) */}
      {viewMode === 'ticks_speed' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-amber-400" />
              Classified Ticks & Speed Distribution
            </h3>
            <p className="text-xs text-slate-400">
              Categorizes Milestone 1 velocity into volume-threshold tick brackets with average time taken.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {(summary?.classifiedTicks || []).map((b, idx) => (
              <div
                key={`${b.bracket}_${idx}`}
                className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1 font-mono">
                    {b.bracket}
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">
                    {b.count}{' '}
                    <span className="text-xs font-normal text-slate-400">({b.percentage}%)</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-850 space-y-1 text-xs">
                  <div className="text-slate-400 flex justify-between">
                    <span>Avg Ticks:</span>
                    <strong className="text-amber-300 font-mono">{b.avgTicks}</strong>
                  </div>
                  <div className="text-slate-400 flex justify-between">
                    <span>Avg Time:</span>
                    <strong className="text-cyan-400">{b.avgTimeTakenFormatted}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 4: INDIVIDUAL TRADES TABLE */}
      {viewMode === 'individual' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3">Trade Details</th>
                  <th className="py-3 px-3">Entry IST</th>
                  <th className="py-3 px-3 text-right">Levels</th>
                  <th className="py-3 px-3 text-center">Goal & Result</th>
                  <th className="py-3 px-3 bg-indigo-950/20 text-indigo-300">Milestone 1 (Hit First)</th>
                  <th className="py-3 px-3 bg-purple-950/20 text-purple-300">Milestone 2 (Follow-Through)</th>
                  <th className="py-3 px-3 bg-rose-950/20 text-rose-300">Drawdown & Loss Multiple</th>
                  <th className="py-3 px-3 text-center">Chart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredAnalyses.map((item, idx) => {
                  const t = item.trade;
                  const m1 = item.milestone1;
                  const m2 = item.milestone2;
                  const dd = item.drawdown;
                  const isBuy = t.type === 'BUY_STOP';
                  const isUber = /uber/i.test(t.version);

                  return (
                    <tr
                      key={`${t.instrument}_${t.timestamp}_${t.version}_${idx}`}
                      className="hover:bg-slate-800/40 transition"
                    >
                      {/* Trade Details */}
                      <td className="py-3 px-3 max-w-xs">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isBuy
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {isBuy ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                            {isBuy ? 'BUY' : 'SELL'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                              isUber
                                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                            }`}
                          >
                            {t.version}
                          </span>
                        </div>
                        <div className="font-semibold text-white truncate">{t.name || t.instrument}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {t.instrument} • Lot: {item.lotSizeUsed || 1} • Thresh: {t.threshold}
                        </div>
                      </td>

                      {/* Entry Time IST */}
                      <td className="py-3 px-3 whitespace-nowrap text-slate-300 font-mono text-[11px]">
                        <div>{item.entryIst}</div>
                        <div className="text-[10px] text-slate-500">Date: {item.dateStr}</div>
                      </td>

                      {/* Levels */}
                      <td className="py-3 px-3 text-right font-mono">
                        <div className="text-white font-semibold">{t.entry.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-400 space-x-1">
                          <span className="text-rose-400">SL {t.sl.toFixed(1)}</span>
                          <span>/</span>
                          <span className="text-emerald-400">TP {t.tp.toFixed(1)}</span>
                        </div>
                      </td>

                      {/* Goal & Outcome */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="text-[10px] text-slate-400 mb-0.5">
                          Goal: <strong className="text-slate-200">{item.expectedTarget}</strong>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.isSuccess
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {item.isSuccess ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>WIN</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-rose-400" />
                              <span>ADVERSE</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* Milestone 1 */}
                      <td className="py-3 px-3 bg-indigo-950/10 font-mono">
                        {m1 ? (
                          <div>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  m1.type === 'TP'
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                                }`}
                              >
                                {m1.type} Hit
                              </span>
                              <span className="text-xs text-amber-300 font-bold">
                                {m1.ticks} ticks
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-300">
                              {m1.daysElapsed === 0 ? 'Same Day' : `Day +${m1.daysElapsed} (${m1.hitDate || ''})`} •{' '}
                              <span className="text-cyan-400">{m1.timeTakenFormatted}</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {m1.candlesCount} candle(s) • Vol: {m1.cumulativeVolume?.toLocaleString()} lots
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">No Hit</span>
                        )}
                      </td>

                      {/* Milestone 2 */}
                      <td className="py-3 px-3 bg-purple-950/10 font-mono">
                        {m2 ? (
                          m2.type !== 'PENDING' ? (
                            <div>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                                    m2.type === 'TP'
                                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                                  }`}
                                >
                                  {m2.type} Hit
                                </span>
                                <span className="text-xs text-amber-300 font-bold">
                                  {m2.ticks} ticks
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-300">
                                {m2.achievedSameDay ? 'Same Day' : `Multi-Day (${m2.hitDate || ''})`} •{' '}
                                <span className="text-cyan-400">{m2.timeTakenFormatted}</span>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/80">
                                Pending Next Milestone
                              </span>
                              <div className="text-[10px] text-slate-500 mt-1 max-w-[170px] truncate">{m2.notes}</div>
                            </div>
                          )
                        ) : (
                          <span className="text-slate-500 italic">-</span>
                        )}
                      </td>

                      {/* Drawdown & Loss Multiples */}
                      <td className="py-3 px-3 bg-rose-950/10 whitespace-nowrap font-mono text-[11px]">
                        <div>
                          Max Loss: <strong className="text-rose-400">{dd.maxLossMultiple}x risk</strong>
                        </div>
                        <div className="text-slate-400 text-[10px]">
                          Before Return: <strong className="text-amber-300">{dd.lossMultipleBeforeEntryReturn}x</strong>
                        </div>
                        <div className="text-slate-500 text-[10px]">
                          SL: {dd.slCrossCount}x • TP: {dd.tpCrossCount}x • Entry: {dd.entryCrossCount}x
                        </div>
                      </td>

                      {/* Chart Button */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => onSelectTradeForChart(item)}
                          className="p-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 hover:text-white transition cursor-pointer"
                          title="View Interactive Candlestick Chart spanning to milestone date"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredAnalyses.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500 font-sans">
                      No analyzed trades match the selected criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 5: 5-MINUTE CLUBBED CLUSTERS VIEW */}
      {viewMode === 'groups' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl text-xs text-slate-400 flex items-center justify-between">
            <div>
              <strong className="text-white font-semibold">5-Minute Instrument Clustering:</strong>{' '}
              Trades for the same instrument occurring within 5 minutes are grouped together. Compare which version (Ultra vs Uber) achieved success first!
            </div>
            <span className="text-indigo-400 font-bold">{filteredGroups.length} Groups Identified</span>
          </div>

          <div className="space-y-3">
            {filteredGroups.map((group, gIdx) => {
              const isExpanded = expandedGroupId === group.groupId;
              return (
                <div
                  key={`${group.groupId}_${gIdx}`}
                  className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition"
                >
                  <div
                    onClick={() => setExpandedGroupId(isExpanded ? null : group.groupId)}
                    className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/40 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400 font-bold">
                        {group.trades.length}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm">{group.name}</h4>
                          <span className="text-[10px] text-slate-500 font-mono">({group.instrument})</span>
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{group.dateStr}</span>
                          <span>•</span>
                          <span className="text-cyan-400 font-mono">{group.timeRangeFormatted} IST</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs font-semibold text-emerald-400">
                          Winner: {group.winningVersion || 'None'}
                        </div>
                        <div className="text-[10px] text-slate-400 max-w-xs truncate">{group.winningReason}</div>
                      </div>

                      <div className="p-1 rounded-lg bg-slate-800 text-slate-400">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 border-t border-slate-800 bg-slate-950/40">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                            <tr>
                              <th className="py-2 px-3">Version</th>
                              <th className="py-2 px-3">Type</th>
                              <th className="py-2 px-3 text-right">Entry</th>
                              <th className="py-2 px-3 text-right">SL / TP</th>
                              <th className="py-2 px-3 text-center">Result</th>
                              <th className="py-2 px-3">Milestone 1</th>
                              <th className="py-2 px-3">Ticks (Time)</th>
                              <th className="py-2 px-3">Max Loss</th>
                              <th className="py-2 px-3 text-center">Chart</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {group.trades.map((item, tIdx) => {
                              const t = item.trade;
                              const m1 = item.milestone1;
                              return (
                                <tr key={`${t.instrument}_${t.timestamp}_${tIdx}`} className="hover:bg-slate-800/40">
                                  <td className="py-2.5 px-3 font-semibold text-white">{t.version}</td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        t.type === 'BUY_STOP' ? 'text-emerald-400 bg-emerald-950' : 'text-rose-400 bg-rose-950'
                                      }`}
                                    >
                                      {t.type}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-white">{t.entry.toFixed(2)}</td>
                                  <td className="py-2.5 px-3 text-right">
                                    <span className="text-rose-400">{t.sl.toFixed(1)}</span> /{' '}
                                    <span className="text-emerald-400">{t.tp.toFixed(1)}</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        item.isSuccess ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                                      }`}
                                    >
                                      {item.isSuccess ? 'SUCCESS' : 'ADVERSE'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className={`font-bold ${m1?.type === 'TP' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {m1?.type || 'None'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="text-amber-300 font-bold">{m1?.ticks || '-'} ticks</span>{' '}
                                    <span className="text-slate-400 font-sans text-[11px]">
                                      ({m1?.timeTakenFormatted || '-'})
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-rose-400 font-bold">
                                    {item.drawdown.maxLossMultiple}x
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      onClick={() => onSelectTradeForChart(item)}
                                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
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
              );
            })}

            {filteredGroups.length === 0 && (
              <div className="p-8 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
                No 5-minute trade clusters found matching the search criteria.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
