#!/usr/bin/env node
import { spawn } from 'child_process';
import { writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';

const logFile = 'd:\\demo-main\\frontend-launch.log';

try {
  writeFileSync(logFile, `[${new Date().toISOString()}] Frontend launcher starting\n`);
  
  appendFileSync(logFile, `CWD: ${process.cwd()}\n`);
  appendFileSync(logFile, `NODE: ${process.version}\n`);
  
  const proc = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    cwd: process.cwd()
  });

  proc.stdout.on('data', (data) => {
    appendFileSync(logFile, `[STDOUT] ${data}\n`);
    process.stdout.write(data);
  });

  proc.stderr.on('data', (data) => {
    appendFileSync(logFile, `[STDERR] ${data}\n`);
    process.stderr.write(data);
  });

  proc.on('error', (err) => {
    appendFileSync(logFile, `[ERROR] ${err.message}\n`);
    process.exit(1);
  });

  proc.on('exit', (code) => {
    appendFileSync(logFile, `[EXIT] Process exited with code ${code}\n`);
    process.exit(code || 0);
  });

} catch (err) {
  writeFileSync(logFile, `FATAL: ${err.message}\n${err.stack}\n`);
  process.exit(1);
}
