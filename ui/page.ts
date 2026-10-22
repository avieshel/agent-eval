export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Eval</title>
<style>
  :root { --bg:#12131a; --panel:#1b1d27; --line:#2c2f3d; --text:#e8e9f0; --dim:#9aa0b5; --accent:#8ab4ff; --good:#4ade80; --bad:#f87171; --warn:#fbbf24; --mono:ui-monospace,Menlo,monospace; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 system-ui,sans-serif; }
  header { position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 16px; background:var(--panel); border-bottom:1px solid var(--line); }
  h1 { font-size:15px; margin:0; font-weight:600; }
  .meta { color:var(--dim); font-size:12px; font-family:var(--mono); }
  .grow { flex:1; }
  button { font:inherit; cursor:pointer; border-radius:8px; border:1px solid var(--line); background:#262a38; color:var(--text); padding:7px 13px; }
  button:hover { background:#303549; }
  button.primary { background:var(--accent); color:#10131d; border-color:transparent; font-weight:600; }
  button.primary:disabled { opacity:.5; cursor:not-allowed; }
  main { display:grid; grid-template-columns:1fr 1fr; gap:14px; padding:14px; height:calc(100vh - 53px); }
  @media (max-width:900px){ main{grid-template-columns:1fr;height:auto;} }
  .col { display:flex; flex-direction:column; gap:10px; }
  label { color:var(--dim); font-size:12px; text-transform:uppercase; letter-spacing:.05em; }
  textarea { width:100%; flex:1; min-height:120px; resize:vertical; background:#0e0f15; color:var(--text); border:1px solid var(--line); border-radius:10px; padding:11px; font:13px/1.55 var(--mono); }
  .out { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px; overflow:auto; height:100%; }
  pre { margin:0; white-space:pre-wrap; word-break:break-word; font:12px/1.5 var(--mono); color:#cdd2e4; }
  .tag { font-size:11px; padding:2px 7px; border-radius:999px; font-weight:600; }
  .tag.good { background:rgba(74,222,128,.15); color:var(--good); }
  .tag.bad { background:rgba(248,113,113,.15); color:var(--bad); }
</style>
</head>
<body>
<header>
  <h1>Agent Eval</h1>
  <span class="meta" id="meta"></span>
  <span class="grow"></span>
  <span class="meta" id="status"></span>
  <button id="test">Test setup</button>
  <button class="primary" id="run">Run</button>
</header>
<main>
  <div class="col">
    <label>System prompt</label>
    <textarea id="system" placeholder="You are a helpful assistant..."></textarea>
    <label>User prompt</label>
    <textarea id="user" placeholder="Ask something..."></textarea>
    <label>Extra context</label>
    <textarea id="context" placeholder="Paste retrieved context, tool outputs, DB rows..."></textarea>
  </div>
  <div class="col">
    <label>Result</label>
    <div class="out" id="out"><pre>No run yet.</pre></div>
  </div>
</main>
<script>
const $=(id)=>document.getElementById(id);
const esc=(s)=>String(s??'').replace(/[&<>]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
async function boot(){const r=await fetch('/api/config');const c=await r.json();$('meta').textContent=c.model+' · '+c.baseUrl;}
async function run(){
  const systemPrompt=$('system').value; const userPrompt=$('user').value; const context=$('context').value;
  if(!userPrompt.trim()) return;
  $('run').disabled=true; $('status').textContent='running…';
  $('out').innerHTML='<pre>Waiting…</pre>';
  try{
    const r=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemPrompt,userPrompt,context,jsonMode:false})});
    const d=await r.json();
    let html='';
    if(d.error) html='<span class="tag bad">'+esc(d.error.kind)+'</span><pre>'+esc(d.error.message)+'</pre>';
    else { const u=d.usage?' · '+d.usage.totalTokens+' tokens (prompt '+d.usage.promptTokens+', completion '+d.usage.completionTokens+')':''; html='<span class="tag good">ok · '+d.elapsedMs+'ms'+u+'</span><pre>'+esc(d.rawText)+'</pre>'; }
    $('out').innerHTML=html;
  }catch(e){ $('out').innerHTML='<pre>'+esc(String(e))+'</pre>'; $('status').textContent='failed'; }
  $('run').disabled=false; $('status').textContent='done';
}
async function test(){
  $('test').disabled=true; $('status').textContent='testing…';
  try{
    const r=await fetch('/api/doctor'); const d=await r.json();
    if(d.ok){ $('status').textContent='ok · '+d.elapsedMs+'ms'; $('out').innerHTML='<span class="tag good">setup ok</span><pre>'+esc(d.message||'')+'</pre>'; }
    else { $('status').textContent='failed'; $('out').innerHTML='<span class="tag bad">setup failed</span><pre>'+esc(d.message||'')+'</pre>'; }
  }catch(e){ $('status').textContent='failed'; $('out').innerHTML='<pre>'+esc(String(e))+'</pre>'; }
  $('test').disabled=false;
}
$('test').onclick=test;
$('run').onclick=run;
document.addEventListener('keydown',(e)=>{ if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();run();}});
boot();
</script>
</body>
</html>
`;