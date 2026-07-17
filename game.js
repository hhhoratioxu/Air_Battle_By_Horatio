"use strict";

(() => {
  const canvas = document.getElementById("gameCanvas");
  const frame = document.getElementById("canvasFrame");
  const ctx = canvas.getContext("2d", { alpha: false });

  const ui = {
    score: document.getElementById("scoreValue"),
    best: document.getElementById("bestValue"),
    wave: document.getElementById("waveValue"),
    healthBar: document.getElementById("healthBar"),
    healthLabel: document.getElementById("healthLabel"),
    shieldBar: document.getElementById("shieldBar"),
    shieldLabel: document.getElementById("shieldLabel"),
    combo: document.getElementById("comboValue"),
    rank: document.getElementById("rankValue"),
    weaponPips: [...document.querySelectorAll("#weaponPips i")],
    bombCount: document.getElementById("bombCount"),
    bombButton: document.getElementById("bombButton"),
    pauseButton: document.getElementById("pauseButton"),
    soundButton: document.getElementById("soundButton"),
    fps: document.getElementById("fpsValue"),
    screen: document.getElementById("gameScreen"),
    screenEyebrow: document.getElementById("screenEyebrow"),
    screenTitle: document.getElementById("screenTitle"),
    screenText: document.getElementById("screenText"),
    screenHint: document.getElementById("screenHint"),
    startButton: document.getElementById("startButton"),
    startButtonText: document.getElementById("startButtonText"),
    pauseBadge: document.getElementById("pauseBadge"),
    bossHud: document.getElementById("bossHud"),
    bossBar: document.getElementById("bossHealthBar"),
    bossLabel: document.getElementById("bossHealthLabel"),
    flash: document.getElementById("flashLayer"),
  };

  const HEIGHT = 720;
  const TAU = Math.PI * 2;
  const keys = new Set();
  const pointer = { active: false, x: 0, y: 0 };
  const ranks = ["ROOKIE", "ACE", "ELITE", "LEGEND"];
  const powerColors = {
    rapid: "#ffd166",
    spread: "#ff71bc",
    shield: "#62e5ff",
    repair: "#66ffc2",
    bomb: "#b58cff",
  };

  let width = 480;
  let pixelRatio = 1;
  let state = "menu";
  let player = null;
  let score = 0;
  let bestScore = loadBestScore();
  let wave = 1;
  let bombs = 2;
  let comboKills = 0;
  let comboTimer = 0;
  let spawnTimer = 0;
  let waveDelay = 0;
  let waveSpawned = 0;
  let waveDestroyed = 0;
  let bossSpawned = false;
  let waveMessage = 0;
  let shake = 0;
  let gameTime = 0;
  let lastTime = performance.now();
  let lastHudUpdate = 0;
  let fpsElapsed = 0;
  let fpsFrames = 0;
  let soundEnabled = loadSoundPreference();
  let audioContext = null;

  const stars = [];
  const bullets = [];
  const enemyBullets = [];
  const enemies = [];
  const particles = [];
  const powerUps = [];
  const floaters = [];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function padScore(value) {
    return Math.floor(value).toString().padStart(6, "0");
  }

  function loadBestScore() {
    try {
      return Number.parseInt(localStorage.getItem("neon-strike-best") || "0", 10) || 0;
    } catch {
      return 0;
    }
  }

  function saveBestScore() {
    try {
      localStorage.setItem("neon-strike-best", String(bestScore));
    } catch {
      // The game still works when storage is blocked.
    }
  }

  function loadSoundPreference() {
    try {
      return localStorage.getItem("neon-strike-sound") !== "off";
    } catch {
      return true;
    }
  }

  function saveSoundPreference() {
    try {
      localStorage.setItem("neon-strike-sound", soundEnabled ? "on" : "off");
    } catch {
      // Ignore private-browsing storage errors.
    }
  }

  function configureCanvas() {
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const oldWidth = width;
    width = clamp((HEIGHT * rect.width) / rect.height, 420, 820);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * pixelRatio);
    canvas.height = Math.round(rect.height * pixelRatio);

    if (oldWidth && oldWidth !== width) {
      const scale = width / oldWidth;
      const collections = [stars, bullets, enemyBullets, enemies, particles, powerUps, floaters];
      for (const collection of collections) {
        for (const item of collection) item.x *= scale;
      }
      if (player) player.x *= scale;
    }
  }

  function setWorldTransform() {
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / HEIGHT, 0, 0);
  }

  function seedStars() {
    stars.length = 0;
    const count = Math.round(width * 0.18);
    for (let i = 0; i < count; i += 1) {
      const layer = Math.random();
      stars.push({
        x: Math.random() * width,
        y: Math.random() * HEIGHT,
        size: layer > 0.92 ? random(1.2, 2) : random(0.35, 1.15),
        speed: 10 + layer * 52,
        alpha: 0.18 + layer * 0.65,
        tint: Math.random() > 0.78 ? "#75dfff" : "#d7e7ff",
      });
    }
  }

  function resetGame() {
    bullets.length = 0;
    enemyBullets.length = 0;
    enemies.length = 0;
    particles.length = 0;
    powerUps.length = 0;
    floaters.length = 0;

    score = 0;
    wave = 1;
    bombs = 2;
    comboKills = 0;
    comboTimer = 0;
    spawnTimer = 0.75;
    waveDelay = 1.3;
    waveSpawned = 0;
    waveDestroyed = 0;
    bossSpawned = false;
    waveMessage = 2.2;
    shake = 0;
    gameTime = 0;

    player = {
      x: width / 2,
      y: HEIGHT - 92,
      radius: 16,
      speed: 355,
      health: 100,
      maxHealth: 100,
      shield: 0,
      fireTimer: 0,
      weaponLevel: 1,
      rapidTimer: 0,
      spreadTimer: 0,
      invulnerable: 1.25,
      tilt: 0,
    };

    state = "running";
    ui.screen.classList.add("hidden");
    ui.pauseBadge.hidden = true;
    ui.pauseButton.disabled = false;
    ui.bombButton.disabled = false;
    ui.bossHud.hidden = true;
    ui.pauseButton.querySelector("span").textContent = "暂停";
    ensureAudio();
    playTone(260, 0.08, "sine", 0.035, 430);
    updateHud(true);
    lastTime = performance.now();
  }

  function waveTarget() {
    return 7 + wave * 2;
  }

  function currentMultiplier() {
    return clamp(1 + Math.floor(comboKills / 5), 1, 8);
  }

  function advanceWave() {
    wave += 1;
    waveSpawned = 0;
    waveDestroyed = 0;
    bossSpawned = false;
    waveDelay = 2;
    spawnTimer = 0.6;
    waveMessage = 2.15;
    player.weaponLevel = clamp(1 + Math.floor((wave - 1) / 3), 1, 4);
    player.health = Math.min(player.maxHealth, player.health + 8);
    player.invulnerable = Math.max(player.invulnerable, 0.9);
    addFloater(width / 2, HEIGHT / 2 + 50, `WAVE ${String(wave).padStart(2, "0")}`, "#78eaff", 1.35, 18);
    playTone(360, 0.1, "triangle", 0.04, 720);
  }

  function spawnEnemy() {
    const roll = Math.random();
    let type = "scout";
    if (wave >= 2 && roll > 0.56) type = "dart";
    if (wave >= 3 && roll > 0.82) type = "tank";

    const configs = {
      scout: { radius: 15, hp: 1, speed: 94 + wave * 4, points: 100, color: "#ff657f" },
      dart: { radius: 18, hp: 2 + Math.floor(wave / 7), speed: 118 + wave * 3, points: 180, color: "#ff9a65" },
      tank: { radius: 24, hp: 5 + Math.floor(wave / 3), speed: 54 + wave * 2, points: 360, color: "#b675ff" },
    };
    const config = configs[type];
    const x = random(42, width - 42);

    enemies.push({
      type,
      x,
      originX: x,
      y: -45,
      radius: config.radius,
      hp: config.hp,
      maxHp: config.hp,
      speed: config.speed,
      points: config.points,
      color: config.color,
      age: random(0, 3),
      phase: random(0, TAU),
      shootTimer: random(0.8, 2.3),
      flash: 0,
    });
  }

  function spawnBoss() {
    const hp = 150 + wave * 38;
    enemies.push({
      type: "boss",
      x: width / 2,
      originX: width / 2,
      y: -100,
      radius: 63,
      hp,
      maxHp: hp,
      speed: 37,
      points: 5200 + wave * 200,
      color: "#ff5c9d",
      age: 0,
      phase: 0,
      shootTimer: 1.5,
      burstTimer: 3.4,
      flash: 0,
      entered: false,
    });
    bossSpawned = true;
    ui.bossHud.hidden = false;
    addFloater(width / 2, HEIGHT * 0.37, "⚠ BOSS INCOMING", "#ff718e", 2, 18);
    playTone(150, 0.38, "sawtooth", 0.05, 65);
  }

  function firePlayer() {
    if (!player) return;
    const level = player.weaponLevel;
    const shots = [];

    if (level === 1) shots.push({ x: 0, vx: 0 });
    if (level === 2) shots.push({ x: -7, vx: -16 }, { x: 7, vx: 16 });
    if (level === 3) shots.push({ x: -11, vx: -28 }, { x: 0, vx: 0 }, { x: 11, vx: 28 });
    if (level >= 4) {
      shots.push(
        { x: -16, vx: -55 },
        { x: -8, vx: -24 },
        { x: 0, vx: 0 },
        { x: 8, vx: 24 },
        { x: 16, vx: 55 },
      );
    }

    if (player.spreadTimer > 0) {
      shots.push({ x: -5, vx: -130 }, { x: 5, vx: 130 });
    }

    for (const shot of shots) {
      bullets.push({
        x: player.x + shot.x,
        y: player.y - 25,
        vx: shot.vx,
        vy: -590,
        radius: level >= 3 ? 2.8 : 2.4,
        damage: 1,
      });
    }

    player.fireTimer = player.rapidTimer > 0 ? 0.075 : Math.max(0.105, 0.19 - level * 0.014);
    if (Math.random() > 0.43) playTone(620, 0.025, "square", 0.009, 480);
  }

  function fireEnemy(enemy) {
    if (!player) return;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    const speed = enemy.type === "tank" ? 175 : 205;

    enemyBullets.push({
      x: enemy.x,
      y: enemy.y + enemy.radius * 0.72,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      radius: enemy.type === "tank" ? 5 : 3.8,
      damage: enemy.type === "tank" ? 18 : 12,
      color: enemy.type === "tank" ? "#bd7cff" : "#ff6c87",
    });
  }

  function fireBossFan(enemy) {
    const count = 9;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.PI * 0.18 + (Math.PI * 0.64 * i) / (count - 1);
      const speed = 155 + (i % 2) * 25;
      enemyBullets.push({
        x: enemy.x,
        y: enemy.y + 28,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 4.5,
        damage: 14,
        color: i % 2 ? "#ff70ad" : "#a877ff",
      });
    }
    playTone(185, 0.1, "sawtooth", 0.018, 110);
  }

  function fireBossBurst(enemy) {
    const count = 15;
    for (let i = 0; i < count; i += 1) {
      const angle = (TAU * i) / count + enemy.age * 0.6;
      const speed = 128;
      enemyBullets.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3.8,
        damage: 10,
        color: "#ff688e",
      });
    }
  }

  function update(delta) {
    updateStars(delta, state === "running" ? 1 : 0.28);
    updateParticles(delta);
    updateFloaters(delta);

    if (state !== "running") return;
    gameTime += delta;
    updatePlayer(delta);
    updateWave(delta);
    updateBullets(delta);
    updateEnemies(delta);
    updatePowerUps(delta);
    resolveCollisions();

    if (comboTimer > 0) {
      comboTimer -= delta;
      if (comboTimer <= 0) comboKills = 0;
    }
    if (waveMessage > 0) waveMessage -= delta;
    if (shake > 0) shake = Math.max(0, shake - delta * 20);
  }

  function updateStars(delta, factor) {
    for (const star of stars) {
      star.y += star.speed * delta * factor;
      if (star.y > HEIGHT + 3) {
        star.y = -3;
        star.x = Math.random() * width;
      }
    }
  }

  function updatePlayer(delta) {
    let dx = 0;
    let dy = 0;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
    if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
    if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;

    const magnitude = Math.hypot(dx, dy) || 1;
    const oldX = player.x;
    if (dx || dy) {
      player.x += (dx / magnitude) * player.speed * delta;
      player.y += (dy / magnitude) * player.speed * delta;
    }

    if (pointer.active) {
      const follow = 1 - Math.exp(-delta * 17);
      player.x += (pointer.x - player.x) * follow;
      player.y += (pointer.y - player.y) * follow;
    }

    player.x = clamp(player.x, 26, width - 26);
    player.y = clamp(player.y, 72, HEIGHT - 40);
    const velocityX = (player.x - oldX) / Math.max(delta, 0.001);
    player.tilt += (clamp(velocityX / 420, -1, 1) - player.tilt) * Math.min(1, delta * 10);

    player.fireTimer -= delta;
    player.rapidTimer = Math.max(0, player.rapidTimer - delta);
    player.spreadTimer = Math.max(0, player.spreadTimer - delta);
    player.invulnerable = Math.max(0, player.invulnerable - delta);
    if (player.fireTimer <= 0) firePlayer();

    if (Math.random() < delta * 32) {
      particles.push({
        x: player.x + random(-7, 7),
        y: player.y + 24,
        vx: random(-12, 12),
        vy: random(80, 150),
        life: random(0.18, 0.38),
        maxLife: 0.38,
        size: random(1.3, 3.6),
        color: Math.random() > 0.5 ? "#58e7ff" : "#7d69ff",
        glow: true,
      });
    }
  }

  function updateWave(delta) {
    if (waveDelay > 0) {
      waveDelay -= delta;
      return;
    }

    if (wave % 5 === 0) {
      if (!bossSpawned) spawnBoss();
      if (bossSpawned && waveDestroyed >= 1 && enemies.length === 0) advanceWave();
      return;
    }

    spawnTimer -= delta;
    if (waveSpawned < waveTarget() && spawnTimer <= 0) {
      spawnEnemy();
      waveSpawned += 1;
      spawnTimer = Math.max(0.31, 0.88 - wave * 0.035) * random(0.8, 1.22);
    }

    if (waveDestroyed >= waveTarget() && enemies.length === 0) advanceWave();
  }

  function updateBullets(delta) {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const bullet = bullets[i];
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;
      if (bullet.y < -30 || bullet.x < -30 || bullet.x > width + 30) bullets.splice(i, 1);
    }

    for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
      const bullet = enemyBullets[i];
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;
      if (bullet.y > HEIGHT + 30 || bullet.y < -50 || bullet.x < -50 || bullet.x > width + 50) {
        enemyBullets.splice(i, 1);
      }
    }
  }

  function updateEnemies(delta) {
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      enemy.age += delta;
      enemy.flash = Math.max(0, enemy.flash - delta * 7);
      enemy.shootTimer -= delta;

      if (enemy.type === "boss") {
        updateBoss(enemy, delta);
        continue;
      }

      enemy.y += enemy.speed * delta;
      const swing = enemy.type === "dart" ? 48 : enemy.type === "scout" ? 25 : 12;
      const frequency = enemy.type === "dart" ? 2.15 : 1.2;
      enemy.x = enemy.originX + Math.sin(enemy.age * frequency + enemy.phase) * swing;
      enemy.x = clamp(enemy.x, enemy.radius + 4, width - enemy.radius - 4);

      if (enemy.shootTimer <= 0 && enemy.y > 45 && enemy.y < HEIGHT * 0.65) {
        if (enemy.type !== "scout" || wave >= 4) fireEnemy(enemy);
        enemy.shootTimer = enemy.type === "tank" ? random(1.7, 2.8) : random(2.2, 3.6);
      }

      if (enemy.y > HEIGHT + 55) {
        enemies.splice(i, 1);
        waveDestroyed += 1;
        damagePlayer(enemy.type === "tank" ? 22 : 12, true);
      }
    }
  }

  function updateBoss(enemy, delta) {
    if (!enemy.entered) {
      enemy.y += 58 * delta;
      if (enemy.y >= 105) {
        enemy.y = 105;
        enemy.entered = true;
      }
      return;
    }

    enemy.x = width / 2 + Math.sin(enemy.age * 0.72) * Math.min(width * 0.31, 190);
    enemy.y = 108 + Math.sin(enemy.age * 1.3) * 10;
    enemy.burstTimer -= delta;

    if (enemy.shootTimer <= 0) {
      fireBossFan(enemy);
      enemy.shootTimer = Math.max(0.75, 1.45 - wave * 0.025);
    }
    if (enemy.burstTimer <= 0) {
      fireBossBurst(enemy);
      enemy.burstTimer = 3.2;
    }
  }

  function updateParticles(delta) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= delta;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= Math.pow(0.985, delta * 60);
      particle.vy *= Math.pow(0.985, delta * 60);
    }
  }

  function updateFloaters(delta) {
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const floater = floaters[i];
      floater.life -= delta;
      floater.y -= 27 * delta;
      if (floater.life <= 0) floaters.splice(i, 1);
    }
  }

  function updatePowerUps(delta) {
    for (let i = powerUps.length - 1; i >= 0; i -= 1) {
      const power = powerUps[i];
      power.age += delta;
      power.y += power.speed * delta;
      power.x += Math.sin(power.age * 2.5 + power.phase) * 12 * delta;
      if (power.y > HEIGHT + 35) powerUps.splice(i, 1);
    }
  }

  function resolveCollisions() {
    for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
      const bullet = bullets[bulletIndex];
      let didHit = false;

      for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = enemies[enemyIndex];
        if (!circlesOverlap(bullet, enemy, enemy.type === "boss" ? -5 : -2)) continue;

        bullets.splice(bulletIndex, 1);
        didHit = true;
        enemy.hp -= bullet.damage;
        enemy.flash = 1;
        burst(bullet.x, bullet.y, "#81edff", 2, 32, 0.18);
        if (enemy.hp <= 0) destroyEnemy(enemyIndex);
        break;
      }
      if (didHit) continue;
    }

    if (!player || player.invulnerable > 0) {
      collectPowerUps();
      return;
    }

    for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
      const bullet = enemyBullets[i];
      if (!circlesOverlap(player, bullet, -2)) continue;
      enemyBullets.splice(i, 1);
      damagePlayer(bullet.damage);
      break;
    }

    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      if (!circlesOverlap(player, enemy, enemy.type === "boss" ? -25 : -6)) continue;
      if (enemy.type !== "boss") {
        waveDestroyed += 1;
        enemies.splice(i, 1);
        burst(enemy.x, enemy.y, enemy.color, 16, 190, 0.7);
      }
      damagePlayer(enemy.type === "boss" ? 34 : 28);
      break;
    }

    collectPowerUps();
  }

  function collectPowerUps() {
    if (!player) return;
    for (let i = powerUps.length - 1; i >= 0; i -= 1) {
      const power = powerUps[i];
      if (!circlesOverlap(player, power, 1)) continue;
      powerUps.splice(i, 1);
      applyPowerUp(power.type);
      burst(power.x, power.y, powerColors[power.type], 18, 150, 0.7);
    }
  }

  function circlesOverlap(a, b, padding = 0) {
    const radius = a.radius + b.radius + padding;
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < radius ** 2;
  }

  function destroyEnemy(index) {
    const enemy = enemies[index];
    enemies.splice(index, 1);
    waveDestroyed += 1;

    const multiplier = currentMultiplier();
    const points = enemy.points * multiplier;
    score += points;
    comboKills += enemy.type === "boss" ? 5 : 1;
    comboTimer = 3;
    shake = enemy.type === "boss" ? 14 : Math.min(5, shake + 1.2);

    addFloater(enemy.x, enemy.y, `+${points}`, enemy.type === "boss" ? "#ff8ab7" : "#b6f5ff", enemy.type === "boss" ? 1.5 : 0.75, enemy.type === "boss" ? 18 : 10);
    burst(enemy.x, enemy.y, enemy.color, enemy.type === "boss" ? 70 : 15, enemy.type === "boss" ? 300 : 180, enemy.type === "boss" ? 1.25 : 0.65);

    if (enemy.type === "boss") {
      ui.bossHud.hidden = true;
      enemyBullets.length = 0;
      flashScreen();
      playTone(110, 0.48, "sawtooth", 0.06, 35);
      powerUps.push(makePowerUp(enemy.x, enemy.y + 25, "bomb"));
    } else {
      if (Math.random() < 0.14) {
        const available = ["rapid", "spread", "shield", "repair"];
        if (bombs < 2 && Math.random() < 0.18) available.push("bomb");
        powerUps.push(makePowerUp(enemy.x, enemy.y, pick(available)));
      }
      playTone(115, 0.065, "triangle", 0.018, 55);
    }
  }

  function makePowerUp(x, y, type) {
    return {
      x,
      y,
      type,
      radius: 14,
      speed: 72,
      age: 0,
      phase: random(0, TAU),
    };
  }

  function applyPowerUp(type) {
    const labels = {
      rapid: "RAPID FIRE",
      spread: "SPREAD SHOT",
      shield: "SHIELD +100",
      repair: "HULL REPAIRED",
      bomb: "EMP BOMB +1",
    };

    if (type === "rapid") player.rapidTimer = Math.max(player.rapidTimer, 8);
    if (type === "spread") player.spreadTimer = Math.max(player.spreadTimer, 10);
    if (type === "shield") player.shield = 100;
    if (type === "repair") player.health = Math.min(player.maxHealth, player.health + 35);
    if (type === "bomb") bombs = Math.min(5, bombs + 1);

    addFloater(player.x, player.y - 30, labels[type], powerColors[type], 1, 10);
    playTone(510, 0.08, "sine", 0.035, 880);
  }

  function damagePlayer(amount, bypassInvulnerability = false) {
    if (!player || state !== "running") return;
    if (player.invulnerable > 0 && !bypassInvulnerability) return;

    let damage = amount;
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, damage);
      player.shield -= absorbed;
      damage -= absorbed;
    }
    if (damage > 0) player.health -= damage;

    player.invulnerable = 0.85;
    comboKills = 0;
    comboTimer = 0;
    shake = Math.max(shake, 9);
    burst(player.x, player.y, player.shield > 0 ? "#62e5ff" : "#ff5f78", 22, 220, 0.75);
    playTone(130, 0.18, "sawtooth", 0.045, 70);

    if (player.health <= 0) {
      player.health = 0;
      endGame();
    }
  }

  function useBomb() {
    if (state !== "running" || bombs <= 0) return;
    bombs -= 1;
    enemyBullets.length = 0;
    flashScreen();
    shake = 16;

    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      enemy.hp -= enemy.type === "boss" ? 28 : 99;
      enemy.flash = 1;
      if (enemy.hp <= 0) destroyEnemy(i);
    }

    for (let i = 0; i < 90; i += 1) {
      const angle = Math.random() * TAU;
      const speed = random(80, 420);
      particles.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: random(0.35, 0.9),
        maxLife: 0.9,
        size: random(1, 4),
        color: Math.random() > 0.5 ? "#76efff" : "#b990ff",
        glow: true,
      });
    }
    playTone(90, 0.45, "sawtooth", 0.07, 320);
    updateHud(true);
  }

  function burst(x, y, color, count, speed, lifetime) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const velocity = random(speed * 0.25, speed);
      const life = random(lifetime * 0.45, lifetime);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life,
        maxLife: life,
        size: random(1, count > 30 ? 5.2 : 3.6),
        color,
        glow: Math.random() > 0.35,
      });
    }
  }

  function addFloater(x, y, text, color, life, size) {
    floaters.push({ x, y, text, color, life, maxLife: life, size });
  }

  function flashScreen() {
    ui.flash.classList.remove("active");
    void ui.flash.offsetWidth;
    ui.flash.classList.add("active");
  }

  function endGame() {
    state = "gameover";
    pointer.active = false;
    burst(player.x, player.y, "#ff6f91", 55, 320, 1.25);
    if (score > bestScore) {
      bestScore = score;
      saveBestScore();
    }
    ui.bossHud.hidden = true;
    ui.pauseButton.disabled = true;
    ui.bombButton.disabled = true;
    ui.screenEyebrow.textContent = "MISSION FAILED";
    ui.screenTitle.innerHTML = "<span>GAME</span> OVER";
    ui.screenText.innerHTML = `本次得分 <strong>${padScore(score)}</strong> · 抵达第 <strong>${wave}</strong> 波<br />整备战机，再次突破敌军防线。`;
    ui.startButtonText.textContent = "重新出击";
    ui.screenHint.innerHTML = `<span>最高分 ${padScore(bestScore)}</span><i></i><span>按 Enter 重新开始</span>`;
    ui.screen.classList.remove("hidden");
    playTone(210, 0.35, "triangle", 0.045, 80);
    updateHud(true);
  }

  function togglePause(forcePause = false) {
    if (state !== "running" && state !== "paused") return;
    const shouldPause = forcePause || state === "running";
    state = shouldPause ? "paused" : "running";
    pointer.active = false;
    ui.pauseBadge.hidden = !shouldPause;
    ui.pauseButton.querySelector("span").textContent = shouldPause ? "继续" : "暂停";
    if (!shouldPause) lastTime = performance.now();
  }

  function draw() {
    setWorldTransform();
    ctx.save();
    if (shake > 0 && state === "running") ctx.translate(random(-shake, shake), random(-shake, shake));
    drawBackground();
    drawPowerUps();
    drawBullets();
    drawEnemies();
    drawPlayer();
    drawParticles();
    drawFloaters();
    drawWaveBanner();
    ctx.restore();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, "#07101f");
    gradient.addColorStop(0.48, "#060b18");
    gradient.addColorStop(1, "#040711");
    ctx.fillStyle = gradient;
    ctx.fillRect(-20, -20, width + 40, HEIGHT + 40);

    const glow = ctx.createRadialGradient(width * 0.52, HEIGHT * 0.36, 10, width * 0.52, HEIGHT * 0.36, width * 0.58);
    glow.addColorStop(0, "rgba(33, 75, 143, 0.13)");
    glow.addColorStop(0.5, "rgba(73, 45, 128, 0.055)");
    glow.addColorStop(1, "rgba(4, 7, 17, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, HEIGHT);

    for (const star of stars) {
      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = star.tint;
      ctx.fillRect(star.x, star.y, star.size, star.size * 1.9);
    }
    ctx.globalAlpha = 1;

    const horizon = HEIGHT * 0.58;
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = "#5288b8";
    ctx.lineWidth = 0.55;
    for (let y = horizon; y < HEIGHT + 60; y += 38) {
      const progress = (y - horizon) / (HEIGHT - horizon);
      const curvedY = horizon + progress * progress * (HEIGHT - horizon);
      ctx.beginPath();
      ctx.moveTo(0, curvedY);
      ctx.lineTo(width, curvedY);
      ctx.stroke();
    }
    for (let x = -width; x < width * 2; x += 72) {
      ctx.beginPath();
      ctx.moveTo(width / 2, horizon);
      ctx.lineTo(x, HEIGHT + 40);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "#89bdff";
    ctx.setLineDash([2, 11]);
    ctx.beginPath();
    ctx.moveTo(width * 0.16, 0);
    ctx.lineTo(width * 0.16, HEIGHT);
    ctx.moveTo(width * 0.84, 0);
    ctx.lineTo(width * 0.84, HEIGHT);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    if (!player || state === "gameover") return;
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 16) % 2 === 0) return;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.tilt * 0.17);

    if (player.shield > 0) {
      const shieldPulse = 24 + Math.sin(gameTime * 5) * 2;
      ctx.beginPath();
      ctx.arc(0, 0, shieldPulse, 0, TAU);
      ctx.strokeStyle = `rgba(98, 229, 255, ${0.35 + Math.sin(gameTime * 7) * 0.08})`;
      ctx.lineWidth = 1.4;
      ctx.shadowBlur = 14;
      ctx.shadowColor = "#62e5ff";
      ctx.stroke();
    }

    ctx.shadowBlur = 20;
    ctx.shadowColor = "#58e7ff";

    const flame = 14 + Math.sin(gameTime * 31) * 4;
    const flameGradient = ctx.createLinearGradient(0, 13, 0, 34);
    flameGradient.addColorStop(0, "#f5fdff");
    flameGradient.addColorStop(0.35, "#58e7ff");
    flameGradient.addColorStop(1, "rgba(111, 77, 255, 0)");
    ctx.fillStyle = flameGradient;
    ctx.beginPath();
    ctx.moveTo(-6, 14);
    ctx.quadraticCurveTo(0, flame + 22, 6, 14);
    ctx.closePath();
    ctx.fill();

    const bodyGradient = ctx.createLinearGradient(-20, -18, 22, 23);
    bodyGradient.addColorStop(0, "#dffbff");
    bodyGradient.addColorStop(0.38, "#6cdff3");
    bodyGradient.addColorStop(1, "#566cff");
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(8, -9);
    ctx.lineTo(27, 13);
    ctx.lineTo(10, 10);
    ctx.lineTo(7, 24);
    ctx.lineTo(0, 17);
    ctx.lineTo(-7, 24);
    ctx.lineTo(-10, 10);
    ctx.lineTo(-27, 13);
    ctx.lineTo(-8, -9);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0b2042";
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(5, -4);
    ctx.lineTo(0, 5);
    ctx.lineTo(-5, -4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(225, 251, 255, 0.78)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -27);
    ctx.lineTo(0, 17);
    ctx.moveTo(-23, 11);
    ctx.lineTo(-7, 6);
    ctx.moveTo(23, 11);
    ctx.lineTo(7, 6);
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemies() {
    for (const enemy of enemies) {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      if (enemy.type === "boss") drawBoss(enemy);
      else drawEnemy(enemy);
      ctx.restore();
    }
  }

  function drawEnemy(enemy) {
    ctx.shadowBlur = enemy.flash > 0 ? 25 : 12;
    ctx.shadowColor = enemy.flash > 0 ? "#ffffff" : enemy.color;
    ctx.fillStyle = enemy.flash > 0 ? "#ffffff" : enemy.color;

    if (enemy.type === "scout") {
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.lineTo(7, 3);
      ctx.lineTo(19, -11);
      ctx.lineTo(8, -7);
      ctx.lineTo(0, -19);
      ctx.lineTo(-8, -7);
      ctx.lineTo(-19, -11);
      ctx.lineTo(-7, 3);
      ctx.closePath();
      ctx.fill();
    } else if (enemy.type === "dart") {
      ctx.beginPath();
      ctx.moveTo(0, 24);
      ctx.lineTo(6, 5);
      ctx.lineTo(25, -17);
      ctx.lineTo(12, -14);
      ctx.lineTo(0, -22);
      ctx.lineTo(-12, -14);
      ctx.lineTo(-25, -17);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#36152a";
      ctx.fillRect(-3, -12, 6, 18);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, 29);
      ctx.lineTo(11, 13);
      ctx.lineTo(30, 7);
      ctx.lineTo(23, -15);
      ctx.lineTo(8, -22);
      ctx.lineTo(0, -29);
      ctx.lineTo(-8, -22);
      ctx.lineTo(-23, -15);
      ctx.lineTo(-30, 7);
      ctx.lineTo(-11, 13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#2a1747";
      ctx.beginPath();
      ctx.arc(0, -2, 9, 0, TAU);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-enemy.radius * 0.48, 2);
    ctx.lineTo(0, enemy.radius * 0.45);
    ctx.lineTo(enemy.radius * 0.48, 2);
    ctx.stroke();

    if (enemy.maxHp > 2) {
      const w = enemy.radius * 1.6;
      ctx.fillStyle = "rgba(255,255,255,0.09)";
      ctx.fillRect(-w / 2, enemy.radius + 10, w, 2);
      ctx.fillStyle = enemy.color;
      ctx.fillRect(-w / 2, enemy.radius + 10, w * (enemy.hp / enemy.maxHp), 2);
    }
  }

  function drawBoss(enemy) {
    ctx.shadowBlur = enemy.flash > 0 ? 32 : 24;
    ctx.shadowColor = enemy.flash > 0 ? "#ffffff" : "#ff5c9d";
    const gradient = ctx.createLinearGradient(-75, -40, 80, 42);
    gradient.addColorStop(0, enemy.flash > 0 ? "#fff" : "#7a4eff");
    gradient.addColorStop(0.52, enemy.flash > 0 ? "#fff" : "#e14f9e");
    gradient.addColorStop(1, enemy.flash > 0 ? "#fff" : "#ff6b70");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, 47);
    ctx.lineTo(18, 24);
    ctx.lineTo(70, 33);
    ctx.lineTo(56, 5);
    ctx.lineTo(78, -18);
    ctx.lineTo(30, -10);
    ctx.lineTo(15, -40);
    ctx.lineTo(0, -53);
    ctx.lineTo(-15, -40);
    ctx.lineTo(-30, -10);
    ctx.lineTo(-78, -18);
    ctx.lineTo(-56, 5);
    ctx.lineTo(-70, 33);
    ctx.lineTo(-18, 24);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 14;
    ctx.shadowColor = "#ffb2dd";
    ctx.fillStyle = "#281035";
    ctx.beginPath();
    ctx.arc(0, -7, 17, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffbbdf";
    ctx.beginPath();
    ctx.arc(0, -7, 6 + Math.sin(enemy.age * 5), 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-62, 15);
    ctx.lineTo(-20, 6);
    ctx.lineTo(0, 35);
    ctx.lineTo(20, 6);
    ctx.lineTo(62, 15);
    ctx.stroke();

    const percent = clamp((enemy.hp / enemy.maxHp) * 100, 0, 100);
    ui.bossBar.style.width = `${percent}%`;
    ui.bossLabel.textContent = `${Math.ceil(percent)}%`;
  }

  function drawBullets() {
    ctx.save();
    ctx.lineCap = "round";
    for (const bullet of bullets) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#66eaff";
      const gradient = ctx.createLinearGradient(bullet.x, bullet.y - 11, bullet.x, bullet.y + 8);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.45, "#dfffff");
      gradient.addColorStop(1, "#58e7ff");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = bullet.radius * 1.25;
      ctx.beginPath();
      ctx.moveTo(bullet.x, bullet.y + 7);
      ctx.lineTo(bullet.x, bullet.y - 11);
      ctx.stroke();
    }

    for (const bullet of enemyBullets) {
      ctx.shadowBlur = 11;
      ctx.shadowColor = bullet.color;
      ctx.fillStyle = bullet.color;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.24;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius * 2.1, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawPowerUps() {
    const labels = { rapid: "R", spread: "S", shield: "◇", repair: "+", bomb: "B" };
    for (const power of powerUps) {
      ctx.save();
      ctx.translate(power.x, power.y);
      ctx.rotate(power.age * 0.8);
      const pulse = 1 + Math.sin(power.age * 6) * 0.08;
      ctx.scale(pulse, pulse);
      ctx.shadowBlur = 18;
      ctx.shadowColor = powerColors[power.type];
      ctx.strokeStyle = powerColors[power.type];
      ctx.fillStyle = "rgba(7, 13, 27, 0.88)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-power.age * 0.8);
      ctx.fillStyle = powerColors[power.type];
      ctx.font = "800 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labels[power.type], 0, 0.5);
      ctx.restore();
    }
  }

  function drawParticles() {
    ctx.save();
    for (const particle of particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      if (particle.glow) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = particle.color;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (0.45 + alpha * 0.55), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFloaters() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const floater of floaters) {
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.globalAlpha = Math.min(1, alpha * 1.8);
      ctx.fillStyle = floater.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = floater.color;
      ctx.font = `800 ${floater.size}px system-ui, sans-serif`;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.restore();
  }

  function drawWaveBanner() {
    if (waveMessage <= 0 || state !== "running") return;
    const progress = clamp(waveMessage / 2.15, 0, 1);
    const alpha = Math.min(1, (1 - progress) * 5, progress * 2.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.fillStyle = wave % 5 === 0 ? "#ff769c" : "#a4eeff";
    ctx.shadowBlur = 16;
    ctx.shadowColor = ctx.fillStyle;
    ctx.font = "800 10px system-ui, sans-serif";
    ctx.fillText(wave % 5 === 0 ? "DANGER ZONE" : "COMBAT WAVE", width / 2, HEIGHT * 0.42 - 16);
    ctx.font = "300 34px system-ui, sans-serif";
    ctx.fillText(String(wave).padStart(2, "0"), width / 2, HEIGHT * 0.42 + 21);
    ctx.restore();
  }

  function updateHud(force = false) {
    const now = performance.now();
    if (!force && now - lastHudUpdate < 80) return;
    lastHudUpdate = now;

    const health = player ? clamp((player.health / player.maxHealth) * 100, 0, 100) : 100;
    const shield = player ? clamp(player.shield, 0, 100) : 0;
    const multiplier = currentMultiplier();
    const weaponLevel = player ? player.weaponLevel : 1;

    ui.score.textContent = padScore(score);
    ui.best.textContent = padScore(Math.max(bestScore, score));
    ui.wave.textContent = String(wave).padStart(2, "0");
    ui.healthBar.style.width = `${health}%`;
    ui.healthLabel.textContent = `${Math.ceil(health)}%`;
    ui.shieldBar.style.width = `${shield}%`;
    ui.shieldLabel.textContent = `${Math.ceil(shield)}%`;
    ui.combo.textContent = `×${multiplier}`;
    ui.rank.textContent = ranks[clamp(Math.floor((wave - 1) / 3), 0, ranks.length - 1)];
    ui.bombCount.textContent = `×${bombs}`;
    ui.bombButton.disabled = state !== "running" || bombs <= 0;
    ui.weaponPips.forEach((pip, index) => pip.classList.toggle("active", index < weaponLevel));

    if (player && player.health < 35) {
      ui.healthBar.style.background = "linear-gradient(90deg, #ff5f78, #ff9c7a)";
      ui.healthBar.style.boxShadow = "0 0 10px rgba(255,95,120,.5)";
    } else {
      ui.healthBar.style.background = "linear-gradient(90deg, #5dffc0, #b7ffdd)";
      ui.healthBar.style.boxShadow = "0 0 10px rgba(93,255,192,.45)";
    }
  }

  function ensureAudio() {
    if (!soundEnabled) return;
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume();
    } catch {
      soundEnabled = false;
      syncSoundButton();
    }
  }

  function playTone(startFrequency, duration, type, volume, endFrequency = startFrequency) {
    if (!soundEnabled) return;
    ensureAudio();
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function syncSoundButton() {
    ui.soundButton.classList.toggle("muted", !soundEnabled);
    ui.soundButton.setAttribute("aria-label", soundEnabled ? "关闭声音" : "开启声音");
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function setPointer(event) {
    const point = canvasPoint(event);
    pointer.x = clamp(point.x, 26, width - 26);
    pointer.y = clamp(point.y - 36, 72, HEIGHT - 40);
  }

  function loop(now) {
    const delta = Math.min((now - lastTime) / 1000, 0.034);
    lastTime = now;
    update(delta);
    draw();
    updateHud();

    fpsFrames += 1;
    fpsElapsed += delta;
    if (fpsElapsed >= 0.5) {
      const fps = Math.round(fpsFrames / fpsElapsed);
      ui.fps.textContent = `${clamp(fps, 0, 99)} FPS`;
      fpsFrames = 0;
      fpsElapsed = 0;
    }
    requestAnimationFrame(loop);
  }

  ui.startButton.addEventListener("click", resetGame);
  ui.pauseButton.addEventListener("click", () => togglePause());
  ui.bombButton.addEventListener("click", useBomb);
  ui.soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    saveSoundPreference();
    syncSoundButton();
    if (soundEnabled) {
      ensureAudio();
      playTone(460, 0.08, "sine", 0.03, 720);
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "running") return;
    pointer.active = true;
    setPointer(event);
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointer.active || state !== "running") return;
    setPointer(event);
    event.preventDefault();
  });

  const releasePointer = (event) => {
    pointer.active = false;
    if (event?.pointerId !== undefined && canvas.hasPointerCapture?.(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("keydown", (event) => {
    const gameKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyW", "KeyA", "KeyS", "KeyD"];
    if (gameKeys.includes(event.code) && state === "running") event.preventDefault();
    keys.add(event.code);

    if (event.code === "KeyX" && !event.repeat) useBomb();
    if ((event.code === "KeyP" || event.code === "Escape") && !event.repeat) togglePause();
    if (event.code === "Enter" && !event.repeat && (state === "menu" || state === "gameover")) resetGame();
  });

  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", () => {
    keys.clear();
    pointer.active = false;
    if (state === "running") togglePause(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "running") togglePause(true);
  });

  const resizeObserver = new ResizeObserver(() => configureCanvas());
  resizeObserver.observe(frame);
  window.addEventListener("resize", configureCanvas, { passive: true });

  configureCanvas();
  seedStars();
  syncSoundButton();
  updateHud(true);
  requestAnimationFrame(loop);

  window.__NEON_STRIKE__ = {
    start: resetGame,
    pause: togglePause,
    useBomb,
    getState: () => ({
      state,
      score,
      bestScore,
      wave,
      bombs,
      enemies: enemies.length,
      player: player
        ? { health: player.health, shield: player.shield, x: player.x, y: player.y, weaponLevel: player.weaponLevel }
        : null,
    }),
  };
})();
