const classes = ["Guerrier", "Mage", "Rôdeur", "Paladin", "Assassin", "Invocateur"];

const abilities = [
  { name: "Frappe Brutale", text: "+35% dégâts le 1er tour.", init: (s) => (s.burst = true), hit: (s, raw, turn) => turn === 1 && s.burst ? raw * 1.35 : raw },
  { name: "Armure Étoilée", text: "Réduit les dégâts subis de 3.", defend: (s, dmg) => Math.max(1, dmg - 3) },
  { name: "Drain Vital", text: "Récupère 25% des dégâts infligés.", afterHit: (s, dealt) => (s.hp += Math.floor(dealt * 0.25)) },
  { name: "Danse-Lame", text: "30% de chance de frapper deux fois.", extraHitChance: 0.3 },
  { name: "Miroir Arcanique", text: "Renvoie 2 dégâts à chaque attaque reçue.", onDamaged: (attacker) => (attacker.hp -= 2) },
  { name: "Concentration", text: "Le critique passe de 10% à 25%.", critChance: 0.25 },
  { name: "Lame Venimeuse", text: "Ajoute 2 dégâts fixes.", bonusDamage: 2 },
  { name: "Bouclier Sacré", text: "Ignore la 1re attaque reçue.", init: (s) => (s.blockOnce = true), defend: (s, dmg) => s.blockOnce ? ((s.blockOnce = false), 0) : dmg },
  { name: "Charge Solaire", text: "Gagne +1 attaque à chaque tour.", turnStart: (s) => (s.scalingAtk += 1) },
  { name: "Ombre Vive", text: "Esquive 20% des coups.", evadeChance: 0.2 }
];

const atmospheres = [
  "Nébuleuse carmin — des braises astrales dansent à l'horizon.",
  "Tempête d'éclats — le champ de bataille vibre sous les comètes.",
  "Silence du vide — chaque décision résonne comme un destin.",
  "Aube cosmique — une lueur dorée galvanise vos troupes."
];

const phases = [
  "1. Début du tour: pioche",
  "2. Ajouter un combattant",
  "3. Boosts / dégâts / sorts offensifs",
  "4. Phase d'attaque",
  "5. Sorts de soin / soutien"
];

const MAX_BOARD = 5;
const ACTION_DELAY = 370;

function createDeck(prefix, themes, offset) {
  return Array.from({ length: 60 }, (_, i) => {
    const className = classes[i % classes.length];
    const ability = abilities[(i + offset) % abilities.length];
    const theme = themes[i % themes.length];
    const rank = Math.floor(i / themes.length) + 1;
    return {
      id: `${prefix}-${i + 1}`,
      name: `${theme} ${rank}`,
      className,
      attack: 7 + ((i * 3 + offset) % 8),
      defense: 4 + ((i * 5 + offset) % 7),
      hp: 28 + ((i * 7 + offset) % 18),
      speed: 3 + ((i * 2 + offset) % 8),
      ability,
      cost: 1 + Math.floor((i + offset) % 7)
    };
  });
}

const baseDeckA = createDeck("SOL", ["Aurogard", "Lumina", "Helion", "Solaria", "Astreon", "Pyrelis", "Orionel", "Clareon", "Valkor", "Zenith", "Dawnis", "Rubion"], 1);
const baseDeckB = createDeck("OMB", ["Nocthar", "Umbrys", "Néantor", "Morbane", "Velkar", "Shadriel", "Sépulor", "Duskhan", "Obscuron", "Vesper", "Nyxor", "Drakmor"], 5);

