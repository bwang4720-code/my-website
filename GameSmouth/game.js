// ===== 合成大仓鼠 =====

const RADII = [15, 20, 27.5, 35, 45, 55, 65];
const COLORS = ['#FFD700', '#FFA500', '#FF8C00', '#FF6347', '#FF4500', '#DC143C', '#B8860B'];
const SCORES = [1, 2, 4, 8, 16, 32, 64];
const GRAVITY = 0.5;
const DAMPING = 0.98;
const RESTITUTION = 0.5;
const WALL_LEFT = 0;
const WALL_RIGHT = 400;
const WALL_BOTTOM = 650;
const ALERT_LINE_Y = 120;
const DROP_COOLDOWN = 1000;

const GameState = { MENU: 0, PLAYING: 1, GAME_OVER: 2 };

let canvas, ctx;
let hamsters = [];
let particles = [];
let state = GameState.MENU;
let score = 0;
let nextLevel = 1;
let lastDropTime = 0;
let mouseX = WALL_RIGHT / 2;
let animationId = null;
let lastTime = 0;

// ===== Audio =====
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'merge') {
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(784, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'drop') {
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'gameover') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch (e) { }
}

// ===== Hamster Class =====
class Hamster {
  constructor(x, y, level) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.level = level;
    this.radius = RADII[level - 1];
    this.color = COLORS[level - 1];
    this.merged = false;
  }
}

// ===== Init =====
function init() {
  canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'gameCanvas';
    canvas.width = 400;
    canvas.height = 700;
    document.body.appendChild(canvas);
  }
  canvas.width = 400;
  canvas.height = 700;
  ctx = canvas.getContext('2d');

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseX = Math.max(RADII[0], Math.min(WALL_RIGHT - RADII[0], mouseX));
  });

  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    mouseX = touch.clientX - rect.left;
    mouseX = Math.max(RADII[0], Math.min(WALL_RIGHT - RADII[0], mouseX));
    handleClick(e);
  }, { passive: false });

  nextLevel = generateNextLevel();
  lastTime = performance.now();
  gameLoop(lastTime);
}

// ===== Game Loop =====
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 16.67, 3);
  lastTime = timestamp;

  if (state === GameState.PLAYING) {
    update(dt);
  }

  render();
  animationId = requestAnimationFrame(gameLoop);
}

// ===== Update =====
function update(dt) {
  // Apply physics
  for (const h of hamsters) {
    h.vy += GRAVITY * dt;
    h.vx *= Math.pow(DAMPING, dt);
    h.vy *= Math.pow(DAMPING, dt);
    h.x += h.vx * dt;
    h.y += h.vy * dt;
  }

  // Wall collisions
  for (const h of hamsters) {
    if (h.x - h.radius < WALL_LEFT) {
      h.x = WALL_LEFT + h.radius;
      h.vx = -h.vx * RESTITUTION;
    }
    if (h.x + h.radius > WALL_RIGHT) {
      h.x = WALL_RIGHT - h.radius;
      h.vx = -h.vx * RESTITUTION;
    }
    if (h.y + h.radius > WALL_BOTTOM) {
      h.y = WALL_BOTTOM - h.radius;
      h.vy = -h.vy * RESTITUTION;
      if (Math.abs(h.vx) < 0.1) h.vx = 0;
    }
    if (h.y - h.radius < 0) {
      h.y = h.radius;
      h.vy = -h.vy * RESTITUTION;
    }
  }

  // Hamster-hamster collisions & merge
  checkCollisions();

  // Remove out-of-bounds hamsters
  hamsters = hamsters.filter(h => h.y - h.radius < WALL_BOTTOM + 50);

  // Check game over
  if (checkGameOver()) {
    state = GameState.GAME_OVER;
    playSound('gameover');
  }

  // Update particles
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.2 * dt;
    p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
}

// ===== Collision Detection =====
function checkCollisions() {
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < hamsters.length; i++) {
      for (let j = i + 1; j < hamsters.length; j++) {
        const a = hamsters[i];
        const b = hamsters[j];
        if (a.merged || b.merged) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.radius + b.radius;

        if (dist < minDist) {
          // Same level -> merge
          if (a.level === b.level && a.level < 7) {
            merge(a, b);
            merged = true;
            break;
          } else if (a.level === b.level && a.level === 7) {
            // Max level, just add score
            score += SCORES[6];
            spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, a.color);
            playSound('merge');
            // Still need to separate
            resolveCollision(a, b, dist, minDist, dx, dy);
          } else {
            resolveCollision(a, b, dist, minDist, dx, dy);
          }
        }
      }
      if (merged) break;
    }
  }

  // Reset merge flags
  for (const h of hamsters) h.merged = false;
}

