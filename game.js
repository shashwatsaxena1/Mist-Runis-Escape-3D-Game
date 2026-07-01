const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const healthBar = document.getElementById("healthBar");
const fearBar = document.getElementById("fearBar");
const torchBar = document.getElementById("torchBar");
const symbolCounter = document.getElementById("symbolCounter");
const overlay = document.getElementById("screenOverlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const primaryButton = document.getElementById("primaryButton");
const mobileTorch = document.getElementById("mobileTorch");

const TILE = 40;
const MAP = [
  "########################",
  "#P....#.......#....S...#",
  "#.##..#.#####.#.####...#",
  "#......S....#.#....#...#",
  "####.#####..#...##.#...#",
  "#....#......#####..#...#",
  "#.##.#.####.....#..S...#",
  "#.#..#....#.###.#.##...#",
  "#.#.####..#...#.#......#",
  "#.#....#..###.#.#####..#",
  "#.####.#S.....#.....#..#",
  "#......####.#######.#..#",
  "#.######....#.....#.#..#",
  "#....S...##...###...E..#",
  "#.......M.#............#",
  "########################",
];

const WORLD_WIDTH = MAP[0].length * TILE;
const WORLD_HEIGHT = MAP.length * TILE;
const TOTAL_SYMBOLS = MAP.join("").split("S").length - 1;

let player;
let mist;
let symbols;
let exitGate;
let particles;
let floatingTexts;
let gameState = "intro";
let keys = {};
let torchOn = true;
let lastTime = 0;
let audioStarted = false;
let audioContext;
let humOscillator;
let humGain;
let messageTimer = 0;
let storyMessage = "Find the Natural Energy symbols.";

function parseMap() {
  symbols = [];
  particles = [];
  floatingTexts = [];
  exitGate = null;

  for (let row = 0; row < MAP.length; row++) {
    for (let col = 0; col < MAP[row].length; col++) {
      const tile = MAP[row][col];
      const x = col * TILE + TILE / 2;
      const y = row * TILE + TILE / 2;

      if (tile === "P") {
        player = {
          x,
          y,
          radius: 13,
          speed: 158,
          health: 100,
          fear: 0,
          torch: 100,
          symbols: 0,
          invincible: 0,
          pulse: 0,
        };
      }

      if (tile === "M") {
        mist = {
          x,
          y,
          radius: 17,
          speed: 74,
          baseSpeed: 74,
          drift: 0,
        };
      }

      if (tile === "S") {
        symbols.push({ x, y, radius: 12, collected: false, phase: Math.random() * Math.PI * 2 });
      }

      if (tile === "E") {
        exitGate = { x, y, radius: 20 };
      }
    }
  }

  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * WORLD_WIDTH,
      y: Math.random() * WORLD_HEIGHT,
      vx: -10 + Math.random() * 20,
      vy: -4 + Math.random() * 8,
      size: 16 + Math.random() * 50,
      alpha: 0.04 + Math.random() * 0.11,
    });
  }
}

function resetGame() {
  parseMap();
  torchOn = true;
  gameState = "playing";
  storyMessage = "Find the Natural Energy symbols.";
  messageTimer = 3;
  lastTime = performance.now();
  overlay.classList.remove("show");
  updateHud();
  startAudio();
  requestAnimationFrame(loop);
}

function startAudio() {
  if (audioStarted) return;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    humOscillator = audioContext.createOscillator();
    humGain = audioContext.createGain();
    humOscillator.type = "sine";
    humOscillator.frequency.value = 58;
    humGain.gain.value = 0.025;
    humOscillator.connect(humGain);
    humGain.connect(audioContext.destination);
    humOscillator.start();
    audioStarted = true;
  } catch (error) {
    audioStarted = false;
  }
}

function playPulse(frequency = 260, duration = 0.09, volume = 0.045) {
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = frequency;
  gain.gain.value = volume;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.stop(audioContext.currentTime + duration + 0.02);
}

function isWallTile(col, row) {
  if (row < 0 || row >= MAP.length || col < 0 || col >= MAP[0].length) return true;
  return MAP[row][col] === "#";
}

function isBlocked(x, y, radius) {
  const points = [
    [x - radius, y - radius],
    [x + radius, y - radius],
    [x - radius, y + radius],
    [x + radius, y + radius],
    [x, y - radius],
    [x, y + radius],
    [x - radius, y],
    [x + radius, y],
  ];

  return points.some(([px, py]) => isWallTile(Math.floor(px / TILE), Math.floor(py / TILE)));
}

