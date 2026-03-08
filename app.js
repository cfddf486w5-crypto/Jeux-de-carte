const classes = ["Guerrier", "Mage", "Rôdeur", "Paladin", "Assassin", "Invocateur"];

const abilities = [
  { name: "Frappe Brutale", text: "+35% dégâts le 1er tour.", init: (s) => (s.burst = true), hit: (s, raw, turn) => turn === 1 && s.burst ? raw * 1.35 : raw },
  { name: "Armure Étoilée", text: "Réduit les dégâts subis de 3.", defend: (s, dmg) => Math.max(1, dmg - 3) },
  { name: "Drain Vital", text: "Récupère 25% des dégâts infligés.", afterHit: (s, dealt) => (s.hp += Math.floor(dealt * 0.25)) },
  { name: "Danse-Lame", text: "30% de chance de frapper deux fois.", extraHitChance: 0.3 },
  { name: "Miroir Arcanique", text: "Renvoie 2 dégâts à chaque attaque reçue.", onDamaged: (attacker) => (attacker.hp -= 2) },
  { name: "Concentration", text: "Le critique passe de 10% à 25%.", critChance: 0.25 },
  { name: "Lame Venimeuse", text: "Ajoute 2 dégâts fixes.", bonusDamage: 2 },
  { name: "Bouclier Sacré", text: "Ignorer complètement la 1re attaque reçue.", init: (s) => (s.blockOnce = true), defend: (s, dmg) => {
    if (s.blockOnce) {
      s.blockOnce = false;
      return 0;
    }
    return dmg;
  }},
  { name: "Charge Solaire", text: "Gagne +1 attaque à chaque tour.", turnStart: (s) => (s.scalingAtk += 1) },
  { name: "Ombre Vive", text: "Esquive 20% des coups.", evadeChance: 0.2 }
];

function createDeck(prefix, themes, offset) {
  const deck = [];
  for (let i = 0; i < 60; i++) {
    const className = classes[i % classes.length];
    const ability = abilities[(i + offset) % abilities.length];
    const theme = themes[i % themes.length];
    const rank = Math.floor(i / themes.length) + 1;
    deck.push({
      id: `${prefix}-${i + 1}`,
      name: `${theme} ${rank}`,
      className,
      attack: 7 + ((i * 3 + offset) % 8),
      defense: 4 + ((i * 5 + offset) % 7),
      hp: 28 + ((i * 7 + offset) % 18),
      speed: 3 + ((i * 2 + offset) % 8),
      ability
    });
  }
  return deck;
}

const deckA = createDeck("SOL", ["Aurogard", "Lumina", "Helion", "Solaria", "Astreon", "Pyrelis", "Orionel", "Clareon", "Valkor", "Zenith", "Dawnis", "Rubion"], 1);
const deckB = createDeck("OMB", ["Nocthar", "Umbrys", "Néantor", "Morbane", "Velkar", "Shadriel", "Sépulor", "Duskhan", "Obscuron", "Vesper", "Nyxor", "Drakmor"], 5);

function renderDeck(targetId, deck) {
  const container = document.getElementById(targetId);
  const tpl = document.getElementById("cardTemplate");
  deck.forEach((card) => {
    const fragment = tpl.content.cloneNode(true);
    fragment.querySelector(".card-name").textContent = `${card.name}`;
    fragment.querySelector(".card-class").textContent = card.className;
    fragment.querySelector(".card-ability").textContent = `${card.ability.name} — ${card.ability.text}`;
    fragment.querySelector(".atk").textContent = card.attack;
    fragment.querySelector(".def").textContent = card.defense;
    fragment.querySelector(".hp").textContent = card.hp;
    fragment.querySelector(".spd").textContent = card.speed;
    container.appendChild(fragment);
  });
}

function toState(card) {
  const state = {
    name: card.name,
    atk: card.attack,
    def: card.defense,
    hp: card.hp,
    spd: card.speed,
    ability: card.ability,
    scalingAtk: 0,
    burst: false,
    blockOnce: false
  };
  card.ability.init?.(state);
  return state;
}