function resolveCollision(a, b, dist, minDist, dx, dy) {
  if (dist === 0) { dx = 1; dy = 0; dist = 1; }
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = (minDist - dist) / 2;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;

  const relVx = a.vx - b.vx;
  const relVy = a.vy - b.vy;
  const relVn = relVx * nx + relVy * ny;
  if (relVn > 0) return;

  const impulse = -(1 + RESTITUTION) * relVn / 2;
  a.vx += impulse * nx;
  a.vy += impulse * ny;
  b.vx -= impulse * nx;
  b.vy -= impulse * ny;
}

// ===== Merge =====
function merge(a, b) {
  const newLevel = a.level + 1;
  const newX = (a.x + b.x) / 2;
  const newY = (a.y + b.y) / 2;

  score += SCORES[a.level - 1] * 2;

  a.merged = true;
  b.merged = true;

  const newHamster = new Hamster(newX, newY, newLevel);
  newHamster.vx = (a.vx + b.vx) / 2;
  newHamster.vy = (a.vy + b.vy) / 2 - 2;

  hamsters = hamsters.filter(h => !h.merged);
  hamsters.push(newHamster);

  spawnParticles(newX, newY, COLORS[newLevel - 1]);
  playSound('merge');
}

// ===== Drop Hamster =====
function dropHamster(x) {
  const now = performance.now();
  if (now - lastDropTime < DROP_COOLDOWN) return;

  const h = new Hamster(x, 60, nextLevel);
  h.vy = 1;
  hamsters.push(h);

  lastDropTime = now;
  nextLevel = generateNextLevel();
  playSound('drop');
}

// ===== Generate Next Level =====
function generateNextLevel() {
  const r = Math.random();
  if (r < 0.4) return 1;
  if (r < 0.7) return 2;
  if (r < 0.9) return 3;
  return 4;
}

// ===== Particles =====
function spawnParticles(x, y, color) {
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.3;
    const speed = 2 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      radius: 3 + Math.random() * 3,
      color: color,
      life: 30 + Math.random() * 20
    });
  }
}

// ===== Check Game Over =====
function checkGameOver() {
  for (const h of hamsters) {
    if (h.y - h.radius < ALERT_LINE_Y) {
      // Only count if hamster has been falling for a bit (velocity check)
      if (Math.abs(h.vy) < 1 && h.y < ALERT_LINE_Y) {
        return true;
      }
    }
  }
  return false;
}

// ===== Click Handler =====
function handleClick(e) {
  if (state === GameState.MENU) {
    state = GameState.PLAYING;
    score = 0;
    hamsters = [];
    particles = [];
    nextLevel = generateNextLevel();
    lastDropTime = 0;
    return;
  }
  if (state === GameState.GAME_OVER) {
    state = GameState.MENU;
    return;
  }
  if (state === GameState.PLAYING) {
    const rect = canvas.getBoundingClientRect();
    let x;
    if (e.touches) {
      x = e.touches[0].clientX - rect.left;
    } else {
      x = e.clientX - rect.left;
    }
    x = Math.max(RADII[0], Math.min(WALL_RIGHT - RADII[0], x));
    dropHamster(x);
  }
}

