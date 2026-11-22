'use strict';
(() => {
  const MOCK = new URLSearchParams(location.search).get('mock') === '1';
  const root = document.getElementById('app');
  const LANGUAGE_KEY = 'gta6-save-editor.language';
  let lang = 'en';
  try { const saved = localStorage.getItem(LANGUAGE_KEY); if (Object.hasOwn(window.UI_COPY,saved)) lang = saved; } catch { /* Storage may be disabled. */ }
  let exited = false, quitting = false, quitError = '', failures = 0;
  let state = null, consoles = [], searched = false, pending = false, offline = false;
  let selected = '', draft = {}, draftVersion = '', deleted = false, localError = null, dismissedError = '';
  let scenario = 'edit', powerStart = 0, powerJob = null, mutation = 0, readSerial = 0;
  const copy = () => window.UI_COPY[lang];
  const t = key => copy()[key];
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value).toLocaleString('en-US');
  const running = () => state?.job?.status === 'running';
  const blocked = () => exited || quitting || pending || offline || running() || state?.network?.ok !== true;
  const subnetMismatch = () => state?.console?.sameSubnet === false;
  const uploadBlocked = () => blocked() || !deleted || subnetMismatch();
  const errorKey = () => `${state?.job?.id}:${state?.job?.error?.code}`;
  const activeError = () => localError || (state?.job?.status === 'error' && dismissedError !== errorKey() ? state.job.error : null);
  const protectedTransfer = () => running() && ['console_connected','transferring'].includes(state.job.stage);
  function stepOf(s) {
    if (s.job?.status === 'running') return ({pair:0,download:1,patch:2,restore:3,upload:3})[s.job.kind] ?? 0;
    if (s.job?.stage === 'uploaded' && s.job.status === 'done') return 3;
    if (!s.console || !s.paired) return 0;
    if (!s.hasSession) return 1;
    return s.readyToUpload ? 3 : 2;
  }
  function latest(slots) {
    return [...slots].sort((a,b)=>String(b.revision ?? '').localeCompare(String(a.revision ?? ''),'en',{numeric:true}))[0];
  }
  function currentSlot() { return state?.slots?.find(s=>s.file === selected); }
  function itemKey(item) { return `${item.inv}:${item.idx}`; }
  function syncDraft() {
    const slots = state?.slots || [];
    if (!slots.some(s=>s.file === selected)) selected = latest(slots)?.file || '';
    const slot = currentSlot();
    const version = JSON.stringify([state?.console?.host, state?.user?.id, selected,slot?.revision,slot?.items]);
    if (version !== draftVersion) {
      draft = Object.fromEntries((slot?.items || []).map(i=>[itemKey(i),money(i.value)]));
      draftVersion = version;
    }
  }
  function parseAmount(value) {
    const raw = String(value).replace(/,/g,'');
    return /^\d+$/.test(raw) && Number(raw) <= 8000000 ? Number(raw) : null;
  }
  function getChanges() {
    return (currentSlot()?.items || []).map(i=>({...i,newValue:parseAmount(draft[itemKey(i)])}));
  }
  function canPatch() { const changes = getChanges(); return changes.length > 0 && changes.every(i=>i.newValue !== null) && changes.some(i=>i.newValue !== i.value); }
  function button(label, action, style = '', disabled = false, extra = '') {
    return `<button type="button" class="btn ${style}" data-action="${action}" ${disabled ? 'disabled' : ''} ${extra}>${esc(label)}</button>`;
  }
  function heading(title,desc,step) {
    return `<header class="card-head"><div class="eyebrow">${esc(t('step'))} 0${step+1} / 04</div><h1 id="screen-title" tabindex="-1">${esc(title)}</h1><p>${esc(desc)}</p></header>`;
  }
  function logs() {
    const rows = state?.job?.log || [];
    return `<details class="logs" id="logs"><summary>${esc(t('logs'))}</summary><pre>${rows.length ? rows.map(r=>esc(`${new Date(r.t*1000).toLocaleTimeString(window.UI_LANGUAGES[lang].locale)}  ${MOCK ? t('demo') + ': ' + (copy().stages[state.job.stage] || copy().errors[state.job.error?.code] || t('wait')) : r.m}`)).join('\n') : esc(t('noLogs'))}</pre></details>`;
  }
  function deviceStatus() {
    const c = state?.console;
    return c ? `<aside class="device-status" aria-label="${esc(t('device'))}"><span>${esc(c.name)}</span><span class="mono">${esc(c.host)}</span><span>${esc(state.paired ? t('paired') : t('unpaired'))}</span></aside>` : '';
  }
  function subnetWarning(step) {
    return subnetMismatch() && [0,1,3].includes(step) ? `<div class="banner subnet-warning" id="subnet-warning" role="alert"><span aria-hidden="true">⚠</span><p>${esc(t('subnetWarning'))}</p></div>` : '';
  }
  function connectView() {
    return heading(t('connectTitle'),t('connectDesc'),0)+`<div class="card-body"><div class="empty-visual"><div class="console-glyph" aria-hidden="true"></div></div><p class="muted small">${esc(searched && !consoles.length ? t('noConsoles') : t('searchHint'))}</p>${consoles.map((c,i)=>`<button type="button" class="btn device-option" data-action="console" data-index="${i}" ${pending || offline || running() ? 'disabled' : ''}><span>${esc(c.name)}<small class="mono">${esc(c.host)}</small></span><span>${esc(t('selectConsole'))} →</span></button>`).join('')}<div class="actions">${button(searched ? t('searchAgain') : t('search'),'discover','primary',pending || offline || running())}</div><details class="manual" id="manual"><summary>${esc(t('manual'))}</summary><form id="ip-form"><label class="screen-reader" for="ip">${esc(t('ip'))}</label><input class="text-input mono" id="ip" name="ip" placeholder="192.168.1.20" inputmode="decimal" autocomplete="off" required ${pending || offline || running() ? 'disabled' : ''}><button class="btn" type="submit" ${pending || offline || running() ? 'disabled' : ''}>${esc(t('selectConsole'))}</button></form><p id="ip-error" class="inline-error" role="alert"></p></details></div>`;
  }
  function pairView() {
    return heading(t('pairTitle'),t('pairDesc'),0)+`<div class="card-body"><div class="instruction"><strong>${esc(t('consoleSteps'))}</strong><span class="route">${esc(t('pairPath'))}</span></div><div class="note">${esc(t('pairNormal'))}</div><div class="actions">${button(t('pair'),'pair','primary',blocked())}</div></div>`;
  }
  function downloadView() {
    return heading(t('downloadTitle'),t('downloadDesc'),1)+`<div class="card-body"><div class="empty-visual"><div class="console-glyph" aria-hidden="true"></div></div><div class="instruction">${esc(t('downloadInfo'))}<span class="route">${esc(t('restartInfo'))}</span></div><div class="actions"><span class="muted small">${esc(state.job?.stage === 'paired' ? copy().stages.paired : '')}</span>${button(t('download'),'download','primary',blocked())}</div></div>`;
  }
  function moneyRow(item,index) {
    const key = itemKey(item), label = `${t(item.kind in {bank:1,cash:1} ? item.kind : 'other')} · ${t('character')} ${Number(item.inv)+1}`;
    return `<div class="money-row"><label class="money-label" for="amount-${index}"><span class="money-icon" aria-hidden="true">${item.kind === 'bank' ? '▤' : '$'}</span><span>${esc(t(item.kind in {bank:1,cash:1} ? item.kind : 'other'))}<small>${esc(t('character'))} ${Number(item.inv)+1}${item.kind === 'other' ? ' · #'+esc(item.idx) : ''}</small></span></label><span class="current mono">${money(item.value)}</span><span class="arrow" aria-hidden="true">→</span><input class="money-input" id="amount-${index}" data-money="${esc(key)}" value="${esc(draft[key])}" inputmode="numeric" autocomplete="off" aria-label="${esc(label+' · '+t('target'))}" aria-describedby="amount-error cap-note" aria-invalid="${parseAmount(draft[key]) === null}" ${blocked() ? 'disabled' : ''}></div>`;
  }
  function editView() {
    const slots = state.slots || [], slot = currentSlot(), newest = latest(slots);
    if (!slot) return heading(t('moneyTitle'),t('noSlots'),2)+`<div class="card-body">${button(t('redownload'),'download','primary',blocked())}</div>`;
    const common = slot.items.filter(i=>i.kind !== 'other'), advanced = slot.items.filter(i=>i.kind === 'other');
    return heading(t('editTitle'),t('editDesc'),2)+`<div class="card-body"><div class="section-label"><h2>${esc(t('slots'))}</h2><span class="muted small">${String(slots.length).padStart(2,'0')}</span></div><div class="slots">${slots.map((s,i)=>`<button type="button" class="slot" data-action="slot" data-index="${i}" aria-pressed="${s.file === selected}" ${blocked() ? 'disabled' : ''}><span class="slot-top"><span class="slot-title">${esc(s.subtitle || s.file)}</span>${s.file === newest.file ? `<span class="tag">${esc(t('latest'))}</span>` : ''}</span><small>${esc(t('revision'))} ${esc(s.revision)}</small></button>`).join('')}</div><div class="section-label"><h2>${esc(t('moneyTitle'))}</h2>${button('↗ '+t('max'),'max','small-btn',blocked())}</div><div class="money-head"><span>${esc(t('item'))}</span><span style="text-align:right">${esc(t('current'))}</span><span></span><span>${esc(t('target'))}</span></div>${common.map((i,n)=>moneyRow(i,n)).join('')}${advanced.length ? `<details class="advanced" id="advanced"><summary>${esc(t('advanced'))}</summary><p class="muted small">${esc(t('advancedNote'))}</p>${advanced.map((i,n)=>moneyRow(i,n+common.length)).join('')}</details>` : ''}<p class="inline-error" id="amount-error" role="alert">${getChanges().some(i=>i.newValue === null) ? esc(t('invalidAmount')) : ''}</p><div class="note" id="cap-note"><strong>${esc(t('capTitle'))}</strong><br>${esc(t('cap'))}</div><p class="zero-note">${esc(t('zero'))}</p><div class="actions">${button(t('generate')+' →','patch','primary',blocked() || !canPatch())}</div></div>`;
  }
  function uploadView() {
    return heading(t('uploadTitle'),t('uploadDesc'),3)+`<div class="card-body"><div class="instruction"><div class="instruction-number">01</div><label class="checklist"><input type="checkbox" id="deleted" ${deleted ? 'checked' : ''} ${blocked() ? 'disabled' : ''}><span><strong>${esc(t('deleted'))}</strong><small>${esc(t('deleteWhy'))}</small></span></label><span class="route">${esc(t('deletePath'))}</span></div><div class="instruction"><div class="instruction-number">02</div><strong>${esc(t('transferSecond'))}</strong><span class="route">${esc(t('transferPath'))}</span></div><div class="actions"><span class="muted small">${esc(t('checkFirst'))}</span>${button(t('upload')+' →','upload','primary',uploadBlocked(),subnetMismatch() ? 'aria-describedby="subnet-warning"' : '')}</div></div>`;
  }
  function progress() {
    const p = state.job.progress;
    if (!p) return '';
    const known = Number.isFinite(p.total) && p.total > 0;
    const files = Math.max(0,Number(p.files) || 0), percent = known ? Math.min(100,Math.max(0,Math.round(files/p.total*100))) : null;
    return `<div class="progress-wrap"><div class="progress-label"><span>${esc(t('fileProgress'))} · <span class="mono">${files}${known ? ' / '+p.total : ''}</span> ${esc(t('files'))}</span>${known ? `<strong>${percent}%</strong>` : ''}</div><progress aria-label="${esc(t('fileProgress'))}" ${known ? `value="${percent}" max="100"` : ''}></progress>${known ? '' : `<p class="muted small">${esc(t('progressUnknown'))}</p>`}</div>`;
  }
  function cancelButton() { return protectedTransfer() ? '' : button(t('cancel'),'cancel','ghost',pending || offline); }
  function runningView() {
    const j = state.job, stageText = copy().stages[j.stage] || t('wait');
    const pairing = j.kind === 'pair';
    const waiting = j.kind === 'upload' && ['preparing','waiting_console'].includes(j.stage);
    return heading(stageText,protectedTransfer() ? t('dontClose') : t('wait'),stepOf(state))+`<div class="card-body"><div class="status-center"><div class="status-orb running" aria-hidden="true"></div><p>${esc(protectedTransfer() ? t('dontCloseDesc') : j.kind === 'download' ? t('restartInfo') : '')}</p></div>${j.hint === 'console_has_save' ? `<div class="banner" role="alert"><div><strong>${esc(t('consoleHasSave'))}</strong>${esc(t('consoleHasSaveDesc'))}</div></div>` : ''}${pairing || waiting ? `<div class="instruction"><strong>${esc(t('consoleSteps'))}</strong><span class="route">${esc(pairing ? t('pairPath') : t('transferPath'))}</span></div>${pairing ? `<div class="note">${esc(t('pairNormal'))}</div>` : `<div class="note">${esc(t('deleteWhy'))}<span class="route">${esc(t('deletePath'))}</span></div>`}` : ''}${progress()}<div class="actions">${cancelButton()}</div>${logs()}</div>`;
  }
  function completeView() {
    return heading(t('completeTitle'),t('completeDesc'),3)+`<div class="card-body"><div class="status-center"><div class="status-orb" aria-hidden="true">✓</div><p>${esc(t('completeNote'))}</p></div><div class="success-line"></div><p class="muted small">${esc(t('restoreInfo'))}</p><div class="actions">${button(t('again'),'download','',blocked())}${button(t('restore'),'restore','ghost',blocked())}</div>${logs()}</div>`;
  }
  function recovery(error) {
    const code = error.code;
    if (['not_paired','console_rejected','pair_failed'].includes(code)) return ['pair','goPair'];
    if (/^save_(layout_changed|verify_failed|stale_item)$/.test(code) || code === 'no_session') return ['download','redownload'];
    if (['no_change','nothing_to_upload'].includes(code)) return ['dismiss','returnEdit'];
    if (code === 'garlic_unreachable') return ['network','networkRetry'];
    if (['no_console','console_not_found'].includes(code)) return ['discover','searchAgain'];
    if (code === 'busy') return ['refresh','refresh'];
    if (error.action) return [error.action,'retry'];
    if (state.job?.kind === 'patch') return ['dismiss','returnEdit'];
    return [state.job?.kind || 'refresh','retry'];
  }
  function errorView(error) {
    const [action,label] = recovery(error);
    return heading(t('errorTitle'),copy().errors[error.code] || copy().errors.internal,stepOf(state))+`<div class="card-body"><div class="status-orb error-title" aria-hidden="true">!</div>${error.detail && !MOCK ? `<p class="error-detail">${esc(error.detail)}</p>` : ''}<div class="actions">${button(t(label),'recover','primary',pending || offline || running() || (action === 'upload' && subnetMismatch()),`data-recovery="${esc(action)}"`)}</div>${logs()}</div>`;
  }
  function powerView() {
    return `<section class="power-layout" id="power-dialog" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="power-title"><div class="power-card">${topControls()}${quitError ? `<div class="banner" role="alert">${esc(t(quitError))}</div>` : ''}<div class="eyebrow">${esc(t('step'))} 02 · ${esc(t('consoleSteps'))}</div><h1 id="power-title">${esc(t('powerTitle'))}</h1><div class="power-grid"><svg class="power-svg" viewBox="0 0 340 240" role="img" aria-label="${esc(t('powerDrawing'))}"><path d="M86 22 Q101 35 115 30 L125 205 Q109 217 92 211 Z" fill="#aab9ce"/><path d="M115 30 L150 23 L159 211 L125 205 Z" fill="#080e1c" stroke="#4da3ff"/><path d="M150 23 Q169 35 178 19 L180 212 Q169 219 159 211 Z" fill="#d4dfed"/><path d="M86 217 L185 217" stroke="#62718b" stroke-width="7" stroke-linecap="round"/><rect x="136" y="171" width="5" height="16" rx="2" fill="#ffd23f"/><circle cx="138" cy="179" r="18" fill="none" stroke="#ffd23f" stroke-width="2"/><path d="M157 179 L213 154 L320 154" stroke="#ffd23f" fill="none"/><text x="237" y="140" fill="#ffd23f" font-size="20">&#x23FB;</text></svg><div class="power-copy"><p class="power-button-label">&#x23FB; ${esc(t('powerLabel'))}</p><h2>${esc(t('powerRelease'))}</h2><p><strong>${esc(t('powerNotPad'))}</strong></p><p class="muted">${esc(t('powerRestart'))}</p><p class="small muted">${esc(t('powerDrawing'))}</p></div></div><div class="power-footer"><div><span class="small muted">${esc(t('countdown'))}</span><span class="timer" id="countdown">05:00</span><span class="small muted" id="timer-note">${esc(t('timerNote'))}</span></div>${cancelButton()}</div><p class="small muted" style="margin-top:15px">${esc(t('powerWait'))}</p></div></section>`;
  }
  function mockPanel(power) {
    if (!MOCK) return '';
    return `<aside class="mock-panel ${power ? 'power-demo' : ''}" aria-label="${esc(t('demo'))}"><div class="mock-panel-top"><div><strong>◈ ${esc(t('demo'))}</strong><br><small>${esc(t('demoNote'))}</small></div><div class="mock-controls">${button('←','previous','small-btn',false,`aria-label="${esc(t('previous'))}"`)}<label for="scenario" class="screen-reader">${esc(t('scenario'))}</label><select id="scenario">${window.SaveDemo.scenarios.map(s=>`<option value="${s.id}" ${s.id === scenario ? 'selected' : ''}>${esc(s.type === 'stage' ? copy().stages[s.id] : s.type === 'error' ? '⚠ '+copy().errors[s.code] : copy().scenarios[s.id])}</option>`).join('')}</select>${button('→','next','small-btn',false,`aria-label="${esc(t('next'))}"`)}</div></div><div class="demo-stage">${esc(t('scenario'))} · ${window.SaveDemo.scenarios.findIndex(s=>s.id === scenario)+1} / ${window.SaveDemo.scenarios.length}</div></aside>`;
  }
  function languageControl() {
    return `<label class="screen-reader" for="language">${esc(t('language'))}</label><select class="lang" id="language">${Object.entries(window.UI_LANGUAGES).map(([id,meta])=>`<option value="${id}" lang="${meta.locale}" ${id === lang ? 'selected' : ''}>${esc(meta.name)}</option>`).join('')}</select>`;
  }
  function topControls() {
    return `<div class="top-actions">${languageControl()}${button(t('quit'),'quit','small-btn danger',pending || quitting || exited)}</div>`;
  }
  async function quit() {
    if (pending || quitting || exited || !window.confirm(t('quitConfirm'))) return;
    quitting = true; quitError = ''; mutation++; render();
    try {
      if (MOCK) { if (protectedTransfer()) throw {code:'busy'}; }
      else await request('quit');
      exited = true; offline = false; localError = null;
    } catch (error) { quitError = error.code === 'busy' ? 'quitBusy' : 'quitFailed'; }
    finally { quitting = false; render(); }
  }
  function render() {
    syncDraft();
    const focus = document.activeElement;
    const focusId = focus?.id, selection = focus?.tagName === 'INPUT' ? [focus.selectionStart,focus.selectionEnd] : null;
    const open = [...root.querySelectorAll('details[open]')].map(e=>e.id);
    const ipValue = document.getElementById('ip')?.value;
    const power = !!(!exited && !offline && state && running() && state.job.needPower);
    const step = state ? stepOf(state) : 0;
    let body;
    if (exited || offline) body = `<header class="card-head"><h1 id="screen-title" tabindex="-1" role="status">${esc(t(exited ? 'quitDone' : 'offline'))}</h1></header>`;
    else if (!state) body = heading(t('loading'),t('wait'),0)+`<div class="card-body"><div class="status-orb running"></div></div>`;
    else if (activeError()) body = errorView(activeError());
    else if (running()) body = runningView();
    else if (state.job?.stage === 'uploaded' && state.job.status === 'done') body = completeView();
    else if (!state.console) body = connectView();
    else if (!state.paired) body = pairView();
    else if (!state.hasSession) body = downloadView();
    else body = state.readyToUpload ? uploadView() : editView();
    root.innerHTML = `<div class="shell"><div id="page-content" ${power ? 'inert' : ''}><header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">↗</span><div><div class="brand-title">GTA6 Save Editor</div><div class="brand-sub">${esc(t('subtitle'))}</div></div></div>${power ? '' : topControls()}</header><nav aria-label="${esc(t('workflow'))}"><ol class="steps">${t('steps').map((name,i)=>`<li class="step ${i === step ? 'active' : i < step ? 'done' : ''}" ${i === step ? 'aria-current="step"' : ''}><span class="step-num">${i < step ? '✓' : '0'+(i+1)}</span><span>${esc(name)}</span></li>`).join('')}</ol></nav>${quitError ? `<div class="banner" role="alert">${esc(t(quitError))}</div>` : ''}${!exited && !offline && state && state.network?.ok !== true ? `<div class="banner ${state.network == null ? 'info' : ''}" role="alert"><span>${esc(state.network == null ? t('networkUnknown') : t('networkBad'))}</span>${button(state.network == null ? t('networkCheck') : t('networkRetry'),'network','small-btn',pending || offline || running())}</div>` : ''}${deviceStatus()}${subnetWarning(step)}<div class="workspace"><main class="main-card" aria-labelledby="screen-title" aria-busy="${pending}">${body}</main></div><footer class="footer"><p>${esc(t('footer'))}</p><span class="edition">${esc(t('version'))} <span class="mono">${esc(state?.version || '\u2014')}</span></span></footer></div>${power ? powerView() : ''}${mockPanel(power)}<div class="screen-reader" role="status" aria-live="polite">${esc(exited || offline ? t(exited ? 'quitDone' : 'offline') : state ? copy().stages[state.job?.stage] || t('steps')[step] : t('loading'))}</div></div>`;
    document.documentElement.lang = window.UI_LANGUAGES[lang].locale;
    document.title = 'GTA6 Save Editor · '+t('subtitle');
    for (const id of open) { const el = document.getElementById(id); if (el) el.open = true; }
    if (ipValue && document.getElementById('ip')) document.getElementById('ip').value = ipValue;
    const nextFocus = focusId && document.getElementById(focusId);
    if (nextFocus && !(power && nextFocus.closest('#page-content'))) {
      nextFocus.focus({preventScroll:true});
      if (selection && typeof nextFocus.setSelectionRange === 'function') try { nextFocus.setSelectionRange(...selection); } catch { /* Non-text input. */ }
    } else if (power) document.getElementById('power-dialog').focus({preventScroll:true});
    else if (focusId === 'power-dialog' || focus?.closest('.power-layout')) document.getElementById('screen-title')?.focus({preventScroll:true});
    tick();
  }
  function acceptState(next) {
    const changed = JSON.stringify(state) !== JSON.stringify(next);
    const recovered = offline;
    offline = false; failures = 0;
    if (state?.job?.id !== next.job?.id || state?.readyToUpload !== next.readyToUpload || state?.console?.host !== next.console?.host) deleted = false;
    state = next;
    if (running() && state.job.needPower) {
      if (powerJob !== state.job.id) { powerJob = state.job.id; powerStart = Date.now(); }
    } else { powerJob = null; powerStart = 0; }
    if (changed || recovered) render();
  }
  function tick() {
    const el = document.getElementById('countdown');
    if (!el) return;
    const seconds = Math.max(0,300-Math.floor((Date.now()-(powerStart || Date.now()))/1000));
    el.textContent = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    if (!seconds) document.getElementById('timer-note').textContent = t('timeElapsed');
  }
  function setScenario(id) {
    if (!MOCK) return;
    const fixture = window.SaveDemo.create(id);
    exited = id === 'quit_done'; quitError = id === 'quit_busy' ? 'quitBusy' : '';
    scenario = id; consoles = fixture.consoles; searched = true; pending = false; localError = null; dismissedError = ''; deleted = false; draftVersion = ''; powerJob = null;
    acceptState(fixture.state); offline = id === 'offline'; render();
  }
  // All real transport is centralized. Mock returns before reaching fetch.
  async function request(action, body = {}) {
    if (MOCK) throw new Error('Demo must never enter real transport');
    const response = await fetch(`/api/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    let result;
    try { result = action === 'quit' && response.ok ? {} : await response.json(); } catch { throw {code:'request_failed',detail:`HTTP ${response.status}`}; }
    if (!response.ok) throw {code:result.error || 'request_failed',detail:result.detail || ''};
    return result;
  }
  async function readState() {
    if (MOCK || exited || quitting) return;
    const version = mutation, serial = ++readSerial;
    try {
      const response = await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error('state unavailable');
      const next = await response.json();
      if (!next || typeof next.paired !== 'boolean' || !Array.isArray(next.slots)) throw new Error('invalid state');
      if (version === mutation && serial === readSerial) acceptState(next);
    } catch {
      if (version === mutation && serial === readSerial) { failures++; if (failures >= 3 && !offline) { offline = true; render(); } }
    }
  }
  async function poll() { if (exited) return; await readState(); if (!exited) setTimeout(poll,1000); }
  function mockAction(action) {
    const map = {discover:'connect',console:'pair',pair:'pair_waiting_console',download:'connecting',patch:'patching',upload:'preparing',restore:'restore'};
    if (action === 'network') { localError = null; dismissedError = errorKey(); state.network = {ok:true,proxy:false}; render(); return; }
    if (action === 'cancel') { setScenario({pair:'pair',download:'download',patch:'edit',upload:'upload',restore:'upload'}[state.job.kind] || 'edit'); return; }
    if (map[action]) {
      const sameSubnet = state?.console?.sameSubnet;
      setScenario(map[action]);
      if (state.console && !['discover','console'].includes(action)) {
        state.console.sameSubnet = sameSubnet;
        render();
      }
    }
  }
  async function perform(action,body = {}) {
    if (action === 'dismiss') { localError = null; dismissedError = errorKey(); render(); return; }
    if (action === 'refresh') { localError = null; if (MOCK) { dismissedError = errorKey(); render(); } else await readState(); return; }
    if (pending || offline || exited || quitting) return;
    if (running() && action !== 'cancel') return;
    if (action === 'cancel' && protectedTransfer()) return;
    if (!['network','discover','console','cancel'].includes(action) && state?.network?.ok !== true) return;
    if (action === 'upload' && (!deleted || subnetMismatch())) { localError = null; dismissedError = errorKey(); render(); return; }
    if (action === 'patch') {
      if (!canPatch()) return;
      body = {slot:selected,changes:getChanges().filter(i=>i.newValue !== i.value).map(({inv,idx,value,newValue})=>({inv,idx,value,newValue}))};
    }
    if (MOCK) { mockAction(action); return; }
    pending = true; localError = null; dismissedError = errorKey(); mutation++; render();
    try {
      const result = await request(action,body);
      if (action === 'discover') { consoles = result.consoles || []; searched = true; }
      if (action === 'network' && state) state.network = result;
      if (action === 'console') acceptState(result);
      else if (result.job && state) acceptState({...state,job:result.job});
      await readState();
    } catch (error) {
      localError = {code:error.code || 'request_failed',detail:error.detail || '',action,body};
      // A response may be lost after the backend accepted the command. Re-read, never auto-retry POST.
      await readState();
      if (running()) localError = null;
    } finally { pending = false; render(); }
  }
  root.addEventListener('click',event=>{
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const action = el.dataset.action;
    if (action === 'quit') { void quit(); return; }
    if (action === 'previous' || action === 'next') {
      const all = window.SaveDemo.scenarios, index = all.findIndex(s=>s.id === scenario);
      setScenario(all[(index+(action === 'next' ? 1 : -1)+all.length)%all.length].id); return;
    }
    if (action === 'slot' && !blocked()) { selected = state.slots[Number(el.dataset.index)].file; render(); return; }
    if (action === 'max' && !blocked()) { for (const i of currentSlot().items) if (['bank','cash'].includes(i.kind)) draft[itemKey(i)] = '8,000,000'; render(); return; }
    if (action === 'console') { void perform('console',{host:consoles[Number(el.dataset.index)].host}); return; }
    if (action === 'recover') { void perform(el.dataset.recovery,localError?.body || {}); return; }
    void perform(action);
  });
  root.addEventListener('change',event=>{
    if (event.target.id === 'language' && Object.hasOwn(window.UI_COPY,event.target.value)) {
      lang = event.target.value;
      try { localStorage.setItem(LANGUAGE_KEY,lang); } catch { /* Keep the selection for this page. */ }
      render(); return;
    }
    if (event.target.id === 'scenario') setScenario(event.target.value);
    if (event.target.id === 'deleted') { deleted = event.target.checked; const button = root.querySelector('[data-action="upload"]'); if (button) button.disabled = uploadBlocked(); }
  });
  root.addEventListener('input',event=>{
    const el = event.target;
    if (!el.dataset.money) return;
    draft[el.dataset.money] = el.value;
    el.setAttribute('aria-invalid',String(parseAmount(el.value) === null));
    document.getElementById('amount-error').textContent = getChanges().some(i=>i.newValue === null) ? t('invalidAmount') : '';
    root.querySelector('[data-action="patch"]').disabled = blocked() || !canPatch();
  });
  root.addEventListener('focusout',event=>{
    const el = event.target;
    if (el.dataset.money && parseAmount(el.value) !== null) { draft[el.dataset.money] = money(parseAmount(el.value)); el.value = draft[el.dataset.money]; }
  });
  root.addEventListener('submit',event=>{
    if (event.target.id !== 'ip-form') return;
    event.preventDefault();
    const value = document.getElementById('ip').value.trim(), parts = value.split('.');
    if (parts.length !== 4 || parts.some(p=>!/^\d{1,3}$/.test(p) || Number(p)>255)) { document.getElementById('ip-error').textContent = t('ipInvalid'); return; }
    void perform('console',{host:parts.map(Number).join('.')});
  });
  root.addEventListener('keydown',event=>{
    if (event.key !== 'Tab' || !document.querySelector('.power-layout')) return;
    const nodes = [...root.querySelectorAll('.power-layout button:not(:disabled), .power-layout select, .power-demo button:not(:disabled), .power-demo select')];
    const first = nodes[0], last = nodes[nodes.length-1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement.id === 'power-dialog')) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  window.addEventListener('beforeunload',event=>{ if (!exited && !offline && protectedTransfer() && !MOCK) { event.preventDefault(); event.returnValue = ''; } });
  if (MOCK) setScenario('edit');
  else { render(); void poll(); }
  setInterval(tick,1000);
})();