function performHit(attacker, defender, turn, logs) {
  if (Math.random() < (defender.ability.evadeChance || 0)) {
    logs.push(`${defender.name} esquive l'attaque de ${attacker.name}.`);
    return;
  }

  let raw = attacker.atk + attacker.scalingAtk - Math.floor(defender.def / 2) + (attacker.ability.bonusDamage || 0);
  raw = Math.max(1, raw);
  if (attacker.ability.hit) raw = Math.round(attacker.ability.hit(attacker, raw, turn));

  const critChance = attacker.ability.critChance || 0.1;
  if (Math.random() < critChance) {
    raw = Math.round(raw * 1.5);
    logs.push(`💥 Coup critique de ${attacker.name} !`);
  }

  let dealt = defender.ability.defend ? defender.ability.defend(defender, raw) : raw;
  dealt = Math.max(0, dealt);
  defender.hp -= dealt;
  logs.push(`${attacker.name} inflige ${dealt} dégâts à ${defender.name}.`);

  attacker.ability.afterHit?.(attacker, dealt);
  defender.ability.onDamaged?.(attacker);

  if (Math.random() < (attacker.ability.extraHitChance || 0) && defender.hp > 0) {
    logs.push(`⚔️ ${attacker.name} enchaîne une seconde attaque !`);
    defender.hp -= Math.max(1, Math.floor((attacker.atk - defender.def / 2) * 0.7));
  }
}

function battle(cardA, cardB) {
  const a = toState(cardA);
  const b = toState(cardB);
  const logs = [`Début du duel : ${a.name} vs ${b.name}`];

  for (let turn = 1; turn <= 20; turn++) {
    a.ability.turnStart?.(a);
    b.ability.turnStart?.(b);

    logs.push(`\n— Tour ${turn} —`);
    const first = a.spd >= b.spd ? [a, b] : [b, a];

    performHit(first[0], first[1], turn, logs);
    if (first[1].hp <= 0) break;

    performHit(first[1], first[0], turn, logs);
    if (first[0].hp <= 0) break;
  }

  const winner = a.hp === b.hp ? null : a.hp > b.hp ? a : b;
  return {
    winner: winner ? `${winner.name} gagne le combat !` : "Égalité parfaite !",
    logs
  };
}

renderDeck("deckA", deckA);
renderDeck("deckB", deckB);

function pickRandomHand(deck, size = 7) {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, size);
}

function simulateRound(deckMain, deckOpponent) {
  const mainHand = pickRandomHand(deckMain, 7);
  const opponentHand = pickRandomHand(deckOpponent, 7);

  const logs = [
    `Chaque joueur pioche 7 cartes aléatoires parmi son paquet de 60.`,
    `Main du joueur principal : ${mainHand.map((card) => card.name).join(", ")}.`,
    `Main de l'opposant : ${opponentHand.map((card) => card.name).join(", ")}.`,
    "",
    "Début de la table de combat :",
    `- Le joueur principal pose ${mainHand[0].name}.`,
    `- L'opposant répond avec ${opponentHand[0].name}.`
  ];

  const maxTurns = Math.min(mainHand.length, opponentHand.length);

  for (let turn = 1; turn <= maxTurns; turn++) {
    const mainCard = mainHand[turn - 1];
    const opponentCard = opponentHand[turn - 1];
    logs.push(`\nTour ${turn}`);

    if (turn > 1) {
      logs.push(`- Le joueur principal pose ${mainCard.name}.`);
      logs.push(`- L'opposant pose ${opponentCard.name}.`);
    }

    if (Math.random() < 0.7) {
      const result = battle(mainCard, opponentCard);
      logs.push(`- Fin de tour (joueur principal) : attaque déclarée avec ${mainCard.name}.`);
      logs.push(`  ${result.winner}`);
    } else {
      logs.push("- Fin de tour (joueur principal) : il choisit de ne pas attaquer.");
    }

    if (Math.random() < 0.7) {
      const result = battle(opponentCard, mainCard);
      logs.push(`- Fin de tour (opposant) : attaque déclarée avec ${opponentCard.name}.`);
      logs.push(`  ${result.winner}`);
    } else {
      logs.push("- Fin de tour (opposant) : il choisit de ne pas attaquer.");
    }
  }

  return {
    summary: "Manche simulée : pioche aléatoire, pose alternée, puis choix d'attaque en fin de tour.",
    logs
  };
}

document.getElementById("fightBtn").addEventListener("click", () => {
  const result = simulateRound(deckA, deckB);
  document.getElementById("battleResult").textContent = result.summary;
  document.getElementById("battleLog").textContent = result.logs.join("\n");
});