const state = {
  turn: 1,
  playerHp: 30,
  opponentHp: 30,
  playerMana: 1,
  opponentMana: 1,
  playerDeck: [],
  opponentDeck: [],
  playerHand: [],
  opponentHand: [],
  playerBoard: [],
  opponentBoard: [],
  selectedCardId: null,
  logs: [],
  phase: phases[0],
  phaseIndex: 0,
  actionQueue: Promise.resolve()
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shuffle(deck) {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function draw(hand, deck, amount = 1) {
  const drawn = [];
  for (let i = 0; i < amount; i++) {
    if (deck.length) {
      const card = deck.shift();
      hand.push(card);
      drawn.push(card);
    }
  }
  return drawn;
}

function toState(card) {
  const s = {
    name: card.name,
    atk: card.attack,
    def: card.defense,
    hp: card.currentHp ?? card.hp,
    spd: card.speed,
    ability: card.ability,
    scalingAtk: 0,
    burst: false,
    blockOnce: false
  };
  card.ability.init?.(s);
  return s;
}

function strike(attacker, defender, turn) {
  if (Math.random() < (defender.ability.evadeChance || 0)) return 0;
  let raw = attacker.atk + attacker.scalingAtk - Math.floor(defender.def / 2) + (attacker.ability.bonusDamage || 0);
  raw = Math.max(1, raw);
  if (attacker.ability.hit) raw = Math.round(attacker.ability.hit(attacker, raw, turn));
  if (Math.random() < (attacker.ability.critChance || 0.1)) raw = Math.round(raw * 1.5);
  const dealt = Math.max(0, defender.ability.defend ? defender.ability.defend(defender, raw) : raw);
  defender.hp -= dealt;
  attacker.ability.afterHit?.(attacker, dealt);
  defender.ability.onDamaged?.(attacker);
  return dealt;
}

function duel(cardA, cardB) {
  const a = toState(cardA);
  const b = toState(cardB);
  const first = a.spd >= b.spd ? [a, b] : [b, a];
  strike(first[0], first[1], state.turn);
  if (first[1].hp > 0) strike(first[1], first[0], state.turn);
  return { aHp: a.hp, bHp: b.hp };
}

function enqueue(action) {
  state.actionQueue = state.actionQueue.then(action).catch(() => {});
  return state.actionQueue;
}

function getRectCenter(el) {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

async function animateTravel(fromEl, toEl, className = "fx-card") {
  const fxLayer = document.getElementById("fxLayer");
  const fx = document.createElement("div");
  fx.className = className;
  fxLayer.appendChild(fx);

  const from = getRectCenter(fromEl);
  const to = getRectCenter(toEl);

  fx.style.left = `${from.x - 30}px`;
  fx.style.top = `${from.y - 42}px`;
  fx.style.opacity = "1";

  await sleep(16);
  fx.style.transition = "transform 360ms cubic-bezier(.22,.88,.35,1), opacity 360ms ease";
  fx.style.transform = `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(0.92)`;
  fx.style.opacity = "0.2";

  await sleep(ACTION_DELAY);
  fx.remove();
}

function pulseSlot(slot, className) {
  if (!slot) return;
  slot.classList.remove(className);
  void slot.offsetWidth;
  slot.classList.add(className);
  setTimeout(() => slot.classList.remove(className), 540);
}

function cardSummary(card) {
  const hp = card.currentHp ?? card.hp;
  return `<strong>${card.name}</strong><br>Coût ${card.cost} · ${card.attack}/${card.defense} · PV ${Math.max(0, hp)}<br><small>${card.ability.name}</small>`;
}

function renderHand() {
  const container = document.getElementById("deckA");
  container.innerHTML = "";
  const tpl = document.getElementById("cardTemplate");

  state.playerHand.forEach((card, index) => {
    const fragment = tpl.content.cloneNode(true);
    const node = fragment.querySelector(".card-3d");
    node.dataset.cardId = card.id;
    node.style.setProperty("--rotate", `${(index - Math.floor(state.playerHand.length / 2)) * 4}deg`);

    fragment.querySelector(".card-name").textContent = card.name;
    fragment.querySelector(".card-class").textContent = card.className;
    fragment.querySelector(".card-ability").textContent = `${card.ability.name} — ${card.ability.text}`;
    fragment.querySelector(".cost").textContent = card.cost;
    fragment.querySelector(".atk").textContent = card.attack;
    fragment.querySelector(".def").textContent = card.defense;
    fragment.querySelector(".hp").textContent = card.currentHp ?? card.hp;

    if (state.selectedCardId === card.id) node.classList.add("is-selected");

    const select = () => {
      state.selectedCardId = card.id;
      render();
    };
    node.addEventListener("click", select);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });

    container.appendChild(fragment);
  });
}

function renderBoard(containerId, board, emptyText) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  for (let i = 0; i < MAX_BOARD; i++) {
    const slot = document.createElement("div");
    slot.className = "mini-slot";
    slot.dataset.lane = String(i);
    const card = board[i];
    slot.innerHTML = card ? cardSummary(card) : `<em>${emptyText}</em>`;
    container.appendChild(slot);
  }
}

function renderOpponentHand() {
  const container = document.getElementById("opponentHand");
  container.innerHTML = "";
  state.opponentHand.forEach(() => {
    const cardBack = document.createElement("div");
    cardBack.className = "back-mini";
    container.appendChild(cardBack);
  });
}

function renderImmersion() {
  document.getElementById("chapterLine").textContent = `Chronique ${state.turn}: ${state.playerHp > state.opponentHp ? "vous prenez l'avantage" : "la bataille reste incertaine"}.`;
  document.getElementById("ambianceText").textContent = atmospheres[state.turn % atmospheres.length];
  document.getElementById("phaseText").textContent = state.phase;
}

