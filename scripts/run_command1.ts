#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { Command1Service } from '../src/services/command1Service.ts';
import { UpstoxApiService } from '../src/services/upstoxApi.ts';
import { TradeSignal } from '../src/types/trade.ts';

function parseArgs(): { signalsPath: string; outDir: string; token?: string } {
  const args = process.argv.slice(2);
  let signalsPath = './signals';
  let outDir = './market_data';
  let token: string | undefined = process.env.UPSTOX_ACCESS_TOKEN;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--signals' && args[i + 1]) {
      signalsPath = args[i + 1];
      i++;
    } else if (args[i] === '--outDir' && args[i + 1]) {
      outDir = args[i + 1];
      i++;
    } else if (args[i] === '--token' && args[i + 1]) {
      token = args[i + 1];
      i++;
    }
  }

  return { signalsPath, outDir, token };
}

function loadTrades(targetPath: string): TradeSignal[] {
  const allTrades: TradeSignal[] = [];

  if (fs.existsSync(targetPath)) {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(targetPath).filter((f) => f.endsWith('.json'));
      console.log(`📂 Scanning directory: ${targetPath} (found ${files.length} JSON files)`);
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(targetPath, file), 'utf-8');
          const data = JSON.parse(content);
          if (Array.isArray(data)) {
            allTrades.push(...data);
            console.log(`  ✓ Loaded ${data.length} trades from ${file}`);
          }
        } catch (err: unknown) {
          console.error(`  ❌ Failed to parse ${file}:`, err instanceof Error ? err.message : String(err));
        }
      }
    } else {
      try {
        const content = fs.readFileSync(targetPath, 'utf-8');
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
          allTrades.push(...data);
          console.log(`  ✓ Loaded ${data.length} trades from ${targetPath}`);
        }
      } catch (err: unknown) {
        console.error(`  ❌ Failed to parse ${targetPath}:`, err instanceof Error ? err.message : String(err));
      }
    }
  } else {
    console.error(`❌ Signals path not found: ${targetPath}`);
  }

  return allTrades;
}

async function main() {
  const { signalsPath, outDir, token } = parseArgs();

  console.log('====================================================');
  console.log('🚀 UPSTOX TRADE ANALYZER - COMMAND 1');
  console.log('Task: Accumulate daily instrument keys & fetch 1-min CSV');
  console.log('====================================================');
  console.log(`Signals source:   ${signalsPath}`);
  console.log(`CSV Output Dir:   ${outDir}`);
  if (token) console.log(`Upstox Token:     ${token.slice(0, 8)}... (provided)`);

  const trades = loadTrades(signalsPath);
  if (trades.length === 0) {
    console.log('⚠️ No trades found to process. Exiting.');
    return;
  }

  console.log(`\n📊 Total trades loaded: ${trades.length}`);

  const apiService = new UpstoxApiService({ accessToken: token, cacheDir: outDir });
  const command1Service = new Command1Service({ apiService, outputDir: outDir });

  console.log('\n⏳ Accumulating instrument keys and fetching 1-minute candle data...\n');

  const result = await command1Service.execute(trades, (p) => {
    process.stdout.write(`\r[${p.completedCount}/${p.totalCount}] Date: ${p.currentDate} | ${p.currentInstrument} `);
  });

  console.log('\n\n====================================================');
  console.log('✅ COMMAND 1 COMPLETE');
  console.log('====================================================');
  console.log(`Total CSV files created: ${result.totalCsvFiles}`);
  console.log(`Total 1-min candles:     ${result.totalCandles}`);
  console.log(`Saved directory:         ${result.outputDirectory}`);

  for (const day of result.days) {
    console.log(`\n📅 Date: ${day.date}`);
    console.log(`   Unique Instruments: ${day.totalInstruments} | Total Trades: ${day.totalTrades} | Downloaded: ${day.downloadedCount}`);
    for (const inst of day.instruments) {
      const statusIcon = inst.status === 'downloaded' ? '✅' : inst.status === 'empty' ? '⚠️' : '❌';
      console.log(`   ${statusIcon} ${inst.instrumentKey.padEnd(20)} (${inst.names[0] || 'Unknown'}): ${inst.candleCount} candles -> ${inst.filePath}`);
    }
  }

  console.log('\n🎉 Finished Command 1 successfully.');
}

main().catch((err) => {
  console.error('Fatal error running Command 1:', err);
  process.exit(1);
});