// ===== Render =====
function render() {
  ctx.clearRect(0, 0, 400, 700);

  if (state === GameState.MENU) {
    drawMenu();
    return;
  }

  // Background
  ctx.fillStyle = '#FFF8DC';
  ctx.fillRect(0, 0, 400, 700);

  // Play area
  ctx.fillStyle = '#FAEBD7';
  ctx.fillRect(WALL_LEFT, ALERT_LINE_Y, WALL_RIGHT - WALL_LEFT, WALL_BOTTOM - ALERT_LINE_Y);

  // Alert line
  ctx.strokeStyle = '#FF6B6B';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(0, ALERT_LINE_Y);
  ctx.lineTo(400, ALERT_LINE_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw hamsters
  for (const h of hamsters) {
    drawHamster(ctx, h);
  }

  // Draw particles
  for (const p of particles) {
    const alpha = Math.max(0, p.life / 50);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Draw preview
  if (state === GameState.PLAYING) {
    drawPreview();
  }

  // Draw UI
  drawUI();

  // Game over overlay
  if (state === GameState.GAME_OVER) {
    drawGameOver();
  }
}

// ===== Draw Hamster =====
function drawHamster(ctx, h) {
  // Body circle
  ctx.fillStyle = h.color;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
  ctx.fill();

  // Outline
  ctx.strokeStyle = '#00000030';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(h.x - h.radius * 0.25, h.y - h.radius * 0.25, h.radius * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Emoji
  const fontSize = Math.max(12, h.radius * 1.1);
  ctx.font = `${fontSize}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐹', h.x, h.y + 1);

  // Level indicator for high levels
  if (h.level >= 5) {
    ctx.font = `bold ${Math.max(10, h.radius * 0.3)}px Arial`;
    ctx.fillStyle = '#FFF';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeText(`Lv${h.level}`, h.x, h.y + h.radius * 0.7);
    ctx.fillText(`Lv${h.level}`, h.x, h.y + h.radius * 0.7);
  }

  // Golden glow for max level
  if (h.level === 7) {
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.radius + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

// ===== Draw Preview =====
function drawPreview() {
  const previewX = Math.max(RADII[0], Math.min(WALL_RIGHT - RADII[0], mouseX));
  const previewY = 60;
  const r = RADII[nextLevel - 1];

  ctx.globalAlpha = 0.6;
  const h = new Hamster(previewX, previewY, nextLevel);
  drawHamster(ctx, h);

  // Drop guide line
  ctx.strokeStyle = '#00000020';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(previewX, previewY + r);
  ctx.lineTo(previewX, WALL_BOTTOM);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

// ===== Draw UI =====
function drawUI() {
  // Score
  ctx.fillStyle = '#333';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`分数: ${score}`, 10, 10);

  // Cooldown indicator
  const now = performance.now();
  const elapsed = now - lastDropTime;
  if (elapsed < DROP_COOLDOWN) {
    const progress = elapsed / DROP_COOLDOWN;
    ctx.fillStyle = '#DDD';
    ctx.fillRect(10, 40, 100, 8);
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(10, 40, 100 * progress, 8);
  }
}

// ===== Draw Menu =====
function drawMenu() {
  ctx.fillStyle = '#FFF8DC';
  ctx.fillRect(0, 0, 400, 700);

  // Title
  ctx.font = 'bold 36px Arial';
  ctx.fillStyle = '#FF6B35';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('合成大仓鼠', 200, 200);

  // Subtitle with emoji
  ctx.font = '24px serif';
  ctx.fillText('🐹🐹🐹', 200, 260);

  // Instructions
  ctx.font = '16px Arial';
  ctx.fillStyle = '#666';
  ctx.fillText('点击或触摸释放仓鼠', 200, 340);
  ctx.fillText('相同仓鼠碰撞会合成更大的！', 200, 370);
  ctx.fillText('7个等级，试试合成最大的！', 200, 400);

  // Start button
  ctx.fillStyle = '#FF6B35';
  const btnX = 150, btnY = 460, btnW = 100, btnH = 50;
  ctx.fillRect(btnX, btnY, btnW, btnH);
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 20px Arial';
  ctx.fillText('开始游戏', 200, btnY + btnH / 2);

  // Store button bounds for click detection
  window._startBtn = { x: btnX, y: btnY, w: btnW, h: btnH };

  // Version
  ctx.font = '12px Arial';
  ctx.fillStyle = '#999';
  ctx.fillText('v1.0', 200, 680);
}

// ===== Draw Game Over =====
function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 400, 700);

  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('游戏结束', 200, 250);

  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = '#FFD700';
  ctx.fillText(`最终分数: ${score}`, 200, 310);

  // Restart button
  ctx.fillStyle = '#FF6B35';
  const btnX = 140, btnY = 380, btnW = 120, btnH = 50;
  ctx.fillRect(btnX, btnY, btnW, btnH);
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 18px Arial';
  ctx.fillText('再来一次', 200, btnY + btnH / 2);

  window._restartBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
}

// Override handleClick to support buttons
const _origHandleClick = handleClick;
handleClick = function(e) {
  if (state === GameState.MENU && window._startBtn) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY || 0) - rect.top;
    const btn = window._startBtn;
    if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
      state = GameState.PLAYING;
      score = 0;
      hamsters = [];
      particles = [];
      nextLevel = generateNextLevel();
      lastDropTime = 0;
      return;
    }
    return;
  }
  if (state === GameState.GAME_OVER && window._restartBtn) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY || 0) - rect.top;
    const btn = window._restartBtn;
    if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
      state = GameState.MENU;
      return;
    }
    return;
  }
  _origHandleClick(e);
};

// Start
window.addEventListener('DOMContentLoaded', init);
