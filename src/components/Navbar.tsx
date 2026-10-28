import React from 'react';
import { Activity, BarChart3, Database, FileSpreadsheet, Settings, Terminal, RefreshCw } from 'lucide-react';

interface NavbarProps {
  activeTab: 'overview' | 'command1' | 'command2' | 'live' | 'signals';
  setActiveTab: (tab: 'overview' | 'command1' | 'command2' | 'live' | 'signals') => void;
  totalTrades: number;
  currentDate: string;
  hasMarketData: boolean;
  onOpenSettings: () => void;
  onOpenMarketDataModal: () => void;
  onRefreshData: () => void;
  isRefreshing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  totalTrades,
  currentDate,
  hasMarketData,
  onOpenSettings,
  onOpenMarketDataModal,
  onRefreshData,
  isRefreshing,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">Upstox Trade Analyzer</span>
                <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                  v2.0 Historical
                </span>
              </div>
              <p className="text-xs text-slate-400">
                1-Min CSV Pipeline & SL vs TP Milestone Resolution
              </p>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Pipeline Overview
            </button>
            <button
              onClick={() => setActiveTab('command1')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'command1'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              Command 1: 1-Min CSVs
            </button>
            <button
              onClick={() => setActiveTab('command2')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'command2'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Command 2: SL vs TP
            </button>
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'live'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-400 hover:text-emerald-300 hover:bg-slate-800/60'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Tracker (5s)</span>
            </button>
            <button
              onClick={() => setActiveTab('signals')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'signals'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Trades JSON
            </button>
          </nav>

          {/* Right Status & Actions */}
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-2 text-xs bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Date: <strong>{currentDate}</strong></span>
              <span className="text-slate-600">|</span>
              <span>Trades: <strong>{totalTrades}</strong></span>
            </div>

            <button
              onClick={onRefreshData}
              disabled={isRefreshing}
              title="Refresh loaded signals & market data"
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>

            <button
              onClick={onOpenMarketDataModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-xs font-semibold text-indigo-300 border border-indigo-800/80 transition cursor-pointer"
              title="Upload & export market data 1-minute CSVs for expired contracts"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Market CSVs</span>
            </button>

            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-xs font-medium text-slate-200 border border-slate-700 transition cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>


        {/* Mobile Navigation */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800/80 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-1 px-2 font-medium ${activeTab === 'overview' ? 'text-indigo-400 font-semibold' : 'text-slate-400'}`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('command1')}
            className={`py-1 px-2 font-medium ${activeTab === 'command1' ? 'text-indigo-400 font-semibold' : 'text-slate-400'}`}
          >
            Command 1
          </button>
          <button
            onClick={() => setActiveTab('command2')}
            className={`py-1 px-2 font-medium ${activeTab === 'command2' ? 'text-indigo-400 font-semibold' : 'text-slate-400'}`}
          >
            Command 2
          </button>
          <button
            onClick={() => setActiveTab('signals')}
            className={`py-1 px-2 font-medium ${activeTab === 'signals' ? 'text-indigo-400 font-semibold' : 'text-slate-400'}`}
          >
            Trades JSON
          </button>
        </div>
      </div>
    </header>
  );
};
