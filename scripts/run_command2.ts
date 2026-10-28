#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { Command2Service } from '../src/services/command2Service.ts';
import { UpstoxApiService } from '../src/services/upstoxApi.ts';
import { TradeSignal } from '../src/types/trade.ts';

function parseArgs(): {
  signalsPath: string;
  versionFilters: string[];
  useAllVersions: boolean;
  marketDataDir: string;
  outDir: string;
  token?: string;
} {
  const args = process.argv.slice(2);
  let signalsPath = './signals';
  let versionFilters: string[] = ['ULTRA', 'UBER'];
  let useAllVersions = false;
  let marketDataDir = './market_data';
  let outDir = './reports';
  let token: string | undefined = process.env.UPSTOX_ACCESS_TOKEN;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--signals' && args[i + 1]) {
      signalsPath = args[i + 1];
      i++;
    } else if (args[i] === '--version' && args[i + 1]) {
      versionFilters = args[i + 1].split(',').map((v) => v.trim());
      i++;
    } else if (args[i] === '--all' || args[i] === '--allVersions') {
      useAllVersions = true;
    } else if (args[i] === '--marketDataDir' && args[i + 1]) {
      marketDataDir = args[i + 1];
      i++;
    } else if (args[i] === '--outDir' && args[i + 1]) {
      outDir = args[i + 1];
      i++;
    } else if (args[i] === '--token' && args[i + 1]) {
      token = args[i + 1];
      i++;
    }
  }

  return { signalsPath, versionFilters, useAllVersions, marketDataDir, outDir, token };
}

function loadTrades(targetPath: string): TradeSignal[] {
  const allTrades: TradeSignal[] = [];

  if (fs.existsSync(targetPath)) {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(targetPath).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(targetPath, file), 'utf-8');
          const data = JSON.parse(content);
          if (Array.isArray(data)) allTrades.push(...data);
        } catch {
          // Ignore
        }
      }
    } else {
      try {
        const content = fs.readFileSync(targetPath, 'utf-8');
        const data = JSON.parse(content);
        if (Array.isArray(data)) allTrades.push(...data);
      } catch {
        // Ignore
      }
    }
  }

  return allTrades;
}

