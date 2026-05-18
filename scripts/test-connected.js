import http from 'http';
import { WebSocket } from 'ws';

let passed = 0;
let failed = 0;

function pass(msg) { console.log('PASS  ' + msg); passed++; }
function fail(msg) { console.log('FAIL  ' + msg); failed++; }

// 1. HTTP health
await new Promise(resolve => {
  http.get('http://localhost:5100/api/service/info', res => {
    res.resume();
    if (res.statusCode === 200) pass('HTTP /api/service/info 200');
    else fail('HTTP /api/service/info got ' + res.statusCode);
    resolve();
  }).on('error', e => { fail('HTTP unreachable: ' + e.message); resolve(); });
});

// 2. index.html serves
await new Promise(resolve => {
  http.get('http://localhost:5100/', res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      if (res.statusCode === 200) pass('index.html 200');
      else fail('index.html got ' + res.statusCode);
      if (body.includes('connStatus')) pass('index.html has connStatus element');
      else fail('index.html missing connStatus element');
      if (body.includes('ai-panel')) fail('index.html still references ai-panel');
      else pass('index.html has no ai-panel reference');
      resolve();
    });
  }).on('error', e => { fail('index.html error: ' + e.message); resolve(); });
});

// 3. init.js has no ai-panel import
await new Promise(resolve => {
  http.get('http://localhost:5100/js/init.js', res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      const lines = body.split('\n').filter(l => l.includes('ai-panel') && !l.trim().startsWith('//'));
      if (lines.length === 0) pass('init.js has no active ai-panel import');
      else fail('init.js still has active ai-panel import: ' + lines[0].trim());
      resolve();
    });
  }).on('error', e => { fail('init.js error: ' + e.message); resolve(); });
});

// 4. WebSocket actually connects and gets a message within 5s
await new Promise(resolve => {
  const ws = new WebSocket('ws://localhost:5100/ws');
  const timeout = setTimeout(() => {
    fail('WebSocket: no message within 5s');
    ws.terminate();
    resolve();
  }, 5000);

  ws.on('open', () => pass('WebSocket connected (onopen fired)'));
  ws.on('message', data => {
    clearTimeout(timeout);
    try {
      const msg = JSON.parse(data.toString());
      pass('WebSocket received valid JSON message: ' + JSON.stringify(msg).slice(0, 80));
    } catch {
      pass('WebSocket received message (non-JSON): ' + String(data).slice(0, 80));
    }
    ws.terminate();
    resolve();
  });
  ws.on('error', e => {
    clearTimeout(timeout);
    fail('WebSocket error: ' + e.message);
    resolve();
  });
});

console.log('');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
