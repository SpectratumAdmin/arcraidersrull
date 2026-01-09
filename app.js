// Russian text is allowed only for UI content. All identifiers are English.

const APP_STATE_DEFAULT = {
  musicUrl: "",
  sections: {
    rare: { prizes: [], players: [], pickedPrizeId: null, winner: "" },
    veryRare: { prizes: [], players: [], pickedPrizeId: null, winner: "" },
    exclusive: { prizes: [], players: [], pickedPrizeId: null, winner: "" },
  }
};

let state = structuredClonePlain(APP_STATE_DEFAULT);

const audioEl = document.getElementById("audio");
let isSpinning = false;

// ===== Utils =====
function structuredClonePlain(x){
  return JSON.parse(JSON.stringify(x));
}

function uid(){
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function getCssVar(v){
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
}

function rarityColor(rarity){
  if (rarity === "rare") return getCssVar("--rare");
  if (rarity === "veryRare") return getCssVar("--veryrare");
  return getCssVar("--exclusive");
}

function rarityLabelRu(rarity){
  if (rarity === "rare") return "Редкие";
  if (rarity === "veryRare") return "Очень редкие";
  return "Эксклюзивные";
}

function normalizeNicks(text){
  return text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/^@/, ""));
}

function availablePrizes(rarity){
  return state.sections[rarity].prizes.filter(p => !p.played);
}

function getPrize(rarity, prizeId){
  return state.sections[rarity].prizes.find(p => p.id === prizeId) ?? null;
}

