import { useEffect, useRef, useState, useCallback } from 'react';

// ==================== TYPES ====================
interface Vec2 { x: number; y: number; }
type FaceType = 'normal' | 'creeper' | 'zombie' | 'skeleton' | 'enderman' | 'pig';
type HatType = 'none' | 'birthday' | 'mariachi' | 'crown' | 'wizard' | 'cap';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
  type: 'spark' | 'blood' | 'smoke' | 'coin' | 'explosion' | 'dust' | 'trail' | 'nuke' | 'fire';
  gravity: number; friction: number;
}

interface Toast { id: number; text: string; color: string; life: number; maxLife: number; }

interface Projectile {
  id: number; x: number; y: number; vx: number; vy: number;
  radius: number; damage: number; life: number; color: string;
  trail: Vec2[]; isEnemy?: boolean;
}

type EnemyType = 'normal' | 'fast' | 'tank' | 'shooter' | 'mini';

interface Entity {
  id: number; x: number; y: number; vx: number; vy: number;
  width: number; height: number; mass: number;
  type: 'player' | 'static' | 'dynamic' | 'ball' | 'enemy' | 'coin' | 'tnt' | 'trampoline' | 'nuke' | 'rocket';
  hp?: number; maxHp?: number; radius?: number; color: string;
  trail: Vec2[]; onGround?: boolean; damageCooldown?: number;
  enemyType?: EnemyType; aiState?: 'idle' | 'chase';
  flashTimer?: number; jumpCount?: number; dashCooldown?: number; dashTimer?: number;
  facingRight?: boolean; bounceForce?: number; fuseTimer?: number; animTimer?: number;
  shootCooldown?: number; targetX?: number; targetY?: number; isSand?: boolean;
  isFalling?: boolean; // For TNT/nuke falling physics
}

interface PlayerConfig {
  color: string;
  face: FaceType;
  hat: HatType;
}

interface DebugState {
  showCoords: boolean; showHitboxes: boolean; showVelocities: boolean;
  showGrid: boolean; showHP: boolean; slowMotion: boolean; paused: boolean;
  showFPS: boolean; showTrails: boolean; showCenterOfMass: boolean;
  showForces: boolean; showGravity: boolean; showMass: boolean;
  showNormals: boolean; showMousePos: boolean; showTime: boolean;
  showAIRange: boolean; showAttackRange: boolean; snapToGrid: boolean;
  showParticles: boolean; zeroGravity: boolean; windActive: boolean; windDirection: number;
}

interface GameState {
  player: Entity; staticBlocks: Entity[]; dynamicBlocks: Entity[]; balls: Entity[];
  enemies: Entity[]; coins: Entity[]; tntBlocks: Entity[]; trampolines: Entity[];
  sandBlocks: Entity[]; rockets: Entity[]; nukes: Entity[];
  projectiles: Projectile[]; particles: Particle[]; toasts: Toast[];
  debug: DebugState; immortal: boolean; gameTime: number; fps: number;
  mousePos: Vec2; keys: Set<string>;
  collisionNormals: { x: number; y: number; nx: number; ny: number }[];
  score: number; kills: number; screenShake: number;
  selectedTool: 'block' | 'dynamic' | 'ball' | 'enemy' | 'coin' | 'tnt' | 'trampoline' | 'sand' | 'rocket' | 'nuke';
  enemySpawnType: EnemyType; gravityOverride: number;
  nukeFlash: number; // Screen flash for nuke explosion
}

// ==================== CONSTANTS ====================
const GRAVITY = 0.6;
const FRICTION = 0.82;
const MAX_SPEED = 8;
const JUMP_FORCE = -12;
const PLAYER_SIZE = 28;
const BLOCK_SIZE = 32;
const BALL_RADIUS = 12;
const ENEMY_SIZE = 30;
const PLAYER_HP = 100;
const ENEMY_HP = 50;
const ATTACK_DAMAGE = 5;
const ENEMY_DAMAGE = 2;
const KNOCKBACK_FORCE = 8;
const AI_RANGE = 300;
const DAMAGE_COOLDOWN = 60;
const DASH_SPEED = 18;
const DASH_DURATION = 8;
const DASH_COOLDOWN = 45;
const DOUBLE_JUMP_MAX = 2;
const PROJECTILE_SPEED = 12;
const PROJECTILE_DAMAGE = 15;
const TNT_FUSE_TIME = 90;
const TNT_EXPLOSION_RADIUS = 80;
const TRAMPOLINE_FORCE = -18;
const KICK_FORCE = 18;

let nextId = 1;
const getId = () => nextId++;

// ==================== AUDIO ====================
class AudioSystem {
  private ctx: AudioContext | null = null;
  init() { if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
  play(type: string) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain); gain.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    switch (type) {
      case 'jump': osc.frequency.setValueAtTime(300, now); osc.frequency.exponentialRampToValueAtTime(600, now + 0.1); gain.gain.setValueAtTime(0.12, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15); osc.start(now); osc.stop(now + 0.15); break;
      case 'attack': osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(80, now + 0.12); gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15); osc.start(now); osc.stop(now + 0.15); break;
      case 'hit': osc.type = 'square'; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(50, now + 0.2); gain.gain.setValueAtTime(0.12, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2); osc.start(now); osc.stop(now + 0.2); break;
      case 'coin': osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.setValueAtTime(1200, now + 0.05); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2); osc.start(now); osc.stop(now + 0.2); break;
      case 'explosion': osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now); osc.frequency.exponentialRampToValueAtTime(20, now + 0.4); gain.gain.setValueAtTime(0.25, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4); osc.start(now); osc.stop(now + 0.4); break;
      case 'nuke': osc.type = 'sawtooth'; osc.frequency.setValueAtTime(60, now); osc.frequency.exponentialRampToValueAtTime(10, now + 1.5); gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 1.5); osc.start(now); osc.stop(now + 1.5); break;
      case 'dash': osc.type = 'triangle'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(800, now + 0.08); gain.gain.setValueAtTime(0.08, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); break;
      case 'bounce': osc.type = 'sine'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(500, now + 0.15); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2); osc.start(now); osc.stop(now + 0.2); break;
      case 'shoot': osc.type = 'square'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(200, now + 0.08); gain.gain.setValueAtTime(0.08, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); break;
      case 'kick': osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.15); gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2); osc.start(now); osc.stop(now + 0.2); break;
      case 'tnt': osc.type = 'square'; osc.frequency.setValueAtTime(80, now); osc.frequency.exponentialRampToValueAtTime(30, now + 0.3); gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3); osc.start(now); osc.stop(now + 0.3); break;
    }
  }
}
const audio = new AudioSystem();

// ==================== HELPERS ====================
function createPlayer(config: PlayerConfig): Entity {
  return { id: getId(), x: 400, y: 300, vx: 0, vy: 0, width: PLAYER_SIZE, height: PLAYER_SIZE, mass: 1, type: 'player', hp: PLAYER_HP, maxHp: PLAYER_HP, color: config.color, trail: [], onGround: false, damageCooldown: 0, jumpCount: 0, dashCooldown: 0, dashTimer: 0, facingRight: true, flashTimer: 0 };
}
function createStaticBlock(x: number, y: number): Entity { return { id: getId(), x, y, vx: 0, vy: 0, width: BLOCK_SIZE, height: BLOCK_SIZE, mass: Infinity, type: 'static', color: '#6b7280', trail: [] }; }
function createDynamicBlock(x: number, y: number): Entity { return { id: getId(), x, y, vx: 0, vy: 0, width: BLOCK_SIZE, height: BLOCK_SIZE, mass: 3, type: 'dynamic', color: '#eab308', trail: [] }; }
function createBall(x: number, y: number): Entity { return { id: getId(), x, y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 3, width: BALL_RADIUS * 2, height: BALL_RADIUS * 2, mass: 1, type: 'ball', radius: BALL_RADIUS, color: '#f97316', trail: [] }; }
function createEnemy(x: number, y: number, enemyType: EnemyType = 'normal'): Entity {
  const configs: Record<EnemyType, { hp: number; mass: number; color: string; size: number }> = {
    normal: { hp: 50, mass: 2, color: '#22c55e', size: ENEMY_SIZE },
    fast: { hp: 30, mass: 1, color: '#06b6d4', size: 24 },
    tank: { hp: 120, mass: 5, color: '#7c3aed', size: 40 },
    shooter: { hp: 60, mass: 2, color: '#f97316', size: 32 },
    mini: { hp: 120, mass: 1, color: '#ec4899', size: 16 }
  };
  const cfg = configs[enemyType];
  return { id: getId(), x, y, vx: 0, vy: 0, width: cfg.size, height: cfg.size, mass: cfg.mass, type: 'enemy', hp: cfg.hp, maxHp: cfg.hp, color: cfg.color, trail: [], damageCooldown: 0, enemyType, aiState: 'idle', flashTimer: 0, shootCooldown: enemyType === 'shooter' ? 120 : 0 };
}
function createCoin(x: number, y: number): Entity { return { id: getId(), x, y, vx: 0, vy: 0, width: 16, height: 16, mass: 0.5, type: 'coin', radius: 8, color: '#fbbf24', trail: [], animTimer: Math.random() * Math.PI * 2 }; }
function createTNT(x: number, y: number): Entity { return { id: getId(), x, y, vx: 0, vy: 0, width: BLOCK_SIZE, height: BLOCK_SIZE, mass: 4, type: 'tnt', color: '#dc2626', trail: [], fuseTimer: -1, animTimer: 0, isFalling: false }; }
function createTrampoline(x: number, y: number): Entity { return { id: getId(), x, y, vx: 0, vy: 0, width: BLOCK_SIZE * 2, height: 12, mass: Infinity, type: 'trampoline', color: '#a855f7', trail: [], bounceForce: TRAMPOLINE_FORCE, animTimer: 0 }; }
function createSand(x: number, y: number): Entity { return { id: getId(), x, y, vx: 0, vy: 0, width: 8, height: 8, mass: 0.5, type: 'dynamic', color: '#d4a574', trail: [], isSand: true }; }
function createRocket(targetX: number, targetY: number): Entity { return { id: getId(), x: targetX - BLOCK_SIZE / 2, y: -BLOCK_SIZE, vx: 0, vy: 0, width: BLOCK_SIZE, height: BLOCK_SIZE * 1.5, mass: 5, type: 'rocket', color: '#ef4444', trail: [], targetX, targetY, fuseTimer: 120 }; }
function createNuke(targetX: number, targetY: number): Entity { 
  // Little Boy: long cylinder, falls from sky
  return { id: getId(), x: targetX - 20, y: -200, vx: 0, vy: 0, width: 40, height: 120, mass: 20, type: 'nuke', color: '#4a4a4a', trail: [], fuseTimer: -1, animTimer: 0, targetX, targetY, isFalling: true }; 
}

function spawnParticles(particles: Particle[], x: number, y: number, type: Particle['type'], count: number, color?: string) {
  const colors: Record<string, string[]> = { spark: ['#fbbf24', '#f97316', '#ef4444', '#fff'], blood: ['#ef4444', '#dc2626', '#991b1b'], smoke: ['#6b7280', '#4b5563', '#374151'], coin: ['#fbbf24', '#f59e0b', '#fcd34d'], explosion: ['#ef4444', '#f97316', '#fbbf24', '#fff'], dust: ['#9ca3af', '#6b7280', '#d1d5db'], trail: ['#fff'], nuke: ['#fff', '#ff0', '#f90', '#f00', '#900'], fire: ['#ff4500', '#ff6347', '#ff8c00', '#ffd700'] };
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = Math.random() * (type === 'nuke' ? 12 : type === 'explosion' ? 4 : 4) + 1;
    const c = color || colors[type][Math.floor(Math.random() * colors[type].length)];
    particles.push({ x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - (type === 'coin' ? 3 : type === 'nuke' ? 5 : 0), life: type === 'nuke' ? 80 : type === 'explosion' ? 40 : type === 'smoke' ? 50 : 25, maxLife: type === 'nuke' ? 80 : type === 'explosion' ? 40 : type === 'smoke' ? 50 : 25, size: type === 'nuke' ? Math.random() * 12 + 6 : type === 'explosion' ? Math.random() * 6 + 3 : Math.random() * 3 + 1, color: c, type, gravity: type === 'smoke' ? -0.05 : type === 'nuke' ? -0.02 : type === 'coin' ? 0.1 : 0.15, friction: type === 'smoke' || type === 'nuke' ? 0.98 : 0.95 });
  }
}
function addToast(toasts: Toast[], text: string, color = '#00ffff') { toasts.push({ id: getId(), text, color, life: 120, maxLife: 120 }); }