async function main() {
  const { signalsPath, versionFilters, useAllVersions, marketDataDir, outDir, token } = parseArgs();

  console.log('====================================================');
  console.log('🎯 UPSTOX TRADE ANALYZER - COMMAND 2');
  console.log('Task: Stop Loss vs Take Profit Milestone Resolution');
  console.log('====================================================');
  console.log(`Signals Source:    ${signalsPath}`);
  console.log(`Version Filter:    ${useAllVersions ? 'ALL VERSIONS' : versionFilters.join(', ')}`);
  console.log(`Market Data Dir:   ${marketDataDir}`);
  console.log(`Reports Output:    ${outDir}`);

  const trades = loadTrades(signalsPath);
  if (trades.length === 0) {
    console.log('⚠️ No trades found in signals path. Exiting.');
    return;
  }

  console.log(`Total trades found: ${trades.length}`);

  const apiService = new UpstoxApiService({ accessToken: token, cacheDir: marketDataDir });
  const command2Service = new Command2Service({
    apiService,
    marketDataDir,
    reportsDir: outDir,
  });

  console.log('\n⏳ Running milestone analysis on trades...\n');

  const result = await command2Service.execute(
    trades,
    {
      versionFilters,
      useAllVersions,
      marketDataDir,
      outputReportsDir: outDir,
    },
    (p) => {
      process.stdout.write(`\r[${p.currentIndex}/${p.totalTrades}] Analyzing ${p.currentTradeName.slice(0, 20)} (${p.currentVersion})... `);
    }
  );

  console.log('\n\n====================================================');
  console.log('📊 COMMAND 2 SUMMARY METRICS (TICKS & WIN RATES)');
  console.log('====================================================');
  const s = result.summary;
  console.log(`Total Trades Analyzed: ${s.totalTradesAnalyzed}`);
  console.log(`Overall Success Rate:  ${s.successCount}/${s.totalTradesAnalyzed} (${s.overallWinRatePercentage.toFixed(1)}%)`);
  console.log(`  - Uber Target (SL):  ${s.uberSuccessRate.uberSuccessCount}/${s.uberSuccessRate.totalUber} (${s.uberSuccessRate.uberSuccessPercentage.toFixed(1)}% success)`);
  console.log(`  - Ultra Target (TP): ${s.ultraSuccessRate.ultraSuccessCount}/${s.ultraSuccessRate.totalUltra} (${s.ultraSuccessRate.ultraSuccessPercentage.toFixed(1)}% success)`);

  console.log(`\n🏆 Milestone 1 (Hit First):`);
  console.log(`   Take Profit (TP):   ${s.m1Hits.tpCount} (${s.m1Hits.tpPercentage.toFixed(1)}%)`);
  console.log(`   Stop Loss (SL):     ${s.m1Hits.slCount} (${s.m1Hits.slPercentage.toFixed(1)}%)`);
  console.log(`   Avg Ticks to M1:    ${s.averages.avgM1Ticks.toFixed(1)} ticks (vol / threshold)`);
  console.log(`   Avg Candles to M1:  ${s.averages.avgCandlesToM1.toFixed(1)} candles (1-min)`);
  console.log(`   Avg Time to M1:     ${s.averages.avgTimeM1Formatted}`);

  console.log(`\n🔄 Milestone 2 (Follow-Through):`);
  console.log(`   Achieved Same Day:  ${s.m2Hits.achievedSameDayCount} (${s.m2Hits.sameDayPercentage.toFixed(1)}%)`);
  console.log(`   Achieved Multi-Day: ${s.m2Hits.achievedMultiDayCount} (${s.m2Hits.multiDayPercentage.toFixed(1)}%)`);
  console.log(`   Pending / Not Hit:  ${s.m2Hits.pendingCount} (${s.m2Hits.pendingPercentage.toFixed(1)}%)`);
  console.log(`   Avg Ticks to M2:    ${s.averages.avgM2Ticks.toFixed(1)} ticks`);
  console.log(`   Avg Time to M2:     ${s.averages.avgTimeM2Formatted}`);

  console.log(`\n📉 Drawdown & Adverse Excursion Metrics:`);
  console.log(`   Avg Max Loss Multiple:        ${s.averages.avgMaxLossMultiple}x of planned risk`);
  console.log(`   Avg Loss Before Entry Return: ${s.averages.avgLossMultipleBeforeEntryReturn}x of planned risk`);

  console.log(`\n🔗 5-Minute Instrument Trade Clubbing:`);
  console.log(`   Total 5-Min Clusters:         ${result.groups5Min.length} groups`);

  console.log('\nTop 5-Minute Trade Groups Sample:');
  console.log('--------------------------------------------------------------------------------------------------------------------');
  console.log('Instrument                       | Window         | Versions Clubbed               | Winning Version & Performance');
  console.log('--------------------------------------------------------------------------------------------------------------------');
  for (const g of result.groups5Min.slice(0, 8)) {
    const inst = g.name.slice(0, 30).padEnd(32);
    const win = g.timeRangeFormatted.padEnd(14);
    const vers = g.versions.join(', ').slice(0, 30).padEnd(30);
    const reason = g.winningReason;
    console.log(`${inst} | ${win} | ${vers} | ${reason}`);
  }
  console.log('--------------------------------------------------------------------------------------------------------------------');

  if (result.reportCsvPath) {
    console.log(`\n📄 Detailed CSV Report Saved: ${result.reportCsvPath}`);
  }
}

main().catch((err) => {
  console.error('Fatal error running Command 2:', err);
  process.exit(1);
});
