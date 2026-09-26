import { useEffect, useRef, useState, useCallback } from 'react';

// ==================== TYPES ====================
interface Vec2 { x: number; y: number; }

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  color: string;
  type: 'spark' | 'blood' | 'smoke' | 'coin' | 'explosion' | 'dust' | 'trail';
  gravity: number;
  friction: number;
}

interface Toast {
  id: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface Projectile {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  damage: number;
  life: number;
  color: string;
  trail: Vec2[];
}

type EnemyType = 'normal' | 'fast' | 'tank';

interface Entity {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  width: number; height: number;
  mass: number;
  type: 'player' | 'static' | 'dynamic' | 'ball' | 'enemy' | 'coin' | 'tnt' | 'trampoline';
  hp?: number;
  maxHp?: number;
  radius?: number;
  color: string;
  trail: Vec2[];
  onGround?: boolean;
  damageCooldown?: number;
  enemyType?: EnemyType;
  aiState?: 'idle' | 'chase' | 'flee';
  flashTimer?: number;
  jumpCount?: number;
  dashCooldown?: number;
  dashTimer?: number;
  facingRight?: boolean;
  bounceForce?: number;
  fuseTimer?: number;
  animTimer?: number;
}

interface DebugState {
  showCoords: boolean;
  showHitboxes: boolean;
  showVelocities: boolean;
  showGrid: boolean;
  showHP: boolean;
  slowMotion: boolean;
  paused: boolean;
  showFPS: boolean;
  showTrails: boolean;
  showCenterOfMass: boolean;
  showForces: boolean;
  showGravity: boolean;
  showMass: boolean;
  showNormals: boolean;
  showMousePos: boolean;
  showTime: boolean;
  showAIRange: boolean;
  showAttackRange: boolean;
  snapToGrid: boolean;
  showParticles: boolean;
  zeroGravity: boolean;
  windActive: boolean;
  windDirection: number;
}

interface GameState {
  player: Entity;
  staticBlocks: Entity[];
  dynamicBlocks: Entity[];
  balls: Entity[];
  enemies: Entity[];
  coins: Entity[];
  tntBlocks: Entity[];
  trampolines: Entity[];
  projectiles: Projectile[];
  particles: Particle[];
  toasts: Toast[];
  debug: DebugState;
  immortal: boolean;
  gameTime: number;
  fps: number;
  mousePos: Vec2;
  keys: Set<string>;
  collisionNormals: { x: number; y: number; nx: number; ny: number }[];
  score: number;
  kills: number;
  screenShake: number;
  selectedTool: 'block' | 'dynamic' | 'ball' | 'enemy' | 'coin' | 'tnt' | 'trampoline';
  enemySpawnType: EnemyType;
  gravityOverride: number;
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
const ATTACK_DAMAGE = 25;
const ENEMY_DAMAGE = 10;
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

let nextId = 1;
const getId = () => nextId++;

// ==================== AUDIO SYSTEM ====================
class AudioSystem {
  private ctx: AudioContext | null = null;
  
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  play(type: 'jump' | 'attack' | 'hit' | 'coin' | 'explosion' | 'dash' | 'bounce' | 'shoot') {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    const now = this.ctx.currentTime;
    
    switch (type) {
      case 'jump':
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      case 'attack':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      case 'hit':
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'coin':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1200, now + 0.05);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'explosion':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      case 'dash':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'bounce':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(500, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'shoot':
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
    }
  }
}

const audio = new AudioSystem();

// ==================== HELPER FUNCTIONS ====================
function createPlayer(): Entity {
  return {
    id: getId(), x: 400, y: 300, vx: 0, vy: 0,
    width: PLAYER_SIZE, height: PLAYER_SIZE, mass: 1,
    type: 'player', hp: PLAYER_HP, maxHp: PLAYER_HP,
    color: '#ef4444', trail: [], onGround: false, damageCooldown: 0,
    jumpCount: 0, dashCooldown: 0, dashTimer: 0, facingRight: true, flashTimer: 0
  };
}

function createStaticBlock(x: number, y: number): Entity {
  return {
    id: getId(), x, y, vx: 0, vy: 0,
    width: BLOCK_SIZE, height: BLOCK_SIZE, mass: Infinity,
    type: 'static', color: '#6b7280', trail: []
  };
}

function createDynamicBlock(x: number, y: number): Entity {
  return {
    id: getId(), x, y, vx: 0, vy: 0,
    width: BLOCK_SIZE, height: BLOCK_SIZE, mass: 3,
    type: 'dynamic', color: '#eab308', trail: []
  };
}

function createBall(x: number, y: number): Entity {
  return {
    id: getId(), x, y,
    vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 4,
    width: BALL_RADIUS * 2, height: BALL_RADIUS * 2, mass: 1,
    type: 'ball', radius: BALL_RADIUS, color: '#f97316', trail: []
  };
}

function createEnemy(x: number, y: number, enemyType: EnemyType = 'normal'): Entity {
  const configs = {
    normal: { hp: 50, mass: 2, color: '#22c55e', size: ENEMY_SIZE },
    fast: { hp: 30, mass: 1, color: '#06b6d4', size: 24 },
    tank: { hp: 120, mass: 5, color: '#7c3aed', size: 40 }
  };
  const cfg = configs[enemyType];
  return {
    id: getId(), x, y, vx: 0, vy: 0,
    width: cfg.size, height: cfg.size, mass: cfg.mass,
    type: 'enemy', hp: cfg.hp, maxHp: cfg.hp,
    color: cfg.color, trail: [], damageCooldown: 0,
    enemyType, aiState: 'idle', flashTimer: 0
  };
}

function createCoin(x: number, y: number): Entity {
  return {
    id: getId(), x, y, vx: 0, vy: 0,
    width: 16, height: 16, mass: 0.5,
    type: 'coin', radius: 8, color: '#fbbf24', trail: [],
    animTimer: Math.random() * Math.PI * 2
  };
}

function createTNT(x: number, y: number): Entity {
  return {
    id: getId(), x, y, vx: 0, vy: 0,
    width: BLOCK_SIZE, height: BLOCK_SIZE, mass: 4,
    type: 'tnt', color: '#dc2626', trail: [],
    fuseTimer: -1, animTimer: 0
  };
}

function createTrampoline(x: number, y: number): Entity {
  return {
    id: getId(), x, y, vx: 0, vy: 0,
    width: BLOCK_SIZE * 2, height: 12, mass: Infinity,
    type: 'trampoline', color: '#a855f7', trail: [],
    bounceForce: TRAMPOLINE_FORCE, animTimer: 0
  };
}

function spawnParticles(particles: Particle[], x: number, y: number, type: Particle['type'], count: number, color?: string) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1;
    const colors: Record<string, string[]> = {
      spark: ['#fbbf24', '#f97316', '#ef4444', '#ffffff'],
      blood: ['#ef4444', '#dc2626', '#991b1b'],
      smoke: ['#6b7280', '#4b5563', '#374151'],
      coin: ['#fbbf24', '#f59e0b', '#fcd34d'],
      explosion: ['#ef4444', '#f97316', '#fbbf24', '#ffffff', '#ff6b35'],
      dust: ['#9ca3af', '#6b7280', '#d1d5db'],
      trail: ['#ffffff']
    };
    const c = color || colors[type][Math.floor(Math.random() * colors[type].length)];
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed * (type === 'explosion' ? 3 : 1),
      vy: Math.sin(angle) * speed * (type === 'explosion' ? 3 : 1) - (type === 'coin' ? 3 : 0),
      life: type === 'explosion' ? 40 : type === 'smoke' ? 50 : 25,
      maxLife: type === 'explosion' ? 40 : type === 'smoke' ? 50 : 25,
      size: type === 'explosion' ? Math.random() * 6 + 3 : Math.random() * 3 + 1,
      color: c,
      type,
      gravity: type === 'smoke' ? -0.05 : type === 'coin' ? 0.1 : 0.15,
      friction: type === 'smoke' ? 0.98 : 0.95
    });
  }
}

function addToast(toasts: Toast[], text: string, color: string = '#00ffff') {
  toasts.push({ id: getId(), text, color, life: 120, maxLife: 120 });
}

function aabbCollision(a: Entity, b: Entity): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}

function circleRectCollision(cx: number, cy: number, cr: number, rx: number, ry: number, rw: number, rh: number): { hit: boolean; nx: number; ny: number; depth: number } {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < cr) {
    const nx = dist === 0 ? 0 : dx / dist;
    const ny = dist === 0 ? -1 : dy / dist;
    return { hit: true, nx, ny, depth: cr - dist };
  }
  return { hit: false, nx: 0, ny: 0, depth: 0 };
}

function circleCircleCollision(a: Entity, b: Entity): { hit: boolean; nx: number; ny: number; depth: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = (a.radius || 0) + (b.radius || 0);
  if (dist < minDist) {
    const nx = dist === 0 ? 0 : dx / dist;
    const ny = dist === 0 ? -1 : dy / dist;
    return { hit: true, nx, ny, depth: minDist - dist };
  }
  return { hit: false, nx: 0, ny: 0, depth: 0 };
}

function resolveAABBOverlap(moving: Entity, solid: Entity, axis: 'x' | 'y') {
  if (axis === 'x') {
    if (moving.vx > 0) {
      moving.x = solid.x - moving.width;
    } else if (moving.vx < 0) {
      moving.x = solid.x + solid.width;
    }
    moving.vx = 0;
  } else {
    if (moving.vy > 0) {
      moving.y = solid.y - moving.height;
      moving.onGround = true;
    } else if (moving.vy < 0) {
      moving.y = solid.y + solid.height;
    }
    moving.vy = 0;
  }
}

function snapToGrid(val: number, gridSize: number): number {
  return Math.round(val / gridSize) * gridSize;
}

