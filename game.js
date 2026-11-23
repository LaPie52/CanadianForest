(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const home = $("home"), gameScreen = $("gameScreen"), result = $("result");
  const field = $("playfield"), targetsRoot = $("targets"), reticle = $("reticle");
  const nickname = $("nickname"), leaderList = $("leaderList"), boardStatus = $("boardStatus");
  const timerEl = $("timer"), scoreEl = $("score"), feedback = $("feedback");
  const cfg = window.GAME_CONFIG || {};
  const configured = /^https:\/\/[^/]+\.supabase\.co$/.test(cfg.SUPABASE_URL || "") &&
    cfg.SUPABASE_ANON_KEY && !String(cfg.SUPABASE_ANON_KEY).includes("TA_CLE");
  const TABLE_URL = configured ? cfg.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/scores" : "";
  const headers = configured ? {
    "apikey": cfg.SUPABASE_ANON_KEY,
    "Authorization": "Bearer " + cfg.SUPABASE_ANON_KEY,
    "Content-Type": "application/json"
  } : {};
  const targets = [
    {id:"squirrel",name:"Écureuil",points:100,src:"assets/squirrel.png",x:4.1,y:7.4,w:8.2,h:10.5,side:"up"},
    {id:"deer",name:"Cerf",points:200,src:"assets/deer.png",x:21.3,y:26.4,w:9.8,h:18.2,side:"left"},
    {id:"bear",name:"Ours",points:300,src:"assets/bear.png",x:53.4,y:32.2,w:7.6,h:14.8,side:"right"},
    {id:"fox",name:"Renard",points:200,src:"assets/fox.png",x:79.2,y:47.8,w:8.0,h:14.2,side:"right"},
    {id:"chipmunk",name:"Tamia coréen",points:100,src:"assets/chipmunk.png",x:74.1,y:70.5,w:14.5,h:12.2,side:"up"},
    {id:"goose",name:"Oie",points:100,src:"assets/goose.png",x:66.2,y:4.2,w:8.5,h:10.5,side:"up"},
    {id:"boy",name:"Garçon",points:-500,src:"assets/boy.png",x:7.1,y:52.5,w:14.0,h:19.2,side:"up"},
    {id:"girl",name:"Fille",points:-500,src:"assets/girl.png",x:30.5,y:54.0,w:8.8,h:14.8,side:"up"}
  ];
  let player = "", score = 0, seconds = 30, running = false;
  let clock = null, spawnTimer = null, hideTimers = new Map(), audioCtx = null;
  let musicOn = true, musicTimer = null, noteIndex = 0, lastTarget = "";
  const active = new Set();
  const targetEls = new Map();

  const boyVoice = new Audio("assets/pas-le-docteur.mp3");
  boyVoice.preload = "auto";

  function showScreen(which) {
    [home, gameScreen, result].forEach(el => el.classList.add("hidden"));
    which.classList.remove("hidden");
  }
  function validConfig() { return configured; }
  function esc(text) { return String(text).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  async function fetchScores() {
    if (!validConfig()) {
      leaderList.innerHTML = '<li class="muted">Classement à connecter — voir le fichier README.</li>';
      boardStatus.textContent = "Configure Supabase pour activer le classement partagé.";
      return [];
    }
    try {
      const response = await fetch(TABLE_URL + "?select=nickname,score,created_at&order=score.desc,created_at.asc&limit=10", {headers});
      if (!response.ok) throw new Error("HTTP " + response.status);
      const rows = await response.json();
      renderBoard(leaderList, rows);
      renderBoard($("resultBoard"), rows);
      boardStatus.textContent = "🌐 Classement mondial synchronisé";
      return rows;
    } catch (err) {
      leaderList.innerHTML = '<li class="muted">Classement indisponible pour le moment.</li>';
      boardStatus.textContent = "Vérifie la configuration Supabase.";
      return [];
    }
  }
  function renderBoard(list, rows) {
    list.innerHTML = "";
    if (!rows || !rows.length) {
      const li = document.createElement("li"); li.className = "muted"; li.textContent = "Pas encore de score. À toi d'ouvrir le classement !"; list.appendChild(li); return;
    }
    rows.forEach((row, i) => {
      const li = document.createElement("li");
      const name = document.createElement("span"); name.textContent = (Number(i)+1) + ". " + row.nickname;
      const pts = document.createElement("span"); pts.textContent = Number(row.score).toLocaleString("fr-FR") + " pts";
      li.append(name, pts); list.appendChild(li);
    });
  }
  async function submitScore() {
    if (!validConfig()) {
      $("saveStatus").textContent = "Score non partagé : configure Supabase (instructions dans README).";
      return;
    }
    $("saveStatus").textContent = "Envoi du score au classement mondial…";
    try {
      const response = await fetch(TABLE_URL, {
        method:"POST", headers:{...headers, "Prefer":"return=minimal"},
        body:JSON.stringify({nickname:player,score})
      });
      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || "HTTP " + response.status);
      }
      $("saveStatus").textContent = "✓ Score enregistré dans le classement partagé.";
    } catch (err) {
      $("saveStatus").textContent = "Impossible d'enregistrer le score. Vérifie Supabase et réessaie.";
    }
    await fetchScores();
  }

  function makeTargets() {
    targets.forEach(t => {
      const el = document.createElement("button");
      el.type = "button"; el.className = "target " + t.side;
      el.setAttribute("data-target", t.id);
      el.setAttribute("aria-label", t.name + ", " + (t.points < 0 ? "pénalité" : t.points + " points"));
      el.style.left = t.x + "%"; el.style.top = t.y + "%";
      el.style.width = t.w + "%"; el.style.height = t.h + "%";
      const img = document.createElement("img"); img.src = t.src; img.alt = "";
      el.appendChild(img);
      el.addEventListener("pointerdown", ev => { ev.stopPropagation(); });
      el.addEventListener("click", ev => {
        ev.preventDefault(); ev.stopPropagation();
        if (!running || !active.has(t.id)) return;
        score += t.points; scoreEl.textContent = score.toLocaleString("fr-FR");
        showFeedback(t.points, t.name, ev.clientX, ev.clientY);
        playShot();
        if (t.id === "boy") {
          playBoyPenaltySound();
          speakBoyLine();
          playBoyVoice();
        }
        hideTarget(t.id); kick();
      });
      targetsRoot.appendChild(el); targetEls.set(t.id, el);
    });
  }
  function showFeedback(points, name, clientX, clientY) {
    if (feedback) {
      feedback.textContent = (points > 0 ? "+" : "") + points + " • " + name;
      feedback.style.color = points < 0 ? "#ffaaa0" : "#ffe7a4";
      feedback.classList.remove("show"); void feedback.offsetWidth; feedback.classList.add("show");
    }
    const rect = field.getBoundingClientRect();
    const x = typeof clientX === "number" ? clientX - rect.left : rect.width / 2;
    const y = typeof clientY === "number" ? clientY - rect.top : rect.height * 0.5;

    const popup = document.createElement("div");
    const isNeg = points < 0;
    popup.className = "score-popup " + (isNeg ? "neg" : "pos");
    popup.style.left = Math.max(48, Math.min(rect.width - 48, x)) + "px";
    popup.style.top = Math.max(48, Math.min(rect.height - 48, y)) + "px";

    const ptsEl = document.createElement("span");
    ptsEl.className = "pts";
    ptsEl.textContent = (points > 0 ? "+" : "") + points.toLocaleString("fr-FR");

    const tagEl = document.createElement("span");
    tagEl.className = "tag";
    tagEl.textContent = isNeg ? `${name} • Aïe !` : name;

    popup.append(ptsEl, tagEl);
    field.appendChild(popup);

    if (isNeg) {
      field.classList.remove("shake");
      void field.offsetWidth;
      field.classList.add("shake");
    }

    setTimeout(() => popup.remove(), 840);
  }
  function hideTarget(id) {
    const el = targetEls.get(id); if (!el) return;
    el.classList.remove("visible", "fly-ltr", "fly-rtl");
    el.style.removeProperty("--peek-dur");
    active.delete(id);
    if (hideTimers.has(id)) { clearTimeout(hideTimers.get(id)); hideTimers.delete(id); }
  }
  function spawnTarget() {
    if (!running) return;
    const choices = targets.filter(t => !active.has(t.id) && t.id !== lastTarget);
    const pool = choices.length ? choices : targets.filter(t => !active.has(t.id));
    if (!pool.length) return;
    const target = pool[Math.floor(Math.random() * pool.length)];
    lastTarget = target.id; active.add(target.id);

    const el = targetEls.get(target.id);
    el.classList.remove("fly-ltr", "fly-rtl");

    let duration = 900 + Math.random() * 850;
    if (target.id === "goose") {
      const dirClass = Math.random() < 0.5 ? "fly-ltr" : "fly-rtl";
      el.classList.add(dirClass);
      duration = 3400;
    }

    el.style.setProperty("--peek-dur", duration + "ms");
    el.classList.add("visible");
    hideTimers.set(target.id, setTimeout(() => hideTarget(target.id), duration));
  }
  function scheduleSpawn() {
    if (!running) return;
    spawnTarget();
    spawnTimer = setTimeout(scheduleSpawn, 420 + Math.random() * 520);
  }
  function kick() { reticle.classList.add("kick"); setTimeout(() => reticle.classList.remove("kick"), 110); $("hitFlash").classList.remove("bang"); void $("hitFlash").offsetWidth; $("hitFlash").classList.add("bang"); }

  function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  function playShot() {
    try {
      const a = getAudio(), now = a.currentTime, duration = .42;
      const buffer = a.createBuffer(1, Math.floor(a.sampleRate * duration), a.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<data.length;i++) { const t=i/a.sampleRate; data[i]=(Math.random()*2-1)*Math.exp(-t/.075); }
      const src=a.createBufferSource(), filter=a.createBiquadFilter(), gain=a.createGain(), comp=a.createDynamicsCompressor();
      src.buffer=buffer; filter.type="lowpass"; filter.frequency.setValueAtTime(2800,now); filter.frequency.exponentialRampToValueAtTime(130,now+.4);
      gain.gain.setValueAtTime(1.8,now); gain.gain.exponentialRampToValueAtTime(.001,now+.41);
      comp.threshold.value=-13; comp.knee.value=14; comp.ratio.value=6;
      src.connect(filter); filter.connect(gain); gain.connect(comp); comp.connect(a.destination); src.start(); src.stop(now+.42);
      const bass=a.createOscillator(), bg=a.createGain(); bass.type="sine"; bass.frequency.setValueAtTime(105,now); bass.frequency.exponentialRampToValueAtTime(30,now+.24);
      bg.gain.setValueAtTime(.85,now); bg.gain.exponentialRampToValueAtTime(.001,now+.27); bass.connect(bg); bg.connect(comp); bass.start(); bass.stop(now+.28);
    } catch(e) {}
  }
  function playBoyPenaltySound() {
    if (!musicOn) return;
    try {
      const a = getAudio();
      const now = a.currentTime;
      const notes = [
        { start: 0, dur: 0.14, fStart: 260, fEnd: 155 },
        { start: 0.13, dur: 0.22, fStart: 195, fEnd: 95 }
      ];
      notes.forEach(n => {
        const osc = a.createOscillator();
        const gain = a.createGain();
        const filter = a.createBiquadFilter();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(n.fStart, now + n.start);
        osc.frequency.exponentialRampToValueAtTime(n.fEnd, now + n.start + n.dur);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(900, now + n.start);
        gain.gain.setValueAtTime(0.001, now + n.start);
        gain.gain.exponentialRampToValueAtTime(0.16, now + n.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + n.start + n.dur);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(a.destination);
        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.02);
      });
    } catch (e) {}
  }
  function speakBoyLine() {
    if (!musicOn || typeof window.speechSynthesis === "undefined") return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance("Pas le docteur !");
      utter.lang = "fr-FR";
      utter.rate = 1.15;
      utter.pitch = 1.25;
      utter.volume = 1;
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  }
  function playBoyVoice() {
    if (!musicOn) return;
    try {
      boyVoice.currentTime = 0;
      boyVoice.play().catch(() => {});
    } catch (e) {}
  }
  // Courte mélodie originale, folk et aventure, sans reprendre une chanson existante.
  const melody=[392,440,523.25,587.33,523.25,440,392,329.63,392,440,523.25,659.25,587.33,523.25,440,392];
  function pluck(freq, when) {
    if (!audioCtx || !musicOn) return;
    const osc=audioCtx.createOscillator(), gain=audioCtx.createGain(), filter=audioCtx.createBiquadFilter();
    osc.type="triangle"; osc.frequency.setValueAtTime(freq,when); filter.type="lowpass"; filter.frequency.value=1250;
    gain.gain.setValueAtTime(.0001,when); gain.gain.exponentialRampToValueAtTime(.07,when+.02); gain.gain.exponentialRampToValueAtTime(.0001,when+.5);
    osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination); osc.start(when); osc.stop(when+.51);
  }
  function startMusic() {
    stopMusic(); if (!musicOn) return;
    try { getAudio(); noteIndex=0; musicTimer=setInterval(() => {
      if (!running || !musicOn) return;
      const when=audioCtx.currentTime+.03; pluck(melody[noteIndex%melody.length],when);
      if (noteIndex%4===0) pluck(melody[(noteIndex+4)%melody.length]/2,when+.01);
      noteIndex++;
    },390); } catch(e) {}
  }
  function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer=null; }
  function startGame() {
    const name=nickname.value.trim().replace(/\s+/g," ").slice(0,18);
    if (!name) { nickname.focus(); nickname.setCustomValidity("Choisis un surnom pour jouer."); nickname.reportValidity(); return; }
    nickname.setCustomValidity(""); player=name; score=0; seconds=30; running=true; lastTarget="";
    $("playerTag").textContent=player; scoreEl.textContent="0"; timerEl.textContent="30";
    active.clear(); targets.forEach(t=>hideTarget(t.id));
    showScreen(gameScreen); startMusic(); scheduleSpawn();
    clock=setInterval(() => {
      seconds--; timerEl.textContent=String(seconds);
      if (seconds<=0) endGame();
    },1000);
  }
  async function endGame() {
    if (!running) return; running=false; clearInterval(clock); clearTimeout(spawnTimer); stopMusic();
    targets.forEach(t=>hideTarget(t.id));
    $("finalScore").textContent=score.toLocaleString("fr-FR");
    $("resultTitle").textContent=score>=1000?"Excellent, "+player+" !":"Bien joué, "+player+" !";
    $("saveStatus").textContent="Préparation du classement…";
    showScreen(result); await submitScore();
  }
  function moveReticle(clientX,clientY) {
    const rect=field.getBoundingClientRect();
    reticle.style.left=(clientX-rect.left)+"px"; reticle.style.top=(clientY-rect.top)+"px";
  }
  field.addEventListener("pointermove", e => {
    if (e.pointerType==="mouse" || e.pointerType==="pen") moveReticle(e.clientX,e.clientY);
  });
  field.addEventListener("pointerdown", e => {
    if (!running || e.target.closest(".target")) return;
    moveReticle(e.clientX,e.clientY); playShot(); kick();
  });
  $("startBtn").addEventListener("click", startGame);
  nickname.addEventListener("keydown", e => { if (e.key==="Enter") startGame(); });
  $("againBtn").addEventListener("click", startGame);
  $("homeBtn").addEventListener("click", () => { showScreen(home); fetchScores(); });
  $("refreshBoard").addEventListener("click", fetchScores);
  $("soundBtn").addEventListener("click", () => {
    musicOn=!musicOn; $("soundBtn").textContent=musicOn?"♫ Son : ON":"♫ Son : OFF";
    if (musicOn && running) startMusic(); else stopMusic();
  });
  makeTargets();
  fetchScores();
  if (window.matchMedia("(orientation: portrait) and (max-width: 700px)").matches) {
    $("rotateHint").classList.remove("hidden");
    setTimeout(()=>$("rotateHint").classList.add("hidden"),6500);
  }
})();