function moveEntity(entity, dx, dy) {
  if (dx !== 0) {
    const nextX = entity.x + dx;
    if (!isBlocked(nextX, entity.y, entity.radius)) entity.x = nextX;
  }
  if (dy !== 0) {
    const nextY = entity.y + dy;
    if (!isBlocked(entity.x, nextY, entity.radius)) entity.y = nextY;
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function update(delta) {
  if (gameState !== "playing") return;

  updatePlayer(delta);
  updateMist(delta);
  updateParticles(delta);
  updateSymbols(delta);
  updateExit();
  updateFear(delta);
  updateFloatingTexts(delta);

  if (messageTimer > 0) messageTimer -= delta;

  if (player.health <= 0) {
    endGame(false, "The mist has caught the Watcher.");
  }

  updateHud();
}

function updatePlayer(delta) {
  let dx = 0;
  let dy = 0;

  if (keys["arrowup"] || keys["w"]) dy -= 1;
  if (keys["arrowdown"] || keys["s"]) dy += 1;
  if (keys["arrowleft"] || keys["a"]) dx -= 1;
  if (keys["arrowright"] || keys["d"]) dx += 1;

  const moving = dx !== 0 || dy !== 0;
  if (moving) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
  }

  const fearSlowdown = 1 - player.fear / 1000;
  const speed = player.speed * fearSlowdown;
  moveEntity(player, dx * speed * delta, dy * speed * delta);

  player.pulse += delta * 5;

  if (torchOn && player.torch > 0) {
    player.torch = clamp(player.torch - 7.5 * delta, 0, 100);
    if (player.torch <= 0) {
      torchOn = false;
      showMessage("The torch dies down. Stay away from the mist.", 3);
    }
  } else if (!torchOn) {
    player.torch = clamp(player.torch + 3.8 * delta, 0, 100);
  }

  if (player.invincible > 0) player.invincible -= delta;
}

function updateMist(delta) {
  const collected = player.symbols;
  mist.speed = mist.baseSpeed + collected * 9 + player.fear * 0.18;
  mist.drift += delta;

  const dx = player.x - mist.x;
  const dy = player.y - mist.y;
  const length = Math.hypot(dx, dy) || 1;

  const wobbleX = Math.cos(mist.drift * 2.7) * 0.35;
  const wobbleY = Math.sin(mist.drift * 2.1) * 0.35;
  moveEntity(mist, (dx / length + wobbleX) * mist.speed * delta, (dy / length + wobbleY) * mist.speed * delta);

  const d = distance(player, mist);
  if (d < player.radius + mist.radius + 4 && player.invincible <= 0) {
    player.health -= 14;
    player.fear = clamp(player.fear + 18, 0, 100);
    player.invincible = 0.8;
    showFloatingText("-14", player.x, player.y - 24, "danger");
    showMessage("The living mist cuts through Yash.", 1.7);
    playPulse(90, 0.2, 0.06);

    const safeDistance = d || 1;
    const pushX = (player.x - mist.x) / safeDistance;
    const pushY = (player.y - mist.y) / safeDistance;
    moveEntity(player, pushX * 32, pushY * 32);
  }
}

function updateParticles(delta) {
  for (const particle of particles) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;

    if (particle.x < -80) particle.x = WORLD_WIDTH + 80;
    if (particle.x > WORLD_WIDTH + 80) particle.x = -80;
    if (particle.y < -80) particle.y = WORLD_HEIGHT + 80;
    if (particle.y > WORLD_HEIGHT + 80) particle.y = -80;
  }
}

function updateSymbols(delta) {
  for (const symbol of symbols) {
    if (symbol.collected) continue;
    symbol.phase += delta * 4;
    if (distance(player, symbol) < player.radius + symbol.radius + 8) {
      symbol.collected = true;
      player.symbols += 1;
      player.fear = clamp(player.fear - 9, 0, 100);
      player.health = clamp(player.health + 5, 0, 100);
      showFloatingText("+ Symbol", symbol.x, symbol.y - 24, "energy");
      playPulse(420 + player.symbols * 50, 0.12, 0.05);

      if (player.symbols === TOTAL_SYMBOLS) {
        showMessage("The broken exit is open. Run.", 4);
        playPulse(740, 0.25, 0.05);
      } else {
        showMessage(`Natural Energy awakened: ${player.symbols}/${TOTAL_SYMBOLS}`, 2.3);
      }
    }
  }
}