// ==================== MAIN COMPONENT ====================
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const fpsCounterRef = useRef<{ frames: number; lastTime: number }>({ frames: 0, lastTime: 0 });
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showPanel, setShowPanel] = useState(true);
  const showPanelRef = useRef(true);
  const [, forceUpdate] = useState(0);
  
  // Keep ref in sync
  showPanelRef.current = showPanel;

  const initGameState = useCallback((): GameState => {
    return {
      player: createPlayer(),
      staticBlocks: [],
      dynamicBlocks: [],
      balls: [],
      enemies: [],
      coins: [],
      tntBlocks: [],
      trampolines: [],
      projectiles: [],
      particles: [],
      toasts: [],
      debug: {
        showCoords: false, showHitboxes: false, showVelocities: false,
        showGrid: true, showHP: true, slowMotion: false, paused: false,
        showFPS: true, showTrails: false, showCenterOfMass: false,
        showForces: false, showGravity: false, showMass: false,
        showNormals: false, showMousePos: false, showTime: false,
        showAIRange: false, showAttackRange: false, snapToGrid: true,
        showParticles: true, zeroGravity: false, windActive: false,
        windDirection: 0
      },
      immortal: false,
      gameTime: 0,
      fps: 0,
      mousePos: { x: 0, y: 0 },
      keys: new Set(),
      collisionNormals: [],
      score: 0,
      kills: 0,
      screenShake: 0,
      selectedTool: 'block',
      enemySpawnType: 'normal',
      gravityOverride: GRAVITY
    };
  }, []);

  const tutorialSteps = [
    { title: "🎮 1. Movimiento del Jugador", desc: "WASD para mover. W/Espacio = saltar (¡doble salto!). Shift = dash con cooldown. El jugador tiene gravedad, fricción y velocidad máxima." },
    { title: "🧱 2. Colocación de Bloques", desc: "Usa la barra de herramientas superior o teclas numéricas: 1=Bloque estático, 2=Dinámico, 3=Pelota, 4=Enemigo, 5=Moneda, 6=TNT, 7=Trampolín. Click para colocar." },
    { title: "⚔️ 3. Sistema de Combate", desc: "Q = ataque melee (25 daño + knockback). F = disparar proyectil (15 daño). Los enemigos tienen tipos: Normal (verde), Rápido (cyan), Tanque (púrpura)." },
    { title: "🎯 4. Tipos de Enemigos", desc: "Normal: equilibrado. Rápido: menos HP pero veloz. Tanque: mucho HP y grande pero lento. Pulsa T para cambiar tipo antes de spawnear (E)." },
    { title: "💰 5. Monedas y Puntos", desc: "Coloca monedas (5) y recógelas con el jugador para ganar puntos. Cada moneda = 10 puntos. ¡Intenta conseguir la mayor puntuación!" },
    { title: "💥 6. TNT y Explosiones", desc: "Coloca TNT (6) y golpéala con Q o un proyectil. Explota después de 1.5s causando daño en área y lanzando partículas. ¡Cuidado con la explosión!" },
    { title: "🟣 7. Trampolines", desc: "Los trampolines (7) lanzan al jugador y objetos hacia arriba con fuerza extra. Ideales para crear parkours y niveles verticales." },
    { title: "🔍 8. Debug Visual", desc: "Usa el panel lateral derecho o teclas: coordenadas(1), hitboxes(2), vectores(3), grid(4), HP(5), trails(9), centro de masa(0), fuerzas(F), masa(M), normales(N)." },
    { title: "⏱️ 9. Control del Tiempo", desc: "6 = Slow motion (30%). 7 = Pausar física. 8 = FPS. T(mayúscula) = Tiempo. G = Vector gravedad global. P = Posición del mouse." },
    { title: "🌬️ 10. Física Avanzada", desc: "Z = Toggle zero gravity. B = Toggle viento. N = Mostrar normales de colisión. Snap to grid para construcción precisa." },
    { title: "🛡️ 11. Estado del Jugador", desc: "I = Inmortalidad. R = Resetear posición. Doble salto disponible. Dash con Shift (cooldown visual). Proyectiles con F." },
    { title: "🧹 12. Limpieza", desc: "C = Borrar bloques. X = Borrar enemigos. V = Borrar pelotas. K = Borrar monedas. L = Limpiar todo." },
    { title: "📊 13. Panel de Debug", desc: "El panel lateral derecho muestra todos los toggles de debug. Click para activar/desactivar. También muestra estadísticas en tiempo real." },
    { title: "🚀 14. ¡Experimenta Libremente!", desc: "Combina todas las herramientas. Construye niveles, crea hordas de enemigos, lanza pelotas, haz parkours con trampolines. ¡Aprende haciendo!" }
  ];

  useEffect(() => {
    gameStateRef.current = initGameState();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cvs = canvas;

    const resize = () => {
      cvs.width = window.innerWidth - (showPanelRef.current ? 280 : 0);
      cvs.height = window.innerHeight - 44 - 36; // subtract toolbar and status bar
    };
    resize();
    window.addEventListener('resize', resize);

    const gs = gameStateRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      gs.keys.add(key);
      audio.init();

      switch (key) {
        case 'e':
          const ex = gs.player.x + (gs.player.facingRight ? 80 : -80);
          const ey = gs.player.y - 20;
          gs.enemies.push(createEnemy(ex, ey, gs.enemySpawnType));
          addToast(gs.toasts, `Enemy spawned: ${gs.enemySpawnType}`, '#22c55e');
          break;
        case 'q':
          handleAttack();
          audio.play('attack');
          break;
        case 'f':
          handleShoot();
          audio.play('shoot');
          break;
        case 'i':
          gs.immortal = !gs.immortal;
          addToast(gs.toasts, gs.immortal ? '🛡️ Immortal ON' : '🛡️ Immortal OFF', '#00ffff');
          break;
        case 'r':
          gs.player.x = 400; gs.player.y = 300;
          gs.player.vx = 0; gs.player.vy = 0;
          gs.player.hp = PLAYER_HP;
          gs.player.jumpCount = 0;
          addToast(gs.toasts, 'Player reset', '#fbbf24');
          break;
        case 'c':
          gs.staticBlocks = []; gs.dynamicBlocks = [];
          addToast(gs.toasts, 'Blocks cleared', '#6b7280');
          break;
        case 'x':
          gs.enemies = [];
          addToast(gs.toasts, 'Enemies cleared', '#22c55e');
          break;
        case 'v':
          gs.balls = [];
          addToast(gs.toasts, 'Balls cleared', '#f97316');
          break;
        case 'k':
          gs.coins = [];
          addToast(gs.toasts, 'Coins cleared', '#fbbf24');
          break;
        case 'l':
          gs.staticBlocks = []; gs.dynamicBlocks = []; gs.balls = [];
          gs.enemies = []; gs.coins = []; gs.tntBlocks = []; gs.trampolines = [];
          gs.projectiles = []; gs.particles = [];
          addToast(gs.toasts, '🧹 All cleared!', '#ff6b6b');
          break;
        case 'h':
          setShowTutorial(prev => !prev);
          break;
        case 't':
          if (e.shiftKey) {
            // Cycle enemy type
            const types: EnemyType[] = ['normal', 'fast', 'tank'];
            const idx = types.indexOf(gs.enemySpawnType);
            gs.enemySpawnType = types[(idx + 1) % types.length];
            addToast(gs.toasts, `Enemy type: ${gs.enemySpawnType}`, '#06b6d4');
          } else {
            gs.debug.showTime = !gs.debug.showTime;
          }
          break;
        case 'z':
          gs.debug.zeroGravity = !gs.debug.zeroGravity;
          gs.gravityOverride = gs.debug.zeroGravity ? 0 : GRAVITY;
          addToast(gs.toasts, gs.debug.zeroGravity ? '🌌 Zero Gravity' : '🌍 Normal Gravity', '#a855f7');
          break;
        case 'b':
          gs.debug.windActive = !gs.debug.windActive;
          addToast(gs.toasts, gs.debug.windActive ? '💨 Wind ON' : '💨 Wind OFF', '#38bdf8');
          break;
        case 'p':
          gs.debug.showMousePos = !gs.debug.showMousePos;
          break;
        case 'g':
          gs.debug.showGravity = !gs.debug.showGravity;
          break;
        case 'n':
          gs.debug.showNormals = !gs.debug.showNormals;
          break;
        case 'm':
          gs.debug.showMass = !gs.debug.showMass;
          break;
        case '1': gs.selectedTool = 'block'; gs.debug.showCoords = !gs.debug.showCoords; break;
        case '2': gs.selectedTool = 'dynamic'; gs.debug.showHitboxes = !gs.debug.showHitboxes; break;
        case '3': gs.selectedTool = 'ball'; gs.debug.showVelocities = !gs.debug.showVelocities; break;
        case '4': gs.selectedTool = 'enemy'; break;
        case '5': gs.selectedTool = 'coin'; gs.debug.showHP = !gs.debug.showHP; break;
        case '6': gs.selectedTool = 'tnt'; gs.debug.slowMotion = !gs.debug.slowMotion; break;
        case '7': gs.selectedTool = 'trampoline'; gs.debug.paused = !gs.debug.paused; break;
        case '8': gs.debug.showFPS = !gs.debug.showFPS; break;
        case '9': gs.debug.showTrails = !gs.debug.showTrails; break;
        case '0': gs.debug.showCenterOfMass = !gs.debug.showCenterOfMass; break;
      }
      forceUpdate(n => n + 1);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      gs.keys.delete(e.key.toLowerCase());
    };

    const handleMouseMove = (e: MouseEvent) => {
      gs.mousePos = { x: e.offsetX, y: e.offsetY };
    };

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      audio.init();
      let x = e.offsetX;
      let y = e.offsetY;

      if (gs.debug.snapToGrid) {
        x = snapToGrid(x, BLOCK_SIZE);
        y = snapToGrid(y, BLOCK_SIZE);
      }

      const bx = x - BLOCK_SIZE / 2;
      const by = y - BLOCK_SIZE / 2;

      switch (gs.selectedTool) {
        case 'block':
          gs.staticBlocks.push(createStaticBlock(bx, by));
          spawnParticles(gs.particles, x, y, 'dust', 5);
          break;
        case 'dynamic':
          gs.dynamicBlocks.push(createDynamicBlock(bx, by));
          spawnParticles(gs.particles, x, y, 'dust', 5);
          break;
        case 'ball':
          gs.balls.push(createBall(x, y));
          spawnParticles(gs.particles, x, y, 'spark', 8);
          break;
        case 'enemy':
          gs.enemies.push(createEnemy(bx, by, gs.enemySpawnType));
          spawnParticles(gs.particles, x, y, 'smoke', 6);
          break;
        case 'coin':
          gs.coins.push(createCoin(x, y));
          spawnParticles(gs.particles, x, y, 'coin', 5);
          break;
        case 'tnt':
          gs.tntBlocks.push(createTNT(bx, by));
          break;
        case 'trampoline':
          gs.trampolines.push(createTrampoline(bx, by));
          spawnParticles(gs.particles, x, y, 'spark', 8, '#a855f7');
          break;
      }
      forceUpdate(n => n + 1);
    };

    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };

   window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleClick);
    canvas.addEventListener('contextmenu', handleContextMenu);
    canvas.tabIndex = 0;
    canvas.focus();

    function handleAttack() {
      const p = gs.player;
      const attackRange = 60;
      const attackX = p.x + p.width / 2 + (p.facingRight ? 30 : -30);
      const attackY = p.y + p.height / 2;
      
      // Attack particles
      spawnParticles(gs.particles, attackX, attackY, 'spark', 12, '#ff6b35');

      gs.enemies.forEach(enemy => {
        const dx = (enemy.x + enemy.width / 2) - attackX;
        const dy = (enemy.y + enemy.height / 2) - attackY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < attackRange) {
          enemy.hp = (enemy.hp || 0) - ATTACK_DAMAGE;
          enemy.flashTimer = 10;
          const nx = dist > 0 ? dx / dist : 1;
          const ny = dist > 0 ? dy / dist : 0;
          enemy.vx += nx * KNOCKBACK_FORCE;
          enemy.vy += ny * KNOCKBACK_FORCE;
          spawnParticles(gs.particles, enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'blood', 8);
          gs.screenShake = 5;
          
          if (enemy.hp <= 0) {
            gs.kills++;
            gs.score += enemy.enemyType === 'tank' ? 50 : enemy.enemyType === 'fast' ? 30 : 20;
            spawnParticles(gs.particles, enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'explosion', 20);
            addToast(gs.toasts, `+${enemy.enemyType === 'tank' ? 50 : enemy.enemyType === 'fast' ? 30 : 20} pts`, '#fbbf24');
          }
        }
      });

      // TNT activation
      gs.tntBlocks.forEach(tnt => {
        const dx = (tnt.x + tnt.width / 2) - attackX;
        const dy = (tnt.y + tnt.height / 2) - attackY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < attackRange && (tnt.fuseTimer ?? -1) < 0) {
          tnt.fuseTimer = TNT_FUSE_TIME;
        }
      });

      gs.enemies = gs.enemies.filter(e => (e.hp || 0) > 0);
    }

    function handleShoot() {
      const p = gs.player;
      const dir = p.facingRight ? 1 : -1;
      gs.projectiles.push({
        id: getId(),
        x: p.x + p.width / 2 + dir * 20,
        y: p.y + p.height / 2,
        vx: PROJECTILE_SPEED * dir,
        vy: 0,
        radius: 4,
        damage: PROJECTILE_DAMAGE,
        life: 120,
        color: '#00ffff',
        trail: []
      });
    }

    function explodeTNT(tnt: Entity) {
      const cx = tnt.x + tnt.width / 2;
      const cy = tnt.y + tnt.height / 2;
      
      audio.play('explosion');
      gs.screenShake = 15;
      spawnParticles(gs.particles, cx, cy, 'explosion', 40);
      spawnParticles(gs.particles, cx, cy, 'smoke', 15);

      // Damage enemies in radius
      gs.enemies.forEach(enemy => {
        const dx = (enemy.x + enemy.width / 2) - cx;
        const dy = (enemy.y + enemy.height / 2) - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < TNT_EXPLOSION_RADIUS) {
          const dmg = Math.round(60 * (1 - dist / TNT_EXPLOSION_RADIUS));
          enemy.hp = (enemy.hp || 0) - dmg;
          enemy.flashTimer = 15;
          const force = (1 - dist / TNT_EXPLOSION_RADIUS) * 15;
          enemy.vx += (dx / dist) * force;
          enemy.vy += (dy / dist) * force - 5;
          if (enemy.hp <= 0) {
            gs.kills++;
            gs.score += 30;
          }
        }
      });
      gs.enemies = gs.enemies.filter(e => (e.hp || 0) > 0);

      // Damage player
      const pdx = (gs.player.x + gs.player.width / 2) - cx;
      const pdy = (gs.player.y + gs.player.height / 2) - cy;
      const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
      if (pdist < TNT_EXPLOSION_RADIUS && !gs.immortal) {
        const dmg = Math.round(40 * (1 - pdist / TNT_EXPLOSION_RADIUS));
        gs.player.hp = (gs.player.hp || 0) - dmg;
        gs.player.flashTimer = 15;
        gs.player.vx += (pdx / pdist) * 10;
        gs.player.vy -= 8;
        audio.play('hit');
      }

      // Push dynamic blocks and balls
      gs.dynamicBlocks.forEach(block => {
        const dx = (block.x + block.width / 2) - cx;
        const dy = (block.y + block.height / 2) - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < TNT_EXPLOSION_RADIUS && dist > 0) {
          const force = (1 - dist / TNT_EXPLOSION_RADIUS) * 12;
          block.vx += (dx / dist) * force;
          block.vy += (dy / dist) * force - 3;
        }
      });

      gs.balls.forEach(ball => {
        const dx = ball.x - cx;
        const dy = ball.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < TNT_EXPLOSION_RADIUS && dist > 0) {
          const force = (1 - dist / TNT_EXPLOSION_RADIUS) * 15;
          ball.vx += (dx / dist) * force;
          ball.vy += (dy / dist) * force - 5;
        }
      });

      // Remove TNT
      gs.tntBlocks = gs.tntBlocks.filter(t => t.id !== tnt.id);
    }

    function updatePhysics(dt: number) {
      if (gs.debug.paused) return;
      const speed = gs.debug.slowMotion ? 0.3 : 1;
      const g = gs.gravityOverride * speed;
      const wind = gs.debug.windActive ? 0.15 * speed : 0;

      // Update player
      const p = gs.player;
      if ((p.dashTimer ?? 0) > 0) {
        p.dashTimer = (p.dashTimer ?? 0) - 1;
      } else {
        if (gs.keys.has('a')) { p.vx -= 1.2 * speed; p.facingRight = false; }
        if (gs.keys.has('d')) { p.vx += 1.2 * speed; p.facingRight = true; }
      }

      // Jump (double jump)
      if ((gs.keys.has('w') || gs.keys.has(' '))) {
        if (!gs.keys.has('_jumpHeld')) {
          gs.keys.add('_jumpHeld');
          if (p.onGround || (p.jumpCount || 0) < DOUBLE_JUMP_MAX) {
            p.vy = JUMP_FORCE * speed;
            p.onGround = false;
            p.jumpCount = (p.jumpCount || 0) + 1;
            audio.play('jump');
            spawnParticles(gs.particles, p.x + p.width / 2, p.y + p.height, 'dust', 4);
          }
        }
      } else {
        gs.keys.delete('_jumpHeld');
      }

      // Dash
      if (gs.keys.has('shift') && (p.dashCooldown || 0) <= 0 && (p.dashTimer ?? 0) <= 0) {
        p.dashTimer = DASH_DURATION;
        p.dashCooldown = DASH_COOLDOWN;
        p.vx = (p.facingRight ? 1 : -1) * DASH_SPEED;
        p.vy = 0;
        audio.play('dash');
        spawnParticles(gs.particles, p.x + p.width / 2, p.y + p.height / 2, 'trail', 8, '#60a5fa');
      }
      if (p.dashCooldown && p.dashCooldown > 0) p.dashCooldown--;

      const dashActive = (p.dashTimer ?? 0) > 0;
      p.vx = Math.max(-MAX_SPEED * (dashActive ? 2.5 : 1), Math.min(MAX_SPEED * (dashActive ? 2.5 : 1), p.vx));
      p.vy += g;
      p.vx += wind;
      if (!dashActive) p.vx *= FRICTION;

      // Move X
      p.x += p.vx * speed;
      p.onGround = false;

      const allSolids = [...gs.staticBlocks, ...gs.dynamicBlocks, ...gs.tntBlocks];
      for (const block of allSolids) {
        if (aabbCollision(p, block)) {
          resolveAABBOverlap(p, block, 'x');
          if (block.type === 'dynamic' && block.mass < Infinity) {
            block.vx += p.vx * (p.mass / block.mass) * 0.5;
          }
        }
      }

      // Move Y
      p.y += p.vy * speed;
      for (const block of allSolids) {
        if (aabbCollision(p, block)) {
          resolveAABBOverlap(p, block, 'y');
        }
      }

      // Trampoline collision
      gs.trampolines.forEach(tramp => {
        if (aabbCollision(p, tramp) && p.vy > 0) {
          p.vy = TRAMPOLINE_FORCE * speed;
          p.jumpCount = 0;
          p.onGround = false;
          tramp.animTimer = 10;
          audio.play('bounce');
          spawnParticles(gs.particles, p.x + p.width / 2, tramp.y, 'spark', 8, '#a855f7');
        }
      });

      // Coin collection
      gs.coins = gs.coins.filter(coin => {
        if (aabbCollision(p, coin)) {
          gs.score += 10;
          audio.play('coin');
          spawnParticles(gs.particles, coin.x + coin.width / 2, coin.y + coin.height / 2, 'coin', 10);
          addToast(gs.toasts, '+10 pts', '#fbbf24');
          return false;
        }
        return true;
      });

      // World bounds for player
      if (p.x < 0) { p.x = 0; p.vx = 0; }
      if (p.x + p.width > cvs.width) { p.x = cvs.width - p.width; p.vx = 0; }
      if (p.y < 0) { p.y = 0; p.vy = 0; }
      if (p.y + p.height > cvs.height) { p.y = cvs.height - p.height; p.vy = 0; p.onGround = true; p.jumpCount = 0; }

      if (p.onGround) p.jumpCount = 0;
      if (p.flashTimer && p.flashTimer > 0) p.flashTimer--;

      // Trail
      if (gs.debug.showTrails) {
        p.trail.push({ x: p.x + p.width / 2, y: p.y + p.height / 2 });
        if (p.trail.length > 100) p.trail.shift();
      } else { p.trail = []; }

      // Update dynamic blocks
      gs.dynamicBlocks.forEach(block => {
        block.vy += g;
        block.vx += wind;
        block.vx *= FRICTION;
        block.x += block.vx * speed;
        block.y += block.vy * speed;

        for (const sb of gs.staticBlocks) {
          if (aabbCollision(block, sb)) {
            resolveAABBOverlap(block, sb, 'x');
            resolveAABBOverlap(block, sb, 'y');
          }
        }

        if (block.x < 0) { block.x = 0; block.vx *= -0.5; }
        if (block.x + block.width > cvs.width) { block.x = cvs.width - block.width; block.vx *= -0.5; }
        if (block.y + block.height > cvs.height) { block.y = cvs.height - block.height; block.vy *= -0.5; block.vx *= FRICTION; }
        if (block.y < 0) { block.y = 0; block.vy = 0; }

        if (gs.debug.showTrails) {
          block.trail.push({ x: block.x + block.width / 2, y: block.y + block.height / 2 });
          if (block.trail.length > 60) block.trail.shift();
        } else { block.trail = []; }
      });

      // Update TNT
      gs.tntBlocks.forEach(tnt => {
        if ((tnt.fuseTimer ?? 0) > 0) {
          tnt.fuseTimer = (tnt.fuseTimer ?? 0) - 1;
          tnt.animTimer = (tnt.animTimer ?? 0) + 1;
          if ((tnt.fuseTimer ?? 0) <= 0) {
            explodeTNT(tnt);
          }
          // Fuse particles
          if ((tnt.fuseTimer ?? 0) % 5 === 0) {
            spawnParticles(gs.particles, tnt.x + tnt.width / 2, tnt.y, 'spark', 2, '#ff4444');
          }
        }
      });

      // Update trampolines animation
      gs.trampolines.forEach(tramp => {
        if (tramp.animTimer && tramp.animTimer > 0) tramp.animTimer--;
      });

      // Update balls
      gs.balls.forEach(ball => {
        ball.vy += g;
        ball.vx += wind;
        ball.x += ball.vx * speed;
        ball.y += ball.vy * speed;

        for (const block of allSolids) {
          const col = circleRectCollision(ball.x, ball.y, ball.radius || BALL_RADIUS, block.x, block.y, block.width, block.height);
          if (col.hit) {
            ball.x += col.nx * col.depth;
            ball.y += col.ny * col.depth;
            const dot = ball.vx * col.nx + ball.vy * col.ny;
            ball.vx -= 2 * dot * col.nx * 0.8;
            ball.vy -= 2 * dot * col.ny * 0.8;
            if (gs.debug.showNormals) {
              gs.collisionNormals.push({ x: ball.x, y: ball.y, nx: col.nx, ny: col.ny });
            }
          }
        }

        // Ball vs trampolines
        gs.trampolines.forEach(tramp => {
          const col = circleRectCollision(ball.x, ball.y, ball.radius || BALL_RADIUS, tramp.x, tramp.y, tramp.width, tramp.height);
          if (col.hit && col.ny < 0) {
            ball.vy = TRAMPOLINE_FORCE * speed * 0.7;
            ball.y += col.ny * col.depth;
            tramp.animTimer = 8;
            audio.play('bounce');
          }
        });

        gs.enemies.forEach(enemy => {
          const col = circleRectCollision(ball.x, ball.y, ball.radius || BALL_RADIUS, enemy.x, enemy.y, enemy.width, enemy.height);
          if (col.hit) {
            ball.x += col.nx * col.depth;
            ball.y += col.ny * col.depth;
            const dot = ball.vx * col.nx + ball.vy * col.ny;
            ball.vx -= 2 * dot * col.nx * 0.7;
            ball.vy -= 2 * dot * col.ny * 0.7;
            enemy.vx += col.nx * 3;
            enemy.vy += col.ny * 2;
            enemy.hp = (enemy.hp || 0) - 5;
            enemy.flashTimer = 5;
          }
        });
        gs.enemies = gs.enemies.filter(e => (e.hp || 0) > 0);

        const r = ball.radius || BALL_RADIUS;
        if (ball.x - r < 0) { ball.x = r; ball.vx *= -0.9; }
        if (ball.x + r > cvs.width) { ball.x = cvs.width - r; ball.vx *= -0.9; }
        if (ball.y - r < 0) { ball.y = r; ball.vy *= -0.9; }
        if (ball.y + r > cvs.height) { ball.y = cvs.height - r; ball.vy *= -0.9; ball.vx *= FRICTION; }

        if (gs.debug.showTrails) {
          ball.trail.push({ x: ball.x, y: ball.y });
          if (ball.trail.length > 80) ball.trail.shift();
        } else { ball.trail = []; }
      });

      // Ball vs Ball
      for (let i = 0; i < gs.balls.length; i++) {
        for (let j = i + 1; j < gs.balls.length; j++) {
          const a = gs.balls[i];
          const b = gs.balls[j];
          const col = circleCircleCollision(a, b);
          if (col.hit) {
            a.x -= col.nx * col.depth / 2;
            a.y -= col.ny * col.depth / 2;
            b.x += col.nx * col.depth / 2;
            b.y += col.ny * col.depth / 2;
            const totalMass = a.mass + b.mass;
            const dvx = a.vx - b.vx;
            const dvy = a.vy - b.vy;
            const dotVN = dvx * col.nx + dvy * col.ny;
            if (dotVN > 0) {
              a.vx -= (2 * b.mass / totalMass) * dotVN * col.nx;
              a.vy -= (2 * b.mass / totalMass) * dotVN * col.ny;
              b.vx += (2 * a.mass / totalMass) * dotVN * col.nx;
              b.vy += (2 * a.mass / totalMass) * dotVN * col.ny;
            }
            spawnParticles(gs.particles, (a.x + b.x) / 2, (a.y + b.y) / 2, 'spark', 3);
          }
        }
      }

      // Update projectiles
      gs.projectiles = gs.projectiles.filter(proj => {
        proj.x += proj.vx * speed;
        proj.y += proj.vy * speed;
        proj.vy += g * 0.3;
        proj.life--;

        proj.trail.push({ x: proj.x, y: proj.y });
        if (proj.trail.length > 15) proj.trail.shift();

        // Hit enemies
        for (const enemy of gs.enemies) {
          const dx = (enemy.x + enemy.width / 2) - proj.x;
          const dy = (enemy.y + enemy.height / 2) - proj.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < enemy.width / 2 + proj.radius) {
            enemy.hp = (enemy.hp || 0) - proj.damage;
            enemy.flashTimer = 8;
            enemy.vx += proj.vx * 0.3;
            spawnParticles(gs.particles, proj.x, proj.y, 'spark', 8, '#00ffff');
            if (enemy.hp <= 0) {
              gs.kills++;
              gs.score += 20;
              spawnParticles(gs.particles, enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'explosion', 15);
            }
            return false;
          }
        }

        // Hit TNT
        for (const tnt of gs.tntBlocks) {
          if (proj.x > tnt.x && proj.x < tnt.x + tnt.width && proj.y > tnt.y && proj.y < tnt.y + tnt.height) {
            if ((tnt.fuseTimer ?? -1) < 0) tnt.fuseTimer = TNT_FUSE_TIME;
            spawnParticles(gs.particles, proj.x, proj.y, 'spark', 5);
            return false;
          }
        }

        // Hit blocks
        for (const block of allSolids) {
          if (proj.x > block.x && proj.x < block.x + block.width && proj.y > block.y && proj.y < block.y + block.height) {
            spawnParticles(gs.particles, proj.x, proj.y, 'spark', 4);
            return false;
          }
        }

        gs.enemies = gs.enemies.filter(e => (e.hp || 0) > 0);
        return proj.life > 0 && proj.x > -50 && proj.x < cvs.width + 50 && proj.y < cvs.height + 50;
      });

      // Update enemies (AI)
      gs.enemies.forEach(enemy => {
        enemy.vy += g;
        enemy.vx += wind;
        const dx = (p.x + p.width / 2) - (enemy.x + enemy.width / 2);
        const dy = (p.y + p.height / 2) - (enemy.y + enemy.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);

        const speedMult = enemy.enemyType === 'fast' ? 2.5 : enemy.enemyType === 'tank' ? 0.6 : 1;
        const detectRange = enemy.enemyType === 'fast' ? AI_RANGE * 1.3 : AI_RANGE;

        if (dist < detectRange) {
          enemy.aiState = 'chase';
          const accel = 0.15 * speed * speedMult;
          enemy.vx += (dx / dist) * accel;
          if (Math.abs(dx) < 50 && dy < -30 && enemy.onGround) {
            enemy.vy = JUMP_FORCE * 0.7 * speed;
          }
        } else {
          enemy.aiState = 'idle';
        }

        enemy.vx *= FRICTION;
        enemy.x += enemy.vx * speed;
        enemy.y += enemy.vy * speed;
        enemy.onGround = false;

        for (const block of allSolids) {
          if (aabbCollision(enemy, block)) {
            resolveAABBOverlap(enemy, block, 'x');
          }
        }
        for (const block of allSolids) {
          if (aabbCollision(enemy, block)) {
            resolveAABBOverlap(enemy, block, 'y');
          }
        }

        // Enemy-enemy
        gs.enemies.forEach(other => {
          if (other.id !== enemy.id && aabbCollision(enemy, other)) {
            const ox = (other.x + other.width / 2) - (enemy.x + enemy.width / 2);
            if (ox > 0) { enemy.x -= 1; other.x += 1; }
            else { enemy.x += 1; other.x -= 1; }
          }
        });

        if (enemy.x < 0) { enemy.x = 0; enemy.vx = 0; }
        if (enemy.x + enemy.width > cvs.width) { enemy.x = cvs.width - enemy.width; enemy.vx = 0; }
        if (enemy.y + enemy.height > cvs.height) { enemy.y = cvs.height - enemy.height; enemy.vy = 0; enemy.onGround = true; }
        if (enemy.y < 0) { enemy.y = 0; enemy.vy = 0; }

        // Damage player
        if (enemy.damageCooldown && enemy.damageCooldown > 0) enemy.damageCooldown--;
        if (aabbCollision(enemy, p) && !gs.immortal && (!enemy.damageCooldown || enemy.damageCooldown <= 0)) {
          const dmg = enemy.enemyType === 'tank' ? 15 : enemy.enemyType === 'fast' ? 7 : ENEMY_DAMAGE;
          p.hp = (p.hp || 0) - dmg;
          p.flashTimer = 12;
          enemy.damageCooldown = DAMAGE_COOLDOWN;
          const kbx = p.x < enemy.x ? -5 : 5;
          p.vx += kbx;
          p.vy -= 3;
          gs.screenShake = 8;
          audio.play('hit');
          spawnParticles(gs.particles, p.x + p.width / 2, p.y + p.height / 2, 'blood', 6);
        }

        if (enemy.flashTimer && enemy.flashTimer > 0) enemy.flashTimer--;

        if (gs.debug.showTrails) {
          enemy.trail.push({ x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 });
          if (enemy.trail.length > 60) enemy.trail.shift();
        } else { enemy.trail = []; }
      });

      if (p.damageCooldown && p.damageCooldown > 0) p.damageCooldown--;
      if (p.hp !== undefined) p.hp = Math.max(0, p.hp);

      // Update particles
      if (gs.debug.showParticles) {
        gs.particles = gs.particles.filter(part => {
          part.vy += part.gravity;
          part.vx *= part.friction;
          part.vy *= part.friction;
          part.x += part.vx;
          part.y += part.vy;
          part.life--;
          return part.life > 0;
        });
      }

      // Update toasts
      gs.toasts = gs.toasts.filter(t => {
        t.life--;
        return t.life > 0;
      });

      // Screen shake decay
      if (gs.screenShake > 0) gs.screenShake *= 0.85;
      if (gs.screenShake < 0.5) gs.screenShake = 0;

      gs.gameTime += dt * speed;
    }

    function render() {
      if (!ctx) return;
      const w = cvs.width;
      const h = cvs.height;

      // Screen shake
      ctx.save();
      if (gs.screenShake > 0) {
        const sx = (Math.random() - 0.5) * gs.screenShake * 2;
        const sy = (Math.random() - 0.5) * gs.screenShake * 2;
        ctx.translate(sx, sy);
      }

      // Clear
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(-10, -10, w + 20, h + 20);

      // Grid
      if (gs.debug.showGrid) {
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 1;
        const gridSize = BLOCK_SIZE;
        for (let x = 0; x < w; x += gridSize) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        ctx.fillStyle = '#222244';
        ctx.font = '8px monospace';
        for (let x = 0; x < w; x += gridSize * 2) {
          ctx.fillText(`${x}`, x + 2, 9);
        }
        for (let y = gridSize; y < h; y += gridSize * 2) {
          ctx.fillText(`${y}`, 2, y - 2);
        }
      }

      // AI Range indicator
      if (gs.debug.showAIRange) {
        gs.enemies.forEach(enemy => {
          const range = enemy.enemyType === 'fast' ? AI_RANGE * 1.3 : AI_RANGE;
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, range, 0, Math.PI * 2);
          ctx.strokeStyle = enemy.color + '30';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      }

      // Attack range indicator
      if (gs.debug.showAttackRange) {
        const p = gs.player;
        const ax = p.x + p.width / 2 + (p.facingRight ? 30 : -30);
        const ay = p.y + p.height / 2;
        ctx.beginPath();
        ctx.arc(ax, ay, 60, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff6b3540';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Trails with gradient
      const allEntities = [gs.player, ...gs.staticBlocks, ...gs.dynamicBlocks, ...gs.balls, ...gs.enemies];
      if (gs.debug.showTrails) {
        allEntities.forEach(e => {
          if (e.trail.length > 1) {
            for (let i = 1; i < e.trail.length; i++) {
              const alpha = (i / e.trail.length) * 0.6;
              ctx.beginPath();
              ctx.strokeStyle = e.color + Math.round(alpha * 255).toString(16).padStart(2, '0');
              ctx.lineWidth = 2 * (i / e.trail.length);
              ctx.moveTo(e.trail[i - 1].x, e.trail[i - 1].y);
              ctx.lineTo(e.trail[i].x, e.trail[i].y);
              ctx.stroke();
            }
          }
        });
      }

      // Draw trampoline
      gs.trampolines.forEach(tramp => {
        const squish = tramp.animTimer && tramp.animTimer > 0 ? 0.5 : 1;
        ctx.fillStyle = tramp.color;
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 8;
        ctx.fillRect(tramp.x, tramp.y + tramp.height * (1 - squish), tramp.width, tramp.height * squish);
        ctx.shadowBlur = 0;
        // Spring lines
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2;
        const segments = 5;
        for (let i = 0; i < segments; i++) {
          const sx = tramp.x + (tramp.width / segments) * i;
          ctx.beginPath();
          ctx.moveTo(sx, tramp.y + tramp.height);
          ctx.lineTo(sx + tramp.width / segments / 2, tramp.y);
          ctx.stroke();
        }
      });

      // Draw coins
      gs.coins.forEach(coin => {
        coin.animTimer = (coin.animTimer || 0) + 0.05;
        const bob = Math.sin(coin.animTimer) * 3;
        ctx.beginPath();
        ctx.arc(coin.x + coin.width / 2, coin.y + coin.height / 2 + bob, coin.radius || 8, 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
        // $ sign
        ctx.fillStyle = '#92400e';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('$', coin.x + coin.width / 2, coin.y + coin.height / 2 + bob + 4);
        ctx.textAlign = 'left';
      });

      // Draw TNT
      gs.tntBlocks.forEach(tnt => {
        const ft = tnt.fuseTimer ?? -1;
        const at = tnt.animTimer ?? 0;
        const shaking = ft > 0 && ft < 30;
        const ox = shaking ? (Math.random() - 0.5) * 4 : 0;
        const oy = shaking ? (Math.random() - 0.5) * 4 : 0;
        ctx.fillStyle = ft > 0 ? (Math.floor(at / 4) % 2 === 0 ? '#ff0000' : '#ff6600') : '#dc2626';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = ft > 0 ? 15 : 5;
        ctx.fillRect(tnt.x + ox, tnt.y + oy, tnt.width, tnt.height);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TNT', tnt.x + tnt.width / 2 + ox, tnt.y + tnt.height / 2 + 4 + oy);
        ctx.textAlign = 'left';
        if (ft > 0) {
          ctx.fillStyle = '#ffff00';
          ctx.font = '9px monospace';
          ctx.fillText(`${(ft / 60).toFixed(1)}s`, tnt.x + ox, tnt.y - 5 + oy);
        }
      });

      // Draw static blocks
      gs.staticBlocks.forEach(block => {
        ctx.fillStyle = block.color;
        ctx.fillRect(block.x, block.y, block.width, block.height);
        // Inner detail
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 1;
        ctx.strokeRect(block.x + 2, block.y + 2, block.width - 4, block.height - 4);
      });

      // Draw dynamic blocks
      gs.dynamicBlocks.forEach(block => {
        ctx.fillStyle = block.color;
        ctx.shadowColor = '#eab308';
        ctx.shadowBlur = 4;
        ctx.fillRect(block.x, block.y, block.width, block.height);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 1;
        ctx.strokeRect(block.x + 2, block.y + 2, block.width - 4, block.height - 4);
      });

      // Draw balls
      gs.balls.forEach(ball => {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius || BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = ball.color;
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ea580c';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Draw enemies
      gs.enemies.forEach(enemy => {
        const flash = enemy.flashTimer && enemy.flashTimer > 0;
        ctx.fillStyle = flash ? '#ffffff' : enemy.color;
        ctx.shadowColor = enemy.color;
        ctx.shadowBlur = 6;
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        ctx.shadowBlur = 0;
        
        // Eyes
        const eyeY = enemy.y + enemy.height * 0.35;
        const eyeSize = enemy.width * 0.12;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(enemy.x + enemy.width * 0.35, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.arc(enemy.x + enemy.width * 0.65, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(enemy.x + enemy.width * 0.35, eyeY, eyeSize * 0.5, 0, Math.PI * 2);
        ctx.arc(enemy.x + enemy.width * 0.65, eyeY, eyeSize * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Type indicator
        if (enemy.enemyType === 'fast') {
          ctx.fillStyle = '#06b6d4';
          ctx.font = '8px monospace';
          ctx.fillText('⚡', enemy.x + enemy.width / 2 - 4, enemy.y - 3);
        } else if (enemy.enemyType === 'tank') {
          ctx.fillStyle = '#7c3aed';
          ctx.font = '8px monospace';
          ctx.fillText('🛡', enemy.x + enemy.width / 2 - 5, enemy.y - 3);
        }

        // AI State
        if (gs.debug.showCoords) {
          ctx.fillStyle = enemy.aiState === 'chase' ? '#ff4444' : '#888888';
          ctx.font = '8px monospace';
          ctx.fillText(enemy.aiState || 'idle', enemy.x, enemy.y + enemy.height + 12);
        }
      });

      // Draw projectiles
      gs.projectiles.forEach(proj => {
        // Trail
        for (let i = 1; i < proj.trail.length; i++) {
          const alpha = i / proj.trail.length;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0, 255, 255, ${alpha * 0.5})`;
          ctx.lineWidth = proj.radius * alpha;
          ctx.moveTo(proj.trail[i - 1].x, proj.trail[i - 1].y);
          ctx.lineTo(proj.trail[i].x, proj.trail[i].y);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
        ctx.fillStyle = proj.color;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Draw player
      const p = gs.player;
      const pFlash = p.flashTimer && p.flashTimer > 0;
      const pDash = (p.dashTimer ?? 0) > 0;
      
      // Dash afterimage
      if (pDash) {
        ctx.fillStyle = '#60a5fa40';
        ctx.fillRect(p.x - p.vx * 2, p.y, p.width, p.height);
        ctx.fillStyle = '#60a5fa20';
        ctx.fillRect(p.x - p.vx * 4, p.y, p.width, p.height);
      }

      ctx.fillStyle = pFlash ? '#ffffff' : (pDash ? '#60a5fa' : p.color);
      ctx.shadowColor = pDash ? '#60a5fa' : '#ef4444';
      ctx.shadowBlur = pDash ? 15 : 8;
      ctx.fillRect(p.x, p.y, p.width, p.height);
      ctx.shadowBlur = 0;

      // Player eyes
      const pEyeX = p.facingRight ? p.x + p.width * 0.6 : p.x + p.width * 0.25;
      const pEyeX2 = p.facingRight ? p.x + p.width * 0.8 : p.x + p.width * 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pEyeX, p.y + p.height * 0.4, 3, 0, Math.PI * 2);
      ctx.arc(pEyeX2, p.y + p.height * 0.4, 3, 0, Math.PI * 2);
      ctx.fill();

      // Dash cooldown indicator
      if (p.dashCooldown && p.dashCooldown > 0) {
        const pct = 1 - p.dashCooldown / DASH_COOLDOWN;
        ctx.fillStyle = '#60a5fa40';
        ctx.fillRect(p.x, p.y + p.height + 3, p.width * pct, 3);
      }

      // Draw particles
      if (gs.debug.showParticles) {
        gs.particles.forEach(part => {
          const alpha = part.life / part.maxLife;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = part.color;
          if (part.type === 'spark') {
            ctx.beginPath();
            ctx.arc(part.x, part.y, part.size * alpha, 0, Math.PI * 2);
            ctx.fill();
          } else if (part.type === 'smoke') {
            ctx.beginPath();
            ctx.arc(part.x, part.y, part.size * (2 - alpha), 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(part.x - part.size / 2, part.y - part.size / 2, part.size * alpha, part.size * alpha);
          }
          ctx.globalAlpha = 1;
        });
      }

      // Debug overlays
      allEntities.forEach(e => {
        const cx = e.type === 'ball' ? e.x : e.x + e.width / 2;
        const cy = e.type === 'ball' ? e.y : e.y + e.height / 2;

        if (gs.debug.showCoords) {
          ctx.fillStyle = '#ffffffcc';
          ctx.font = '9px monospace';
          ctx.fillText(`${Math.round(e.x)},${Math.round(e.y)}`, e.x, e.y - 5);
        }

        if (gs.debug.showHitboxes) {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = '#ff00ff';
          ctx.lineWidth = 1.5;
          if (e.type === 'ball') {
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius || BALL_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.strokeRect(e.x, e.y, e.width, e.height);
          }
          ctx.setLineDash([]);
        }

        if (gs.debug.showVelocities) {
          ctx.fillStyle = '#ffff00cc';
          ctx.font = '8px monospace';
          ctx.fillText(`v:${e.vx.toFixed(1)},${e.vy.toFixed(1)}`, e.x, e.y + (e.height || 0) + 12);
          ctx.beginPath();
          ctx.strokeStyle = '#ffff00';
          ctx.lineWidth = 2;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + e.vx * 5, cy + e.vy * 5);
          ctx.stroke();
          const angle = Math.atan2(e.vy, e.vx);
          ctx.beginPath();
          ctx.moveTo(cx + e.vx * 5, cy + e.vy * 5);
          ctx.lineTo(cx + e.vx * 5 - 5 * Math.cos(angle - 0.5), cy + e.vy * 5 - 5 * Math.sin(angle - 0.5));
          ctx.lineTo(cx + e.vx * 5 - 5 * Math.cos(angle + 0.5), cy + e.vy * 5 - 5 * Math.sin(angle + 0.5));
          ctx.closePath();
          ctx.fillStyle = '#ffff00';
          ctx.fill();
        }

        if (gs.debug.showHP && e.hp !== undefined && e.maxHp !== undefined) {
          const barW = e.width + 4;
          const barH = 4;
          const barY = e.y - 12;
          const barX = e.x - 2;
          const pct = e.hp / e.maxHp;
          ctx.fillStyle = '#333';
          ctx.fillRect(barX, barY, barW, barH);
          const hpColor = pct > 0.6 ? '#22c55e' : pct > 0.3 ? '#eab308' : '#ef4444';
          ctx.fillStyle = hpColor;
          ctx.fillRect(barX, barY, barW * pct, barH);
          ctx.strokeStyle = '#555';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(barX, barY, barW, barH);
        }

        if (gs.debug.showCenterOfMass) {
          ctx.beginPath();
          ctx.arc(cx, cy, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#ff0000';
          ctx.fill();
          ctx.strokeStyle = '#ff000088';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy);
          ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6);
          ctx.stroke();
        }

        if (gs.debug.showForces && e.type !== 'static') {
          ctx.beginPath();
          ctx.strokeStyle = '#00ffff';
          ctx.lineWidth = 2;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx, cy + gs.gravityOverride * 15);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy + gs.gravityOverride * 15);
          ctx.lineTo(cx - 3, cy + gs.gravityOverride * 15 - 5);
          ctx.lineTo(cx + 3, cy + gs.gravityOverride * 15 - 5);
          ctx.closePath();
          ctx.fillStyle = '#00ffff';
          ctx.fill();
        }

        if (gs.debug.showMass) {
          ctx.fillStyle = '#aaaaffcc';
          ctx.font = '8px monospace';
          const massText = e.mass === Infinity ? '∞' : e.mass.toFixed(1);
          ctx.fillText(`m:${massText}`, e.x + (e.width || 0) + 3, e.y + 10);
        }
      });

      // Gravity vector
      if (gs.debug.showGravity) {
        ctx.beginPath();
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.moveTo(30, 30);
        ctx.lineTo(30, 30 + gs.gravityOverride * 40);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(30, 30 + gs.gravityOverride * 40);
        ctx.lineTo(25, 30 + gs.gravityOverride * 40 - 8);
        ctx.lineTo(35, 30 + gs.gravityOverride * 40 - 8);
        ctx.closePath();
        ctx.fillStyle = '#00ffff';
        ctx.fill();
        ctx.fillStyle = '#00ffff';
        ctx.font = '11px monospace';
        ctx.fillText(`g=${gs.gravityOverride.toFixed(2)}`, 42, 50);
      }

      // Wind indicator
      if (gs.debug.windActive) {
        ctx.fillStyle = '#38bdf888';
        ctx.font = '12px monospace';
        ctx.fillText('💨 WIND →', 30, 70);
      }

      // Collision normals
      if (gs.debug.showNormals && gs.collisionNormals.length > 0) {
        gs.collisionNormals.forEach(cn => {
          ctx.beginPath();
          ctx.strokeStyle = '#ff00ff';
          ctx.lineWidth = 2;
          ctx.moveTo(cn.x, cn.y);
          ctx.lineTo(cn.x + cn.nx * 20, cn.y + cn.ny * 20);
          ctx.stroke();
        });
      }

      // Mouse position
      if (gs.debug.showMousePos) {
        ctx.fillStyle = '#ffffffcc';
        ctx.font = '10px monospace';
        ctx.fillText(`Mouse: ${Math.round(gs.mousePos.x)}, ${Math.round(gs.mousePos.y)}`, gs.mousePos.x + 15, gs.mousePos.y - 5);
        ctx.beginPath();
        ctx.arc(gs.mousePos.x, gs.mousePos.y, 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Crosshair
        ctx.beginPath();
        ctx.moveTo(gs.mousePos.x - 10, gs.mousePos.y);
        ctx.lineTo(gs.mousePos.x + 10, gs.mousePos.y);
        ctx.moveTo(gs.mousePos.x, gs.mousePos.y - 10);
        ctx.lineTo(gs.mousePos.x, gs.mousePos.y + 10);
        ctx.strokeStyle = '#ffffff44';
        ctx.stroke();
      }

      // FPS
      if (gs.debug.showFPS) {
        ctx.fillStyle = gs.fps >= 55 ? '#00ff00' : gs.fps >= 30 ? '#ffff00' : '#ff0000';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(`FPS: ${gs.fps}`, w - 90, 22);
      }

      // Time
      if (gs.debug.showTime) {
        ctx.fillStyle = '#aaaaff';
        ctx.font = '11px monospace';
        ctx.fillText(`⏱ ${(gs.gameTime / 1000).toFixed(1)}s`, w - 130, 40);
      }

      // Score
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`★ ${gs.score}`, w - 90, 60);
      ctx.fillStyle = '#22c55e';
      ctx.font = '11px monospace';
      ctx.fillText(`☠ ${gs.kills}`, w - 90, 78);

      // Paused indicator
      if (gs.debug.paused) {
        ctx.fillStyle = '#ff000088';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⏸ PAUSED', w / 2, 30);
        ctx.textAlign = 'left';
      }
      if (gs.debug.slowMotion) {
        ctx.fillStyle = '#ffff0088';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🐌 SLOW MOTION (30%)', w / 2, 50);
        ctx.textAlign = 'left';
      }

      // Immortal indicator
      if (gs.immortal) {
        ctx.fillStyle = '#00ffff88';
        ctx.font = '11px monospace';
        ctx.fillText('🛡️ IMMORTAL', 10, 22);
      }

      // Zero gravity
      if (gs.debug.zeroGravity) {
        ctx.fillStyle = '#a855f788';
        ctx.font = '11px monospace';
        ctx.fillText('🌌 ZERO-G', 10, gs.immortal ? 38 : 22);
      }

      gs.collisionNormals = [];
      ctx.restore();
    }

    function gameLoop(timestamp: number) {
      const dt = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      fpsCounterRef.current.frames++;
      if (timestamp - fpsCounterRef.current.lastTime >= 1000) {
        gs.fps = fpsCounterRef.current.frames;
        fpsCounterRef.current.frames = 0;
        fpsCounterRef.current.lastTime = timestamp;
      }

      updatePhysics(dt);
      render();
      forceUpdate(n => n + 1);
      animFrameRef.current = requestAnimationFrame(gameLoop);
    }

    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
     window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleClick);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [initGameState]);

  // Resize canvas when panel toggles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = window.innerWidth - (showPanel ? 280 : 0);
      canvas.height = window.innerHeight - 44 - 36;
    }
  }, [showPanel]);

  const gs = gameStateRef.current;
  const playerHp = gs?.player.hp ?? PLAYER_HP;
  const hpPct = playerHp / PLAYER_HP;
  const hpColor = hpPct > 0.6 ? '#22c55e' : hpPct > 0.3 ? '#eab308' : '#ef4444';
  const dashPct = gs ? 1 - (gs.player.dashCooldown || 0) / DASH_COOLDOWN : 1;

  const toggleDebug = (key: keyof DebugState) => {
    if (!gs) return;
    (gs.debug as any)[key] = !(gs.debug as any)[key];
    forceUpdate(n => n + 1);
  };

  const tools = [
    { id: 'block' as const, label: '🧱 Block', key: '1', color: '#6b7280' },
    { id: 'dynamic' as const, label: '📦 Dynamic', key: '2', color: '#eab308' },
    { id: 'ball' as const, label: '⚽ Ball', key: '3', color: '#f97316' },
    { id: 'enemy' as const, label: '👾 Enemy', key: '4', color: '#22c55e' },
    { id: 'coin' as const, label: '💰 Coin', key: '5', color: '#fbbf24' },
    { id: 'tnt' as const, label: '💣 TNT', key: '6', color: '#dc2626' },
    { id: 'trampoline' as const, label: '🟣 Spring', key: '7', color: '#a855f7' },
  ];

  return (
    <div className="w-full h-screen flex flex-col bg-[#0a0a0a] overflow-hidden">
      {/* Toolbar */}
      <div className="h-[44px] bg-[#111118] border-b border-[#2a2a3a] flex items-center px-3 gap-2 shrink-0">
        <span className="text-cyan-400 font-mono text-xs font-bold mr-2">🎮 SANDBOX 2D</span>
        <div className="h-6 w-px bg-[#333] mx-1" />
        {tools.map(tool => (
          <button
            key={tool.id}
            onClick={() => { if (gs) { gs.selectedTool = tool.id; forceUpdate(n => n + 1); } }}
            className={`px-2 py-1 rounded text-xs font-mono transition-all ${
              gs?.selectedTool === tool.id
                ? 'bg-[#2a2a4a] text-white ring-1 ring-cyan-500 shadow-lg shadow-cyan-500/20'
                : 'bg-[#1a1a2a] text-gray-400 hover:bg-[#222238] hover:text-gray-200'
            }`}
          >
            <span>{tool.label}</span>
            <span className="text-[10px] text-gray-600 ml-1">[{tool.key}]</span>
          </button>
        ))}
        <div className="h-6 w-px bg-[#333] mx-1" />
        <span className="text-[10px] text-gray-500 font-mono">
          Enemy: <span style={{ color: gs?.enemySpawnType === 'fast' ? '#06b6d4' : gs?.enemySpawnType === 'tank' ? '#7c3aed' : '#22c55e' }}>
            {gs?.enemySpawnType || 'normal'}
          </span>
          <span className="text-gray-600"> [Shift+T]</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowPanel(p => !p)}
            className="px-2 py-1 bg-[#1a1a2a] text-gray-400 rounded text-xs font-mono hover:bg-[#222238] hover:text-gray-200 transition"
          >
            {showPanel ? '◀ Hide' : '▶ Panel'}
          </button>
          <button
            onClick={() => setShowTutorial(true)}
            className="px-2 py-1 bg-cyan-900/50 text-cyan-300 rounded text-xs font-mono hover:bg-cyan-800/50 transition"
          >
            📚 Help [H]
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="flex-1 block cursor-crosshair outline-none"
        />

        {/* Debug Panel */}
        {showPanel && (
          <div className="w-[280px] bg-[#0d0d18] border-l border-[#2a2a3a] overflow-y-auto shrink-0 font-mono text-xs">
            {/* Player Stats */}
            <div className="p-3 border-b border-[#1a1a2e]">
              <div className="text-cyan-400 font-bold text-[11px] mb-2">📊 PLAYER STATS</div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-8">HP</span>
                  <div className="flex-1 h-3 bg-[#1a1a2e] rounded overflow-hidden">
                    <div className="h-full transition-all duration-200 rounded" style={{ width: `${hpPct * 100}%`, backgroundColor: hpColor }} />
                  </div>
                  <span className="text-gray-300 w-14 text-right">{playerHp}/{PLAYER_HP}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-8">DASH</span>
                  <div className="flex-1 h-3 bg-[#1a1a2e] rounded overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all duration-100 rounded" style={{ width: `${dashPct * 100}%` }} />
                  </div>
                  <span className="text-gray-300 w-14 text-right">{dashPct >= 1 ? '✓' : `${Math.round(dashPct * 100)}%`}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Score: <span className="text-yellow-400">{gs?.score ?? 0}</span></span>
                  <span>Kills: <span className="text-green-400">{gs?.kills ?? 0}</span></span>
                </div>
              </div>
            </div>

            {/* Entity Count */}
            <div className="p-3 border-b border-[#1a1a2e]">
              <div className="text-cyan-400 font-bold text-[11px] mb-2">🗂️ ENTITIES</div>
              <div className="grid grid-cols-2 gap-1 text-gray-400">
                <span>🧱 Static: <span className="text-gray-300">{gs?.staticBlocks.length ?? 0}</span></span>
                <span>📦 Dynamic: <span className="text-yellow-300">{gs?.dynamicBlocks.length ?? 0}</span></span>
                <span>⚽ Balls: <span className="text-orange-400">{gs?.balls.length ?? 0}</span></span>
                <span>👾 Enemies: <span className="text-green-400">{gs?.enemies.length ?? 0}</span></span>
                <span>💰 Coins: <span className="text-yellow-400">{gs?.coins.length ?? 0}</span></span>
                <span>💣 TNT: <span className="text-red-400">{gs?.tntBlocks.length ?? 0}</span></span>
                <span>🟣 Springs: <span className="text-purple-400">{gs?.trampolines.length ?? 0}</span></span>
                <span>🔫 Proj: <span className="text-cyan-400">{gs?.projectiles.length ?? 0}</span></span>
              </div>
            </div>

            {/* Debug Toggles */}
            <div className="p-3 border-b border-[#1a1a2e]">
              <div className="text-cyan-400 font-bold text-[11px] mb-2">🔍 DEBUG TOGGLES</div>
              <div className="space-y-1">
                {[
                  { key: 'showCoords' as const, label: '1 Coordinates', icon: '📍' },
                  { key: 'showHitboxes' as const, label: '2 Hitboxes', icon: '🔲' },
                  { key: 'showVelocities' as const, label: '3 Velocities', icon: '➡️' },
                  { key: 'showGrid' as const, label: '4 Grid', icon: '📐' },
                  { key: 'showHP' as const, label: '5 HP Bars', icon: '❤️' },
                  { key: 'showTrails' as const, label: '9 Trails', icon: '〰️' },
                  { key: 'showCenterOfMass' as const, label: '0 Center Mass', icon: '⊙' },
                  { key: 'showForces' as const, label: 'F Forces', icon: '↓' },
                  { key: 'showGravity' as const, label: 'G Gravity Vec', icon: '🌍' },
                  { key: 'showMass' as const, label: 'M Mass', icon: '⚖️' },
                  { key: 'showNormals' as const, label: 'N Normals', icon: '↗️' },
                  { key: 'showMousePos' as const, label: 'P Mouse Pos', icon: '🖱️' },
                  { key: 'showTime' as const, label: 'T Time', icon: '⏱️' },
                  { key: 'showAIRange' as const, label: 'AI Range', icon: '📡' },
                  { key: 'showAttackRange' as const, label: 'Attack Range', icon: '⚔️' },
                  { key: 'showParticles' as const, label: 'Particles', icon: '✨' },
                ].map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => toggleDebug(key)}
                    className={`w-full text-left px-2 py-1 rounded transition ${
                      gs?.debug[key]
                        ? 'bg-cyan-900/30 text-cyan-300 border border-cyan-800/50'
                        : 'bg-[#1a1a2e] text-gray-500 border border-transparent hover:bg-[#222238] hover:text-gray-300'
                    }`}
                  >
                    <span className="mr-1">{icon}</span> {label}
                    <span className="float-right">{gs?.debug[key] ? '✓' : '○'}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Physics Controls */}
            <div className="p-3 border-b border-[#1a1a2e]">
              <div className="text-cyan-400 font-bold text-[11px] mb-2">⚙️ PHYSICS</div>
              <div className="space-y-1">
                <button
                  onClick={() => { if (gs) { gs.debug.slowMotion = !gs.debug.slowMotion; forceUpdate(n => n + 1); } }}
                  className={`w-full text-left px-2 py-1 rounded transition ${
                    gs?.debug.slowMotion ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-800/50' : 'bg-[#1a1a2e] text-gray-500 hover:bg-[#222238]'
                  }`}
                >
                  🐌 Slow Motion [6] {gs?.debug.slowMotion ? '✓' : '○'}
                </button>
                <button
                  onClick={() => { if (gs) { gs.debug.paused = !gs.debug.paused; forceUpdate(n => n + 1); } }}
                  className={`w-full text-left px-2 py-1 rounded transition ${
                    gs?.debug.paused ? 'bg-red-900/30 text-red-300 border border-red-800/50' : 'bg-[#1a1a2e] text-gray-500 hover:bg-[#222238]'
                  }`}
                >
                  ⏸ Pause [7] {gs?.debug.paused ? '✓' : '○'}
                </button>
                <button
                  onClick={() => { if (gs) { gs.debug.zeroGravity = !gs.debug.zeroGravity; gs.gravityOverride = gs.debug.zeroGravity ? 0 : GRAVITY; forceUpdate(n => n + 1); } }}
                  className={`w-full text-left px-2 py-1 rounded transition ${
                    gs?.debug.zeroGravity ? 'bg-purple-900/30 text-purple-300 border border-purple-800/50' : 'bg-[#1a1a2e] text-gray-500 hover:bg-[#222238]'
                  }`}
                >
                  🌌 Zero Gravity [Z] {gs?.debug.zeroGravity ? '✓' : '○'}
                </button>
                <button
                  onClick={() => { if (gs) { gs.debug.windActive = !gs.debug.windActive; forceUpdate(n => n + 1); } }}
                  className={`w-full text-left px-2 py-1 rounded transition ${
                    gs?.debug.windActive ? 'bg-sky-900/30 text-sky-300 border border-sky-800/50' : 'bg-[#1a1a2e] text-gray-500 hover:bg-[#222238]'
                  }`}
                >
                  💨 Wind [B] {gs?.debug.windActive ? '✓' : '○'}
                </button>
                <button
                  onClick={() => { if (gs) { gs.debug.snapToGrid = !gs.debug.snapToGrid; forceUpdate(n => n + 1); } }}
                  className={`w-full text-left px-2 py-1 rounded transition ${
                    gs?.debug.snapToGrid ? 'bg-green-900/30 text-green-300 border border-green-800/50' : 'bg-[#1a1a2e] text-gray-500 hover:bg-[#222238]'
                  }`}
                >
                  🧲 Snap to Grid {gs?.debug.snapToGrid ? '✓' : '○'}
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="p-3 border-b border-[#1a1a2e]">
              <div className="text-cyan-400 font-bold text-[11px] mb-2">⚡ ACTIONS</div>
              <div className="grid grid-cols-2 gap-1">
                <button onClick={() => { if (gs) { gs.immortal = !gs.immortal; addToast(gs.toasts, gs.immortal ? '🛡️ Immortal ON' : '🛡️ OFF', '#00ffff'); forceUpdate(n => n + 1); } }}
                  className="px-2 py-1 bg-[#1a1a2e] text-gray-400 rounded hover:bg-[#222238] hover:text-cyan-300 transition text-[10px]">
                  🛡️ Immortal [I]
                </button>
                <button onClick={() => { if (gs) { gs.player.x = 400; gs.player.y = 300; gs.player.vx = 0; gs.player.vy = 0; gs.player.hp = PLAYER_HP; forceUpdate(n => n + 1); } }}
                  className="px-2 py-1 bg-[#1a1a2e] text-gray-400 rounded hover:bg-[#222238] hover:text-yellow-300 transition text-[10px]">
                  🔄 Reset [R]
                </button>
                <button onClick={() => { if (gs) { gs.staticBlocks = []; gs.dynamicBlocks = []; forceUpdate(n => n + 1); } }}
                  className="px-2 py-1 bg-[#1a1a2e] text-gray-400 rounded hover:bg-[#222238] hover:text-gray-300 transition text-[10px]">
                  🧹 Blocks [C]
                </button>
                <button onClick={() => { if (gs) { gs.enemies = []; forceUpdate(n => n + 1); } }}
                  className="px-2 py-1 bg-[#1a1a2e] text-gray-400 rounded hover:bg-[#222238] hover:text-green-300 transition text-[10px]">
                  💀 Enemies [X]
                </button>
                <button onClick={() => { if (gs) { gs.balls = []; forceUpdate(n => n + 1); } }}
                  className="px-2 py-1 bg-[#1a1a2e] text-gray-400 rounded hover:bg-[#222238] hover:text-orange-300 transition text-[10px]">
                  ⚽ Balls [V]
                </button>
                <button onClick={() => { if (gs) { gs.coins = []; forceUpdate(n => n + 1); } }}
                  className="px-2 py-1 bg-[#1a1a2e] text-gray-400 rounded hover:bg-[#222238] hover:text-yellow-300 transition text-[10px]">
                  💰 Coins [K]
                </button>
                <button onClick={() => { if (gs) { gs.staticBlocks = []; gs.dynamicBlocks = []; gs.balls = []; gs.enemies = []; gs.coins = []; gs.tntBlocks = []; gs.trampolines = []; gs.projectiles = []; gs.particles = []; forceUpdate(n => n + 1); } }}
                  className="col-span-2 px-2 py-1 bg-red-900/20 text-red-400 rounded hover:bg-red-900/40 transition text-[10px]">
                  🗑️ Clear All [L]
                </button>
              </div>
            </div>

            {/* Controls Help */}
            <div className="p-3">
              <div className="text-cyan-400 font-bold text-[11px] mb-2">🎮 CONTROLS</div>
              <div className="space-y-0.5 text-[10px] text-gray-500">
                <div><span className="text-gray-300">WASD</span> Move | <span className="text-gray-300">W/Space</span> Jump (x2)</div>
                <div><span className="text-gray-300">Shift</span> Dash | <span className="text-gray-300">Q</span> Attack</div>
                <div><span className="text-gray-300">F</span> Shoot | <span className="text-gray-300">E</span> Spawn Enemy</div>
                <div><span className="text-gray-300">Click</span> Place tool | <span className="text-gray-300">1-7</span> Select tool</div>
                <div><span className="text-gray-300">Shift+T</span> Cycle enemy type</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="h-[36px] bg-[#0d0d18] border-t border-[#2a2a3a] flex items-center px-4 gap-4 font-mono text-[11px] text-gray-400 overflow-x-auto shrink-0">
        <span>HP: <span style={{ color: hpColor }} className="font-bold">{playerHp}/{PLAYER_HP}</span></span>
        <span className="text-gray-600">|</span>
        <span>Score: <span className="text-yellow-400 font-bold">{gs?.score ?? 0}</span></span>
        <span className="text-gray-600">|</span>
        <span>Kills: <span className="text-green-400">{gs?.kills ?? 0}</span></span>
        <span className="text-gray-600">|</span>
        <span>Tool: <span className="text-cyan-300">{gs?.selectedTool ?? 'block'}</span></span>
        {gs?.debug.showFPS && <><span className="text-gray-600">|</span><span className="text-green-400">FPS: {gs.fps}</span></>}
        {gs?.debug.showTime && <><span className="text-gray-600">|</span><span className="text-blue-300">⏱ {((gs?.gameTime ?? 0) / 1000).toFixed(1)}s</span></>}
        {gs?.immortal && <><span className="text-gray-600">|</span><span className="text-cyan-400">🛡️ IMMORTAL</span></>}
        {gs?.debug.paused && <><span className="text-gray-600">|</span><span className="text-red-400">⏸ PAUSED</span></>}
        {gs?.debug.slowMotion && <><span className="text-gray-600">|</span><span className="text-yellow-400">🐌 SLOW</span></>}
        {gs?.debug.zeroGravity && <><span className="text-gray-600">|</span><span className="text-purple-400">🌌 ZERO-G</span></>}
        <span className="ml-auto text-gray-600">[H] Tutorial</span>
      </div>

      {/* Toast Notifications */}
      <div className="fixed top-16 right-4 z-40 flex flex-col gap-1 pointer-events-none" style={{ right: showPanel ? '296px' : '16px' }}>
        {gs?.toasts.map(toast => (
          <div
            key={toast.id}
            className="px-3 py-1.5 rounded font-mono text-xs shadow-lg backdrop-blur-sm transition-all"
            style={{
              backgroundColor: `${toast.color}15`,
              border: `1px solid ${toast.color}40`,
              color: toast.color,
              opacity: toast.life / toast.maxLife,
              transform: `translateX(${(1 - toast.life / toast.maxLife) * 20}px)`
            }}
          >
            {toast.text}
          </div>
        ))}
      </div>

      {/* Tutorial Modal */}
      {showTutorial && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setShowTutorial(false)}>
          <div className="bg-[#0d0d20] border border-[#334] rounded-xl p-6 max-w-lg w-full mx-4 font-mono shadow-2xl shadow-cyan-500/10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg text-cyan-400 font-bold">{tutorialSteps[tutorialStep].title}</h2>
              <button onClick={() => setShowTutorial(false)} className="text-gray-500 hover:text-gray-300 text-lg">✕</button>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed mb-6 min-h-[60px]">{tutorialSteps[tutorialStep].desc}</p>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setTutorialStep(s => Math.max(0, s - 1))}
                disabled={tutorialStep === 0}
                className="px-4 py-2 bg-[#1a1a2e] text-gray-300 rounded disabled:opacity-30 hover:bg-[#222238] transition border border-[#334]"
              >
                ← Anterior
              </button>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs">{tutorialStep + 1} / {tutorialSteps.length}</span>
              </div>
              <div className="flex gap-2">
                {tutorialStep < tutorialSteps.length - 1 ? (
                  <button
                    onClick={() => setTutorialStep(s => s + 1)}
                    className="px-4 py-2 bg-cyan-800 text-white rounded hover:bg-cyan-700 transition"
                  >
                    Siguiente →
                  </button>
                ) : null}
                <button
                  onClick={() => setShowTutorial(false)}
                  className="px-4 py-2 bg-[#1a1a2e] text-gray-300 rounded hover:bg-[#222238] transition border border-[#334]"
                >
                  Cerrar
                </button>
              </div>
            </div>
            <div className="flex justify-center gap-1.5 mt-5">
              {tutorialSteps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setTutorialStep(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${i === tutorialStep ? 'bg-cyan-400 scale-125' : 'bg-[#334] hover:bg-[#445]'}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
