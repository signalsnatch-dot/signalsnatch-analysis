import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  Database,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  FolderArchive,
  RefreshCw,
  Calendar,
  Layers,
} from 'lucide-react';
import { UpstoxApiService } from '../services/upstoxApi.ts';

interface MarketDataFile {
  date: string;
  filename: string;
  relativePath: string;
  size: number;
  lines: number;
}

interface MarketDataManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
}

export const MarketDataManagerModal: React.FC<MarketDataManagerModalProps> = ({
  isOpen,
  onClose,
  onDataChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'files'>('upload');
  const [selectedDate, setSelectedDate] = useState<string>(UpstoxApiService.toISTDate(Date.now()));
  const [stagedFiles, setStagedFiles] = useState<{ filename: string; content: string; size: number; lines: number }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Existing files list
  const [filesList, setFilesList] = useState<MarketDataFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch files list
  const fetchMarketDataFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch('/api/market-data/files');
      const data = await res.json();
      if (Array.isArray(data.files)) {
        setFilesList(data.files);
      }
    } catch (e) {
      console.error('Failed to load market data files:', e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMarketDataFiles();
      setUploadMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // File selection handler
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = String(evt.target?.result || '');
        const lines = text.trim().split('\n').length - 1;
        setStagedFiles((prev) => [
          ...prev.filter((f) => f.filename !== file.name),
          {
            filename: file.name,
            content: text,
            size: file.size,
            lines: Math.max(0, lines),
          },
        ]);
      };
      reader.readAsText(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Perform upload to server
  const handleUploadStaged = async () => {
    if (stagedFiles.length === 0) return;
    setIsUploading(true);
    setUploadMessage(null);

    try {
      const csvList = stagedFiles.map((f) => ({
        date: selectedDate,
        filename: f.filename,
        content: f.content,
      }));

      const res = await fetch('/api/market-data/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvList }),
      });

      const data = await res.json();
      if (data.success) {
        setUploadMessage({
          type: 'success',
          text: `Successfully uploaded ${data.savedCount} CSV files into market_data/${selectedDate}/ directory! Available for Command 1 and Command 2.`,
        });
        setStagedFiles([]);
        fetchMarketDataFiles();
        onDataChanged?.();
      } else {
        setUploadMessage({
          type: 'error',
          text: data.error || 'Failed to upload files',
        });
      }
    } catch (err: unknown) {
      setUploadMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Network error during upload',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const filteredFiles = filesList.filter((f) => {
    const q = searchQuery.toLowerCase();
    return f.date.includes(q) || f.filename.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Market Data CSV Manager</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Expired Contracts Support
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Upload historical 1-minute OHLCV CSVs directly into <code className="text-cyan-300">./market_data/&lt;date&gt;/</code> or download all archived CSVs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/download-directory?type=market"
              download="market_data_export.tar.gz"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              <FolderArchive className="w-4 h-4 text-emerald-400" />
              <span>Download All (.tar.gz)</span>
            </a>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="px-5 pt-3 pb-0 border-b border-slate-800 bg-slate-950/40 flex items-center gap-3">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
              activeTab === 'upload'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload CSVs</span>
            {stagedFiles.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-600 text-white font-mono">
                {stagedFiles.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('files');
              fetchMarketDataFiles();
            }}
            className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
              activeTab === 'files'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Stored CSV Files ({filesList.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {uploadMessage && (
            <div
              className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2.5 ${
                uploadMessage.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-800 text-emerald-200'
                  : 'bg-rose-950/50 border-rose-800 text-rose-200'
              }`}
            >
              {uploadMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{uploadMessage.text}</span>
            </div>
          )}

          {activeTab === 'upload' ? (
            <div className="space-y-4">
              {/* Target Date Picker */}
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  <div>
                    <label className="block text-xs font-bold text-white">Target Date Folder</label>
                    <span className="text-[11px] text-slate-400">
                      CSVs will be stored in <code className="text-cyan-300">./market_data/{selectedDate}/</code>
                    </span>
                  </div>
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Upload Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 bg-slate-950/40 hover:bg-slate-950/80 rounded-2xl p-8 text-center transition cursor-pointer flex flex-col items-center justify-center space-y-2"
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 text-indigo-400 flex items-center justify-center mb-1">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold text-white">Click or Drop CSV files here</div>
                <p className="text-xs text-slate-400 max-w-md">
                  Upload 1-minute OHLCV CSVs (e.g. <code className="text-cyan-400">NSE_FO_61471.csv</code>) to pre-seed market data for expired contracts.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".csv,text/csv"
                  onChange={handleFilesSelected}
                  className="hidden"
                />
              </div>

              {/* Staged files preview */}
              {stagedFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-300">
                      Staged Files to Upload ({stagedFiles.length})
                    </h4>
                    <button
                      onClick={() => setStagedFiles([])}
                      className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-2xl bg-slate-950/60 font-mono text-xs">
                    {stagedFiles.map((f, i) => (
                      <div key={i} className="p-2.5 flex items-center justify-between text-slate-300">
                        <div className="flex items-center gap-2 truncate">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span className="truncate">{f.filename}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-400 shrink-0 text-[11px]">
                          <span>{f.lines.toLocaleString()} candles</span>
                          <span>{(f.size / 1024).toFixed(1)} KB</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setStagedFiles((prev) => prev.filter((_, idx) => idx !== i));
                            }}
                            className="text-rose-400 hover:text-rose-300 ml-1 cursor-pointer"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleUploadStaged}
                      disabled={isUploading}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer"
                    >
                      {isUploading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving CSVs...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Save {stagedFiles.length} File(s) to Market Data</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <input
                  type="text"
                  placeholder="Filter by date or instrument name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-full sm:w-64"
                />
                <button
                  onClick={fetchMarketDataFiles}
                  disabled={isLoadingFiles}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer border border-slate-700"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>Refresh List</span>
                </button>
              </div>

              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60 max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Date Folder</th>
                      <th className="py-2.5 px-3">Instrument File</th>
                      <th className="py-2.5 px-3 text-right">Candles</th>
                      <th className="py-2.5 px-3 text-right">Size</th>
                      <th className="py-2.5 px-3 text-right">Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {filteredFiles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                          {isLoadingFiles ? 'Loading market data files...' : 'No market data files found.'}
                        </td>
                      </tr>
                    ) : (
                      filteredFiles.map((file, idx) => (
                        <tr key={`${file.relativePath}_${idx}`} className="hover:bg-slate-850/50 transition">
                          <td className="py-2 px-3 text-indigo-400 font-semibold">{file.date}</td>
                          <td className="py-2 px-3 text-slate-200">{file.filename}</td>
                          <td className="py-2 px-3 text-right text-emerald-400">{file.lines.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-slate-400">{(file.size / 1024).toFixed(1)} KB</td>
                          <td className="py-2 px-3 text-right">
                            <a
                              href={`/api/download-csv?type=market&file=${encodeURIComponent(file.relativePath)}`}
                              download={file.filename}
                              className="text-cyan-400 hover:text-cyan-300 font-semibold text-xs"
                            >
                              Download
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
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
