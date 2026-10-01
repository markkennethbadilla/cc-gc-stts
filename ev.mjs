import WebSocket from 'ws';
const t = await (await fetch('http://127.0.0.1:63527/json')).json();
const p = t.find(x => x.type==='page' && x.url.includes('15986'));
const ws = new WebSocket(p.webSocketDebuggerUrl);
ws.on('open', () => ws.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{awaitPromise:true, expression: process.argv[2]}})));
ws.on('message', m => { console.log(m.toString().slice(0,2000)); process.exit(0); });
