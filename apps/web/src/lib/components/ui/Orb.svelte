<script lang="ts">
  import { onMount } from 'svelte';
  /**
   * Monochrome particle vortex, ported from the UI library's Thinking Orb (canvas, theme-aware,
   * reduced-motion aware). The motion changes the movement, not the colour.
   */
  let { motion = 'working', size = 128, speed = 1 }: { motion?: string; size?: number; speed?: number } = $props();

  type Cfg = { energy: number; turbulence: number; rotation: number; pulse: number; compression: number; wave: number; drift: number; coreGlow: number };
  const STATES: Record<string, Cfg> = {
    working: { energy: 0.8, turbulence: 0.2, rotation: 0.35, pulse: 0.7, compression: 1, wave: 0.2, drift: 0.12, coreGlow: 0.9 },
    searching: { energy: 1.15, turbulence: 0.5, rotation: 0.8, pulse: 0.55, compression: 1.02, wave: 0.45, drift: 0.28, coreGlow: 0.75 },
    solving: { energy: 1.35, turbulence: 0.7, rotation: 0.95, pulse: 0.85, compression: 0.92, wave: 0.65, drift: 0.38, coreGlow: 1 },
    connecting: { energy: 0.95, turbulence: 0.28, rotation: 1.3, pulse: 0.5, compression: 1, wave: 0.3, drift: 0.4, coreGlow: 0.85 },
    weaving: { energy: 1.1, turbulence: 0.6, rotation: 0.45, pulse: 0.65, compression: 0.88, wave: 0.9, drift: 0.25, coreGlow: 0.8 },
    composing: { energy: 0.75, turbulence: 0.18, rotation: 0.2, pulse: 0.9, compression: 0.75, wave: 0.35, drift: 0.1, coreGlow: 0.7 },
    breathing: { energy: 0.25, turbulence: 0.04, rotation: 0.06, pulse: 1.5, compression: 1.1, wave: 0.03, drift: 0.02, coreGlow: 0.5 },
    shaping: { energy: 0.95, turbulence: 0.42, rotation: 0.5, pulse: 0.7, compression: 0.92, wave: 0.75, drift: 0.25, coreGlow: 0.85 }
  };

  let canvas: HTMLCanvasElement | undefined = $state();

  onMount(() => {
    const c = canvas!.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const center = size / 2;
    const base = size * 0.36;
    canvas!.width = size * dpr;
    canvas!.height = size * dpr;
    canvas!.style.width = `${size}px`;
    canvas!.style.height = `${size}px`;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = size <= 48 ? 90 : size <= 80 ? 160 : 220;
    const parts = Array.from({ length: n }, (_, i) => ({ theta: Math.PI * (1 + Math.sqrt(5)) * i, phi: Math.acos(1 - (2 * (i + 0.5)) / n), radius: 0.75 + Math.random() * 0.25, speed: 0.15 + Math.random() * 0.85, size: 0.4 + Math.random() * 1.1, phase: Math.random() * Math.PI * 2, depth: Math.random() }));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let time = 0;
    let visible = true;
    const io = new IntersectionObserver((e) => (visible = e[0]?.isIntersecting ?? true));
    io.observe(canvas!);

    function draw() {
      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      const W = (a: number) => (dark ? `rgba(255,255,255,${a})` : `rgba(20,20,28,${a})`);
      const cfg = STATES[motion] ?? STATES.working!;
      c.clearRect(0, 0, size, size);
      const halo = c.createRadialGradient(center, center, 0, center, center, base * 1.55);
      if (dark) { halo.addColorStop(0, 'rgba(255,255,255,.06)'); halo.addColorStop(0.35, 'rgba(255,255,255,.02)'); halo.addColorStop(1, 'rgba(0,0,0,0)'); }
      else { halo.addColorStop(0, 'rgba(0,0,0,.05)'); halo.addColorStop(0.4, 'rgba(0,0,0,.015)'); halo.addColorStop(1, 'rgba(255,255,255,0)'); }
      c.fillStyle = halo;
      c.fillRect(0, 0, size, size);
      const breathing = 1 + Math.sin(time * cfg.pulse * 1.35) * 0.045 * cfg.energy;
      const rotation = time * cfg.rotation * 0.65;
      for (const p of parts) {
        let theta = p.theta + rotation * (0.65 + p.depth * 0.45);
        let phi = p.phi;
        const wave = Math.sin(theta * 3 + time * (1.05 + cfg.energy * 0.8)) * Math.cos(phi * 3 - time * 0.5);
        let r = p.radius * breathing * cfg.compression * (1 + wave * cfg.turbulence * 0.06);
        if (motion === 'searching') { r += Math.sin(time * 1.6 + p.phase) * 0.03; theta += Math.sin(time * 1.2 + p.phase) * 0.02; }
        else if (motion === 'solving') { const cv = Math.sin(time * 2.8 + p.phase); r += cv * 0.045; phi += cv * 0.02; }
        else if (motion === 'connecting') { theta += p.radius * time * 0.5; phi += Math.sin(time * 1.1 + p.phase) * 0.03; }
        else if (motion === 'weaving') { theta += Math.sin(phi * 6 + time * 1.4) * 0.05; phi += Math.cos(theta * 4 + time * 1.1) * 0.045; }
        else if (motion === 'composing') { r *= 0.96; phi += Math.sin(time * 1.4 + p.phase) * 0.015; }
        else if (motion === 'shaping') r *= 1 + Math.sin(theta * 2 + time * 0.9) * 0.08;
        let x = Math.sin(phi) * Math.cos(theta) * r;
        let y = Math.cos(phi) * r;
        const z = Math.sin(phi) * Math.sin(theta);
        x += Math.sin(theta * 3 + time) * Math.sin(phi * 2 - time * 0.4) * cfg.wave * 0.025;
        y += Math.cos(theta * 2 - time * 0.8) * cfg.wave * 0.02;
        const persp = 1 / (1.22 - z * 0.22);
        const sx = center + x * base * persp;
        const sy = center + y * base * persp;
        const depth = (z + 1) / 2;
        const ps = p.size * (0.5 + depth * 0.85) * (size / 64);
        let a = (0.2 + depth * 0.8) * (0.25 + p.depth * 0.55) * cfg.energy;
        if (depth < 0.25) a *= 0.5;
        a = Math.min(Math.max(a, 0.05), 0.95);
        if (cfg.energy > 0.8 && ps > 0.85 && size >= 48) {
          const tl = p.speed * cfg.rotation * 2.2;
          const tx = sx - Math.cos(theta) * tl;
          const ty = sy - Math.sin(theta) * tl;
          const g = c.createLinearGradient(tx, ty, sx, sy);
          g.addColorStop(0, W(0));
          g.addColorStop(1, W(a * (dark ? 0.18 : 0.22)));
          c.strokeStyle = g;
          c.lineWidth = Math.max(ps * 0.5, 0.35);
          c.beginPath(); c.moveTo(tx, ty); c.lineTo(sx, sy); c.stroke();
        }
        if (size >= 40 && depth > 0.4) { c.shadowBlur = ps * 4.5; c.shadowColor = dark ? `rgba(255,255,255,${a * 0.35})` : `rgba(0,0,0,${a * 0.2})`; } else c.shadowBlur = 0;
        c.beginPath(); c.arc(sx, sy, Math.max(ps, 0.35), 0, Math.PI * 2); c.fillStyle = W(a); c.fill(); c.shadowBlur = 0;
      }
      const cp = 1 + Math.sin(time * cfg.pulse * 1.7) * 0.1 * cfg.coreGlow;
      const cr = size * 0.046 * cp;
      const bloom = c.createRadialGradient(center, center, 0, center, center, cr * 4.2);
      if (dark) { bloom.addColorStop(0, 'rgba(255,255,255,.92)'); bloom.addColorStop(0.18, 'rgba(255,255,255,.55)'); bloom.addColorStop(0.4, 'rgba(240,240,248,.18)'); bloom.addColorStop(0.7, 'rgba(220,220,235,.04)'); bloom.addColorStop(1, 'rgba(0,0,0,0)'); }
      else { bloom.addColorStop(0, 'rgba(18,18,24,.92)'); bloom.addColorStop(0.2, 'rgba(35,35,45,.5)'); bloom.addColorStop(0.45, 'rgba(70,70,85,.16)'); bloom.addColorStop(0.75, 'rgba(100,100,120,.03)'); bloom.addColorStop(1, 'rgba(255,255,255,0)'); }
      c.shadowBlur = size * 0.14;
      c.shadowColor = dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.15)';
      c.beginPath(); c.arc(center, center, cr * 4.2, 0, Math.PI * 2); c.fillStyle = bloom; c.fill(); c.shadowBlur = 0;
      const hot = c.createRadialGradient(center, center, 0, center, center, cr * 0.95);
      if (dark) { hot.addColorStop(0, 'rgba(255,255,255,.98)'); hot.addColorStop(0.45, 'rgba(255,255,255,.45)'); hot.addColorStop(1, 'rgba(255,255,255,0)'); }
      else { hot.addColorStop(0, 'rgba(10,10,15,.98)'); hot.addColorStop(0.45, 'rgba(30,30,40,.45)'); hot.addColorStop(1, 'rgba(0,0,0,0)'); }
      c.beginPath(); c.arc(center, center, cr * 0.95, 0, Math.PI * 2); c.fillStyle = hot; c.fill();
    }

    draw();
    let id = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.04);
      last = t;
      if (visible && !reduced) {
        time += dt * speed;
        draw();
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(id);
      io.disconnect();
    };
  });
</script>

<canvas bind:this={canvas} role="img" aria-label="Scanning" style="display: block"></canvas>
