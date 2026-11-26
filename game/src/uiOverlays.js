export function createUiOverlays(root, callbacks = {}) {
  const ui = { root, selected: 0, missions: [], mode: 'title', els: {} };
  const call = (name, ...args) => { if (callbacks[name]) callbacks[name](...args); };
  const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const css = document.createElement('style');
  css.textContent = `
.ov{position:absolute;inset:0;display:none;align-items:center;justify-content:center;pointer-events:auto;font-family:var(--mono)}
.ov.show{display:flex}
.card{background:rgba(29,35,43,.86);border:1px solid rgba(244,239,230,.28);border-top:3px solid var(--amber);padding:22px 26px;max-width:min(760px,94vw);color:var(--ivory);backdrop-filter:blur(6px)}
.card h1{margin:0;font:700 30px var(--mono);letter-spacing:.32em}.card h1 span{color:var(--amber)}
.card .sub{margin:4px 0 14px;font-size:11px;letter-spacing:.2em;opacity:.7;text-transform:uppercase}
.mis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.mis button{all:unset;cursor:pointer;box-sizing:border-box;padding:10px 12px;border:1px solid rgba(244,239,230,.25);font-size:11px;line-height:1.5;text-transform:uppercase}
.mis button.sel{border-color:var(--amber);background:rgba(242,169,59,.14)}
.mis b{display:block;color:var(--amber);font-size:12px;letter-spacing:.1em}
.brief{font:13px/1.55 var(--sans);margin:0 0 12px;min-height:40px}
.keys{display:grid;grid-template-columns:repeat(2,1fr);gap:2px 18px;font-size:11px;opacity:.85;margin-bottom:14px;text-transform:uppercase}
.keys b{color:var(--amber)}
.btn{all:unset;cursor:pointer;display:inline-block;padding:9px 16px;margin-right:8px;background:var(--amber);color:#14181d;font:700 12px var(--mono);letter-spacing:.16em}
.btn.alt{background:transparent;color:var(--ivory);border:1px solid rgba(244,239,230,.5)}
.btn:hover{filter:brightness(1.12)}
.ov.side{align-items:flex-end;justify-content:flex-end;pointer-events:none}
.ov.side{align-items:center;padding:0 20px}
.ov.side .debrief{position:relative;width:min(380px,40vw);max-height:calc(100vh - 40px);overflow:auto;box-sizing:border-box;margin:0;pointer-events:auto}
.medal{font-weight:700;color:var(--amber)}
.debrief .btns{margin-top:10px}
`;
  root.appendChild(css);
  const make = (cls, html) => { const el = document.createElement('div'); el.className = 'ov ' + cls; el.innerHTML = html; root.appendChild(el); return el; };

  ui.els.title = make('show', '<div class="card"><h1>SOLARIS <span>WING</span></h1><div class="sub">KW-14 Kestrel \u00B7 Hangar mission briefing</div><div class="mis"></div><p class="brief"></p><div class="keys"><div><b>W/S</b> pitch \u00B7 <b>A/D</b> roll \u00B7 <b>Q/E</b> yaw</div><div><b>Shift/Ctrl</b> throttle \u00B7 <b>Space</b> boost</div><div><b>F</b> flaps \u00B7 <b>G</b> gear \u00B7 <b>B</b> brake</div><div><b>V</b> camera \u00B7 <b>M</b> mouse yoke \u00B7 <b>X</b> drop</div><div><b>P</b> pause \u00B7 <b>R</b> restart \u00B7 <b>N</b> mute</div><div><b>1/2/3</b> mission</div></div><button class="btn" data-act="launch">LAUNCH SORTIE</button><span class="sub">or press Enter / Space</span></div>');
  ui.els.pause = make('', '<div class="card"><h1>PAUSED</h1><div class="sub">Sortie on hold</div><button class="btn" data-act="resume">RESUME</button><button class="btn alt" data-act="restart">RESTART</button><button class="btn alt" data-act="change">CHANGE MISSION</button></div>');
  ui.els.debrief = make('side', '<div class="debrief"></div>');

  ui.setMissions = (list) => { ui.missions = list; renderMissions(); };
  const renderMissions = () => {
    const holder = ui.els.title.querySelector('.mis');
    holder.innerHTML = ui.missions.map((m, i) => `<button data-mission="${i}" class="${i === ui.selected ? 'sel' : ''}"><b>${i + 1}. ${esc(m.name)}</b>${esc(m.mood)} \u00B7 ${esc(m.unit)}</button>`).join('');
    const mission = ui.missions[ui.selected];
    ui.els.title.querySelector('.brief').textContent = mission ? mission.brief : '';
  };
  ui.select = (index) => {
    ui.selected = index;
    renderMissions();
    call('onSelect', index);
  };

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-act],[data-mission]');
    if (!target) return;
    if (target.dataset.mission !== undefined) return ui.select(Number(target.dataset.mission));
    const act = target.dataset.act;
    if (act === 'launch') call('onLaunch', ui.selected);
    else if (act === 'resume') call('onResume');
    else if (act === 'restart') call('onRestart');
    else if (act === 'change') call('onChangeMission');
    else if (act === 'next') call('onNext');
  });

  const hideAll = () => { for (const el of Object.values(ui.els)) el.classList.remove('show'); };
  ui.showTitle = () => { hideAll(); ui.mode = 'title'; ui.els.title.classList.add('show'); };
  ui.showPause = () => { hideAll(); ui.mode = 'pause'; ui.els.pause.classList.add('show'); };
  ui.hide = () => { hideAll(); ui.mode = 'play'; };
  ui.showDebrief = (d) => {
    hideAll();
    ui.mode = 'debrief';
    const card = ui.els.debrief.querySelector('.debrief');
    card.className = 'debrief' + (d.crashed ? ' crash' : '');
    const sec = Math.floor(d.time);
    card.innerHTML = `<h2>${d.crashed ? 'CRASH DIAGNOSIS' : 'SORTIE DEBRIEF'}</h2><div class="grade">${esc(d.grade)}</div><dl>
<dt>Touchdown</dt><dd>${Math.round(d.touchdownFpm)} FPM</dd><dt>Speed</dt><dd>${Math.round(d.touchdownKts)} KTS</dd>
<dt>Centerline</dt><dd>${Math.abs(d.centerlineM).toFixed(1)} m ${d.centerlineM < 0 ? 'L' : 'R'}</dd><dt>Fuel</dt><dd>${d.fuelPct}%</dd><dt>Hull</dt><dd>${d.hullPct}%</dd>
<dt>${esc(d.unit)}</dt><dd>${d.cleared}/${d.total}</dd><dt>Time</dt><dd>${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</dd>
<dt>Score</dt><dd>${d.score}</dd><dt>Medal</dt><dd class="medal">${esc(d.medal)}</dd></dl>
<div class="btns"><button class="btn" data-act="restart">FLY AGAIN [R]</button><button class="btn alt" data-act="next">NEXT MISSION</button></div>`;
    ui.els.debrief.classList.add('show');
  };
  ui.setDebriefRaw = (html) => { ui.els.debrief.querySelector('.debrief').innerHTML = html; };
  renderMissions();
  return ui;
}