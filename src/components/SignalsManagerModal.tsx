import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  FileText,
  Check,
  AlertCircle,
  Copy,
  Globe,
  Download,
  RefreshCw,
  Search,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { TradeSignal } from '../types/trade.ts';

interface SignalsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  trades: TradeSignal[];
  onUploadTrades: (trades: TradeSignal[], filename: string) => Promise<void>;
  onSelectRemoteFile?: (filename: string, url: string) => Promise<void>;
}

export const SignalsManagerModal: React.FC<SignalsManagerModalProps> = ({
  isOpen,
  onClose,
  trades,
  onUploadTrades,
  onSelectRemoteFile,
}) => {
  const [activeTab, setActiveTab] = useState<'remote' | 'view' | 'upload' | 'paste'>('remote');
  const [pastedJson, setPastedJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Remote signals state
  const [remoteBaseUrl, setRemoteBaseUrl] = useState('http://13.232.16.180:8000');
  const [customFileUrl, setCustomFileUrl] = useState('http://13.232.16.180:8000/signals_today_2026-10-27.json');
  const [remoteFiles, setRemoteFiles] = useState<{ filename: string; url: string; date?: string; isDownloaded?: boolean }[]>([]);
  const [localFiles, setLocalFiles] = useState<string[]>([]);
  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(new Set());
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [isServerOffline, setIsServerOffline] = useState(false);
  const [remoteSearch, setRemoteSearch] = useState('');
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string | null>(null);

  // Fetch remote files list on mount or URL change
  const fetchRemoteFiles = async (baseUrl: string) => {
    setLoadingRemote(true);
    setJsonError(null);
    setIsServerOffline(false);
    try {
      const res = await fetch(`/api/remote-signals/list?baseUrl=${encodeURIComponent(baseUrl)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.files)) {
        setRemoteFiles(data.files);
        if (Array.isArray(data.localFiles)) {
          setLocalFiles(data.localFiles);
        }
      } else if (data.offline) {
        setIsServerOffline(true);
        if (Array.isArray(data.localFiles)) {
          setLocalFiles(data.localFiles);
        }
        setJsonError(data.message || 'Remote signals server offline. Showing locally downloaded signal files.');
      } else {
        setJsonError(data.error || 'Failed to list remote files');
      }
    } catch (err: unknown) {
      setIsServerOffline(true);
      setJsonError(err instanceof Error ? err.message : 'Error connecting to remote signals server');
    } finally {
      setLoadingRemote(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRemoteFiles(remoteBaseUrl);
    }
  }, [isOpen, remoteBaseUrl]);

  if (!isOpen) return null;

  const toggleSelectFile = (filename: string) => {
    setSelectedFilenames((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedFilenames.size === filteredRemoteFiles.length) {
      setSelectedFilenames(new Set());
    } else {
      setSelectedFilenames(new Set(filteredRemoteFiles.map((f) => f.filename)));
    }
  };

  const handleBatchDownload = async () => {
    if (selectedFilenames.size === 0) return;
    setIsSubmitting(true);
    setJsonError(null);
    try {
      const filesToDownload = remoteFiles
        .filter((f) => selectedFilenames.has(f.filename))
        .map((f) => ({ filename: f.filename, url: f.url }));

      const res = await fetch('/api/remote-signals/batch-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesToDownload }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.trades)) {
        await onUploadTrades(data.trades, `batch_${data.downloadedFiles?.length || 0}_files.json`);
        setDownloadSuccessMessage(`Successfully downloaded ${data.downloadedFiles?.length || 0} files (${data.tradesCount} trades) and loaded into dashboard!`);
        setSelectedFilenames(new Set());
        fetchRemoteFiles(remoteBaseUrl);
        setTimeout(() => setDownloadSuccessMessage(null), 4000);
      } else {
        setJsonError(data.error || 'Batch download failed');
      }
    } catch (err: unknown) {
      setJsonError(err instanceof Error ? err.message : 'Failed batch download');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadRemote = async (filename: string, url: string) => {
    setIsSubmitting(true);
    setJsonError(null);
    try {
      const res = await fetch('/api/remote-signals/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, url }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.trades)) {
        await onUploadTrades(data.trades, data.filename);
        setDownloadSuccessMessage(`Successfully downloaded ${data.filename} (${data.tradesCount} trades) and updated dashboard!`);
        setTimeout(() => setDownloadSuccessMessage(null), 3500);
      } else {
        setJsonError(data.error || 'Failed to download remote signals file');
      }
    } catch (err: unknown) {
      setJsonError(err instanceof Error ? err.message : 'Failed to download remote file');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomUrlSubmit = async () => {
    if (!customFileUrl.trim()) return;
    const filename = customFileUrl.split('/').pop() || `signals_${Date.now()}.json`;
    await handleDownloadRemote(filename, customFileUrl.trim());
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) {
          setJsonError('File content must be a JSON array of trade objects');
          return;
        }
        setIsSubmitting(true);
        await onUploadTrades(parsed, file.name);
        setIsSubmitting(false);
        setActiveTab('view');
      } catch (err: unknown) {
        setJsonError(err instanceof Error ? err.message : 'Invalid JSON file');
        setIsSubmitting(false);
      }
    };
    reader.readAsText(file);
  };

  const handlePasteSubmit = async () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(pastedJson);
      if (!Array.isArray(parsed)) {
        setJsonError('Pasted text must be a JSON array of trade objects (starting with [ and ending with ])');
        return;
      }
      setIsSubmitting(true);
      await onUploadTrades(parsed, `pasted_trades_${Date.now()}.json`);
      setIsSubmitting(false);
      setActiveTab('view');
    } catch (err: unknown) {
      setJsonError(err instanceof Error ? err.message : 'Failed to parse JSON');
      setIsSubmitting(false);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(trades, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredRemoteFiles = remoteFiles.filter((f) => {
    const s = remoteSearch.toLowerCase();
    return f.filename.toLowerCase().includes(s) || (f.date && f.date.includes(s));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white flex items-center justify-center shadow-md">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Daily Trade Signals Manager</h3>
              <p className="text-xs text-slate-400">
                Select from remote server <code className="text-cyan-400 font-mono">http://13.232.16.180:8000</code>, upload file, or view loaded trades ({trades.length})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 py-2.5 bg-slate-950/40 border-b border-slate-800 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('remote')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'remote' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Select from Remote Link ({remoteFiles.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('view')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'view' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Loaded Signals ({trades.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'upload' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload File</span>
          </button>
          <button
            onClick={() => setActiveTab('paste')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'paste' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <span>Paste Raw JSON</span>
          </button>

          {activeTab === 'view' && (
            <button
              onClick={handleCopyJson}
              className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy All JSON'}</span>
            </button>
          )}
        </div>

        {/* Success Message Banner */}
        {downloadSuccessMessage && (
          <div className="px-6 py-2 bg-emerald-950/80 border-b border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{downloadSuccessMessage}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="p-6 flex-1 overflow-y-auto">
          {/* TAB 1: REMOTE LINK SELECTOR */}
          {activeTab === 'remote' && (
            <div className="space-y-5">
              {/* Direct Link Input */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Direct Link to JSON File
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customFileUrl}
                    onChange={(e) => setCustomFileUrl(e.target.value)}
                    placeholder="http://13.232.16.180:8000/signals_today_2026-10-27.json"
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <button
                    onClick={handleCustomUrlSubmit}
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download & Process</span>
                  </button>
                </div>
              </div>

              {/* Remote Directory Listing from Base URL */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Available JSON Files</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-cyan-400 font-mono">
                        {remoteBaseUrl}
                      </span>
                      {isServerOffline && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800 font-semibold">
                          OFFLINE (CACHED DATA ACTIVE)
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-400">
                      Pick any JSON file below to download a local copy or batch process multiple dates.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-56">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Search date or filename..."
                        value={remoteSearch}
                        onChange={(e) => setRemoteSearch(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      onClick={() => fetchRemoteFiles(remoteBaseUrl)}
                      disabled={loadingRemote}
                      title="Refresh remote list"
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingRemote ? 'animate-spin text-cyan-400' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Batch Actions Bar */}
                <div className="flex items-center justify-between bg-slate-950/60 px-3.5 py-2 rounded-xl border border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="select-all-remote"
                      checked={filteredRemoteFiles.length > 0 && selectedFilenames.size === filteredRemoteFiles.length}
                      onChange={handleSelectAll}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <label htmlFor="select-all-remote" className="text-slate-300 font-medium cursor-pointer">
                      Select All ({selectedFilenames.size} of {filteredRemoteFiles.length} selected)
                    </label>
                  </div>

                  {selectedFilenames.size > 0 && (
                    <button
                      onClick={handleBatchDownload}
                      disabled={isSubmitting}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold transition cursor-pointer"
                    >
                      {isSubmitting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>Download & Process Selected ({selectedFilenames.size})</span>
                    </button>
                  )}
                </div>

                {loadingRemote ? (
                  <div className="h-60 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                    <span className="text-xs">Fetching file directory from {remoteBaseUrl}...</span>
                  </div>
                ) : filteredRemoteFiles.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-slate-950/50 rounded-2xl border border-slate-800 space-y-2">
                    <p className="font-semibold text-slate-300">
                      {isServerOffline ? 'Remote server is offline, but existing local files are preserved:' : 'No JSON files found matching criteria.'}
                    </p>
                    {localFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 justify-center pt-2">
                        {localFiles.map((lf) => (
                          <span key={lf} className="px-2.5 py-1 rounded-lg bg-slate-800 text-xs font-mono text-emerald-400 border border-slate-700">
                            📁 {lf}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden max-h-[48vh] overflow-y-auto">
                    <div className="divide-y divide-slate-850">
                      {filteredRemoteFiles.map((file) => {
                        const isToday = file.filename.includes('2026-10-27');
                        const isSelected = selectedFilenames.has(file.filename);
                        const isDownloaded = Boolean(file.isDownloaded);

                        return (
                          <div
                            key={file.filename}
                            className={`p-3.5 flex items-center justify-between hover:bg-slate-900/60 transition ${
                              isSelected ? 'bg-indigo-950/30' : isToday ? 'bg-indigo-950/10' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectFile(file.filename)}
                                className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                                  isToday
                                    ? 'bg-indigo-600 text-white'
                                    : isDownloaded
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {isToday ? <Sparkles className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-semibold text-xs text-white">
                                    {file.filename}
                                  </span>
                                  {isToday && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                                      TODAY
                                    </span>
                                  )}
                                  {isDownloaded ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                                      <Check className="w-3 h-3" />
                                      DOWNLOADED IN DIRECTORY
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-800 text-slate-400">
                                      REMOTE ONLY
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">{file.url}</div>
                              </div>
                            </div>

                            <button
                              onClick={() => handleDownloadRemote(file.filename, file.url)}
                              disabled={isSubmitting}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                isDownloaded
                                  ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-900/50'
                                  : isToday
                                  ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                              }`}
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>{isDownloaded ? 'Re-download & Load' : 'Select & Process'}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CURRENT SIGNALS */}
          {activeTab === 'view' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Showing {trades.length} active trade signals.</span>
                <span>Directory: <code className="text-cyan-400 font-mono">./signals/</code></span>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto max-h-[50vh]">
                <pre className="text-[11px] font-mono text-slate-300">
                  {JSON.stringify(trades.slice(0, 8), null, 2)}
                  {trades.length > 8 && `\n\n... and ${trades.length - 8} more trades.`}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: UPLOAD FILE */}
          {activeTab === 'upload' && (
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-950/40 text-center">
              <Upload className="w-10 h-10 text-indigo-400 mb-3" />
              <h4 className="text-sm font-bold text-white mb-1">Upload Daily Signals JSON</h4>
              <p className="text-xs text-slate-400 max-w-md mb-4">
                Select a local JSON file containing trade signals with version, instrument, entry, sl, tp, threshold, and timestamp.
              </p>
              <label className="cursor-pointer px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg transition">
                <span>Browse Local File</span>
                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
              </label>
              {jsonError && (
                <div className="mt-4 flex items-center gap-2 text-rose-400 text-xs">
                  <AlertCircle className="w-4 h-4" />
                  <span>{jsonError}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PASTE RAW JSON */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Paste your JSON array of trades directly below and click "Save & Process Trades".
              </p>
              <textarea
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder='[ { "version": "ELITE_V945A_S_ULTRA", "instrument": "NSE_FO|48964", ... } ]'
                className="w-full h-64 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
              {jsonError && (
                <div className="flex items-center gap-2 text-rose-400 text-xs">
                  <AlertCircle className="w-4 h-4" />
                  <span>{jsonError}</span>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setPastedJson('')}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                >
                  Clear
                </button>
                <button
                  onClick={handlePasteSubmit}
                  disabled={!pastedJson.trim() || isSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg transition cursor-pointer"
                >
                  {isSubmitting ? 'Parsing...' : 'Save & Process Trades'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