function aabbCollision(a: Entity, b: Entity): boolean { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }
function circleRectCollision(cx: number, cy: number, cr: number, rx: number, ry: number, rw: number, rh: number): { hit: boolean; nx: number; ny: number; depth: number } {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX; const dy = cy - closestY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < cr) { const nx = dist === 0 ? 0 : dx / dist; const ny = dist === 0 ? -1 : dy / dist; return { hit: true, nx, ny, depth: cr - dist }; }
  return { hit: false, nx: 0, ny: 0, depth: 0 };
}
function circleCircleCollision(a: Entity, b: Entity): { hit: boolean; nx: number; ny: number; depth: number } {
  const dx = b.x - a.x; const dy = b.y - a.y; const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = (a.radius || 0) + (b.radius || 0);
  if (dist < minDist) { const nx = dist === 0 ? 0 : dx / dist; const ny = dist === 0 ? -1 : dy / dist; return { hit: true, nx, ny, depth: minDist - dist }; }
  return { hit: false, nx: 0, ny: 0, depth: 0 };
}
function resolveAABBOverlap(moving: Entity, solid: Entity, axis: 'x' | 'y') {
  if (axis === 'x') { if (moving.vx > 0) moving.x = solid.x - moving.width; else if (moving.vx < 0) moving.x = solid.x + solid.width; moving.vx = 0; }
  else { if (moving.vy > 0) { moving.y = solid.y - moving.height; moving.onGround = true; } else if (moving.vy < 0) moving.y = solid.y + solid.height; moving.vy = 0; }
}
function snapToGrid(val: number, gridSize: number): number { return Math.round(val / gridSize) * gridSize; }