function render() {
  document.getElementById("playerHp").textContent = state.playerHp;
  document.getElementById("opponentHp").textContent = state.opponentHp;
  document.getElementById("playerMana").textContent = state.playerMana;
  document.getElementById("opponentMana").textContent = state.opponentMana;
  document.getElementById("turnCounter").textContent = state.turn;

  renderBoard("playerBoard", state.playerBoard, "Emplacement vide");
  renderBoard("opponentBoard", state.opponentBoard, "Emplacement vide");
  renderImmersion();
  renderHand();
  renderOpponentHand();
  document.getElementById("battleLog").textContent = state.logs.slice(-14).join("\n");
}

function queueDrawFx(count, sourceId, targetId) {
  for (let i = 0; i < count; i++) {
    enqueue(async () => {
      const source = document.getElementById(sourceId);
      const target = document.getElementById(targetId);
      await animateTravel(source, target);
    });
  }
}

function startGame() {
  Object.assign(state, {
    turn: 1,
    playerHp: 30,
    opponentHp: 30,
    playerMana: 1,
    opponentMana: 1,
    playerDeck: shuffle(baseDeckA),
    opponentDeck: shuffle(baseDeckB),
    playerHand: [],
    opponentHand: [],
    playerBoard: [],
    opponentBoard: [],
    selectedCardId: null,
    phase: phases[0],
    phaseIndex: 0,
    logs: [
      "Nouvelle partie lancée.",
      "Règle active: plateau split-screen (haut: adversaire, bas: joueur).",
      `Phase actuelle: ${phases[0]}`
    ]
  });

  const p = draw(state.playerHand, state.playerDeck, 5).length;
  const o = draw(state.opponentHand, state.opponentDeck, 5).length;
  render();
  queueDrawFx(p, "playerDeckPile", "deckA");
  queueDrawFx(o, "opponentDeckPile", "opponentHand");
}

function playSelectedCard() {
  if (state.phaseIndex !== 1) return state.logs.push("Vous pouvez ajouter un combattant uniquement durant la phase 2.") || render();
  if (state.playerBoard.length >= MAX_BOARD) return state.logs.push("Votre table est pleine (5 combattants max).") || render();

  const card = state.playerHand.find((c) => c.id === state.selectedCardId);
  if (!card) return state.logs.push("Sélectionnez d'abord une carte.") || render();
  if (card.cost > state.playerMana) return state.logs.push(`Mana insuffisant (${card.cost} requis).`) || render();

  const handCardEl = document.querySelector(`.card-3d[data-card-id="${card.id}"]`);
  handCardEl?.classList.add("is-committing");

  state.playerMana -= card.cost;
  state.playerBoard.push({ ...card, currentHp: card.hp });
  state.playerHand = state.playerHand.filter((c) => c.id !== card.id);
  state.selectedCardId = null;
  state.logs.push(`Vous placez ${card.name} sur votre table.`);
  render();

  enqueue(async () => {
    const targetSlot = document.querySelector(`#playerBoard .mini-slot[data-lane="${state.playerBoard.length - 1}"]`);
    await animateTravel(document.getElementById("deckA"), targetSlot);
    pulseSlot(targetSlot, "is-boosted");
  });
}

function opponentPlay() {
  if (state.opponentBoard.length >= MAX_BOARD) return;
  const playable = state.opponentHand.filter((c) => c.cost <= state.opponentMana);
  if (!playable.length) {
    state.logs.push("L'adversaire ne peut pas ajouter de combattant cette manche.");
    return;
  }
  playable.sort((a, b) => b.cost - a.cost);
  const card = playable[0];
  state.opponentMana -= card.cost;
  state.opponentBoard.push({ ...card, currentHp: card.hp });
  state.opponentHand = state.opponentHand.filter((c) => c.id !== card.id);
  state.logs.push(`L'adversaire place ${card.name} sur sa table.`);

  enqueue(async () => {
    render();
    const lane = state.opponentBoard.length - 1;
    const targetSlot = document.querySelector(`#opponentBoard .mini-slot[data-lane="${lane}"]`);
    await animateTravel(document.getElementById("opponentHand"), targetSlot);
    pulseSlot(targetSlot, "is-boosted");
  });
}

async function triggerBoostAnimations() {
  const playerTargets = [...document.querySelectorAll("#playerBoard .mini-slot")].slice(0, state.playerBoard.length);
  const opponentTargets = [...document.querySelectorAll("#opponentBoard .mini-slot")].slice(0, state.opponentBoard.length);
  [...playerTargets, ...opponentTargets].forEach((slot) => pulseSlot(slot, "is-boosted"));
  state.logs.push("Phase 3: les auras de boost s'activent sur toutes les créatures en jeu.");
  await sleep(430);
}