function pickRandom(arr){
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp01(x){ return Math.min(1, Math.max(0, x)); }
function lerp(a,b,t){ return a + (b-a)*t; }

// Smoothstep-like helper (0..1)
function smoothstep(t){
  t = clamp01(t);
  return t * t * (3 - 2 * t);
}

// ===== Music (URL-based) =====
function setMusicUrl(url){
  state.musicUrl = url || "";
  if (!state.musicUrl){
    audioEl.removeAttribute("src");
    return;
  }
  audioEl.src = state.musicUrl;
  audioEl.loop = true;
  audioEl.volume = 0;
}

function fadeVolume(target, ms){
  const steps = Math.max(1, Math.floor(ms / 25));
  const start = audioEl.volume;
  const delta = (target - start) / steps;
  let i = 0;
  return new Promise(resolve => {
    const t = setInterval(() => {
      i++;
      audioEl.volume = clamp01(start + delta * i);
      if (i >= steps){
        clearInterval(t);
        resolve();
      }
    }, 25);
  });
}

async function musicStart(){
  if (!audioEl.src) return;
  try{
    audioEl.loop = true;
    await audioEl.play();
    await fadeVolume(0.9, 250);
  }catch{}
}

async function musicStop(){
  if (!audioEl.src) return;
  await fadeVolume(0.0, 500);
  try{
    audioEl.pause();
    audioEl.currentTime = 0;
  }catch{}
}

// ===== Render =====
function renderSection(sectionEl){
  const rarity = sectionEl.dataset.rarity;
  const s = state.sections[rarity];

  const avail = availablePrizes(rarity).length;
  const played = s.prizes.filter(p => p.played).length;

  sectionEl.querySelectorAll('[data-bind="available"]').forEach(el => el.textContent = String(avail));
  sectionEl.querySelectorAll('[data-bind="played"]').forEach(el => el.textContent = String(played));

  const picked = s.pickedPrizeId ? getPrize(rarity, s.pickedPrizeId) : null;
  const pickedHost = sectionEl.querySelector('[data-bind="pickedPrize"]');
  pickedHost.innerHTML = "";
  if (!picked){
    const empty = document.createElement("div");
    empty.className = "picked__empty";
    empty.textContent = "Пока ничего не выбрано";
    pickedHost.appendChild(empty);
  }else{
    pickedHost.appendChild(renderPickedPrizeCard(rarity, picked));
  }

  sectionEl.querySelector('[data-bind="winner"]').textContent = s.winner ? s.winner : "Нет";

  const prizeList = sectionEl.querySelector('[data-bind="prizeList"]');
  prizeList.innerHTML = "";
  s.prizes.forEach(p => prizeList.appendChild(renderPrizeRow(rarity, p)));

  const playersList = sectionEl.querySelector('[data-bind="playersList"]');
  playersList.innerHTML = "";
  s.players.forEach((nick, idx) => {
    const pill = document.createElement("div");
    pill.className = "pill";

    const name = document.createElement("span");
    name.textContent = nick;

    const x = document.createElement("button");
    x.className = "pxbtn";
    x.type = "button";
    x.title = "Удалить игрока";
    x.textContent = "×";
    x.addEventListener("click", () => removePlayer(rarity, idx));

    pill.append(name, x);
    playersList.appendChild(pill);
  });
}

function renderAllPrizes(){
  const host = document.getElementById("allPrizes");
  host.innerHTML = "";

  const all = [];
  for (const rarity of ["rare","veryRare","exclusive"]){
    for (const p of state.sections[rarity].prizes){
      all.push({ rarity, prize: p });
    }
  }

  all.sort((a,b)=> (a.prize.played === b.prize.played) ? 0 : (a.prize.played ? 1 : -1));

  all.forEach(({rarity, prize}) => {
    const card = document.createElement("div");
    card.className = "ap" + (prize.played ? " ap--done" : "");

    if (prize.played){
      const rib = document.createElement("div");
      rib.className = "ribbon";
      rib.textContent = "Разыграно";
      card.appendChild(rib);
    }

    const top = document.createElement("div");
    top.className = "ap__top";

    const img = document.createElement("div");
    img.className = "ap__img";
    if (prize.imageUrl){
      const im = document.createElement("img");
      im.src = prize.imageUrl;
      im.alt = prize.name;
      img.appendChild(im);
    }

    const meta = document.createElement("div");
    const nm = document.createElement("div");
    nm.className = "ap__name";
    nm.textContent = prize.name || "Без названия";

    const ds = document.createElement("div");
    ds.className = "ap__desc";
    ds.textContent = prize.desc || "";
    meta.append(nm, ds);

    top.append(img, meta);

    const bottom = document.createElement("div");
    bottom.className = "ap__bottom";

    const rar = document.createElement("div");
    rar.className = "ap__rar";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = rarityColor(rarity);
    const tx = document.createElement("span");
    tx.textContent = rarityLabelRu(rarity);
    rar.append(dot, tx);

    const st = document.createElement("div");
    st.className = "ap__rar";
    st.textContent = prize.played ? ("Победитель: " + (prize.winner || "Не указан")) : "Не разыграно";

    bottom.append(rar, st);
    card.append(top, bottom);
    host.appendChild(card);
  });
}

function render(){
  document.querySelectorAll(".panel[data-rarity]").forEach(renderSection);
  renderAllPrizes();
}

function renderTapeCard({imageUrl, title, subtitle, color}){
  const card = document.createElement("div");
  card.className = "tcard";

  const img = document.createElement("div");
  img.className = "tcard__img";
  img.style.boxShadow = color ? `0 0 0 1px ${color}33 inset` : "";

  if (imageUrl){
    const im = document.createElement("img");
    im.src = imageUrl;
    im.alt = title || "";
    img.appendChild(im);
  }

  const meta = document.createElement("div");
  meta.className = "tcard__meta";

  const nm = document.createElement("div");
  nm.className = "tcard__name";
  nm.textContent = title || "Без названия";

  const ds = document.createElement("div");
  ds.className = "tcard__desc";
  ds.textContent = subtitle || "";

  meta.append(nm, ds);
  card.append(img, meta);
  return card;
}

function renderPickedPrizeCard(rarity, prize){
  const wrap = document.createElement("div");
  wrap.className = "pcard";

  const img = document.createElement("div");
  img.className = "pcard__img";
  if (prize.imageUrl){
    const im = document.createElement("img");
    im.src = prize.imageUrl;
    im.alt = prize.name;
    img.appendChild(im);
  }

  const meta = document.createElement("div");
  meta.className = "pcard__meta";

  const name = document.createElement("div");
  name.className = "pcard__name";
  name.textContent = prize.name || "Без названия";

  const desc = document.createElement("div");
  desc.className = "pcard__desc";
  desc.textContent = prize.desc || "";

  const tag = document.createElement("div");
  tag.className = "pcard__tag";

  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = rarityColor(rarity);

  const t = document.createElement("span");
  t.textContent = rarityLabelRu(rarity) + (prize.played ? " • Разыграно" : "");

  tag.append(dot, t);
  meta.append(name, desc, tag);
  wrap.append(img, meta);
  return wrap;
}

function renderPrizeRow(rarity, prize){
  const row = document.createElement("div");
  row.className = "item";

  const img = document.createElement("div");
  img.className = "item__img";
  if (prize.imageUrl){
    const im = document.createElement("img");
    im.src = prize.imageUrl;
    im.alt = prize.name;
    img.appendChild(im);
  }

  const mid = document.createElement("div");
  const nm = document.createElement("div");
  nm.className = "item__name";
  nm.textContent = (prize.name || "Без названия") + (prize.played ? " • Разыграно" : "");

  const ds = document.createElement("div");
  ds.className = "item__desc";
  ds.textContent = prize.desc || "";
  mid.append(nm, ds);

  const right = document.createElement("div");
  right.className = "item__right";

  const x = document.createElement("button");
  x.className = "xbtn";
  x.type = "button";
  x.title = "Удалить";
  x.textContent = "×";
  x.addEventListener("click", () => removePrize(rarity, prize.id));

  right.appendChild(x);
  row.append(img, mid, right);
  return row;
}

// ===== Actions =====
function removePlayer(rarity, index){
  const s = state.sections[rarity];
  if (index < 0 || index >= s.players.length) return;
  s.players.splice(index, 1);
  render();
}

function addPrize(rarity, imageUrlInputId, nameInputId, descInputId){
  const imgInput = document.getElementById(imageUrlInputId);
  const nameInput = document.getElementById(nameInputId);
  const descInput = document.getElementById(descInputId);

  const name = (nameInput.value || "").trim();
  const desc = (descInput.value || "").trim();
  const imageUrl = (imgInput.value || "").trim();

  if (!name){
    alert("Введи название приза");
    return;
  }

  state.sections[rarity].prizes.unshift({
    id: uid(),
    name,
    desc,
    imageUrl,
    played: false,
    winner: ""
  });

  nameInput.value = "";
  descInput.value = "";
  imgInput.value = "";

  render();
}

function removePrize(rarity, prizeId){
  const s = state.sections[rarity];
  const p = getPrize(rarity, prizeId);
  if (!p) return;

  const ok = confirm("Удалить приз «" + (p.name || "Без названия") + "»?");
  if (!ok) return;

  s.prizes = s.prizes.filter(x => x.id !== prizeId);

  if (s.pickedPrizeId === prizeId){
    s.pickedPrizeId = null;
    s.winner = "";
  }

  render();
}

function addPlayers(rarity, text){
  const nicks = normalizeNicks(text);
  if (!nicks.length){
    alert("Вставь хотя бы один ник");
    return;
  }
  state.sections[rarity].players.push(...nicks);
  render();
}

// ===== Spin timing =====
// We want: start fast (~5 cards/sec) then slow down to ~1 card/sec
// Prize: total 20s, slowDownStart at 15s
// Player: total 10s, slowDownStart at 5s
function speedProfileCardsPerSec(type, t01){
  // t01 is 0..1 overall time
  const fast = 5.0;
  const slow = 1.0;

  const slowStart01 = (type === "prize") ? (15/20) : (5/10); // 0.75 or 0.5
  if (t01 <= slowStart01) return fast;

  // after slowStart, ease to slow
  const tt = (t01 - slowStart01) / (1 - slowStart01);
  const e = smoothstep(tt);
  return lerp(fast, slow, e);
}

// integrate speed over time to compute how many cards we should pass
function totalCardsToPass(type, durationMs){
  // approximate by numeric integration (good enough and stable)
  const durationSec = durationMs / 1000;
  const steps = 400; // integration granularity
  let sum = 0;
  for (let i=0; i<steps; i++){
    const t0 = i / steps;
    const t1 = (i+1) / steps;
    const v0 = speedProfileCardsPerSec(type, t0);
    const v1 = speedProfileCardsPerSec(type, t1);
    const v = (v0 + v1) / 2;
    sum += v * (durationSec / steps);
  }
  return sum; // cards
}

async function spinTape({sectionEl, durationMs, items, finalItem, type}){
  const hint = sectionEl.querySelector('[data-bind="slotText"]');
  const track = sectionEl.querySelector('[data-bind="tape"]');
  const tape = sectionEl.querySelector(".tape");

  if (!hint) throw new Error("Markup error: data-bind='slotText' not found");
  if (!track) throw new Error("Markup error: data-bind='tape' not found");
  if (!tape) throw new Error("Markup error: .tape not found");

  if (!items.length){
    hint.textContent = "Нет данных для прокрутки";
    return null;
  }

  isSpinning = true;
  lockButtons(true);

  hint.textContent = (type === "prize") ? "Крутится приз..." : "Крутится игрок...";
  track.innerHTML = "";

  const rarity = sectionEl.dataset.rarity;

  const renderItem = (it) => {
    if (type === "prize"){
      return renderTapeCard({
        imageUrl: it.imageUrl,
        title: it.name,
        subtitle: it.desc,
        color: rarityColor(rarity),
      });
    }
    return renderTapeCard({
      imageUrl: "",
      title: it,
      subtitle: "Участник",
      color: "rgba(255,255,255,.25)",
    });
  };

  // If only 1 element — no animation
  if (items.length === 1){
    for (let i=0; i<30; i++) track.appendChild(renderItem(items[0]));

    const cards = Array.from(track.children);
    const cardW = cards[0]?.getBoundingClientRect().width ?? 200;
    const gap = 10;
    const step = cardW + gap;
    const center = tape.getBoundingClientRect().width / 2;

    const idxFinal = 15;
    const xFinal = center - (idxFinal * step + cardW/2);
    track.style.transform = `translate3d(${xFinal}px,-50%,0)`;

    hint.textContent = (type === "prize") ? "Приз выбран" : "Игрок выбран";
    isSpinning = false;
    lockButtons(false);
    return finalItem;
  }

  // build long tape
  const cardsToPass = totalCardsToPass(type, durationMs);
  const bufferLeft = Math.ceil(cardsToPass) + 25;
  const bufferRight = 60;
  const idxFinal = bufferLeft;

  for (let i=0; i<bufferLeft; i++){
    track.appendChild(renderItem(pickRandom(items)));
  }
  track.appendChild(renderItem(finalItem));
  for (let i=0; i<bufferRight; i++){
    track.appendChild(renderItem(pickRandom(items)));
  }

  // measure
  const cards = Array.from(track.children);
  const cardW = cards[0]?.getBoundingClientRect().width ?? 200;
  const gap = 10;
  const step = cardW + gap;
  const center = tape.getBoundingClientRect().width / 2;

  const shiftForIndex = (idx) => center - (idx * step + cardW/2);

  const idxStart = Math.max(0, idxFinal - Math.round(cardsToPass));
  const xStart = shiftForIndex(idxStart);
  const xFinal = shiftForIndex(idxFinal);

  track.style.transform = `translate3d(${xStart}px,-50%,0)`;

  await musicStart();

  const startTime = performance.now();

  await new Promise((resolve) => {
    function tick(now){
      const elapsed = now - startTime;
      const t01 = clamp01(elapsed / durationMs);

      // distance based on integral speed: cardsPassed(t) * step
      // numeric integration on-the-fly (fast enough): approximate by mapping using smooth profile
      // We'll approximate cardsPassed as:
      // cardsPassed(t) = cardsToPass * F(t), where F(t) derived from integrating profile normalized.
      // Build F(t) by integration in small steps once per frame:
      const framesSteps = 60; // light integration per frame
      let sum = 0;
      for (let i=0; i<framesSteps; i++){
        const a = (i / framesSteps) * t01;
        const b = ((i+1) / framesSteps) * t01;
        const v0 = speedProfileCardsPerSec(type, a);
        const v1 = speedProfileCardsPerSec(type, b);
        sum += (v0 + v1) / 2 * (t01 / framesSteps);
      }
      // sum is "relative cards/sec integrated over relative time".
      // normalize by total integral over 0..1:
      const total = (function(){
        const steps = 160;
        let s = 0;
        for (let i=0; i<steps; i++){
          const a = i / steps;
          const b = (i+1) / steps;
          const v0 = speedProfileCardsPerSec(type, a);
          const v1 = speedProfileCardsPerSec(type, b);
          s += (v0 + v1) / 2 * (1 / steps);
        }
        return s;
      })();

      const F = total > 0 ? (sum / total) : t01;

      const x = lerp(xStart, xFinal, F);
      track.style.transform = `translate3d(${x}px,-50%,0)`;

      if (t01 >= 1) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }).finally(async () => {
    isSpinning = false;
    await musicStop();
    lockButtons(false);
  });

  track.style.transform = `translate3d(${xFinal}px,-50%,0)`;
  hint.textContent = (type === "prize") ? "Приз выбран" : "Игрок выбран";
  return finalItem;
}

function lockButtons(lock){
  document.querySelectorAll(
    '[data-action="spinPrize"], [data-action="spinPlayer"], [data-action="addPrize"], [data-action="addPlayers"]'
  ).forEach(btn => btn.disabled = lock);
}

async function spinPrize(sectionEl){
  const rarity = sectionEl.dataset.rarity;
  const avail = availablePrizes(rarity);

  if (avail.length === 0){
    alert("В этой секции нет доступных призов");
    return;
  }

  const finalPrize = (avail.length === 1) ? avail[0] : pickRandom(avail);

  state.sections[rarity].pickedPrizeId = null;
  state.sections[rarity].winner = "";
  render();

  await spinTape({
    sectionEl,
    durationMs: 20000,
    items: avail,
    finalItem: finalPrize,
    type: "prize"
  });

  state.sections[rarity].pickedPrizeId = finalPrize.id;
  state.sections[rarity].winner = "";
  render();
}

async function spinPlayer(sectionEl){
  const rarity = sectionEl.dataset.rarity;
  const s = state.sections[rarity];

  if (!s.pickedPrizeId){
    alert("Сначала выбери приз");
    return;
  }

  const prize = getPrize(rarity, s.pickedPrizeId);
  if (!prize || prize.played){
    alert("Этот приз уже разыгран или недоступен");
    return;
  }

  if (s.players.length === 0){
    alert("Добавь игроков");
    return;
  }

  const finalNick = (s.players.length === 1) ? s.players[0] : pickRandom(s.players);

  await spinTape({
    sectionEl,
    durationMs: 10000,
    items: s.players.slice(),
    finalItem: finalNick,
    type: "player"
  });

  s.winner = finalNick;
  prize.played = true;
  prize.winner = finalNick;

  render();
}

// ===== Events =====
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const sectionEl = btn.closest(".panel[data-rarity]");
  const action = btn.dataset.action;

  if (!sectionEl){
    alert("Ошибка разметки: кнопка находится вне секции редкости.");
    return;
  }
  if (isSpinning) return;

  try{
    if (action === "spinPrize") await spinPrize(sectionEl);
    else if (action === "spinPlayer") await spinPlayer(sectionEl);
    else if (action === "addPrize"){
      const rarity = sectionEl.dataset.rarity;
      addPrize(rarity, btn.dataset.img, btn.dataset.name, btn.dataset.desc);
    }
    else if (action === "addPlayers"){
      const rarity = sectionEl.dataset.rarity;
      const area = sectionEl.querySelector('[data-bind="playersInput"]');
      const txt = area.value;
      area.value = "";
      addPlayers(rarity, txt);
    }
  }catch(err){
    console.error(err);
    alert("Ошибка: " + (err?.message || err));
  }
});

document.getElementById("musicUrl")?.addEventListener("change", (e) => {
  setMusicUrl(e.target.value.trim());
});

document.getElementById("resetData")?.addEventListener("click", () => {
  const ok = confirm("Сбросить данные рулетки? Будут удалены призы, игроки и результаты.");
  if (!ok) return;

  try{
    audioEl.pause();
    audioEl.currentTime = 0;
  }catch{}

  state = structuredClonePlain(APP_STATE_DEFAULT);
  render();
});

// Smooth jump inside scroll container
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-jump]");
  if (!btn) return;

  const targetId = btn.dataset.jump;
  const target = document.getElementById(targetId);
  const scroller = document.getElementById("scrollArea");
  if (!target || !scroller) return;

  const top = target.offsetTop - 8;
  scroller.scrollTo({ top, behavior: "smooth" });
});

// ===== Init =====
(function init(){
  render();
})();