'use strict';
// Pure fixtures: no timers, storage, fetch, or console side effects.
window.SaveDemo = (() => {
  const stages = {
    pair: ['pair_waiting_console', 'pair_reading', 'paired'],
    download: ['connecting', 'need_power', 'reading_list', 'downloading', 'decrypting', 'ready'],
    patch: ['patching', 'encrypting', 'importing', 'ready_to_upload'],
    upload: ['preparing', 'waiting_console', 'console_connected', 'transferring', 'uploaded']
  };
  const errors = ['garlic_unreachable','not_paired','power_timeout','console_rejected','no_gta_save','no_story_slot','pair_failed','save_layout_changed','save_verify_failed','save_stale_item','no_change','port_in_use','upload_failed','download_failed','tool_failed','internal','busy','no_console','no_session','nothing_to_upload','console_not_found','request_failed'];
  const consoleData = {host:'192.168.1.20',name:'PS5 · Living Room',hostId:'DEMO00000001',firmware:'14230000',sameSubnet:true};
  const slots = [
    {file:'sdimg_SAVEDATASARC0001',subtitle:'Fresh Start',revision:'102',items:[{inv:0,idx:329,kind:'bank',value:5000},{inv:0,idx:303,kind:'cash',value:20000},{inv:1,idx:303,kind:'cash',value:12500},{inv:0,idx:332,kind:'other',value:5000}],ledger:{amount:-30000,balance:5000},modified:false,changes:[]},
    {file:'sdimg_SAVEDATASARC0002',subtitle:'Back to the Coast',revision:'99',items:[{inv:0,idx:329,kind:'bank',value:3200},{inv:0,idx:303,kind:'cash',value:8400}],ledger:null,modified:false,changes:[]}
  ];
  function base(level = 'edit') {
    const n = ['connect','pair','download','edit','upload'].indexOf(level);
    return {version:'0.1.0-demo',console:n > 0 ? {...consoleData} : null,paired:n > 1,network:{ok:true,proxy:false},hasSession:n > 2,user:n > 2 ? {id:'demo',name:'Player'} : null,title:'PPSA01547',readyToUpload:n > 3,slots:n > 2 ? JSON.parse(JSON.stringify(slots)) : [],job:{id:1,kind:'',status:'idle',stage:'',needPower:false,progress:null,hint:null,error:null,log:[]}};
  }
  function stageState(kind, stage) {
    const s = base({pair:'pair',download:'download',patch:'edit',upload:'upload'}[kind]);
    Object.assign(s.job,{kind,stage,status:'running',log:[{t:1795400000,m:`[demo] ${kind}: ${stage}`}]});
    if (stage === 'need_power') s.job.needPower = true;
    if (['downloading','transferring'].includes(stage)) s.job.progress = {files:2,total:5};
    if (['paired','ready','ready_to_upload','uploaded'].includes(stage)) {
      s.job.status = 'done';
      if (stage === 'paired') s.paired = true;
      if (stage === 'ready') Object.assign(s,{hasSession:true,slots:JSON.parse(JSON.stringify(slots)),user:{id:'demo',name:'Player'}});
      if (stage === 'ready_to_upload') s.readyToUpload = true;
      if (stage === 'uploaded') s.readyToUpload = false;
    }
    return s;
  }
  const scenarios = ['offline','quit_done','quit_busy','connect','empty','network','unchecked','pair','subnet_connect','download','subnet_download','edit','empty_slots','upload','subnet_upload','subnet_unknown','subnet_waiting','subnet_retry'].map(id=>({id,type:'screen'}));
  for (const [kind,list] of Object.entries(stages)) for (const stage of list) scenarios.push({id:stage,type:'stage',kind});
  scenarios.push({id:'hint',type:'screen'},{id:'unknown_progress',type:'screen'},{id:'restore',type:'screen'});
  for (const code of errors) scenarios.push({id:`error:${code}`,type:'error',code});
  function create(id) {
    const entry = scenarios.find(x=>x.id === id);
    if (!entry) throw new Error(`Unknown demo scenario: ${id}`);
    let s;
    if (entry.type === 'stage') s = stageState(entry.kind,id);
    else if (entry.type === 'error') {
      const code = entry.code;
      const kind = /pair/.test(code) || code === 'console_rejected' ? 'pair' : /upload/.test(code) ? 'upload' : /save_(layout|verify|stale)|no_change|tool_failed/.test(code) ? 'patch' : 'download';
      s = stageState(kind,stages[kind][0]);
      Object.assign(s.job,{status:'error',error:{code,detail:`[demo] ${code}`},needPower:false});
    } else {
      s = base(['connect','pair','download','edit','upload'].includes(id) ? id : 'edit');
      if (id === 'empty') s = base('connect');
      if (id === 'quit_busy') s = stageState('upload','transferring');
      if (id === 'network') s.network.ok = false;
      if (id === 'unchecked') s.network = null;
      if (id === 'empty_slots') s.slots = [];
      if (id === 'hint') { s = stageState('upload','waiting_console'); s.job.hint = 'console_has_save'; }
      if (id === 'unknown_progress') { s = stageState('upload','transferring'); s.job.progress = {files:2,total:0}; }
      if (id === 'restore') { s = base('upload'); Object.assign(s.job,{kind:'restore',status:'done',stage:'ready_to_upload'}); }
      if (id.startsWith('subnet_')) {
        s = id === 'subnet_waiting' ? stageState('upload','waiting_console') : base(id === 'subnet_connect' ? 'pair' : id === 'subnet_download' ? 'download' : 'upload');
        s.console.sameSubnet = id === 'subnet_unknown' ? null : false;
        if (id === 'subnet_retry') Object.assign(s.job,{kind:'upload',status:'error',error:{code:'upload_failed',detail:'[demo] upload_failed'}});
      }
    }
    return {state:s,consoles:id === 'empty' ? [] : [{...consoleData}]};
  }
  return Object.freeze({scenarios,stages,errors,create});
})();