function updateExit() {
  const open = player.symbols >= TOTAL_SYMBOLS;
  if (open && distance(player, exitGate) < player.radius + exitGate.radius) {
    endGame(true, "Yash bursts out of the ruins. The mist collapses behind him.");
  }
}

function updateFear(delta) {
  const d = distance(player, mist);
  const danger = clamp((220 - d) / 220, 0, 1);
  const torchProtection = torchOn && player.torch > 0 ? 0.7 : 1.35;
  const stillness = isPlayerMoving() ? -4 : 1.2;
  player.fear += (danger * 24 * torchProtection + stillness) * delta;

  if (torchOn && player.torch > 0) player.fear -= 3.5 * delta;
  player.fear = clamp(player.fear, 0, 100);
}

function isPlayerMoving() {
  return keys["arrowup"] || keys["w"] || keys["arrowdown"] || keys["s"] || keys["arrowleft"] || keys["a"] || keys["arrowright"] || keys["d"];
}

function showMessage(text, seconds = 2.5) {
  storyMessage = text;
  messageTimer = seconds;
}

function showFloatingText(text, x, y, type) {
  floatingTexts.push({ text, x, y, type, life: 1 });
}

function updateFloatingTexts(delta) {
  floatingTexts = floatingTexts.filter((item) => {
    item.y -= 24 * delta;
    item.life -= delta;
    return item.life > 0;
  });
}

function endGame(won, text) {
  gameState = won ? "won" : "lost";
  overlayTitle.textContent = won ? "Escaped" : "Game Over";
  overlayText.textContent = won ? `${text} “I told you... I'd come back.”` : text;
  primaryButton.textContent = won ? "Play Again" : "Restart";
  overlay.classList.add("show");
  playPulse(won ? 620 : 120, won ? 0.3 : 0.35, 0.07);
}

function updateHud() {
  healthBar.style.width = `${clamp(player?.health || 100, 0, 100)}%`;
  fearBar.style.width = `${clamp(player?.fear || 0, 0, 100)}%`;
  torchBar.style.width = `${clamp(player?.torch || 100, 0, 100)}%`;
  symbolCounter.textContent = `Symbols ${player?.symbols || 0}/${TOTAL_SYMBOLS}`;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawMap();
  drawSymbols();
  drawExit();
  drawMist();
  drawPlayer();
  drawParticles();
  drawDarkness();
  drawFloatingTexts();
  drawStoryMessage();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  gradient.addColorStop(0, "#050607");
  gradient.addColorStop(0.52, "#0b1014");
  gradient.addColorStop(1, "#030404");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawMap() {
  for (let row = 0; row < MAP.length; row++) {
    for (let col = 0; col < MAP[row].length; col++) {
      const tile = MAP[row][col];
      const x = col * TILE;
      const y = row * TILE;

      if (tile === "#") {
        ctx.fillStyle = "#15191d";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(x + 2, y + 2, TILE - 4, 2);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x + 3, y + TILE - 5, TILE - 6, 3);
      } else {
        ctx.fillStyle = ((row + col) % 2 === 0) ? "#080b0d" : "#090d10";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = "rgba(255,255,255,0.025)";
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      }

      if (tile !== "#" && Math.random() < 0.002) {
        ctx.fillStyle = "rgba(154,247,255,0.08)";
        ctx.fillRect(x + Math.random() * TILE, y + Math.random() * TILE, 2, 2);
      }
    }
  }
}

