'use strict';
// No packages, server, browser process, or network needed: node ui/selftest.cjs
// This DOM harness validates generated markup and interactions, not browser layout.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const here = __dirname;
const decode = s => String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
let assertions = 0;
function check(value,message) { assertions++; assert.ok(value,message); }
class Element {
  constructor(tag,attrs = {},doc = null) { this.tagName = tag.toUpperCase(); this.attrs = attrs; this.doc = doc; this.children = []; this.listeners = {}; this.parent = null; this.textContent = ''; this.selectionStart = 0; this.selectionEnd = 0; }
  get id() { return this.attrs.id || ''; }
  get dataset() { return Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v])); }
  get value() { return this._value ?? this.attrs.value ?? (this.tagName === 'SELECT' ? (this.children.find(c=>'selected' in c.attrs) || this.children[0])?.value : ''); }
  set value(value) { this._value = value; }
  get disabled() { return 'disabled' in this.attrs; }
  set disabled(v) { if (v) this.attrs.disabled = ''; else delete this.attrs.disabled; }
  get checked() { return 'checked' in this.attrs; }
  set checked(v) { if (v) this.attrs.checked = ''; else delete this.attrs.checked; }
  get open() { return 'open' in this.attrs; }
  set open(v) { if (v) this.attrs.open = ''; else delete this.attrs.open; }
  get innerHTML() { return this._html || ''; }
  set innerHTML(html) { this._html = html; this.children = parse(html,this.doc); this.children.forEach(c=>c.parent = this); }
  setAttribute(k,v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type,fn) { (this.listeners[type] ||= []).push(fn); }
  focus() { this.doc.activeElement = this; }
  setSelectionRange(start,end) { this.selectionStart = start; this.selectionEnd = end; }
  matches(selector) {
    let s = selector.trim();
    const descendant = s.match(/^(\.[\w-]+)\s+(.+)$/);
    if (descendant) {
      if (!this.matches(descendant[2])) return false;
      for (let ancestor = this.parent; ancestor; ancestor = ancestor.parent) if (ancestor.matches(descendant[1])) return true;
      return false;
    }
    if (s.includes(':not(:disabled)')) { if (this.disabled) return false; s = s.replace(':not(:disabled)',''); }
    const attrs = [...s.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
    for (const [,key,value] of attrs) if (!(key in this.attrs) || (value !== undefined && this.attrs[key] !== value)) return false;
    s = s.replace(/\[[^\]]+\]/g,'');
    if (s.startsWith('#')) return this.id === s.slice(1);
    if (s.startsWith('.')) return (this.attrs.class || '').split(/\s+/).includes(s.slice(1));
    return !s || s === '*' || this.tagName.toLowerCase() === s;
  }
  closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
  querySelectorAll(selector) {
    const result = [], selectors = selector.split(',').map(s=>s.trim());
    const visit = el => { for (const child of el.children) { if (selectors.some(s=>child.matches(s))) result.push(child); visit(child); } };
    visit(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function parse(html,doc) {
  const wrapper = new Element('fragment',{},doc), stack = [wrapper];
  const tokens = html.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]*>|[^<]+/g) || [];
  for (const token of tokens) {
    if (/^<!/.test(token)) continue;
    if (token.startsWith('</')) {
      const tag = token.match(/^<\/([\w-]+)/)[1].toUpperCase();
      assert.equal(stack.at(-1).tagName,tag,`Unbalanced HTML near ${token}`); stack.pop(); continue;
    }
    if (!token.startsWith('<')) { stack.at(-1).textContent += decode(token); continue; }
    const match = token.match(/^<([\w-]+)([\s\S]*?)\/?\s*>$/);
    assert.ok(match,`Invalid tag: ${token}`);
    const [,tag,raw] = match, attrs = {};
    for (const a of raw.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)) {
      assert.ok(!(a[1] in attrs),`Duplicate attribute ${a[1]}`);
      attrs[a[1]] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    }
    const el = new Element(tag,attrs,doc); el.parent = stack.at(-1); stack.at(-1).children.push(el);
    if (!voids.has(tag.toLowerCase()) && !token.endsWith('/>')) stack.push(el);
  }
  assert.equal(stack.length,1,'Unclosed HTML tags');
  return wrapper.children;
}
function createHarness(mock = true, storage = new Map(), failStartup = false) {
  const doc = {activeElement:null,title:'',documentElement:new Element('html')};
  const root = new Element('div',{id:'app'},doc);
  doc.getElementById = id=>id === 'app' ? root : root.querySelector('#'+id);
  doc.querySelector = s=>root.querySelector(s);
  let fetches = [], intervals = [], timeouts = [], now = 1795400000000;
  const sandbox = {localStorage:{getItem:k=>storage.get(k) ?? null,setItem:(k,v)=>storage.set(k,v)},navigator:{language:'zh-CN'},confirm:()=>true,document:doc,location:{search:mock ? '?mock=1' : ''},URLSearchParams,AbortSignal,console,
    Date:class extends Date { static now() { return now; } },
    setTimeout:(fn,ms)=>{timeouts.push({fn,ms});},setInterval:(fn,ms)=>{intervals.push({fn,ms});},
    fetch:async(url,options = {})=>{
      fetches.push({url,options});
      if (mock) throw new Error('NETWORK FORBIDDEN IN MOCK');
      assert.equal(options.method || 'GET','GET','No POST allowed during selftest');
      if (failStartup) throw new Error('Simulated startup failure');
      return {ok:true,json:async()=>sandbox.SaveDemo.create('edit').state};
    },addEventListener:()=>{}
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const file of ['i18n.js','locales.js','ps5-paths.js','mock.js','app.js']) new vm.Script(fs.readFileSync(path.join(here,file),'utf8'),{filename:file}).runInContext(context);
  function dispatch(type,target,extra = {}) { assert.ok(target,`Missing ${type} target`); if (target.disabled && type === 'click') return; for (const fn of root.listeners[type] || []) fn({target,preventDefault(){},...extra}); }
  function scenario(id) { const select = doc.getElementById('scenario'); select.value = id; dispatch('change',select); }
  function language(id) { const select = doc.getElementById('language'); select.value = id; dispatch('change',select); }
  const click = selector=>dispatch('click',root.querySelector(selector));
  return {sandbox,root,doc,fetches,intervals,timeouts,dispatch,scenario,language,click,storage,advance:ms=>{now += ms;intervals.forEach(t=>t.fn());}};
}
async function main() {
  const html = fs.readFileSync(path.join(here,'index.html'),'utf8');
  parse(html,null);
  check(!/https?:\/\/|@import|url\(/.test(html+fs.readFileSync(path.join(here,'styles.css'),'utf8')),'No external assets');
  const h = createHarness();
  const scenarios = h.sandbox.SaveDemo.scenarios;
  for (const lang of Object.keys(h.sandbox.UI_LANGUAGES)) {
    h.language(lang);
    for (const scene of scenarios.filter(s=>s.type === 'screen')) check(h.sandbox.UI_COPY[lang].scenarios[scene.id]?.length > 0,`${lang}/${scene.id}: translated scenario label`);
    for (const scene of scenarios) {
      h.scenario(scene.id);
      check(h.root.innerHTML.includes('id="screen-title"'),`${lang}/${scene.id}: screen rendered`);
      check(!h.root.innerHTML.includes('undefined'),`${lang}/${scene.id}: no missing copy`);
      check(h.doc.documentElement.lang === h.sandbox.UI_LANGUAGES[lang].locale,`${lang}: document language`);
      const ids = h.root.querySelectorAll('[id]').map(e=>e.id);
      check(ids.length === new Set(ids).size,`${scene.id}: unique element IDs`);
      for (const input of h.root.querySelectorAll('input')) check(input.attrs['aria-label'] || input.id === 'deleted' || h.root.querySelector(`[for="${input.id}"]`),`${scene.id}: input label`);
      if (scene.type === 'error') check(h.root.querySelector('[data-action="recover"]') && h.root.querySelector('#logs'),`${scene.id}: recovery and logs`);
      if (['transferring','console_connected','unknown_progress'].includes(scene.id)) check(!h.root.querySelector('[data-action="cancel"]'),`${scene.id}: cancel hidden`);
      if (scene.id === 'need_power') check(h.root.querySelector('.power-layout') && h.root.querySelector('#page-content').attrs.inert !== undefined,'Power dialog and inert background');
      if (scene.id === 'upload') check(h.root.querySelector('[data-action="upload"]').disabled,'Upload requires deletion checkbox');
      if (scene.id.startsWith('subnet_')) {
        const warning = h.doc.getElementById('subnet-warning');
        check(!!warning === (scene.id !== 'subnet_unknown'),`${lang}/${scene.id}: subnet warning visibility`);
        if (warning) check(warning.querySelector('p').textContent === h.sandbox.UI_COPY[lang].subnetWarning,`${lang}: full subnet warning`);
      }
      check(h.fetches.length === 0,'Mock has zero requests');
    }
  }
  h.scenario('edit');
  check(h.doc.getElementById('language').value === 'ru','Language preserved');
  check(h.root.querySelector('.slot').attrs['aria-pressed'] === 'true','Numeric revision 102 selected over 99');
  const otherBefore = h.root.querySelectorAll('[data-money]').at(-1).value;
  h.click('[data-action="max"]');
  check(h.root.querySelectorAll('[data-money]').slice(0,3).every(e=>e.value === '8,000,000'),'Max fills bank and both characters');
  check(h.root.querySelectorAll('[data-money]').at(-1).value === otherBefore,'Max preserves unidentified item');
  check(!h.doc.getElementById('advanced').open,'Advanced collapsed by default');
  check(!h.root.querySelector('[data-action="patch"]').disabled,'Changed values enable patch');
  let input = h.root.querySelector('[data-money]');
  for (const invalid of ['-1','8,000,001','1.5','abc','']) {
    input.value = invalid; h.dispatch('input',input);
    check(input.attrs['aria-invalid'] === 'true' && h.root.querySelector('[data-action="patch"]').disabled,`Reject ${invalid}`);
  }
  input.value = '12345'; input.focus(); input.setSelectionRange(2,2); h.dispatch('input',input);
  h.language('zh');
  check(h.root.querySelector('[data-money]').value === '12345','Language switch preserves draft');
  check(h.doc.activeElement.id === input.id && h.doc.activeElement.selectionStart === 2,'Preserves focus and caret');
  h.click('[data-action="patch"]');
  check(h.doc.getElementById('scenario').value === 'patching','Mock patch is simulated');
  h.scenario('upload'); let checkbox = h.doc.getElementById('deleted'); checkbox.checked = true; h.dispatch('change',checkbox);
  check(!h.root.querySelector('[data-action="upload"]').disabled,'Deletion confirmation enables upload');
  h.click('[data-action="upload"]'); check(h.doc.getElementById('scenario').value === 'preparing','Mock upload is simulated');
  h.scenario('subnet_upload'); checkbox = h.doc.getElementById('deleted'); checkbox.checked = true; h.dispatch('change',checkbox);
  check(h.root.querySelector('[data-action="upload"]').disabled,'Subnet mismatch blocks upload after deletion confirmation');
  h.root.querySelector('[data-action="upload"]').disabled = false; h.click('[data-action="upload"]');
  check(h.doc.getElementById('scenario').value === 'subnet_upload','Upload action guard cannot be bypassed by enabling the button');
  h.scenario('subnet_retry'); check(h.root.querySelector('[data-action="recover"]').disabled,'Subnet mismatch disables upload retry');
  h.root.querySelector('[data-action="recover"]').disabled = false; h.click('[data-action="recover"]');
  check(h.doc.getElementById('scenario').value === 'subnet_retry','Retry guard cannot start upload on mismatched subnet');
  h.scenario('subnet_unknown'); checkbox = h.doc.getElementById('deleted'); checkbox.checked = true; h.dispatch('change',checkbox);
  check(!h.root.querySelector('[data-action="upload"]').disabled,'Unknown subnet permits upload after confirmation');
  h.scenario('subnet_download'); check(!h.root.querySelector('[data-action="download"]').disabled,'Subnet mismatch does not block download');
  h.click('[data-action="download"]'); check(h.doc.getElementById('scenario').value === 'connecting','Download action permitted on different networks');
  check(h.doc.getElementById('subnet-warning'),'Simulated download retains the console subnet status');
  h.scenario('subnet_connect'); check(!h.root.querySelector('[data-action="pair"]').disabled,'Subnet mismatch does not block pairing');
  h.scenario('need_power');
  check(h.doc.activeElement.id === 'power-dialog','Power dialog container receives initial focus');
  check(h.doc.getElementById('power-title').getAttribute('tabindex') === null,'Power title is not a focus target');
  const dialog = h.doc.getElementById('power-dialog');
  check(dialog.getAttribute('aria-modal') === 'true' && dialog.getAttribute('aria-labelledby') === 'power-title','Power dialog retains accessible name and modality');
  const focusable = h.root.querySelectorAll('.power-layout button:not(:disabled), .power-layout select, .power-demo button:not(:disabled), .power-demo select');
  h.dispatch('keydown',dialog,{key:'Tab',shiftKey:true});
  check(h.doc.activeElement === focusable.at(-1),'Shift-Tab from dialog wraps to last control');
  h.dispatch('keydown',h.doc.activeElement,{key:'Tab',shiftKey:false});
  check(h.doc.activeElement === focusable[0],'Tab from last control wraps to first');
  h.scenario('need_power'); h.advance(61000); check(h.doc.getElementById('countdown').textContent === '03:59','Power countdown');
  h.advance(300000); check(h.doc.getElementById('countdown').textContent === '00:00','Countdown never negative');
  h.click('[data-action="next"]'); check(h.doc.getElementById('scenario').value !== 'need_power','Can exit power scene through panel');
  h.scenario('hint'); check(h.root.innerHTML.includes(h.sandbox.UI_COPY.zh.consoleHasSaveDesc),'Old-save hint rendered');
  h.scenario('uploaded'); h.click('[data-action="restore"]'); check(h.doc.getElementById('scenario').value === 'restore','Restore leads to upload checklist');
  h.scenario('uploaded'); h.click('[data-action="download"]'); check(h.doc.getElementById('scenario').value === 'connecting','Edit again starts download');
  h.scenario('empty'); h.doc.getElementById('ip').value = '999.0.0.1'; h.dispatch('submit',h.doc.getElementById('ip-form'));
  check(h.doc.getElementById('ip-error').textContent.length > 0,'Invalid IP rejected');
  h.doc.getElementById('ip').value = '192.168.1.20'; h.dispatch('submit',h.doc.getElementById('ip-form'));
  check(h.doc.getElementById('scenario').value === 'pair','Manual connect is simulated');
  // Source-derived coverage prevents accidentally omitting a documented code or stage.
  const api = fs.readFileSync(path.join(here,'../docs/API.md'),'utf8');
  const stageSection = api.split('## job.stage')[1].split('## job.error.code')[0];
  for (const [,id] of stageSection.matchAll(/`([a-z_]+)`/g)) if (!['progress','files','total'].includes(id)) check(scenarios.some(s=>s.id === id),`Documented stage ${id}`);
  const errorSection = api.split('## job.error.code')[1];
  for (const [,id] of errorSection.matchAll(/`([a-z_]+)`/g)) check(h.sandbox.SaveDemo.errors.includes(id),`Documented error ${id}`);
  for (const id of ['busy','no_console','no_session','nothing_to_upload']) check(h.sandbox.SaveDemo.errors.includes(id),`HTTP 409 ${id}`);
  // Exercise every mock task action and retry, then flush promises to catch attempted requests.
  for (const scene of scenarios) {
    h.scenario(scene.id);
    const recovery = h.root.querySelector('[data-action="recover"]');
    if (recovery) h.dispatch('click',recovery);
  }
  for (const [scene,action] of [['connect','discover'],['pair','pair'],['download','download'],['connecting','cancel'],['network','network']]) {
    h.scenario(scene); h.click(`[data-action="${action}"]`);
  }
  await new Promise(resolve=>setImmediate(resolve));
  check(h.fetches.length === 0,'All demo interactions and retries make zero requests');
  const real = createHarness(false);
  await new Promise(resolve=>setImmediate(resolve));
  check(real.fetches.length === 1 && real.fetches[0].url === '/api/state','Normal startup only GETs state');
  check(!real.root.querySelector('#scenario'),'No demo controls in normal mode');
  check(real.timeouts.some(t=>t.ms === 1000),'State polling scheduled after one second');
  // Use an in-memory server to verify the real transport adapter. This fetch
  // replacement has no route to a network socket, including for POST tests.
  const memoryRequests = [];
  let serverState = real.sandbox.SaveDemo.create('edit').state;
  real.sandbox.fetch = async(url,options = {})=>{
    memoryRequests.push({url,options});
    if (options.method === 'POST') {
      if (url === '/api/patch') serverState = real.sandbox.SaveDemo.create('patching').state;
      return {ok:true,json:async()=>({job:JSON.parse(JSON.stringify(serverState.job))})};
    }
    return {ok:true,json:async()=>JSON.parse(JSON.stringify(serverState))};
  };
  real.click('[data-action="max"]');
  real.doc.getElementById('advanced').open = true;
  serverState.job.log.push({t:1795400000,m:'Progress changed'});
  await real.timeouts.pop().fn();
  check(real.root.querySelector('[data-money]').value === '8,000,000','Polling preserves edited amounts');
  check(real.doc.getElementById('advanced').open,'Polling preserves expanded details');
  real.click('[data-action="patch"]');
  await new Promise(resolve=>setImmediate(resolve));
  const patch = memoryRequests.find(r=>r.options.method === 'POST');
  check(patch.url === '/api/patch','Patch adapter selects documented endpoint (memory only)');
  const payload = JSON.parse(patch.options.body);
  check(payload.slot === 'sdimg_SAVEDATASARC0001','Patch targets selected latest slot');
  check(payload.changes.length === 3,'Patch only includes changed recognized balances');
  check(payload.changes[0].value === 5000 && payload.changes[0].newValue === 8000000,'Patch retains original value and sends newValue');
  check(payload.changes.every(c=>Object.keys(c).sort().join(',') === 'idx,inv,newValue,value'),'Patch payload has exactly the documented fields');
  check(real.root.querySelector('.running'),'Returned job immediately renders running state');
  // Poll subnet changes as independent response objects, just like JSON over HTTP.
  serverState = real.sandbox.SaveDemo.create('upload').state;
  await real.timeouts.pop().fn();
  checkbox = real.doc.getElementById('deleted'); checkbox.checked = true; real.dispatch('change',checkbox);
  for (const sameSubnet of [false,true,null,undefined,false]) {
    serverState.console.sameSubnet = sameSubnet;
    await real.timeouts.pop().fn();
    check(!!real.doc.getElementById('subnet-warning') === (sameSubnet === false),`Polling sameSubnet=${sameSubnet}: warning`);
    check(real.root.querySelector('[data-action="upload"]').disabled === (sameSubnet === false),`Polling sameSubnet=${sameSubnet}: button state`);
  }
  const requestCount = memoryRequests.length;
  real.root.querySelector('[data-action="upload"]').disabled = false;
  real.click('[data-action="upload"]');
  await new Promise(resolve=>setImmediate(resolve));
  check(memoryRequests.length === requestCount,'Mismatched subnet is rejected before real transport adapter');
  serverState = real.sandbox.SaveDemo.create('need_power').state;
  await real.timeouts.pop().fn();
  check(real.doc.activeElement.id === 'power-dialog','Polling opens power dialog with container focus');
  const cancel = real.doc.getElementById('power-dialog').querySelector('[data-action="cancel"]');
  cancel.focus(); real.dispatch('keydown',cancel,{key:'Tab'});
  check(real.root.querySelector('.power-layout select'),'Normal power dialog offers language control');
  cancel.focus();
  serverState = real.sandbox.SaveDemo.create('downloading').state;
  await real.timeouts.pop().fn();
  check(real.doc.activeElement.id === 'screen-title','Focus returns to current step after power dialog closes');
  real.sandbox.fetch = async()=>{throw new Error('Simulated disconnection');};
  await real.timeouts.pop().fn();
  check(!real.root.innerHTML.includes(real.sandbox.UI_COPY.en.offline),'One failed poll does not report stopped');
  await real.timeouts.pop().fn(); await real.timeouts.pop().fn();
  check(real.root.innerHTML.includes(real.sandbox.UI_COPY.en.offline),'Offline status is visible');
  check(!real.root.querySelector('[data-action="cancel"]') && !real.root.querySelector('.running'),'Offline removes task controls and spinners');
  serverState = real.sandbox.SaveDemo.create('edit').state;
  serverState.slots[0].subtitle = '<img src=x onerror=alert(1)>';
  real.sandbox.fetch = async()=>({ok:true,json:async()=>serverState});
  await real.timeouts.pop().fn();
  check(!real.root.innerHTML.includes(real.sandbox.UI_COPY.en.offline),'Polling recovers from disconnection');
  check(!real.root.querySelector('img') && real.root.innerHTML.includes('&lt;img'),'API text is escaped');
  await roundThreeChecks();
  console.log(`PASS: ${scenarios.length} scenarios × 10 languages; ${assertions} assertions.`);
  console.log('PASS: HTML structure, JavaScript parsing, mock isolation, controls, validation, countdown, and normal GET-only startup.');
  console.log('NOT CHECKED: browser layout and real-console operations. No network requests were made.');
}
async function roundThreeChecks() {
  const flush = () => new Promise(resolve=>setImmediate(resolve));
  const h = createHarness();
  const languages = Object.keys(h.sandbox.UI_LANGUAGES);
  const flatten = (value,prefix = '') => Object.entries(value).flatMap(([key,v]) =>
    typeof v === 'object' ? flatten(v,prefix+key+'.') : [[prefix+key,v]]);
  const baseKeys = flatten(h.sandbox.UI_COPY.en).map(([k])=>k).sort();
  const chinesePhrases = [...flatten(h.sandbox.UI_COPY.zh),...flatten(h.sandbox.UI_COPY['zh-TW'])]
    .flatMap(([,v])=>v.match(/[\p{Script=Han}]{6,}/gu) || []);
  check(languages.length === 10,'Exactly ten supported languages');
  check(h.doc.getElementById('language').value === 'en','Fresh visit uses English even with Chinese browser locale');
  for (const lang of languages) {
    const entries = flatten(h.sandbox.UI_COPY[lang]);
    assert.deepEqual(entries.map(([k])=>k).sort(),baseKeys,`${lang}: exact key coverage`);
    for (const [key,value] of entries) {
      check(typeof value === 'string' && value.trim().length > 0,`${lang}/${key}: nonempty translation`);
      if (!['zh','zh-TW','ja'].includes(lang)) check(!/\p{Script=Han}/u.test(value),`${lang}/${key}: no Chinese text`);
      if (lang === 'ja') check(!chinesePhrases.some(p=>value.includes(p)),`${lang}/${key}: no copied Chinese prose (Japanese kanji allowed)`);
    }
    h.language(lang);
    for (const scene of h.sandbox.SaveDemo.scenarios) {
      h.scenario(scene.id);
      for (const el of h.root.querySelectorAll('*')) {
        // Language autonyms and game-provided titles intentionally stay verbatim.
        if (el.closest('#language') || el.matches('.slot-title')) continue;
        if (!['zh','zh-TW','ja'].includes(lang)) check(!/\p{Script=Han}/u.test(el.textContent),`${lang}/${scene.id}: rendered copy has no Chinese`);
        if (lang === 'ja') check(!chinesePhrases.some(p=>el.textContent.includes(p)),`${lang}/${scene.id}: no Chinese prose`);
      }
      const footer = h.root.querySelector('.edition');
      check(footer.querySelector('.mono').textContent === '0.1.0-demo',`${lang}/${scene.id}: version from state`);
      check(h.doc.title.includes(h.sandbox.UI_COPY[lang].subtitle),`${lang}: localized document title`);
      if (scene.id === 'edit') {
        check(h.root.querySelector('.slot-title').textContent === h.sandbox.SaveDemo.create('edit').state.slots[0].subtitle,`${lang}: game subtitle unchanged`);
        check(h.root.querySelector('[data-money]').value === '5,000',`${lang}: English thousands separator`);
      }
      if (scene.id === 'offline' || scene.id === 'quit_done') check(!h.root.querySelector('.running'),`${lang}/${scene.id}: no endless spinner`);
    }
    h.scenario('edit');
    let confirmations = 0;
    h.sandbox.confirm = message=>{check(message === h.sandbox.UI_COPY[lang].quitConfirm,`${lang}: localized confirmation`); confirmations++; return false;};
    h.click('[data-action="quit"]'); await flush();
    check(confirmations === 1 && h.root.querySelector('[data-action="max"]'),`${lang}: cancel keeps app running`);
    h.sandbox.confirm = ()=>true;
    h.scenario('transferring'); h.click('[data-action="quit"]'); await flush();
    check(h.root.innerHTML.includes(h.sandbox.UI_COPY[lang].quitBusy),`${lang}: simulated busy response`);
    h.scenario('edit'); h.click('[data-action="quit"]'); await flush();
    check(h.root.innerHTML.includes(h.sandbox.UI_COPY[lang].quitDone),`${lang}: simulated exit`);
    check(h.fetches.length === 0,`${lang}: all scenes and quit have zero network requests`);
    const reopened = createHarness(true,h.storage);
    check(reopened.doc.getElementById('language').value === lang,`${lang}: preference survives reopening`);
  }
  const invalid = createHarness(true,new Map([['gta6-save-editor.language','not-a-language']]));
  check(invalid.doc.getElementById('language').value === 'en','Invalid stored language falls back to English');
  const unavailable = {get(){throw new Error('Storage denied');},set(){throw new Error('Storage denied');}};
  const privateMode = createHarness(true,unavailable); privateMode.language('fr');
  check(privateMode.doc.getElementById('language').value === 'fr','Storage failure does not break language switching');
  const failed = createHarness(false,new Map(),true); await flush();
  await failed.timeouts.pop().fn(); await failed.timeouts.pop().fn();
  check(failed.root.innerHTML.includes(failed.sandbox.UI_COPY.en.offline) && !failed.root.querySelector('.running'),'Initial consecutive failures replace loading screen');
  const real = createHarness(false); await flush();
  const requests = [];
  real.sandbox.fetch = async(url,options={})=>{
    requests.push({url,options});
    return {ok:false,status:409,json:async()=>({error:'busy'})};
  };
  real.sandbox.confirm = ()=>false; real.click('[data-action="quit"]'); await flush();
  check(requests.length === 0,'Declined confirmation never reaches transport');
  real.sandbox.confirm = ()=>true; real.click('[data-action="quit"]'); await flush();
  check(requests.length === 1 && requests[0].url === '/api/quit' && requests[0].options.method === 'POST','Quit uses documented POST endpoint (in memory only)');
  check(requests[0].options.headers['Content-Type'] === 'application/json','Quit sends JSON Content-Type');
  check(real.root.innerHTML.includes(real.sandbox.UI_COPY.en.quitBusy),'HTTP 409 busy has specific quit message');
  real.sandbox.fetch = async()=>{throw new Error('Simulated lost response');};
  real.click('[data-action="quit"]'); await flush();
  check(real.root.innerHTML.includes(real.sandbox.UI_COPY.en.quitFailed) && !real.root.querySelector('[data-action="quit"]').disabled,'Failed quit is retryable and never claims success');
  let finishQuit;
  real.sandbox.fetch = (url,options)=>{requests.push({url,options});return new Promise(resolve=>{finishQuit=resolve;});};
  real.click('[data-action="quit"]'); real.click('[data-action="quit"]');
  check(requests.length === 2,'Double click sends only one quit request');
  finishQuit({ok:true,status:204,json:async()=>{throw new Error('No JSON on 204');}}); await flush();
  check(real.root.innerHTML.includes(real.sandbox.UI_COPY.en.quitDone),'Successful empty response shows exited page');
  await real.timeouts.pop().fn();
  check(requests.length === 2 && real.timeouts.length === 0,'Successful quit stops all future state polling');
  const race = createHarness(false); await flush();
  let finishRead;
  race.sandbox.fetch = (url,options={})=> options.method === 'POST'
    ? Promise.resolve({ok:true,status:200})
    : new Promise(resolve=>{finishRead=resolve;});
  const stalePoll = race.timeouts.pop().fn();
  race.click('[data-action="quit"]'); await flush();
  finishRead({ok:true,json:async()=>race.sandbox.SaveDemo.create('need_power').state});
  await stalePoll;
  check(race.root.innerHTML.includes(race.sandbox.UI_COPY.en.quitDone) && !race.root.querySelector('.power-layout'),'Late state response cannot reopen the app after quit');
  check(race.timeouts.length === 0,'Late poll cannot restart polling after quit');
}
main().catch(error=>{console.error(error);process.exitCode = 1;});