async function resolveCombat() {
  const lanes = Math.max(state.playerBoard.length, state.opponentBoard.length);

  for (let i = 0; i < lanes; i++) {
    const ally = state.playerBoard[i];
    const enemy = state.opponentBoard[i];
    const allySlot = document.querySelector(`#playerBoard .mini-slot[data-lane="${i}"]`);
    const enemySlot = document.querySelector(`#opponentBoard .mini-slot[data-lane="${i}"]`);

    if (ally && enemy) {
      pulseSlot(allySlot, "is-attacking");
      await animateTravel(allySlot, enemySlot, "fx-burst");
      pulseSlot(enemySlot, "is-damaged");

      const result = duel(ally, enemy);
      ally.currentHp = result.aHp;
      enemy.currentHp = result.bHp;
      state.logs.push(`Ligne ${i + 1}: ${ally.name} (${Math.max(0, result.aHp)} PV) vs ${enemy.name} (${Math.max(0, result.bHp)} PV).`);
      await sleep(160);
    } else if (ally && !enemy) {
      pulseSlot(allySlot, "is-attacking");
      await animateTravel(allySlot, document.getElementById("opponentHp"), "fx-burst");
      const dmg = Math.max(1, Math.floor(ally.attack / 2));
      state.opponentHp -= dmg;
      state.logs.push(`Ligne ${i + 1}: ${ally.name} attaque le héros adverse (${dmg} dégâts).`);
    } else if (!ally && enemy) {
      pulseSlot(enemySlot, "is-attacking");
      await animateTravel(enemySlot, document.getElementById("playerHp"), "fx-burst");
      const dmg = Math.max(1, Math.floor(enemy.attack / 2));
      state.playerHp -= dmg;
      state.logs.push(`Ligne ${i + 1}: ${enemy.name} attaque votre héros (${dmg} dégâts).`);
    }
    render();
  }

  state.playerBoard = state.playerBoard.filter((c) => (c.currentHp ?? c.hp) > 0);
  state.opponentBoard = state.opponentBoard.filter((c) => (c.currentHp ?? c.hp) > 0);
}

function beginNewTurn() {
  state.turn += 1;
  state.playerMana = Math.min(10, state.turn);
  state.opponentMana = Math.min(10, state.turn);
  const p = draw(state.playerHand, state.playerDeck, 1).length;
  const o = draw(state.opponentHand, state.opponentDeck, 1).length;

  state.phaseIndex = 0;
  state.phase = phases[state.phaseIndex];
  state.logs.push(`--- Tour ${state.turn}: changement de joueur, reprise des 5 phases. ---`);
  state.logs.push("Phase 1: début du tour, pioche d'une carte.");
  document.getElementById("battleResult").textContent = `Tour ${state.turn} — ${state.phase}`;
  render();
  queueDrawFx(p, "playerDeckPile", "deckA");
  queueDrawFx(o, "opponentDeckPile", "opponentHand");
}

function checkGameOver() {
  if (state.playerHp <= 0 || state.opponentHp <= 0) {
    const message = state.playerHp <= 0 ? "Défaite. L'adversaire l'emporte." : "Victoire ! Vous remportez la partie.";
    document.getElementById("battleResult").textContent = message;
    state.logs.push(message);
    render();
    return true;
  }
  return false;
}

async function nextPhase() {
  if (checkGameOver()) return;

  if (state.phaseIndex === 1) opponentPlay();
  if (state.phaseIndex === 2) await triggerBoostAnimations();

  if (state.phaseIndex === 3) {
    await resolveCombat();
    if (checkGameOver()) return;
  }

  if (state.phaseIndex === 4) {
    state.logs.push("Phase 5: fenêtre de soins et sorts alliés (effet de soutien visuel). ");
    const first = document.querySelector("#playerBoard .mini-slot[data-lane='0']");
    pulseSlot(first, "is-boosted");
    await sleep(220);
    beginNewTurn();
    return;
  }

  state.phaseIndex += 1;
  state.phase = phases[state.phaseIndex];
  state.logs.push(`Passage à la ${state.phase}.`);
  document.getElementById("battleResult").textContent = `Tour ${state.turn} — ${state.phase}`;
  render();
}

document.getElementById("dealBtn").addEventListener("click", startGame);
document.getElementById("playBtn").addEventListener("click", playSelectedCard);
document.getElementById("fightBtn").addEventListener("click", () => enqueue(nextPhase));

startGame();
