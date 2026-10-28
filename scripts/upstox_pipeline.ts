#!/usr/bin/env tsx
import { spawn } from 'child_process';
import path from 'path';

async function runScript(scriptPath: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('tsx', [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
    });
    proc.on('close', (code) => resolve(code ?? 0));
  });
}

async function main() {
  const args = process.argv.slice(2);
  let cmd = 'all';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cmd' && args[i + 1]) {
      cmd = args[i + 1].toLowerCase();
      i++;
    }
  }

  const remainingArgs = args.filter((a, i) => a !== '--cmd' && args[i - 1] !== '--cmd');

  if (cmd === '1' || cmd === 'cmd1' || cmd === 'command1') {
    await runScript('scripts/run_command1.ts', remainingArgs);
  } else if (cmd === '2' || cmd === 'cmd2' || cmd === 'command2') {
    await runScript('scripts/run_command2.ts', remainingArgs);
  } else {
    console.log('\n🚀 RUNNING COMPLETE PIPELINE (COMMAND 1 -> COMMAND 2)\n');
    const code1 = await runScript('scripts/run_command1.ts', remainingArgs);
    if (code1 === 0) {
      console.log('\n----------------------------------------------------\n');
      await runScript('scripts/run_command2.ts', remainingArgs);
    }
  }
}

main().catch(console.error);