function drawSymbols() {
  for (const symbol of symbols) {
    if (symbol.collected) continue;
    const glow = 10 + Math.sin(symbol.phase) * 4;
    ctx.save();
    ctx.shadowColor = "rgba(154, 247, 255, 0.95)";
    ctx.shadowBlur = 18 + glow;
    ctx.strokeStyle = "#a9fbff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(symbol.x, symbol.y, symbol.radius + Math.sin(symbol.phase) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(symbol.x, symbol.y - 11);
    ctx.lineTo(symbol.x + 10, symbol.y + 8);
    ctx.lineTo(symbol.x - 10, symbol.y + 8);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

function drawExit() {
  const open = player.symbols >= TOTAL_SYMBOLS;
  ctx.save();
  ctx.translate(exitGate.x, exitGate.y);
  ctx.shadowColor = open ? "rgba(154,247,255,0.9)" : "rgba(255,74,74,0.55)";
  ctx.shadowBlur = open ? 26 : 10;
  ctx.strokeStyle = open ? "#a6fbff" : "#792727";
  ctx.lineWidth = 5;
  ctx.strokeRect(-16, -20, 32, 40);
  ctx.fillStyle = open ? "rgba(154,247,255,0.16)" : "rgba(255,74,74,0.08)";
  ctx.fillRect(-13, -17, 26, 34);
  ctx.restore();
}

function drawMist() {
  const pulse = 1 + Math.sin(performance.now() / 150) * 0.08;
  ctx.save();
  ctx.translate(mist.x, mist.y);
  ctx.shadowColor = "rgba(230, 230, 230, 0.8)";
  ctx.shadowBlur = 28;
  const gradient = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
  gradient.addColorStop(0, "rgba(235,235,235,0.8)");
  gradient.addColorStop(0.28, "rgba(150,150,150,0.35)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, 32 * pulse, 42 / pulse, Math.sin(performance.now() / 450) * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.arc(-7, -5, 3, 0, Math.PI * 2);
  ctx.arc(8, -5, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);

  if (player.invincible > 0 && Math.floor(performance.now() / 80) % 2 === 0) {
    ctx.globalAlpha = 0.5;
  }

  ctx.shadowColor = "rgba(154,247,255,0.55)";
  ctx.shadowBlur = player.symbols > 0 ? 14 + player.symbols * 2 : 6;
  ctx.fillStyle = "#dce6ea";
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111417";
  ctx.beginPath();
  ctx.arc(-4, -2, 2, 0, Math.PI * 2);
  ctx.arc(5, -2, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#9af7ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(7, 9, 5 + Math.sin(player.pulse) * 1.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const particle of particles) {
    ctx.fillStyle = `rgba(210,220,225,${particle.alpha})`;
    ctx.beginPath();
    ctx.ellipse(particle.x, particle.y, particle.size, particle.size * 0.28, Math.sin(particle.x * 0.02), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDarkness() {
  const radius = torchOn && player.torch > 0 ? 185 + player.torch * 0.85 : 105;
  const fearOpacity = player.fear / 100 * 0.28;

  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.83 + fearOpacity})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = "destination-out";
  const light = ctx.createRadialGradient(player.x, player.y, 18, player.x, player.y, radius);
  light.addColorStop(0, "rgba(0,0,0,0.95)");
  light.addColorStop(0.55, "rgba(0,0,0,0.45)");
  light.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (player.fear > 65) {
    ctx.save();
    ctx.globalAlpha = (player.fear - 65) / 35 * 0.12;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 18; i++) {
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 2 + 1, Math.random() * 48 + 8);
    }
    ctx.restore();
  }
}

function drawFloatingTexts() {
  ctx.save();
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  for (const item of floatingTexts) {
    ctx.globalAlpha = item.life;
    ctx.fillStyle = item.type === "danger" ? "#ff6b6b" : "#9af7ff";
    ctx.fillText(item.text, item.x, item.y);
  }
  ctx.restore();
}

function drawStoryMessage() {
  if (messageTimer <= 0) return;

  ctx.save();
  ctx.globalAlpha = clamp(messageTimer, 0, 1);
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(220, 20, 520, 48);
  ctx.strokeStyle = "rgba(154,247,255,0.22)";
  ctx.strokeRect(220.5, 20.5, 519, 47);
  ctx.fillStyle = "#eafcff";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(storyMessage, canvas.width / 2, 51);
  ctx.restore();
}

function loop(time) {
  const delta = Math.min((time - lastTime) / 1000, 0.033);
  lastTime = time;

  update(delta);
  draw();

  if (gameState === "playing") requestAnimationFrame(loop);
}

function toggleTorch() {
  if (gameState !== "playing") return;
  if (!torchOn && player.torch < 8) {
    showMessage("The torch needs a moment to recover.", 1.5);
    return;
  }
  torchOn = !torchOn;
  showMessage(torchOn ? "Torch raised." : "Torch lowered. Battery recovers slowly.", 1.4);
  playPulse(torchOn ? 340 : 170, 0.08, 0.03);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  keys[key] = true;

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
    event.preventDefault();
  }

  if (key === "f") toggleTorch();
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});

primaryButton.addEventListener("click", resetGame);
mobileTorch.addEventListener("click", toggleTorch);

document.querySelectorAll(".mobile-controls button[data-key]").forEach((button) => {
  const key = button.dataset.key.toLowerCase();
  const press = (event) => {
    event.preventDefault();
    keys[key] = true;
  };
  const release = (event) => {
    event.preventDefault();
    keys[key] = false;
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("pointercancel", release);
});

parseMap();
updateHud();
draw();
