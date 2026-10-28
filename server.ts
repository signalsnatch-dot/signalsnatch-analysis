import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { createServer as createViteServer } from 'vite';
import { UpstoxApiService } from './src/services/upstoxApi.ts';
import { Command1Service } from './src/services/command1Service.ts';
import { Command2Service } from './src/services/command2Service.ts';
import { augmentCandlesWithIndicators } from './src/services/indicators.ts';
import { TradeSignal } from './src/types/trade.ts';

import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const SIGNALS_DIR = path.resolve(__dirname, 'signals');
const MARKET_DATA_DIR = path.resolve(__dirname, 'market_data');
const REPORTS_DIR = path.resolve(__dirname, 'reports');
const REMOTE_SIGNALS_BASE_URL = 'http://13.232.16.180:8000';

// Ensure necessary directories exist
[SIGNALS_DIR, MARKET_DATA_DIR, REPORTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Seed default signals if empty
const defaultSeedPath = path.resolve(__dirname, 'public/assets/aistudio/Paste_October_27__2026_-_8_20PM_b6026899');
const sampleSignalTarget = path.join(SIGNALS_DIR, 'trades_2026-10-27.json');
if (!fs.existsSync(sampleSignalTarget) && fs.existsSync(defaultSeedPath)) {
  try {
    fs.copyFileSync(defaultSeedPath, sampleSignalTarget);
  } catch {
    // Ignore
  }
}

let activeUpstoxToken: string | undefined = process.env.UPSTOX_ACCESS_TOKEN;

function getApiService(): UpstoxApiService {
  return new UpstoxApiService({ accessToken: activeUpstoxToken, cacheDir: MARKET_DATA_DIR });
}

function loadAllSignals(): { filename: string; trades: TradeSignal[] }[] {
  const result: { filename: string; trades: TradeSignal[] }[] = [];
  if (!fs.existsSync(SIGNALS_DIR)) return result;

  const files = fs.readdirSync(SIGNALS_DIR).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(SIGNALS_DIR, f), 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        result.push({ filename: f, trades: data });
      }
    } catch {
      // Ignore invalid files
    }
  }
  return result;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // --- API Endpoints ---

  // 1. Remote Signals: List available JSON files on http://13.232.16.180:8000
  app.get('/api/remote-signals/list', async (req: Request, res: Response) => {
    const existingLocalFiles = new Set(fs.existsSync(SIGNALS_DIR) ? fs.readdirSync(SIGNALS_DIR) : []);
    try {
      const baseUrl = (req.query.baseUrl as string) || REMOTE_SIGNALS_BASE_URL;
      const response = await axios.get(baseUrl, { timeout: 6000 });
      const html = String(response.data);

      const regex = /href="([^"]+\.json)"/g;
      let match;
      const files: { filename: string; url: string; date?: string; isDownloaded: boolean }[] = [];

      while ((match = regex.exec(html)) !== null) {
        const fname = match[1];
        const dateMatch = fname.match(/\d{4}-\d{2}-\d{2}/);
        const cleanName = fname.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const isDownloaded = existingLocalFiles.has(fname) || existingLocalFiles.has(cleanName) || existingLocalFiles.has(`signals_${fname}`) || existingLocalFiles.has(`signals_${cleanName}`);
        
        files.push({
          filename: fname,
          url: `${baseUrl.replace(/\/+$/, '')}/${fname}`,
          date: dateMatch ? dateMatch[0] : undefined,
          isDownloaded,
        });
      }

      // Sort recent first
      files.reverse();
      res.json({
        success: true,
        baseUrl,
        files,
        total: files.length,
        localFiles: Array.from(existingLocalFiles),
      });
    } catch (err: unknown) {
      // If remote server is offline, return local files so user can still proceed!
      res.json({
        success: false,
        offline: true,
        error: err instanceof Error ? err.message : String(err),
        message: 'Remote signals server is offline or unreachable. Existing local files and data are retained.',
        files: [],
        localFiles: Array.from(existingLocalFiles),
      });
    }
  });

  // 2. Remote Signals: Download a selected JSON file from remote link to ./signals/
  app.post('/api/remote-signals/download', async (req: Request, res: Response) => {
    try {
      const { filename, url } = req.body;
      const targetUrl = url || `${REMOTE_SIGNALS_BASE_URL}/${filename}`;

      const response = await axios.get(targetUrl, { timeout: 10000 });
      const trades = response.data;

      if (!Array.isArray(trades)) {
        return res.status(400).json({ error: 'Downloaded file is not a JSON array of trade signals' });
      }

      const saveName = (filename || path.basename(targetUrl)).replace(/[^a-zA-Z0-9_.-]/g, '_');
      const targetPath = path.join(SIGNALS_DIR, saveName);
      fs.writeFileSync(targetPath, JSON.stringify(trades, null, 2), 'utf-8');

      res.json({
        success: true,
        filename: saveName,
        savedPath: targetPath,
        tradesCount: trades.length,
        trades,
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 2b. Batch Download Remote Signals
  app.post('/api/remote-signals/batch-download', async (req: Request, res: Response) => {
    try {
      const { files } = req.body; // Array of { filename: string, url: string }
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'No files provided for batch download' });
      }

      const allMergedTrades: TradeSignal[] = [];
      const downloadedFiles: string[] = [];

      for (const item of files) {
        try {
          const targetUrl = item.url || `${REMOTE_SIGNALS_BASE_URL}/${item.filename}`;
          const response = await axios.get(targetUrl, { timeout: 10000 });
          const trades = response.data;
          if (Array.isArray(trades)) {
            const saveName = (item.filename || path.basename(targetUrl)).replace(/[^a-zA-Z0-9_.-]/g, '_');
            const targetPath = path.join(SIGNALS_DIR, saveName);
            fs.writeFileSync(targetPath, JSON.stringify(trades, null, 2), 'utf-8');
            downloadedFiles.push(saveName);
            allMergedTrades.push(...trades);
          }
        } catch (e) {
          console.error(`Failed to download ${item.filename}:`, e);
        }
      }

      res.json({
        success: true,
        downloadedFiles,
        tradesCount: allMergedTrades.length,
        trades: allMergedTrades,
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 2c. Live Tracker Polling Endpoint (Polls current date JSON link every 5s)
  app.get('/api/live/poll', async (req: Request, res: Response) => {
    const targetUrl = (req.query.url as string) || `${REMOTE_SIGNALS_BASE_URL}/signals_today_${UpstoxApiService.toISTDate(Date.now())}.json`;
    try {
      const response = await axios.get(targetUrl, { timeout: 4000 });
      const trades = response.data;

      if (!Array.isArray(trades)) {
        return res.json({
          success: false,
          offline: false,
          error: 'Remote response is not a JSON array',
          polledAt: Date.now(),
          polledAtIST: UpstoxApiService.toISTString(Date.now()),
        });
      }

      // Quick filter for Ultra/Uber completed trades
      const ultraUberTrades = trades.filter(
        (t: any) =>
          t &&
          t.bar_type !== 'price' &&
          t.status === 'completed' &&
          ['ULTRA', 'UBER'].includes(String(t.version || '').toUpperCase())
      );

      res.json({
        success: true,
        offline: false,
        url: targetUrl,
        polledAt: Date.now(),
        polledAtIST: UpstoxApiService.toISTString(Date.now()),
        totalTrades: trades.length,
        ultraUberCount: ultraUberTrades.length,
        trades,
      });
    } catch (err: unknown) {
      res.json({
        success: false,
        offline: true,
        error: err instanceof Error ? err.message : String(err),
        polledAt: Date.now(),
        polledAtIST: UpstoxApiService.toISTString(Date.now()),
      });
    }
  });

  // 3. Local Signals: Get list of local signals files
  app.get('/api/signals', (req: Request, res: Response) => {
    try {
      const all = loadAllSignals();
      const filesInfo = all.map((item) => {
        const dates = new Set(item.trades.map((t) => UpstoxApiService.toISTDate(t.timestamp)));
        const versions = new Set(item.trades.map((t) => t.version));
        const instruments = new Set(item.trades.map((t) => t.instrument));
        return {
          filename: item.filename,
          tradesCount: item.trades.length,
          dates: Array.from(dates),
          versions: Array.from(versions),
          instrumentsCount: instruments.size,
        };
      });
      res.json({ files: filesInfo, totalFiles: filesInfo.length });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 4. Load trades data
  app.get('/api/signals/data', (req: Request, res: Response) => {
    try {
      const filename = req.query.filename as string | undefined;
      const all = loadAllSignals();
      let combinedTrades: TradeSignal[] = [];

      if (filename) {
        const found = all.find((item) => item.filename === filename);
        if (found) combinedTrades = found.trades;
      } else {
        all.forEach((item) => combinedTrades.push(...item.trades));
      }

      combinedTrades = combinedTrades.map((t) => ({
        ...t,
        ist: t.ist || UpstoxApiService.toISTString(t.timestamp),
      }));

      const versions = Array.from(new Set(combinedTrades.map((t) => t.version))).sort();
      const instruments = Array.from(new Set(combinedTrades.map((t) => t.instrument))).sort();
      const dates = Array.from(new Set(combinedTrades.map((t) => UpstoxApiService.toISTDate(t.timestamp)))).sort();

      res.json({
        trades: combinedTrades,
        total: combinedTrades.length,
        versions,
        instruments,
        dates,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 5. Upload/paste trades
  app.post('/api/signals/upload', (req: Request, res: Response) => {
    try {
      const { filename, trades } = req.body;
      if (!Array.isArray(trades)) {
        return res.status(400).json({ error: 'Expected trades to be a JSON array' });
      }
      const safeName = (filename || `trades_${Date.now()}.json`).replace(/[^a-zA-Z0-9_.-]/g, '_');
      const target = path.join(SIGNALS_DIR, safeName);
      fs.writeFileSync(target, JSON.stringify(trades, null, 2), 'utf-8');
      res.json({ success: true, filename: safeName, count: trades.length });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 6. Run Command 1
  app.post('/api/command1/run', async (req: Request, res: Response) => {
    try {
      const { filename, trades: customTrades } = req.body;
      let tradesToProcess: TradeSignal[] = [];

      if (Array.isArray(customTrades) && customTrades.length > 0) {
        tradesToProcess = customTrades;
      } else {
        const all = loadAllSignals();
        if (filename) {
          const found = all.find((item) => item.filename === filename);
          if (found) tradesToProcess = found.trades;
        } else {
          all.forEach((item) => tradesToProcess.push(...item.trades));
        }
      }

      if (tradesToProcess.length === 0) {
        return res.status(400).json({ error: 'No trades available to process' });
      }

      const apiService = getApiService();
      const cmd1 = new Command1Service({ apiService, outputDir: MARKET_DATA_DIR });
      const result = await cmd1.execute(tradesToProcess);
      res.json({ success: true, result });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 7. Run Command 2
  app.post('/api/command2/run', async (req: Request, res: Response) => {
    try {
      const { filename, trades: customTrades, versionFilters, useAllVersions } = req.body;
      let tradesToProcess: TradeSignal[] = [];

      if (Array.isArray(customTrades) && customTrades.length > 0) {
        tradesToProcess = customTrades;
      } else {
        const all = loadAllSignals();
        if (filename) {
          const found = all.find((item) => item.filename === filename);
          if (found) tradesToProcess = found.trades;
        } else {
          all.forEach((item) => tradesToProcess.push(...item.trades));
        }
      }

      if (tradesToProcess.length === 0) {
        return res.status(400).json({ error: 'No trades available to process' });
      }

      const apiService = getApiService();
      const cmd2 = new Command2Service({
        apiService,
        marketDataDir: MARKET_DATA_DIR,
        reportsDir: REPORTS_DIR,
      });

      const result = await cmd2.execute(tradesToProcess, {
        versionFilters: Array.isArray(versionFilters) ? versionFilters : ['ULTRA', 'UBER'],
        useAllVersions: Boolean(useAllVersions),
        marketDataDir: MARKET_DATA_DIR,
        outputReportsDir: REPORTS_DIR,
      });

      res.json({ success: true, result });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 8. Candles with Indicators for Charting
  // 8. Candles with Indicators for Charting (supports multi-day range via endDate)
  app.get('/api/candles', async (req: Request, res: Response) => {
    try {
      const instrument = req.query.instrument as string;
      const date = req.query.date as string;
      const endDate = (req.query.endDate as string) || date;

      if (!instrument || !date) {
        return res.status(400).json({ error: 'Missing instrument or date parameter' });
      }

      const apiService = getApiService();
      let candles: any[] = [];

      if (endDate && endDate !== date) {
        candles = await apiService.fetchCandleRange(instrument, date, endDate);
      } else {
        const safeName = Command1Service.safeFilename(instrument);
        const csvPath = path.join(MARKET_DATA_DIR, date, `${safeName}.csv`);

        // Re-use cached copy first for expired contracts!
        if (fs.existsSync(csvPath)) {
          candles = UpstoxApiService.loadCandlesFromCsv(csvPath);
        }

        if (candles.length === 0) {
          candles = await apiService.fetch1MinCandles(instrument, date);
          if (candles.length > 0) {
            UpstoxApiService.saveCandlesToCsv(candles, csvPath);
          }
        }
      }

      // Ensure indicators are calculated
      const augmented = augmentCandlesWithIndicators(candles);

      res.json({
        instrument,
        date,
        endDate,
        isMultiDay: Boolean(endDate && endDate !== date),
        count: augmented.length,
        candles: augmented,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 9. List Market Data Files
  app.get('/api/market-data/files', (req: Request, res: Response) => {
    try {
      const results: { date: string; filename: string; relativePath: string; size: number; lines: number }[] = [];
      if (fs.existsSync(MARKET_DATA_DIR)) {
        const dateDirs = fs.readdirSync(MARKET_DATA_DIR);
        for (const d of dateDirs) {
          const fullDateDir = path.join(MARKET_DATA_DIR, d);
          if (fs.statSync(fullDateDir).isDirectory()) {
            const files = fs.readdirSync(fullDateDir).filter((f) => f.endsWith('.csv'));
            for (const f of files) {
              const filePath = path.join(fullDateDir, f);
              const stat = fs.statSync(filePath);
              const content = fs.readFileSync(filePath, 'utf-8');
              const lines = content.trim().split('\n').length - 1;
              results.push({
                date: d,
                filename: f,
                relativePath: `${d}/${f}`,
                size: stat.size,
                lines: Math.max(0, lines),
              });
            }
          }
        }
      }
      res.json({ files: results });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 9b. Upload CSV into Market Data Directory (supports expired contracts)
  app.post('/api/market-data/upload', (req: Request, res: Response) => {
    try {
      const { date, filename, content, csvList } = req.body;
      const itemsToSave: { date: string; filename: string; content: string }[] = [];

      if (Array.isArray(csvList) && csvList.length > 0) {
        itemsToSave.push(...csvList);
      } else if (filename && content) {
        itemsToSave.push({ date: date || UpstoxApiService.toISTDate(Date.now()), filename, content });
      } else {
        return res.status(400).json({ error: 'Missing csv file content or filename' });
      }

      const savedFiles: string[] = [];
      for (const item of itemsToSave) {
        const targetDate = (item.date || UpstoxApiService.toISTDate(Date.now())).trim();
        const dateDir = path.join(MARKET_DATA_DIR, targetDate);
        if (!fs.existsSync(dateDir)) {
          fs.mkdirSync(dateDir, { recursive: true });
        }
        const safeName = item.filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const finalPath = path.join(dateDir, safeName.endsWith('.csv') ? safeName : `${safeName}.csv`);
        fs.writeFileSync(finalPath, item.content, 'utf-8');
        savedFiles.push(`${targetDate}/${path.basename(finalPath)}`);
      }

      res.json({ success: true, savedCount: savedFiles.length, files: savedFiles });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 10. Download CSV File
  app.get('/api/download-csv', (req: Request, res: Response) => {
    try {
      const type = req.query.type as string;
      const file = req.query.file as string;

      if (!file) return res.status(400).send('File parameter required');

      let target = '';
      if (type === 'report') {
        target = path.resolve(REPORTS_DIR, path.basename(file));
      } else {
        target = path.resolve(MARKET_DATA_DIR, file);
      }

      if (!fs.existsSync(target)) {
        return res.status(404).send('File not found');
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(target)}"`);
      fs.createReadStream(target).pipe(res);
    } catch (err: unknown) {
      res.status(500).send(err instanceof Error ? err.message : String(err));
    }
  });

// 10b. Download Entire CSV Directory as TAR.GZ
app.get('/api/download-directory', (req: Request, res: Response) => {
  try {
    const type = req.query.type as string; // 'report' or 'market'
    
    // Select which directory to download based on query type
    const targetDir = type === 'report' ? REPORTS_DIR : MARKET_DATA_DIR;
    const folderName = type === 'report' ? 'reports_export' : 'market_data_export';

    if (!fs.existsSync(targetDir)) {
      return res.status(404).send('Directory not found');
    }

    // Using tar.gz format since 'tar' is standard on Linux environments
    const archiveName = `${folderName}.tar.gz`;
    const tempArchivePath = path.resolve(__dirname, archiveName);

    // tar -czf creates a compressed gzip archive of all files (.) inside the target directory
    exec(`tar -czf "${tempArchivePath}" .`, { cwd: targetDir }, (err: any) => {
      if (err) {
        return res.status(500).send(`Archiving failed: ${err.message}`);
      }

      // Set headers for standard browser GZIP download package
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

      const fileStream = fs.createReadStream(tempArchivePath);
      fileStream.pipe(res);

      // Clean up the temp archive out of server memory once delivery completes
      fileStream.on('end', () => {
        if (fs.existsSync(tempArchivePath)) {
          fs.unlinkSync(tempArchivePath);
        }
      });
    });
  } catch (err: unknown) {
    res.status(500).send(err instanceof Error ? err.message : String(err));
  }
});


  // 11. Upstox Token Configuration
  app.post('/api/config/token', (req: Request, res: Response) => {
    const { token } = req.body;
    activeUpstoxToken = token ? String(token).trim() : undefined;
    res.json({ success: true, tokenSet: Boolean(activeUpstoxToken) });
  });

  app.get('/api/config/status', async (req: Request, res: Response) => {
    res.json({
      tokenConfigured: Boolean(activeUpstoxToken),
      upstoxApiOnline: true,
      currentISTDate: UpstoxApiService.toISTDate(Date.now()),
    });
  });

  // Mount Vite middleware in dev or static files in production
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(__dirname, 'dist'))) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Upstox Trade Milestone Analyzer running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