// ==================== MAIN ====================
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const fpsCounterRef = useRef<{ frames: number; lastTime: number }>({ frames: 0, lastTime: 0 });
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showPanel, setShowPanel] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig>({ color: '#ef4444', face: 'normal', hat: 'none' });
  const showPanelRef = useRef(true);
  const playerConfigRef = useRef(playerConfig);
  const [, forceUpdate] = useState(0);
  showPanelRef.current = showPanel;
  playerConfigRef.current = playerConfig;

  const initGameState = useCallback((): GameState => ({
    player: createPlayer(playerConfigRef.current), staticBlocks: [], dynamicBlocks: [], balls: [], enemies: [], coins: [],
    tntBlocks: [], trampolines: [], sandBlocks: [], rockets: [], nukes: [],
    projectiles: [], particles: [], toasts: [],
    debug: { showCoords: false, showHitboxes: false, showVelocities: false, showGrid: true, showHP: true, slowMotion: false, paused: false, showFPS: true, showTrails: false, showCenterOfMass: false, showForces: false, showGravity: false, showMass: false, showNormals: false, showMousePos: false, showTime: false, showAIRange: false, showAttackRange: false, snapToGrid: true, showParticles: true, zeroGravity: false, windActive: false, windDirection: 0 },
    immortal: false, gameTime: 0, fps: 0, mousePos: { x: 0, y: 0 }, keys: new Set(),
    collisionNormals: [], score: 0, kills: 0, screenShake: 0, selectedTool: 'block', enemySpawnType: 'normal', gravityOverride: GRAVITY, nukeFlash: 0
  }), []);

  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6'];
  const faces: { id: FaceType; name: string; emoji: string }[] = [
    { id: 'normal', name: 'Steve', emoji: '😐' },
    { id: 'creeper', name: 'Creeper', emoji: '💚' },
    { id: 'zombie', name: 'Zombie', emoji: '🧟' },
    { id: 'skeleton', name: 'Skeleton', emoji: '💀' },
    { id: 'enderman', name: 'Enderman', emoji: '🟣' },
    { id: 'pig', name: 'Pig', emoji: '🐷' },
  ];

  const hats: { id: HatType; name: string; emoji: string }[] = [
    { id: 'none', name: 'None', emoji: '❌' },
    { id: 'birthday', name: 'Birthday', emoji: '🎂' },
    { id: 'mariachi', name: 'Mariachi', emoji: '🎺' },
    { id: 'crown', name: 'Crown', emoji: '👑' },
    { id: 'wizard', name: 'Wizard', emoji: '🧙' },
    { id: 'cap', name: 'Cap', emoji: '🧢' },
  ];

  const tutorialSteps = [
    { title: "🎮 1. Movimiento", desc: "WASD para mover. W/Espacio = saltar (¡doble salto!). Shift = dash. Q = ataque (5 daño). F = disparar." },
    { title: "🧱 2. Herramientas", desc: "1=Bloque, 2=Caja, 3=Pelota, 4=Enemigo, 5=Moneda, 6=TNT, 7=Trampolín, 8=Arena, 9=Cohete, 0=Nuke." },
    { title: "⚔️ 3. Combate", desc: "Q = ataque melee (5 daño). F = proyectil (15 daño). Las cajas se empujan. Las pelotas salen volando con Q (patada)." },
    { title: "💣 4. TNT Minecraft", desc: "La TNT (6) se activa con Q o proyectil. ¡CAE con gravedad como en Minecraft! Explota después de 1.5s." },
    { title: "☢️ 5. Nuke Little Boy", desc: "La Nuke (0) cae del cielo como la bomba Little Boy. ¡Explota al tocar el suelo! Animación de mushroom cloud." },
    { title: "🎯 6. Enemigos", desc: "Normal, Rápido, Tanque, Disparador (lanza proyectiles), Mini (120HP rapidísimo). Shift+T cambia tipo." },
    { title: "🔍 7. Debug", desc: "Panel lateral con toggles. Coordenadas, hitboxes, vectores, HP, trails, masa, fuerzas, etc." },
    { title: "🎮 8. ¡Experimenta!", desc: "Combina herramientas. Empuja cajas, patea pelotas, detona TNT, lanza nukes. ¡Aprende haciendo!" }
  ];

  useEffect(() => {
    if (!gameStarted) return;
    gameStateRef.current = initGameState();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cvs = canvas;

    const resize = () => { cvs.width = window.innerWidth - (showPanelRef.current ? 280 : 0); cvs.height = window.innerHeight - 44 - 36; };
    resize();
    window.addEventListener('resize', resize);
    const gs = gameStateRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      gs.keys.add(key);
      audio.init();
      switch (key) {
        case 'e': { const ex = gs.player.x + (gs.player.facingRight ? 80 : -80); gs.enemies.push(createEnemy(ex, gs.player.y - 20, gs.enemySpawnType)); break; }
        case 'q': handleAttack(); audio.play('attack'); break;
        case 'f': handleShoot(); audio.play('shoot'); break;
        case 'i': gs.immortal = !gs.immortal; break;
        case 'r': gs.player.x = 400; gs.player.y = 300; gs.player.vx = 0; gs.player.vy = 0; gs.player.hp = PLAYER_HP; gs.player.jumpCount = 0; break;
        case 'c': gs.staticBlocks = []; gs.dynamicBlocks = []; break;
        case 'x': gs.enemies = []; break;
        case 'v': gs.balls = []; break;
        case 'k': gs.coins = []; break;
        case 'l': gs.staticBlocks = []; gs.dynamicBlocks = []; gs.balls = []; gs.enemies = []; gs.coins = []; gs.tntBlocks = []; gs.trampolines = []; gs.sandBlocks = []; gs.rockets = []; gs.nukes = []; gs.projectiles = []; gs.particles = []; break;
        case 'h': setShowTutorial(p => !p); break;
        case 't': if (e.shiftKey) { const types: EnemyType[] = ['normal', 'fast', 'tank', 'shooter', 'mini']; const idx = types.indexOf(gs.enemySpawnType); gs.enemySpawnType = types[(idx + 1) % types.length]; } else { gs.debug.showTime = !gs.debug.showTime; } break;
        case 'z': gs.debug.zeroGravity = !gs.debug.zeroGravity; gs.gravityOverride = gs.debug.zeroGravity ? 0 : GRAVITY; break;
        case 'b': gs.debug.windActive = !gs.debug.windActive; break;
        case 'p': gs.debug.showMousePos = !gs.debug.showMousePos; break;
        case 'g': gs.debug.showGravity = !gs.debug.showGravity; break;
        case 'n': gs.debug.showNormals = !gs.debug.showNormals; break;
        case 'm': gs.debug.showMass = !gs.debug.showMass; break;
        case '1': gs.selectedTool = 'block'; break; case '2': gs.selectedTool = 'dynamic'; break;
        case '3': gs.selectedTool = 'ball'; break; case '4': gs.selectedTool = 'enemy'; break;
        case '5': gs.selectedTool = 'coin'; break; case '6': gs.selectedTool = 'tnt'; break;
        case '7': gs.selectedTool = 'trampoline'; break; case '8': gs.selectedTool = 'sand'; break;
        case '9': gs.selectedTool = 'rocket'; break; case '0': gs.selectedTool = 'nuke'; break;
      }
      forceUpdate(n => n + 1);
    };
    const handleKeyUp = (e: KeyboardEvent) => { gs.keys.delete(e.key.toLowerCase()); };
    const handleMouseMove = (e: MouseEvent) => { gs.mousePos = { x: e.offsetX, y: e.offsetY }; };
    const handleClick = (e: MouseEvent) => {
      e.preventDefault(); audio.init();
      let x = e.offsetX, y = e.offsetY;
      if (gs.debug.snapToGrid) { x = snapToGrid(x, BLOCK_SIZE); y = snapToGrid(y, BLOCK_SIZE); }
      const bx = x - BLOCK_SIZE / 2, by = y - BLOCK_SIZE / 2;
      switch (gs.selectedTool) {
        case 'block': gs.staticBlocks.push(createStaticBlock(bx, by)); break;
        case 'dynamic': gs.dynamicBlocks.push(createDynamicBlock(bx, by)); break;
        case 'ball': gs.balls.push(createBall(x, y)); break;
        case 'enemy': gs.enemies.push(createEnemy(bx, by, gs.enemySpawnType)); break;
        case 'coin': gs.coins.push(createCoin(x, y)); break;
        case 'tnt': { const tnt = createTNT(bx, by); tnt.isFalling = true; gs.tntBlocks.push(tnt); break; }
        case 'trampoline': gs.trampolines.push(createTrampoline(bx, by)); break;
        case 'sand': for (let i = 0; i < 5; i++) gs.sandBlocks.push(createSand(bx + Math.random() * BLOCK_SIZE, by + Math.random() * 10)); break;
        case 'rocket': gs.rockets.push(createRocket(x, y)); break;
        case 'nuke': gs.nukes.push(createNuke(x, y)); addToast(gs.toasts, '☢️ LITTLE BOY INCOMING!', '#ff0000'); break;
      }
      forceUpdate(n => n + 1);
    };
    const handleContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleClick);
    canvas.addEventListener('contextmenu', handleContextMenu);
    canvas.tabIndex = 0; canvas.focus();

    function handleAttack() {
      const p = gs.player;
      const attackRange = 60;
      const attackX = p.x + p.width / 2 + (p.facingRight ? 30 : -30);
      const attackY = p.y + p.height / 2;
      spawnParticles(gs.particles, attackX, attackY, 'spark', 8, '#ff6b35');

      gs.enemies.forEach(enemy => {
        const dx = (enemy.x + enemy.width / 2) - attackX;
        const dy = (enemy.y + enemy.height / 2) - attackY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < attackRange) {
          enemy.hp = (enemy.hp || 0) - ATTACK_DAMAGE;
          enemy.flashTimer = 10;
          const nx = dist > 0 ? dx / dist : 1; const ny = dist > 0 ? dy / dist : 0;
          enemy.vx += nx * KNOCKBACK_FORCE; enemy.vy += ny * KNOCKBACK_FORCE;
          spawnParticles(gs.particles, enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'blood', 6);
          gs.screenShake = 4;
          if (enemy.hp <= 0) { gs.kills++; gs.score += 20; spawnParticles(gs.particles, enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'explosion', 15); }
        }
      });

      // Kick balls
      gs.balls.forEach(ball => {
        const dx = ball.x - attackX; const dy = ball.y - attackY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < attackRange + ball.radius!) {
          const nx = dist > 0 ? dx / dist : (p.facingRight ? 1 : -1);
          const ny = dist > 0 ? dy / dist : -0.5;
          ball.vx = nx * KICK_FORCE; ball.vy = ny * KICK_FORCE - 4;
          spawnParticles(gs.particles, ball.x, ball.y, 'spark', 10, '#f97316');
          audio.play('kick');
        }
      });

      // Push dynamic blocks
      gs.dynamicBlocks.forEach(block => {
        const dx = (block.x + block.width / 2) - attackX;
        const dy = (block.y + block.height / 2) - attackY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < attackRange + 20) {
          const nx = dist > 0 ? dx / dist : (p.facingRight ? 1 : -1);
          block.vx += nx * 8; block.vy += (dist > 0 ? dy / dist : 0) * 6 - 2;
        }
      });

      // Activate TNT
      gs.tntBlocks.forEach(tnt => {
        const dx = (tnt.x + tnt.width / 2) - attackX;
        const dy = (tnt.y + tnt.height / 2) - attackY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < attackRange && (tnt.fuseTimer ?? -1) < 0) {
          tnt.fuseTimer = TNT_FUSE_TIME;
          tnt.isFalling = true; // Start falling when activated!
        }
      });

      gs.enemies = gs.enemies.filter(e => (e.hp || 0) > 0);
    }

    function handleShoot() {
      const p = gs.player;
      const dir = p.facingRight ? 1 : -1;
      gs.projectiles.push({ id: getId(), x: p.x + p.width / 2 + dir * 20, y: p.y + p.height / 2, vx: PROJECTILE_SPEED * dir, vy: 0, radius: 4, damage: PROJECTILE_DAMAGE, life: 120, color: '#00ffff', trail: [] });
    }

    function explodeTNT(tnt: Entity) {
      const cx = tnt.x + tnt.width / 2, cy = tnt.y + tnt.height / 2;
      audio.play('explosion'); gs.screenShake = 15;
      spawnParticles(gs.particles, cx, cy, 'explosion', 40);
      spawnParticles(gs.particles, cx, cy, 'fire', 20);
      spawnParticles(gs.particles, cx, cy, 'smoke', 15);
      
      gs.enemies.forEach(e => { const d = Math.sqrt((e.x + e.width / 2 - cx) ** 2 + (e.y + e.height / 2 - cy) ** 2); if (d < TNT_EXPLOSION_RADIUS) { e.hp = (e.hp || 0) - Math.round(60 * (1 - d / TNT_EXPLOSION_RADIUS)); e.flashTimer = 15; const f = (1 - d / TNT_EXPLOSION_RADIUS) * 15; e.vx += ((e.x + e.width / 2 - cx) / (d || 1)) * f; e.vy += ((e.y + e.height / 2 - cy) / (d || 1)) * f - 5; if ((e.hp || 0) <= 0) { gs.kills++; gs.score += 20; } } });
      gs.enemies = gs.enemies.filter(e => (e.hp || 0) > 0);
      
      const pd = Math.sqrt((gs.player.x + gs.player.width / 2 - cx) ** 2 + (gs.player.y + gs.player.height / 2 - cy) ** 2);
      if (pd < TNT_EXPLOSION_RADIUS && !gs.immortal) { gs.player.hp = (gs.player.hp || 0) - Math.round(40 * (1 - pd / TNT_EXPLOSION_RADIUS)); gs.player.flashTimer = 15; gs.player.vx += ((gs.player.x - cx) / (pd || 1)) * 10; gs.player.vy -= 8; }
      
      gs.dynamicBlocks.forEach(b => { const d = Math.sqrt((b.x + b.width / 2 - cx) ** 2 + (b.y + b.height / 2 - cy) ** 2); if (d < TNT_EXPLOSION_RADIUS && d > 0) { const f = (1 - d / TNT_EXPLOSION_RADIUS) * 12; b.vx += ((b.x + b.width / 2 - cx) / d) * f; b.vy += ((b.y + b.height / 2 - cy) / d) * f - 3; } });
      gs.balls.forEach(b => { const d = Math.sqrt((b.x - cx) ** 2 + (b.y - cy) ** 2); if (d < TNT_EXPLOSION_RADIUS && d > 0) { const f = (1 - d / TNT_EXPLOSION_RADIUS) * 15; b.vx += ((b.x - cx) / d) * f; b.vy += ((b.y - cy) / d) * f - 5; } });
      gs.sandBlocks.forEach(s => { const d = Math.sqrt((s.x + s.width / 2 - cx) ** 2 + (s.y + s.height / 2 - cy) ** 2); if (d < TNT_EXPLOSION_RADIUS && d > 0) { const f = (1 - d / TNT_EXPLOSION_RADIUS) * 18; s.vx += ((s.x + s.width / 2 - cx) / d) * f; s.vy += ((s.y + s.height / 2 - cy) / d) * f - 8; } });
      gs.tntBlocks = gs.tntBlocks.filter(t => t.id !== tnt.id);
    }

    function explodeNuke(nuke: Entity) {
      const cx = nuke.x + nuke.width / 2, cy = nuke.y + nuke.height / 2;
      const R = TNT_EXPLOSION_RADIUS * 4;
      
      // MASSIVE effects
      audio.play('nuke');
      gs.screenShake = 50;
      gs.nukeFlash = 30; // White flash
      
      // Mushroom cloud particles
      spawnParticles(gs.particles, cx, cy, 'nuke', 100);
      spawnParticles(gs.particles, cx, cy, 'fire', 60);
      spawnParticles(gs.particles, cx, cy, 'explosion', 80);
      spawnParticles(gs.particles, cx, cy, 'smoke', 50);
      
      addToast(gs.toasts, '☢️ NUKE DETONATED!', '#ff0000');

      gs.enemies.forEach(e => { const d = Math.sqrt((e.x + e.width / 2 - cx) ** 2 + (e.y + e.height / 2 - cy) ** 2); if (d < R) { e.hp = (e.hp || 0) - Math.round(200 * (1 - d / R)); e.flashTimer = 20; const f = (1 - d / R) * 30; e.vx += ((e.x + e.width / 2 - cx) / (d || 1)) * f; e.vy += ((e.y + e.height / 2 - cy) / (d || 1)) * f - 15; if ((e.hp || 0) <= 0) { gs.kills++; gs.score += 20; } } });
      gs.enemies = gs.enemies.filter(e => (e.hp || 0) > 0);
      
      const pd = Math.sqrt((gs.player.x + gs.player.width / 2 - cx) ** 2 + (gs.player.y + gs.player.height / 2 - cy) ** 2);
      if (pd < R && !gs.immortal) { gs.player.hp = (gs.player.hp || 0) - Math.round(150 * (1 - pd / R)); gs.player.flashTimer = 20; gs.player.vx += ((gs.player.x - cx) / (pd || 1)) * 25; gs.player.vy -= 20; }
      
      gs.dynamicBlocks.forEach(b => { const d = Math.sqrt((b.x + b.width / 2 - cx) ** 2 + (b.y + b.height / 2 - cy) ** 2); if (d < R && d > 0) { const f = (1 - d / R) * 35; b.vx += ((b.x + b.width / 2 - cx) / d) * f; b.vy += ((b.y + b.height / 2 - cy) / d) * f - 20; } });
      gs.balls.forEach(b => { const d = Math.sqrt((b.x - cx) ** 2 + (b.y - cy) ** 2); if (d < R && d > 0) { const f = (1 - d / R) * 40; b.vx += ((b.x - cx) / d) * f; b.vy += ((b.y - cy) / d) * f - 25; } });
      gs.sandBlocks.forEach(s => { const d = Math.sqrt((s.x + s.width / 2 - cx) ** 2 + (s.y + s.height / 2 - cy) ** 2); if (d < R && d > 0) { const f = (1 - d / R) * 45; s.vx += ((s.x + s.width / 2 - cx) / d) * f; s.vy += ((s.y + s.height / 2 - cy) / d) * f - 25; } });
      gs.sandBlocks = gs.sandBlocks.filter(s => { const d = Math.sqrt((s.x + s.width / 2 - cx) ** 2 + (s.y + s.height / 2 - cy) ** 2); return d > R * 0.3; });
      gs.nukes = gs.nukes.filter(n => n.id !== nuke.id);
    }

    function explodeRocket(rocket: Entity) {
      const cx = rocket.x + rocket.width / 2, cy = rocket.y + rocket.height / 2;
      const R = TNT_EXPLOSION_RADIUS * 1.5;
      audio.play('explosion'); gs.screenShake = 20;
      spawnParticles(gs.particles, cx, cy, 'explosion', 60); spawnParticles(gs.particles, cx, cy, 'smoke', 25);
      gs.enemies.forEach(e => { const d = Math.sqrt((e.x + e.width / 2 - cx) ** 2 + (e.y + e.height / 2 - cy) ** 2); if (d < R) { e.hp = (e.hp || 0) - Math.round(80 * (1 - d / R)); e.flashTimer = 15; const f = (1 - d / R) * 20; e.vx += ((e.x + e.width / 2 - cx) / (d || 1)) * f; e.vy += ((e.y + e.height / 2 - cy) / (d || 1)) * f - 8; if ((e.hp || 0) <= 0) { gs.kills++; gs.score += 20; } } });
      gs.enemies = gs.enemies.filter(e => (e.hp || 0) > 0);
      const pd = Math.sqrt((gs.player.x + gs.player.width / 2 - cx) ** 2 + (gs.player.y + gs.player.height / 2 - cy) ** 2);
      if (pd < R && !gs.immortal) { gs.player.hp = (gs.player.hp || 0) - Math.round(60 * (1 - pd / R)); gs.player.flashTimer = 15; gs.player.vx += ((gs.player.x - cx) / (pd || 1)) * 15; gs.player.vy -= 12; }
      gs.dynamicBlocks.forEach(b => { const d = Math.sqrt((b.x + b.width / 2 - cx) ** 2 + (b.y + b.height / 2 - cy) ** 2); if (d < R && d > 0) { const f = (1 - d / R) * 18; b.vx += ((b.x + b.width / 2 - cx) / d) * f; b.vy += ((b.y + b.height / 2 - cy) / d) * f - 8; } });
      gs.balls.forEach(b => { const d = Math.sqrt((b.x - cx) ** 2 + (b.y - cy) ** 2); if (d < R && d > 0) { const f = (1 - d / R) * 22; b.vx += ((b.x - cx) / d) * f; b.vy += ((b.y - cy) / d) * f - 10; } });
      gs.rockets = gs.rockets.filter(r => r.id !== rocket.id);
    }

    function updatePhysics(dt: number) {
      if (gs.debug.paused) return;
      const speed = gs.debug.slowMotion ? 0.3 : 1;
      const g = gs.gravityOverride * speed;
      const wind = gs.debug.windActive ? 0.15 * speed : 0;
      const p = gs.player;

      // Nuke flash decay
      if (gs.nukeFlash > 0) gs.nukeFlash--;

      // Player movement
      if ((p.dashTimer ?? 0) > 0) { p.dashTimer = (p.dashTimer ?? 0) - 1; }
      else {
        if (gs.keys.has('a')) { p.vx -= 1.2 * speed; p.facingRight = false; }
        if (gs.keys.has('d')) { p.vx += 1.2 * speed; p.facingRight = true; }
      }
      if (gs.keys.has('w') || gs.keys.has(' ')) {
        if (!gs.keys.has('_jh')) { gs.keys.add('_jh'); if (p.onGround || (p.jumpCount || 0) < DOUBLE_JUMP_MAX) { p.vy = JUMP_FORCE * speed; p.onGround = false; p.jumpCount = (p.jumpCount || 0) + 1; audio.play('jump'); } }
      } else { gs.keys.delete('_jh'); }
      if (gs.keys.has('shift') && (p.dashCooldown || 0) <= 0 && (p.dashTimer ?? 0) <= 0) { p.dashTimer = DASH_DURATION; p.dashCooldown = DASH_COOLDOWN; p.vx = (p.facingRight ? 1 : -1) * DASH_SPEED; p.vy = 0; audio.play('dash'); }
      if (p.dashCooldown && p.dashCooldown > 0) p.dashCooldown--;

      const dashActive = (p.dashTimer ?? 0) > 0;
      p.vx = Math.max(-MAX_SPEED * (dashActive ? 2.5 : 1), Math.min(MAX_SPEED * (dashActive ? 2.5 : 1), p.vx));
      p.vy += g; p.vx += wind;
      if (!dashActive) p.vx *= FRICTION;

      p.x += p.vx * speed; p.onGround = false;
      const allSolids = [...gs.staticBlocks, ...gs.tntBlocks.filter(t => !t.isFalling)];
      for (const block of allSolids) { if (aabbCollision(p, block)) resolveAABBOverlap(p, block, 'x'); }
      gs.dynamicBlocks.forEach(block => { if (aabbCollision(p, block)) { const ox = Math.min(p.x + p.width - block.x, block.x + block.width - p.x); const oy = Math.min(p.y + p.height - block.y, block.y + block.height - p.y); if (ox < oy) { if (p.vx > 0) { block.x = p.x + p.width; block.vx = Math.max(block.vx, p.vx * 0.6); } else if (p.vx < 0) { block.x = p.x - block.width; block.vx = Math.min(block.vx, p.vx * 0.6); } } else resolveAABBOverlap(p, block, 'y'); } });
      p.y += p.vy * speed;
      for (const block of allSolids) { if (aabbCollision(p, block)) resolveAABBOverlap(p, block, 'y'); }
      gs.dynamicBlocks.forEach(block => { if (aabbCollision(p, block)) resolveAABBOverlap(p, block, 'y'); });

      gs.trampolines.forEach(tramp => { if (aabbCollision(p, tramp) && p.vy > 0) { p.vy = TRAMPOLINE_FORCE * speed; p.jumpCount = 0; p.onGround = false; audio.play('bounce'); } });
      gs.coins = gs.coins.filter(coin => { if (aabbCollision(p, coin)) { gs.score += 10; audio.play('coin'); return false; } return true; });

      if (p.x < 0) { p.x = 0; p.vx = 0; } if (p.x + p.width > cvs.width) { p.x = cvs.width - p.width; p.vx = 0; }
      if (p.y < 0) { p.y = 0; p.vy = 0; } if (p.y + p.height > cvs.height) { p.y = cvs.height - p.height; p.vy = 0; p.onGround = true; p.jumpCount = 0; }
      if (p.flashTimer && p.flashTimer > 0) p.flashTimer--;

      // Dynamic blocks
      gs.dynamicBlocks.forEach(block => { block.vy += g; block.vx += wind; block.vx *= FRICTION; block.x += block.vx * speed; block.y += block.vy * speed; for (const sb of gs.staticBlocks) { if (aabbCollision(block, sb)) { resolveAABBOverlap(block, sb, 'x'); resolveAABBOverlap(block, sb, 'y'); } } if (block.x < 0) { block.x = 0; block.vx *= -0.5; } if (block.x + block.width > cvs.width) { block.x = cvs.width - block.width; block.vx *= -0.5; } if (block.y + block.height > cvs.height) { block.y = cvs.height - block.height; block.vy *= -0.5; block.vx *= FRICTION; } if (block.y < 0) { block.y = 0; block.vy = 0; } });

      // TNT with Minecraft physics (falls when activated)
      gs.tntBlocks.forEach(tnt => {
        if (tnt.isFalling) {
          tnt.vy += g;
          tnt.x += tnt.vx * speed;
          tnt.y += tnt.vy * speed;
          
          // Check ground collision
          if (tnt.y + tnt.height > cvs.height) {
            tnt.y = cvs.height - tnt.height;
            tnt.vy = 0;
            tnt.vx *= 0.5;
            tnt.isFalling = false;
            // Start fuse when it lands if not already started
            if ((tnt.fuseTimer ?? -1) < 0) tnt.fuseTimer = TNT_FUSE_TIME;
          }
          
          // Collide with static blocks
          for (const sb of gs.staticBlocks) {
            if (aabbCollision(tnt, sb)) {
              if (tnt.vy > 0) { tnt.y = sb.y - tnt.height; tnt.vy = 0; tnt.isFalling = false; if ((tnt.fuseTimer ?? -1) < 0) tnt.fuseTimer = TNT_FUSE_TIME; }
              else if (tnt.vy < 0) { tnt.y = sb.y + sb.height; tnt.vy = 0; }
            }
          }
        }
        
        if ((tnt.fuseTimer ?? 0) > 0) {
          tnt.fuseTimer = (tnt.fuseTimer ?? 0) - 1;
          tnt.animTimer = (tnt.animTimer ?? 0) + 1;
          if ((tnt.fuseTimer ?? 0) <= 0) explodeTNT(tnt);
          if ((tnt.fuseTimer ?? 0) % 5 === 0) spawnParticles(gs.particles, tnt.x + tnt.width / 2, tnt.y, 'spark', 2, '#ff4444');
        }
      });

      gs.trampolines.forEach(tramp => { if (tramp.animTimer && tramp.animTimer > 0) tramp.animTimer--; });

      // Sand
      gs.sandBlocks.forEach(sand => { sand.vy += g; sand.vx += wind; sand.vx *= FRICTION; sand.x += sand.vx * speed; sand.y += sand.vy * speed; for (const sb of gs.staticBlocks) { if (aabbCollision(sand, sb)) resolveAABBOverlap(sand, sb, 'y'); } if (sand.y + sand.height > cvs.height) { sand.y = cvs.height - sand.height; sand.vy = 0; } });

      // Rockets
      gs.rockets = gs.rockets.filter(rocket => {
        if (rocket.fuseTimer === undefined) return false;
        rocket.fuseTimer--;
        const tx = rocket.targetX || 0, ty = rocket.targetY || 0;
        const dx = tx - (rocket.x + rocket.width / 2), dy = ty - (rocket.y + rocket.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) { const s = 8 * speed; rocket.vx = (dx / dist) * s; rocket.vy = (dy / dist) * s; rocket.x += rocket.vx; rocket.y += rocket.vy; spawnParticles(gs.particles, rocket.x + rocket.width / 2, rocket.y + rocket.height, 'smoke', 2, '#ff6600'); }
        else { explodeRocket(rocket); return false; }
        if (rocket.fuseTimer <= 0) { explodeRocket(rocket); return false; }
        return true;
      });

      // Nukes - Little Boy falls from sky, explodes on ground contact
      gs.nukes = gs.nukes.filter(nuke => {
        if (nuke.isFalling) {
          // Fall with gravity
          nuke.vy += g * 3; // Falls fast
          nuke.vy = Math.min(nuke.vy, 15); // Terminal velocity
          nuke.y += nuke.vy;
          
          // Smoke trail
          if (Math.random() < 0.6) spawnParticles(gs.particles, nuke.x + nuke.width / 2, nuke.y + nuke.height, 'smoke', 2, '#555');
          
          // Check ground collision - EXPLODE!
          if (nuke.y + nuke.height >= cvs.height) {
            nuke.y = cvs.height - nuke.height;
            explodeNuke(nuke);
            return false;
          }
          
          // Check collision with blocks
          for (const block of gs.staticBlocks) {
            if (aabbCollision(nuke, block)) {
              explodeNuke(nuke);
              return false;
            }
          }
        }
        return true;
      });

      // Balls
      gs.balls.forEach(ball => { ball.vy += g; ball.vx += wind; ball.x += ball.vx * speed; ball.y += ball.vy * speed; for (const block of allSolids) { const col = circleRectCollision(ball.x, ball.y, ball.radius || BALL_RADIUS, block.x, block.y, block.width, block.height); if (col.hit) { ball.x += col.nx * col.depth; ball.y += col.ny * col.depth; const dot = ball.vx * col.nx + ball.vy * col.ny; ball.vx -= 2 * dot * col.nx * 0.8; ball.vy -= 2 * dot * col.ny * 0.8; } } const r = ball.radius || BALL_RADIUS; if (ball.x - r < 0) { ball.x = r; ball.vx *= -0.9; } if (ball.x + r > cvs.width) { ball.x = cvs.width - r; ball.vx *= -0.9; } if (ball.y - r < 0) { ball.y = r; ball.vy *= -0.9; } if (ball.y + r > cvs.height) { ball.y = cvs.height - r; ball.vy *= -0.9; ball.vx *= FRICTION; } });

      // Ball vs Ball
      for (let i = 0; i < gs.balls.length; i++) { for (let j = i + 1; j < gs.balls.length; j++) { const a = gs.balls[i], b = gs.balls[j]; const col = circleCircleCollision(a, b); if (col.hit) { a.x -= col.nx * col.depth / 2; a.y -= col.ny * col.depth / 2; b.x += col.nx * col.depth / 2; b.y += col.ny * col.depth / 2; const tm = a.mass + b.mass; const dvx = a.vx - b.vx, dvy = a.vy - b.vy; const dvn = dvx * col.nx + dvy * col.ny; if (dvn > 0) { a.vx -= (2 * b.mass / tm) * dvn * col.nx; a.vy -= (2 * b.mass / tm) * dvn * col.ny; b.vx += (2 * a.mass / tm) * dvn * col.nx; b.vy += (2 * a.mass / tm) * dvn * col.ny; } } } }

      // Projectiles
      gs.projectiles = gs.projectiles.filter(proj => {
        proj.x += proj.vx * speed; proj.y += proj.vy * speed; proj.vy += g * 0.3; proj.life--;
        proj.trail.push({ x: proj.x, y: proj.y }); if (proj.trail.length > 15) proj.trail.shift();
        if (proj.isEnemy && !gs.immortal) { const pd = Math.sqrt((p.x + p.width / 2 - proj.x) ** 2 + (p.y + p.height / 2 - proj.y) ** 2); if (pd < p.width / 2 + proj.radius) { p.hp = (p.hp || 0) - proj.damage; p.flashTimer = 10; gs.screenShake = 6; return false; } }
        if (!proj.isEnemy) { for (const enemy of gs.enemies) { const d = Math.sqrt((enemy.x + enemy.width / 2 - proj.x) ** 2 + (enemy.y + enemy.height / 2 - proj.y) ** 2); if (d < enemy.width / 2 + proj.radius) { enemy.hp = (enemy.hp || 0) - proj.damage; enemy.flashTimer = 8; if ((enemy.hp || 0) <= 0) { gs.kills++; gs.score += 20; } return false; } } }
        for (const tnt of gs.tntBlocks) { if (proj.x > tnt.x && proj.x < tnt.x + tnt.width && proj.y > tnt.y && proj.y < tnt.y + tnt.height) { if ((tnt.fuseTimer ?? -1) < 0) { tnt.fuseTimer = TNT_FUSE_TIME; tnt.isFalling = true; } return false; } }
        for (const block of allSolids) { if (proj.x > block.x && proj.x < block.x + block.width && proj.y > block.y && proj.y < block.y + block.height) return false; }
        gs.enemies = gs.enemies.filter(e => (e.hp || 0) > 0);
        return proj.life > 0 && proj.x > -50 && proj.x < cvs.width + 50 && proj.y < cvs.height + 50;
      });

      // Enemies AI
      gs.enemies.forEach(enemy => {
        enemy.vy += g; enemy.vx += wind;
        const dx = (p.x + p.width / 2) - (enemy.x + enemy.width / 2);
        const dy = (p.y + p.height / 2) - (enemy.y + enemy.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const sm = enemy.enemyType === 'fast' ? 2.5 : enemy.enemyType === 'tank' ? 0.6 : enemy.enemyType === 'shooter' ? 0.8 : enemy.enemyType === 'mini' ? 4.0 : 1;
        const dr = enemy.enemyType === 'fast' ? AI_RANGE * 1.3 : enemy.enemyType === 'mini' ? AI_RANGE * 1.5 : AI_RANGE;
        if (dist < dr) { enemy.aiState = 'chase'; enemy.vx += (dx / dist) * 0.15 * speed * sm; if (Math.abs(dx) < 50 && dy < -30 && enemy.onGround) enemy.vy = JUMP_FORCE * 0.7 * speed; } else enemy.aiState = 'idle';

        if (enemy.enemyType === 'shooter') {
          if (enemy.shootCooldown === undefined) enemy.shootCooldown = 120;
          if (enemy.shootCooldown > 0) enemy.shootCooldown--;
          else if (dist < AI_RANGE * 1.5) {
            const angle = Math.atan2(dy, dx);
            gs.projectiles.push({ id: getId(), x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2, vx: Math.cos(angle) * 7, vy: Math.sin(angle) * 7, radius: 5, damage: 8, life: 100, color: '#f97316', trail: [], isEnemy: true });
            enemy.shootCooldown = 90;
          }
        }

        enemy.vx *= FRICTION; enemy.x += enemy.vx * speed; enemy.y += enemy.vy * speed; enemy.onGround = false;
        for (const block of allSolids) { if (aabbCollision(enemy, block)) resolveAABBOverlap(enemy, block, 'x'); }
        for (const block of allSolids) { if (aabbCollision(enemy, block)) resolveAABBOverlap(enemy, block, 'y'); }
        if (enemy.x < 0) { enemy.x = 0; enemy.vx = 0; } if (enemy.x + enemy.width > cvs.width) { enemy.x = cvs.width - enemy.width; enemy.vx = 0; }
        if (enemy.y + enemy.height > cvs.height) { enemy.y = cvs.height - enemy.height; enemy.vy = 0; enemy.onGround = true; } if (enemy.y < 0) { enemy.y = 0; enemy.vy = 0; }

        if (enemy.damageCooldown && enemy.damageCooldown > 0) enemy.damageCooldown--;
        if (aabbCollision(enemy, p) && !gs.immortal && (!enemy.damageCooldown || enemy.damageCooldown <= 0)) {
          p.hp = (p.hp || 0) - ENEMY_DAMAGE; p.flashTimer = 8; enemy.damageCooldown = DAMAGE_COOLDOWN;
          p.vx += p.x < enemy.x ? -3 : 3; p.vy -= 2; gs.screenShake = 3;
        }
        if (enemy.flashTimer && enemy.flashTimer > 0) enemy.flashTimer--;
      });

      if (p.hp !== undefined) p.hp = Math.max(0, p.hp);
      if (gs.debug.showParticles) gs.particles = gs.particles.filter(pt => { pt.vy += pt.gravity; pt.vx *= pt.friction; pt.vy *= pt.friction; pt.x += pt.vx; pt.y += pt.vy; pt.life--; return pt.life > 0; });
      gs.toasts = gs.toasts.filter(t => { t.life--; return t.life > 0; });
      if (gs.screenShake > 0) gs.screenShake *= 0.85;
      if (gs.screenShake < 0.5) gs.screenShake = 0;
      gs.gameTime += dt * speed;
    }

    function drawPlayerFace(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, face: FaceType) {
      const cfg = playerConfigRef.current;
      const px = Math.max(1, Math.floor(w / 16)); // Pixel size for pixel art
      
      // Draw base cube with pixel art style
      ctx.fillStyle = cfg.color;
      ctx.fillRect(x, y, w, h);
      
      // Pixel art shading (darker edges)
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x, y, w, px); // Top edge
      ctx.fillRect(x, y, px, h); // Left edge
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x + w - px, y, px, h); // Right highlight
      ctx.fillRect(x, y + h - px, w, px); // Bottom highlight
      
      switch (face) {
        case 'creeper':
          // Pixel art creeper face
          ctx.fillStyle = '#000';
          // Eyes (4x4 pixels each)
          ctx.fillRect(x + w * 0.2, y + h * 0.25, px * 4, px * 4);
          ctx.fillRect(x + w * 0.6, y + h * 0.25, px * 4, px * 4);
          // Mouth (pixelated frown)
          ctx.fillRect(x + w * 0.35, y + h * 0.55, px * 5, px * 3);
          ctx.fillRect(x + w * 0.25, y + h * 0.65, px * 3, px * 3);
          ctx.fillRect(x + w * 0.6, y + h * 0.65, px * 3, px * 3);
          break;
        case 'zombie':
          // Pixel art zombie
          ctx.fillStyle = '#2d4a2d';
          ctx.fillRect(x, y, w, h);
          // Darker patches
          ctx.fillStyle = '#1a2e1a';
          ctx.fillRect(x + w * 0.1, y + h * 0.1, px * 3, px * 2);
          ctx.fillRect(x + w * 0.7, y + h * 0.8, px * 4, px * 2);
          // Eyes
          ctx.fillStyle = '#000';
          ctx.fillRect(x + w * 0.2, y + h * 0.3, px * 3, px * 3);
          ctx.fillRect(x + w * 0.6, y + h * 0.3, px * 3, px * 3);
          // Mouth
          ctx.fillRect(x + w * 0.3, y + h * 0.65, px * 6, px * 2);
          break;
        case 'skeleton':
          // Pixel art skeleton
          ctx.fillStyle = '#e8e8e8';
          ctx.fillRect(x, y, w, h);
          // Eye sockets
          ctx.fillStyle = '#000';
          ctx.fillRect(x + w * 0.2, y + h * 0.25, px * 4, px * 5);
          ctx.fillRect(x + w * 0.6, y + h * 0.25, px * 4, px * 5);
          // Nose hole
          ctx.fillRect(x + w * 0.45, y + h * 0.5, px * 2, px * 2);
          // Teeth
          ctx.fillRect(x + w * 0.3, y + h * 0.7, px * 2, px * 3);
          ctx.fillRect(x + w * 0.45, y + h * 0.7, px * 2, px * 3);
          ctx.fillRect(x + w * 0.6, y + h * 0.7, px * 2, px * 3);
          break;
        case 'enderman':
          // Pixel art enderman
          ctx.fillStyle = '#0a0a0a';
          ctx.fillRect(x, y, w, h);
          // Glowing purple eyes
          ctx.fillStyle = '#c084fc';
          ctx.fillRect(x + w * 0.15, y + h * 0.35, px * 5, px * 2);
          ctx.fillRect(x + w * 0.6, y + h * 0.35, px * 5, px * 2);
          // Glow effect
          ctx.fillStyle = 'rgba(192, 132, 252, 0.3)';
          ctx.fillRect(x + w * 0.1, y + h * 0.3, px * 7, px * 4);
          ctx.fillRect(x + w * 0.55, y + h * 0.3, px * 7, px * 4);
          break;
        case 'pig':
          // Pixel art pig
          ctx.fillStyle = '#ffb6c1';
          ctx.fillRect(x, y, w, h);
          // Eyes
          ctx.fillStyle = '#000';
          ctx.fillRect(x + w * 0.25, y + h * 0.3, px * 2, px * 2);
          ctx.fillRect(x + w * 0.65, y + h * 0.3, px * 2, px * 2);
          // Snout
          ctx.fillStyle = '#ff69b4';
          ctx.fillRect(x + w * 0.3, y + h * 0.55, px * 6, px * 4);
          // Nostrils
          ctx.fillStyle = '#000';
          ctx.fillRect(x + w * 0.38, y + h * 0.62, px * 2, px * 2);
          ctx.fillRect(x + w * 0.54, y + h * 0.62, px * 2, px * 2);
          break;
        default: // normal (steve-like)
          // Hair
          ctx.fillStyle = '#4a3728';
          ctx.fillRect(x, y, w, h * 0.3);
          // Face skin
          ctx.fillStyle = '#c69c6d';
          ctx.fillRect(x + px, y + h * 0.3, w - px * 2, h * 0.7 - px);
          // Eyes
          ctx.fillStyle = '#fff';
          ctx.fillRect(x + w * 0.2, y + h * 0.4, px * 3, px * 3);
          ctx.fillRect(x + w * 0.6, y + h * 0.4, px * 3, px * 3);
          // Pupils
          ctx.fillStyle = '#4a3728';
          ctx.fillRect(x + w * 0.22, y + h * 0.42, px * 2, px * 2);
          ctx.fillRect(x + w * 0.62, y + h * 0.42, px * 2, px * 2);
          // Mouth
          ctx.fillStyle = '#8b5e3c';
          ctx.fillRect(x + w * 0.35, y + h * 0.7, px * 4, px * 2);
          break;
      }
    }

    function drawHat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hat: HatType) {
      const px = Math.max(1, Math.floor(w / 16));
      
      switch (hat) {
        case 'birthday':
          // Party hat (cone)
          ctx.fillStyle = '#ff6b9d';
          ctx.beginPath();
          ctx.moveTo(x + w * 0.5, y - h * 0.4);
          ctx.lineTo(x + w * 0.2, y);
          ctx.lineTo(x + w * 0.8, y);
          ctx.closePath();
          ctx.fill();
          // Stripes
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(x + w * 0.35, y - h * 0.2, px * 2, h * 0.15);
          ctx.fillRect(x + w * 0.55, y - h * 0.15, px * 2, h * 0.1);
          // Pom pom
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x + w * 0.5, y - h * 0.4, px * 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'mariachi':
          // Sombrero
          ctx.fillStyle = '#8b4513';
          // Brim
          ctx.fillRect(x - w * 0.2, y - px * 2, w * 1.4, px * 3);
          // Crown
          ctx.fillRect(x + w * 0.2, y - h * 0.3, w * 0.6, h * 0.3);
          // Decoration
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(x + w * 0.2, y - px * 3, w * 0.6, px);
          break;
        case 'crown':
          // Golden crown
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(x + w * 0.15, y - h * 0.2, w * 0.7, h * 0.2);
          // Points
          ctx.fillRect(x + w * 0.15, y - h * 0.3, px * 2, h * 0.1);
          ctx.fillRect(x + w * 0.45, y - h * 0.35, px * 2, h * 0.15);
          ctx.fillRect(x + w * 0.75, y - h * 0.3, px * 2, h * 0.1);
          // Gems
          ctx.fillStyle = '#ff0000';
          ctx.fillRect(x + w * 0.3, y - h * 0.15, px * 2, px * 2);
          ctx.fillRect(x + w * 0.6, y - h * 0.15, px * 2, px * 2);
          break;
        case 'wizard':
          // Wizard hat
          ctx.fillStyle = '#4a0080';
          ctx.beginPath();
          ctx.moveTo(x + w * 0.5, y - h * 0.6);
          ctx.lineTo(x + w * 0.1, y);
          ctx.lineTo(x + w * 0.9, y);
          ctx.closePath();
          ctx.fill();
          // Stars
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(x + w * 0.4, y - h * 0.3, px * 2, px * 2);
          ctx.fillRect(x + w * 0.55, y - h * 0.15, px * 2, px * 2);
          // Brim
          ctx.fillRect(x, y - px, w, px * 2);
          break;
        case 'cap':
          // Baseball cap
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(x + w * 0.1, y - h * 0.2, w * 0.8, h * 0.2);
          // Brim
          ctx.fillRect(x + w * 0.6, y - px, w * 0.5, px * 2);
          // Button
          ctx.fillStyle = '#fff';
          ctx.fillRect(x + w * 0.45, y - h * 0.22, px * 2, px * 2);
          break;
      }
    }

    function render() {
      if (!ctx) return;
      const w = cvs.width, h = cvs.height;
      ctx.save();
      if (gs.screenShake > 0) ctx.translate((Math.random() - 0.5) * gs.screenShake * 2, (Math.random() - 0.5) * gs.screenShake * 2);
      
      // Background
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-10, -10, w + 20, h + 20);

      // Nuke flash
      if (gs.nukeFlash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${gs.nukeFlash / 30 * 0.8})`;
        ctx.fillRect(-10, -10, w + 20, h + 20);
      }

      // Grid
      if (gs.debug.showGrid) { ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 1; for (let x = 0; x < w; x += BLOCK_SIZE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += BLOCK_SIZE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); } }

      // Static blocks
      gs.staticBlocks.forEach(b => { ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.width, b.height); ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 1; ctx.strokeRect(b.x + 2, b.y + 2, b.width - 4, b.height - 4); });

      // Dynamic blocks
      gs.dynamicBlocks.forEach(b => { ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.width, b.height); ctx.strokeStyle = '#ca8a04'; ctx.lineWidth = 1; ctx.strokeRect(b.x + 2, b.y + 2, b.width - 4, b.height - 4); });

      // Balls
      gs.balls.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, b.radius || BALL_RADIUS, 0, Math.PI * 2); ctx.fillStyle = b.color; ctx.fill(); ctx.strokeStyle = '#ea580c'; ctx.lineWidth = 2; ctx.stroke(); });

      // Coins
      gs.coins.forEach(coin => { coin.animTimer = (coin.animTimer || 0) + 0.05; const bob = Math.sin(coin.animTimer) * 3; ctx.beginPath(); ctx.arc(coin.x + 8, coin.y + 8 + bob, 8, 0, Math.PI * 2); ctx.fillStyle = '#fbbf24'; ctx.fill(); ctx.fillStyle = '#92400e'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText('$', coin.x + 8, coin.y + 12 + bob); ctx.textAlign = 'left'; });

      // TNT - Enhanced pixel art Minecraft style
      gs.tntBlocks.forEach(tnt => {
        const ft = tnt.fuseTimer ?? -1;
        const flashing = ft > 0 && ft < 60;
        const tw = tnt.width;
        const th = tnt.height;
        const px = Math.max(1, Math.floor(tw / 16));
        
        // Base red color (flashing when active)
        ctx.fillStyle = flashing && Math.floor((tnt.animTimer ?? 0) / 4) % 2 === 0 ? '#ff4444' : '#dc2626';
        ctx.fillRect(tnt.x, tnt.y, tw, th);
        
        // Pixel art shading (darker edges)
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(tnt.x, tnt.y, tw, px); // Top
        ctx.fillRect(tnt.x, tnt.y, px, th); // Left
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(tnt.x + tw - px, tnt.y, px, th); // Right highlight
        ctx.fillRect(tnt.x, tnt.y + th - px, tw, px); // Bottom highlight
        
        // White bands (top and bottom)
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(tnt.x + px, tnt.y + px, tw - px * 2, px * 2);
        ctx.fillRect(tnt.x + px, tnt.y + th - px * 3, tw - px * 2, px * 2);
        
        // Dark band in middle
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(tnt.x + px * 2, tnt.y + th * 0.4, tw - px * 4, th * 0.2);
        
        // TNT text (pixel art style)
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(8, Math.floor(tw * 0.3))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TNT', tnt.x + tw / 2, tnt.y + th / 2);
        
        // Fuse (when active)
        if (ft > 0) {
          ctx.fillStyle = '#8b4513';
          ctx.fillRect(tnt.x + tw / 2 - px, tnt.y - px * 3, px * 2, px * 3);
          // Spark
          if (Math.floor((tnt.animTimer ?? 0) / 3) % 2 === 0) {
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(tnt.x + tw / 2, tnt.y - px * 3, px * 2, 0, Math.PI * 2);
            ctx.fill();
          }
          // Timer
          ctx.fillStyle = '#ff0';
          ctx.font = '9px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`${(ft / 60).toFixed(1)}s`, tnt.x, tnt.y - px * 5);
        }
        
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      });

      // Trampolines
      gs.trampolines.forEach(tramp => { const sq = tramp.animTimer && tramp.animTimer > 0 ? 0.5 : 1; ctx.fillStyle = tramp.color; ctx.fillRect(tramp.x, tramp.y + tramp.height * (1 - sq), tramp.width, tramp.height * sq); });

      // Sand
      gs.sandBlocks.forEach(sand => { ctx.fillStyle = sand.color; ctx.fillRect(sand.x, sand.y, sand.width, sand.height); });

      // Enemies
      gs.enemies.forEach(enemy => { const flash = enemy.flashTimer && enemy.flashTimer > 0; ctx.fillStyle = flash ? '#fff' : enemy.color; ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height); const eyeY = enemy.y + enemy.height * 0.35; const es = enemy.width * 0.12; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(enemy.x + enemy.width * 0.35, eyeY, es, 0, Math.PI * 2); ctx.arc(enemy.x + enemy.width * 0.65, eyeY, es, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(enemy.x + enemy.width * 0.35, eyeY, es * 0.5, 0, Math.PI * 2); ctx.arc(enemy.x + enemy.width * 0.65, eyeY, es * 0.5, 0, Math.PI * 2); ctx.fill(); });

      // Projectiles
      gs.projectiles.forEach(proj => { const gc = proj.isEnemy ? '#f97316' : '#00ffff'; for (let i = 1; i < proj.trail.length; i++) { const a = i / proj.trail.length; ctx.beginPath(); ctx.strokeStyle = gc + Math.round(a * 128).toString(16).padStart(2, '0'); ctx.lineWidth = proj.radius * a; ctx.moveTo(proj.trail[i - 1].x, proj.trail[i - 1].y); ctx.lineTo(proj.trail[i].x, proj.trail[i].y); ctx.stroke(); } ctx.beginPath(); ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2); ctx.fillStyle = proj.color; ctx.shadowColor = gc; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0; });

      // Rockets - Detailed pixel art style
      gs.rockets.forEach(rocket => { 
        ctx.save(); 
        const cx = rocket.x + rocket.width / 2, cy = rocket.y + rocket.height / 2; 
        const angle = Math.atan2(rocket.vy, rocket.vx); 
        ctx.translate(cx, cy); 
        ctx.rotate(angle); 
        
        const rw = rocket.width;
        const rh = rocket.height;
        const px = Math.max(1, Math.floor(rw / 16));
        
        // Body (red with pixel art shading)
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-rw / 2, -rh / 4, rw, rh / 2);
        
        // Nose cone (darker red)
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.moveTo(rw / 2, 0);
        ctx.lineTo(rw / 2 + rw * 0.3, -rh * 0.15);
        ctx.lineTo(rw / 2 + rw * 0.3, rh * 0.15);
        ctx.closePath();
        ctx.fill();
        
        // Fins (dark gray)
        ctx.fillStyle = '#374151';
        ctx.fillRect(-rw / 2, -rh / 2 - px * 2, px * 3, rh * 0.3);
        ctx.fillRect(-rw / 2, rh / 4, px * 3, rh * 0.3);
        
        // Window (light blue)
        ctx.fillStyle = '#60a5fa';
        ctx.fillRect(rw * 0.1, -rh * 0.1, px * 3, px * 3);
        
        // Pixel art shading
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-rw / 2, -rh / 4, rw, px);
        ctx.fillRect(-rw / 2, -rh / 4, px, rh / 2);
        
        ctx.restore(); 
        
        // Target indicator
        if (rocket.targetX !== undefined && rocket.targetY !== undefined) { 
          ctx.beginPath(); 
          ctx.arc(rocket.targetX, rocket.targetY, 8, 0, Math.PI * 2); 
          ctx.strokeStyle = '#ff000080'; 
          ctx.lineWidth = 2; 
          ctx.setLineDash([4, 4]); 
          ctx.stroke(); 
          ctx.setLineDash([]); 
        } 
      });

      // Nukes - Little Boy style
      gs.nukes.forEach(nuke => {
        const cx = nuke.x + nuke.width / 2;
        const cy = nuke.y + nuke.height / 2;
        
        ctx.save();
        // Rotate to point down while falling
        if (nuke.isFalling) {
          ctx.translate(cx, cy);
          ctx.rotate(Math.PI); // Point nose down
          ctx.translate(-cx, -cy);
        }
        
        // Little Boy: long cylinder, olive drab/green military color
        const bodyW = nuke.width * 0.8;
        const bodyH = nuke.height * 0.85;
        const bodyX = cx - bodyW / 2;
        const bodyY = nuke.y + nuke.height * 0.08;
        
        // Main body gradient (military green/gray)
        const bg = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY);
        bg.addColorStop(0, '#3d4f3d');
        bg.addColorStop(0.3, '#5a6b5a');
        bg.addColorStop(0.5, '#6b7d6b');
        bg.addColorStop(0.7, '#5a6b5a');
        bg.addColorStop(1, '#3d4f3d');
        ctx.fillStyle = bg;
        
        // Rounded cylinder body
        ctx.beginPath();
        ctx.roundRect(bodyX, bodyY, bodyW, bodyH, bodyW * 0.4);
        ctx.fill();
        
        // Nose cone (pointed)
        ctx.fillStyle = '#4a5a4a';
        ctx.beginPath();
        ctx.moveTo(cx - bodyW * 0.3, bodyY);
        ctx.lineTo(cx, bodyY - nuke.height * 0.12);
        ctx.lineTo(cx + bodyW * 0.3, bodyY);
        ctx.closePath();
        ctx.fill();
        
        // Tail fins
        ctx.fillStyle = '#2d3d2d';
        const finW = bodyW * 0.5;
        const finH = nuke.height * 0.15;
        const finY = bodyY + bodyH - finH * 0.2;
        // Left fin
        ctx.beginPath();
        ctx.moveTo(cx - bodyW * 0.35, finY);
        ctx.lineTo(cx - bodyW * 0.35 - finW, finY + finH);
        ctx.lineTo(cx - bodyW * 0.35, finY + finH * 0.6);
        ctx.closePath();
        ctx.fill();
        // Right fin
        ctx.beginPath();
        ctx.moveTo(cx + bodyW * 0.35, finY);
        ctx.lineTo(cx + bodyW * 0.35 + finW, finY + finH);
        ctx.lineTo(cx + bodyW * 0.35, finY + finH * 0.6);
        ctx.closePath();
        ctx.fill();
        
        // Radiation symbol ☢ (yellow on dark)
        ctx.fillStyle = '#fbbf24';
        ctx.font = `bold ${nuke.width * 0.5}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☢', cx, bodyY + bodyH * 0.4);
        
        // "LITTLE BOY" text
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(7, nuke.width * 0.15)}px monospace`;
        ctx.fillText('LITTLE', cx, bodyY + bodyH * 0.65);
        ctx.fillText('BOY', cx, bodyY + bodyH * 0.78);
        
        // Metal bands
        ctx.strokeStyle = '#2d3d2d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bodyX, bodyY + bodyH * 0.2);
        ctx.lineTo(bodyX + bodyW, bodyY + bodyH * 0.2);
        ctx.moveTo(bodyX, bodyY + bodyH * 0.8);
        ctx.lineTo(bodyX + bodyW, bodyY + bodyH * 0.8);
        ctx.stroke();
        
        ctx.restore();
        
        // Target indicator
        if (nuke.isFalling && nuke.targetX !== undefined && nuke.targetY !== undefined) {
          ctx.beginPath();
          ctx.arc(nuke.targetX, nuke.targetY, 15, 0, Math.PI * 2);
          ctx.strokeStyle = '#ff000080';
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
          // Crosshair
          ctx.beginPath();
          ctx.moveTo(nuke.targetX - 20, nuke.targetY);
          ctx.lineTo(nuke.targetX + 20, nuke.targetY);
          ctx.moveTo(nuke.targetX, nuke.targetY - 20);
          ctx.lineTo(nuke.targetX, nuke.targetY + 20);
          ctx.strokeStyle = '#ff000060';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      });

      // Player
      const p = gs.player; const pFlash = p.flashTimer && p.flashTimer > 0; const pDash = (p.dashTimer ?? 0) > 0;
      if (pDash) { ctx.fillStyle = '#60a5fa40'; ctx.fillRect(p.x - p.vx * 2, p.y, p.width, p.height); }
      
      if (pFlash) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(p.x, p.y, p.width, p.height);
      } else {
        drawPlayerFace(ctx, p.x, p.y, p.width, p.height, playerConfigRef.current.face);
        drawHat(ctx, p.x, p.y, p.width, p.height, playerConfigRef.current.hat);
      }
      
      if (p.dashCooldown && p.dashCooldown > 0) { ctx.fillStyle = '#60a5fa40'; ctx.fillRect(p.x, p.y + p.height + 3, p.width * (1 - p.dashCooldown / DASH_COOLDOWN), 3); }

      // Particles
      if (gs.debug.showParticles) { gs.particles.forEach(pt => { const a = pt.life / pt.maxLife; ctx.globalAlpha = a; ctx.fillStyle = pt.color; if (pt.type === 'spark' || pt.type === 'smoke' || pt.type === 'nuke' || pt.type === 'fire') { ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (pt.type === 'smoke' || pt.type === 'nuke' ? (2 - a) : a), 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size * a, pt.size * a); ctx.globalAlpha = 1; }); }

      // Debug overlays
      [gs.player, ...gs.staticBlocks, ...gs.dynamicBlocks, ...gs.balls, ...gs.enemies].forEach(e => {
        if (gs.debug.showCoords) { ctx.fillStyle = '#ffffffcc'; ctx.font = '9px monospace'; ctx.fillText(`${Math.round(e.x)},${Math.round(e.y)}`, e.x, e.y - 5); }
        if (gs.debug.showHitboxes) { ctx.setLineDash([3, 3]); ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 1.5; ctx.strokeRect(e.x, e.y, e.width, e.height); ctx.setLineDash([]); }
        if (gs.debug.showHP && e.hp !== undefined && e.maxHp !== undefined) { const bw = e.width + 4, bh = 4, by = e.y - 12, bx = e.x - 2; const pct = e.hp / e.maxHp; ctx.fillStyle = '#333'; ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = pct > 0.6 ? '#22c55e' : pct > 0.3 ? '#eab308' : '#ef4444'; ctx.fillRect(bx, by, bw * pct, bh); }
      });

      // HUD
      if (gs.debug.showFPS) { ctx.fillStyle = gs.fps >= 55 ? '#00ff00' : gs.fps >= 30 ? '#ffff00' : '#ff0000'; ctx.font = 'bold 13px monospace'; ctx.fillText(`FPS: ${gs.fps}`, w - 90, 22); }
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 14px monospace'; ctx.fillText(`★ ${gs.score}`, w - 90, 60);
      ctx.fillStyle = '#22c55e'; ctx.font = '11px monospace'; ctx.fillText(`☠ ${gs.kills}`, w - 90, 78);
      if (gs.debug.paused) { ctx.fillStyle = '#ff000088'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.fillText('⏸ PAUSED', w / 2, 30); ctx.textAlign = 'left'; }
      if (gs.immortal) { ctx.fillStyle = '#00ffff88'; ctx.font = '11px monospace'; ctx.fillText('🛡️ IMMORTAL', 10, 22); }
      
      gs.collisionNormals = [];
      ctx.restore();
    }

    function gameLoop(timestamp: number) {
      const dt = timestamp - lastTimeRef.current; lastTimeRef.current = timestamp;
      fpsCounterRef.current.frames++;
      if (timestamp - fpsCounterRef.current.lastTime >= 1000) { gs.fps = fpsCounterRef.current.frames; fpsCounterRef.current.frames = 0; fpsCounterRef.current.lastTime = timestamp; }
      updatePhysics(dt); render(); forceUpdate(n => n + 1);
      animFrameRef.current = requestAnimationFrame(gameLoop);
    }
    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => { cancelAnimationFrame(animFrameRef.current); window.removeEventListener('resize', resize); canvas.removeEventListener('keydown', handleKeyDown); canvas.removeEventListener('keyup', handleKeyUp); canvas.removeEventListener('mousemove', handleMouseMove); canvas.removeEventListener('mousedown', handleClick); canvas.removeEventListener('contextmenu', handleContextMenu); };
  }, [initGameState, gameStarted]);

  // ==================== START MENU ====================
  if (!gameStarted) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#0a0a1a] to-[#1a0a2a] overflow-hidden">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-cyan-400 mb-2 font-mono tracking-wider">🎮 SANDBOX 2D</h1>
          <p className="text-gray-400 font-mono text-sm">Educational Game Dev Debug Tool</p>
        </div>

        <div className="bg-[#111128] border border-[#334] rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl shadow-cyan-500/10">
          <h2 className="text-xl text-cyan-400 font-mono font-bold mb-6 text-center">Configure Player</h2>
          
          {/* Color picker */}
          <div className="mb-6">
            <label className="text-gray-300 font-mono text-sm mb-2 block">Color:</label>
            <div className="grid grid-cols-5 gap-2">
              {colors.map(c => (
                <button key={c} onClick={() => setPlayerConfig(p => ({ ...p, color: c }))}
                  className={`w-12 h-12 rounded-lg border-2 transition-all ${playerConfig.color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:border-gray-500'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          {/* Face picker */}
          <div className="mb-6">
            <label className="text-gray-300 font-mono text-sm mb-2 block">Face:</label>
            <div className="grid grid-cols-3 gap-2">
              {faces.map(f => (
                <button key={f.id} onClick={() => setPlayerConfig(p => ({ ...p, face: f.id }))}
                  className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${playerConfig.face === f.id ? 'border-cyan-400 bg-cyan-900/30 scale-105' : 'border-[#334] bg-[#1a1a2e] hover:bg-[#222238]'}`}>
                  <span className="text-2xl">{f.emoji}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{f.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Hat picker */}
          <div className="mb-8">
            <label className="text-gray-300 font-mono text-sm mb-2 block">Hat:</label>
            <div className="grid grid-cols-3 gap-2">
              {hats.map(h => (
                <button key={h.id} onClick={() => setPlayerConfig(p => ({ ...p, hat: h.id }))}
                  className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${playerConfig.hat === h.id ? 'border-cyan-400 bg-cyan-900/30 scale-105' : 'border-[#334] bg-[#1a1a2e] hover:bg-[#222238]'}`}>
                  <span className="text-2xl">{h.emoji}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{h.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 rounded-lg border-2 border-[#444] flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
              <PlayerPreview config={playerConfig} size={60} />
            </div>
          </div>

          {/* Start button */}
          <button onClick={() => { setGameStarted(true); }}
            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-mono font-bold rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/30 text-lg">
            ▶ START GAME
          </button>
        </div>

        <p className="text-gray-600 font-mono text-xs mt-6">Press H in-game for tutorial</p>
      </div>
    );
  }

  // ==================== GAME ====================
  const gs = gameStateRef.current;
  const playerHp = gs?.player.hp ?? PLAYER_HP;
  const hpPct = playerHp / PLAYER_HP;
  const hpColor = hpPct > 0.6 ? '#22c55e' : hpPct > 0.3 ? '#eab308' : '#ef4444';

  const toggleDebug = (key: keyof DebugState) => { if (!gs) return; (gs.debug as any)[key] = !(gs.debug as any)[key]; forceUpdate(n => n + 1); };

  const tools = [
    { id: 'block' as const, label: '🧱', key: '1' }, { id: 'dynamic' as const, label: '📦', key: '2' },
    { id: 'ball' as const, label: '⚽', key: '3' }, { id: 'enemy' as const, label: '👾', key: '4' },
    { id: 'coin' as const, label: '💰', key: '5' }, { id: 'tnt' as const, label: '💣', key: '6' },
    { id: 'trampoline' as const, label: '🟣', key: '7' }, { id: 'sand' as const, label: '⏳', key: '8' },
    { id: 'rocket' as const, label: '🚀', key: '9' }, { id: 'nuke' as const, label: '☢️', key: '0' },
  ];

  return (
    <div className="w-full h-screen flex flex-col bg-[#0a0a0a] overflow-hidden">
      <div className="h-[44px] bg-[#111118] border-b border-[#2a2a3a] flex items-center px-3 gap-2 shrink-0 overflow-x-auto">
        <span className="text-cyan-400 font-mono text-xs font-bold mr-2">🎮 SANDBOX 2D</span>
        <div className="h-6 w-px bg-[#333] mx-1" />
        {tools.map(tool => (
          <button key={tool.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (gs) { gs.selectedTool = tool.id; forceUpdate(n => n + 1); } }}
            className={`w-9 h-9 rounded text-sm font-mono transition-all ${gs?.selectedTool === tool.id ? 'bg-[#2a2a4a] ring-1 ring-cyan-500' : 'bg-[#1a1a2a] text-gray-400 hover:bg-[#222238]'}`}>
            {tool.label}
          </button>
        ))}
        <div className="h-6 w-px bg-[#333] mx-1" />
        <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap">Enemy: <span style={{ color: gs?.enemySpawnType === 'fast' ? '#06b6d4' : gs?.enemySpawnType === 'tank' ? '#7c3aed' : gs?.enemySpawnType === 'shooter' ? '#f97316' : gs?.enemySpawnType === 'mini' ? '#ec4899' : '#22c55e' }}>{gs?.enemySpawnType}</span> <span className="text-gray-600">[Shift+T]</span></span>
        <div className="ml-auto flex items-center gap-2">
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => setShowPanel(p => !p)} className="px-2 py-1 bg-[#1a1a2a] text-gray-400 rounded text-xs font-mono hover:bg-[#222238] transition">{showPanel ? '◀' : '▶'}</button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => setShowTutorial(true)} className="px-2 py-1 bg-cyan-900/50 text-cyan-300 rounded text-xs font-mono hover:bg-cyan-800/50 transition">📚</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="flex-1 block cursor-crosshair outline-none" />
        {showPanel && (
          <div className="w-[280px] bg-[#0d0d18] border-l border-[#2a2a3a] overflow-y-auto shrink-0 font-mono text-xs">
            <div className="p-3 border-b border-[#1a1a2e]">
              <div className="text-cyan-400 font-bold text-[11px] mb-2">📊 PLAYER</div>
              <div className="flex items-center gap-2"><span className="text-gray-500 w-8">HP</span><div className="flex-1 h-3 bg-[#1a1a2e] rounded overflow-hidden"><div className="h-full rounded transition-all" style={{ width: `${hpPct * 100}%`, backgroundColor: hpColor }} /></div><span className="text-gray-300 w-14 text-right">{playerHp}/{PLAYER_HP}</span></div>
              <div className="flex justify-between text-gray-400 mt-2"><span>★ <span className="text-yellow-400">{gs?.score ?? 0}</span></span><span>☠ <span className="text-green-400">{gs?.kills ?? 0}</span></span></div>
            </div>
            <div className="p-3 border-b border-[#1a1a2e]">
              <div className="text-cyan-400 font-bold text-[11px] mb-2">🔍 DEBUG</div>
              <div className="space-y-1">
                {([['showCoords', '📍 Coords'], ['showHitboxes', '🔲 Hitboxes'], ['showVelocities', '➡️ Velocity'], ['showGrid', '📐 Grid'], ['showHP', '❤️ HP'], ['showTrails', '〰️ Trails'], ['showMass', '⚖️ Mass'], ['showParticles', '✨ Particles']] as [keyof DebugState, string][]).map(([key, label]) => (
                  <button key={key} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleDebug(key)} className={`w-full text-left px-2 py-1 rounded transition ${gs?.debug[key] ? 'bg-cyan-900/30 text-cyan-300' : 'bg-[#1a1a2e] text-gray-500 hover:bg-[#222238]'}`}>{label} <span className="float-right">{gs?.debug[key] ? '✓' : '○'}</span></button>
                ))}
              </div>
            </div>
            <div className="p-3">
              <div className="text-cyan-400 font-bold text-[11px] mb-2">⚡ ACTIONS</div>
              <div className="grid grid-cols-2 gap-1">
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => { if (gs) { gs.immortal = !gs.immortal; forceUpdate(n => n + 1); } }} className="px-2 py-1 bg-[#1a1a2e] text-gray-400 rounded hover:bg-[#222238] text-[10px]">🛡️ [I]</button>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => { if (gs) { gs.player.x = 400; gs.player.y = 300; gs.player.hp = PLAYER_HP; forceUpdate(n => n + 1); } }} className="px-2 py-1 bg-[#1a1a2e] text-gray-400 rounded hover:bg-[#222238] text-[10px]">🔄 [R]</button>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => { if (gs) { gs.debug.slowMotion = !gs.debug.slowMotion; forceUpdate(n => n + 1); } }} className={`px-2 py-1 rounded text-[10px] ${gs?.debug.slowMotion ? 'bg-yellow-900/30 text-yellow-300' : 'bg-[#1a1a2e] text-gray-400 hover:bg-[#222238]'}`}>🐌 [6]</button>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => { if (gs) { gs.debug.paused = !gs.debug.paused; forceUpdate(n => n + 1); } }} className={`px-2 py-1 rounded text-[10px] ${gs?.debug.paused ? 'bg-red-900/30 text-red-300' : 'bg-[#1a1a2e] text-gray-400 hover:bg-[#222238]'}`}>⏸ [7]</button>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => { if (gs) { gs.staticBlocks = []; gs.dynamicBlocks = []; gs.balls = []; gs.enemies = []; gs.coins = []; gs.tntBlocks = []; gs.trampolines = []; gs.sandBlocks = []; gs.rockets = []; gs.nukes = []; gs.projectiles = []; gs.particles = []; forceUpdate(n => n + 1); } }} className="col-span-2 px-2 py-1 bg-red-900/20 text-red-400 rounded hover:bg-red-900/40 text-[10px]">🗑️ Clear All [L]</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="h-[36px] bg-[#0d0d18] border-t border-[#2a2a3a] flex items-center px-4 gap-4 font-mono text-[11px] text-gray-400 shrink-0">
        <span>HP: <span style={{ color: hpColor }} className="font-bold">{playerHp}/{PLAYER_HP}</span></span>
        <span className="text-gray-600">|</span><span>★ <span className="text-yellow-400 font-bold">{gs?.score ?? 0}</span></span>
        <span className="text-gray-600">|</span><span>☠ <span className="text-green-400">{gs?.kills ?? 0}</span></span>
        {gs?.immortal && <><span className="text-gray-600">|</span><span className="text-cyan-400">🛡️</span></>}
        {gs?.debug.paused && <><span className="text-gray-600">|</span><span className="text-red-400">⏸</span></>}
        <span className="ml-auto text-gray-600">[H] Tutorial</span>
      </div>

      <div className="fixed top-16 z-40 flex flex-col gap-1 pointer-events-none" style={{ right: showPanel ? '296px' : '16px' }}>
        {gs?.toasts.map(toast => (
          <div key={toast.id} className="px-3 py-1.5 rounded font-mono text-xs shadow-lg backdrop-blur-sm" style={{ backgroundColor: `${toast.color}15`, border: `1px solid ${toast.color}40`, color: toast.color, opacity: toast.life / toast.maxLife }}>{toast.text}</div>
        ))}
      </div>

      {showTutorial && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setShowTutorial(false)}>
          <div className="bg-[#0d0d20] border border-[#334] rounded-xl p-6 max-w-lg w-full mx-4 font-mono shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg text-cyan-400 font-bold">{tutorialSteps[tutorialStep].title}</h2><button onClick={() => setShowTutorial(false)} className="text-gray-500 hover:text-gray-300 text-lg">✕</button></div>
            <p className="text-gray-300 text-sm leading-relaxed mb-6 min-h-[60px]">{tutorialSteps[tutorialStep].desc}</p>
            <div className="flex items-center justify-between">
              <button onClick={() => setTutorialStep(s => Math.max(0, s - 1))} disabled={tutorialStep === 0} className="px-4 py-2 bg-[#1a1a2e] text-gray-300 rounded disabled:opacity-30 hover:bg-[#222238] border border-[#334]">← Anterior</button>
              <span className="text-gray-500 text-xs">{tutorialStep + 1}/{tutorialSteps.length}</span>
              <div className="flex gap-2">
                {tutorialStep < tutorialSteps.length - 1 && <button onClick={() => setTutorialStep(s => s + 1)} className="px-4 py-2 bg-cyan-800 text-white rounded hover:bg-cyan-700">Siguiente →</button>}
                <button onClick={() => setShowTutorial(false)} className="px-4 py-2 bg-[#1a1a2e] text-gray-300 rounded hover:bg-[#222238] border border-[#334]">Cerrar</button>
              </div>
            </div>
            <div className="flex justify-center gap-1.5 mt-5">{tutorialSteps.map((_, i) => <button key={i} onClick={() => setTutorialStep(i)} className={`w-2.5 h-2.5 rounded-full ${i === tutorialStep ? 'bg-cyan-400 scale-125' : 'bg-[#334]'}`} />)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Player preview component for start menu
function PlayerPreview({ config, size }: { config: PlayerConfig; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, size, size);
    
    const x = (size - PLAYER_SIZE) / 2;
    const y = (size - PLAYER_SIZE) / 2 + 10; // Offset down for hat space
    const w = PLAYER_SIZE;
    const h = PLAYER_SIZE;
    const px = Math.max(1, Math.floor(w / 16));
    
    // Draw base cube with pixel art style
    ctx.fillStyle = config.color;
    ctx.fillRect(x, y, w, h);
    
    // Pixel art shading
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x, y, w, px);
    ctx.fillRect(x, y, px, h);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x + w - px, y, px, h);
    ctx.fillRect(x, y + h - px, w, px);
    
    // Draw face based on type
    switch (config.face) {
      case 'creeper':
        ctx.fillStyle = '#000';
        ctx.fillRect(x + w * 0.2, y + h * 0.25, px * 4, px * 4);
        ctx.fillRect(x + w * 0.6, y + h * 0.25, px * 4, px * 4);
        ctx.fillRect(x + w * 0.35, y + h * 0.55, px * 5, px * 3);
        ctx.fillRect(x + w * 0.25, y + h * 0.65, px * 3, px * 3);
        ctx.fillRect(x + w * 0.6, y + h * 0.65, px * 3, px * 3);
        break;
      case 'zombie':
        ctx.fillStyle = '#2d4a2d';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#000';
        ctx.fillRect(x + w * 0.2, y + h * 0.3, px * 3, px * 3);
        ctx.fillRect(x + w * 0.6, y + h * 0.3, px * 3, px * 3);
        ctx.fillRect(x + w * 0.3, y + h * 0.65, px * 6, px * 2);
        break;
      case 'skeleton':
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#000';
        ctx.fillRect(x + w * 0.2, y + h * 0.25, px * 4, px * 5);
        ctx.fillRect(x + w * 0.6, y + h * 0.25, px * 4, px * 5);
        ctx.fillRect(x + w * 0.3, y + h * 0.7, px * 2, px * 3);
        ctx.fillRect(x + w * 0.45, y + h * 0.7, px * 2, px * 3);
        ctx.fillRect(x + w * 0.6, y + h * 0.7, px * 2, px * 3);
        break;
      case 'enderman':
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#c084fc';
        ctx.fillRect(x + w * 0.15, y + h * 0.35, px * 5, px * 2);
        ctx.fillRect(x + w * 0.6, y + h * 0.35, px * 5, px * 2);
        break;
      case 'pig':
        ctx.fillStyle = '#ffb6c1';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#000';
        ctx.fillRect(x + w * 0.25, y + h * 0.3, px * 2, px * 2);
        ctx.fillRect(x + w * 0.65, y + h * 0.3, px * 2, px * 2);
        ctx.fillStyle = '#ff69b4';
        ctx.fillRect(x + w * 0.3, y + h * 0.55, px * 6, px * 4);
        ctx.fillStyle = '#000';
        ctx.fillRect(x + w * 0.38, y + h * 0.62, px * 2, px * 2);
        ctx.fillRect(x + w * 0.54, y + h * 0.62, px * 2, px * 2);
        break;
      default:
        ctx.fillStyle = '#4a3728';
        ctx.fillRect(x, y, w, h * 0.3);
        ctx.fillStyle = '#c69c6d';
        ctx.fillRect(x + px, y + h * 0.3, w - px * 2, h * 0.7 - px);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + w * 0.2, y + h * 0.4, px * 3, px * 3);
        ctx.fillRect(x + w * 0.6, y + h * 0.4, px * 3, px * 3);
        ctx.fillStyle = '#4a3728';
        ctx.fillRect(x + w * 0.22, y + h * 0.42, px * 2, px * 2);
        ctx.fillRect(x + w * 0.62, y + h * 0.42, px * 2, px * 2);
        ctx.fillStyle = '#8b5e3c';
        ctx.fillRect(x + w * 0.35, y + h * 0.7, px * 4, px * 2);
        break;
    }
    
    // Draw hat
    if (config.hat !== 'none') {
      switch (config.hat) {
        case 'birthday':
          ctx.fillStyle = '#ff6b9d';
          ctx.beginPath();
          ctx.moveTo(x + w * 0.5, y - h * 0.4);
          ctx.lineTo(x + w * 0.2, y);
          ctx.lineTo(x + w * 0.8, y);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(x + w * 0.35, y - h * 0.2, px * 2, h * 0.15);
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x + w * 0.5, y - h * 0.4, px * 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'mariachi':
          ctx.fillStyle = '#8b4513';
          ctx.fillRect(x - w * 0.2, y - px * 2, w * 1.4, px * 3);
          ctx.fillRect(x + w * 0.2, y - h * 0.3, w * 0.6, h * 0.3);
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(x + w * 0.2, y - px * 3, w * 0.6, px);
          break;
        case 'crown':
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(x + w * 0.15, y - h * 0.2, w * 0.7, h * 0.2);
          ctx.fillRect(x + w * 0.15, y - h * 0.3, px * 2, h * 0.1);
          ctx.fillRect(x + w * 0.45, y - h * 0.35, px * 2, h * 0.15);
          ctx.fillRect(x + w * 0.75, y - h * 0.3, px * 2, h * 0.1);
          ctx.fillStyle = '#ff0000';
          ctx.fillRect(x + w * 0.3, y - h * 0.15, px * 2, px * 2);
          ctx.fillRect(x + w * 0.6, y - h * 0.15, px * 2, px * 2);
          break;
        case 'wizard':
          ctx.fillStyle = '#4a0080';
          ctx.beginPath();
          ctx.moveTo(x + w * 0.5, y - h * 0.6);
          ctx.lineTo(x + w * 0.1, y);
          ctx.lineTo(x + w * 0.9, y);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(x + w * 0.4, y - h * 0.3, px * 2, px * 2);
          ctx.fillRect(x, y - px, w, px * 2);
          break;
        case 'cap':
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(x + w * 0.1, y - h * 0.2, w * 0.8, h * 0.2);
          ctx.fillRect(x + w * 0.6, y - px, w * 0.5, px * 2);
          ctx.fillStyle = '#fff';
          ctx.fillRect(x + w * 0.45, y - h * 0.22, px * 2, px * 2);
          break;
      }
    }
  }, [config, size]);

  return <canvas ref={canvasRef} width={size} height={size} />;
}
