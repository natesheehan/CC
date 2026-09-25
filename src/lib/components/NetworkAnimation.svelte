<script lang="ts">
	import { onMount } from 'svelte';

	// "Concept" (or "idea"/"knowledge") in a spread of languages — purely
	// decorative labels for the hero's layered-orbit animation.
	const CORE_WORD = 'Concept';
	const WORDS = [
		'Concepto', 'Konzept', 'Concetto', 'Conceito', 'Idea',
		'Pojęcie', 'Понятие', '概念', '개념', 'مفهوم', 'अवधारणा',
		'Ý tưởng', 'Käsite', 'Begrip', 'Ιδέα', 'Fikra', 'Wazo'
	];

	const INK = '#14110f';
	const CREAM = '#fff6e9';
	const PINK = '#ff3d81';
	const YELLOW = '#ffd23f';
	const CYAN = '#00c2d1';

	// Three tilted, counter-rotating rings around a core concept — each ring is
	// a "layer of meaning". Radii are fractions of the scene radius R.
	const RINGS = [
		{ r: 0.42, tiltX: 1.15, tiltZ: 0.4, speed: 0.22, color: PINK, count: 5, dotted: false },
		{ r: 0.7, tiltX: 1.32, tiltZ: -0.5, speed: -0.14, color: YELLOW, count: 6, dotted: true },
		{ r: 1.0, tiltX: 1.05, tiltZ: 0.12, speed: 0.09, color: CYAN, count: 6, dotted: false }
	];
	const RING_SEGMENTS = 72;

	type Node = {
		ring: number;
		theta0: number;
		label: string;
		delay: number; // staggered entrance
		parent: number; // index into nodes, -1 = core
		children: number[];
	};

	type Projected = { x: number; y: number; z: number; s: number };
	type Pulse = { from: number; to: number; t: number; speed: number };
	type Drawable = { z: number; draw: () => void };

	let canvasEl: HTMLCanvasElement | undefined = $state();

	onMount(() => {
		const canvas = canvasEl;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		let width = 0;
		let height = 0;
		let cx = 0;
		let cy = 0;
		let R = 0;

		function size() {
			const rect = canvas!.parentElement!.getBoundingClientRect();
			width = rect.width;
			height = rect.height;
			canvas!.width = width * dpr;
			canvas!.height = height * dpr;
			canvas!.style.width = `${width}px`;
			canvas!.style.height = `${height}px`;
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

			// On wide screens the orbit sits to the right of the copy; on narrow
			// screens it centres behind it.
			if (width >= 1024) {
				cx = width * 0.72;
				cy = height * 0.5;
				R = Math.min(width * 0.26, height * 0.4);
			} else {
				cx = width / 2;
				cy = height * 0.45;
				R = Math.min(width * 0.46, height * 0.36);
			}
		}
		size();

		// Build nodes ring by ring, each linked to the angularly-nearest node on
		// the ring inside it, so the structure reads as meaning radiating out.
		const nodes: Node[] = [];
		let w = 0;
		RINGS.forEach((ring, ri) => {
			const offset = ri * 0.7;
			for (let k = 0; k < ring.count; k++) {
				nodes.push({
					ring: ri,
					theta0: offset + (k / ring.count) * Math.PI * 2,
					label: WORDS[w++ % WORDS.length],
					delay: 0.35 + ri * 0.35 + k * 0.06,
					parent: -1,
					children: []
				});
			}
		});
		const angleGap = (a: number, b: number) => {
			const d = Math.abs(a - b) % (Math.PI * 2);
			return d > Math.PI ? Math.PI * 2 - d : d;
		};
		const coreChildren: number[] = [];
		nodes.forEach((n, i) => {
			if (n.ring === 0) {
				coreChildren.push(i);
				return;
			}
			let best = -1;
			let bestGap = Infinity;
			nodes.forEach((m, j) => {
				if (m.ring !== n.ring - 1) return;
				const gap = angleGap(n.theta0, m.theta0);
				if (gap < bestGap) {
					bestGap = gap;
					best = j;
				}
			});
			n.parent = best;
			nodes[best].children.push(i);
		});

		// Scene rotation, eased toward pointer-driven targets.
		const view = { yaw: 0, pitch: -0.28, targetYaw: 0, targetPitch: -0.28 };
		const pointer = { x: -9999, y: -9999 };
		let hovered = -2; // -2 none, -1 core, >=0 node index

		function onPointerMove(e: PointerEvent) {
			const rect = canvas!.getBoundingClientRect();
			pointer.x = e.clientX - rect.left;
			pointer.y = e.clientY - rect.top;
			if (!reduceMotion) {
				view.targetYaw = (pointer.x / width - 0.5) * 0.7;
				view.targetPitch = -0.28 + (pointer.y / height - 0.5) * 0.45;
			}
		}

		function project(ringIdx: number, theta: number, radius: number, spin: number): Projected {
			const ring = RINGS[ringIdx];
			let x = radius * Math.cos(theta);
			let y = 0;
			let z = radius * Math.sin(theta);
			// tilt ring about X
			let c = Math.cos(ring.tiltX);
			let s = Math.sin(ring.tiltX);
			[y, z] = [y * c - z * s, y * s + z * c];
			// tilt ring about Z
			c = Math.cos(ring.tiltZ);
			s = Math.sin(ring.tiltZ);
			[x, y] = [x * c - y * s, x * s + y * c];
			return toScreen(x, y, z, spin);
		}

		function toScreen(x: number, y: number, z: number, spin: number): Projected {
			// global yaw (slow spin + pointer) then pitch
			const yaw = view.yaw + spin;
			let c = Math.cos(yaw);
			let s = Math.sin(yaw);
			[x, z] = [x * c + z * s, -x * s + z * c];
			c = Math.cos(view.pitch);
			s = Math.sin(view.pitch);
			[y, z] = [y * c - z * s, y * s + z * c];
			const f = R * 3.2;
			const scale = f / (f + z);
			return { x: cx + x * scale, y: cy + y * scale, z, s: scale };
		}

		// 1 at the front of the scene, 0 at the back.
		const nearness = (z: number) => Math.max(0, Math.min(1, 0.5 - z / (2 * R)));

		const easeOutBack = (t: number) => {
			const c1 = 1.5;
			const c3 = c1 + 1;
			return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
		};
		const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

		// Signals cascade outward from the core: when one lands it may fire
		// onward into that node's children, like an idea unpacking.
		const pulses: Pulse[] = [];
		function fireFromCore() {
			const to = coreChildren[Math.floor(Math.random() * coreChildren.length)];
			pulses.push({ from: -1, to, t: 0, speed: 0.9 + Math.random() * 0.4 });
		}

		let time = 0;
		let last = performance.now();
		let lastFire = 0;
		let raf = 0;
		let visible = true;

		function render(now: number) {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			time += dt;

			const intro = reduceMotion ? 1 : clamp01((time - 0.1) / 1.2);
			const spin = reduceMotion ? 0 : time * 0.06;

			view.yaw += (view.targetYaw - view.yaw) * 0.05;
			view.pitch += (view.targetPitch - view.pitch) * 0.05;

			// Project everything for this frame.
			const core = toScreen(0, 0, 0, spin);
			const pos: Projected[] = nodes.map((n) => {
				const ring = RINGS[n.ring];
				const grow = reduceMotion ? 1 : easeOutBack(clamp01((time - n.delay) / 1.1));
				const theta = n.theta0 + (reduceMotion ? 0 : time * ring.speed);
				return project(n.ring, theta, ring.r * R * grow, spin);
			});
			const nodeAlpha = (i: number) =>
				reduceMotion ? 1 : clamp01((time - nodes[i].delay) / 0.5);
			const posOf = (i: number) => (i === -1 ? core : pos[i]);

			// Hover: front-most node near the pointer.
			hovered = -2;
			let bestZ = Infinity;
			if (Math.hypot(pointer.x - core.x, pointer.y - core.y) < R * 0.12) {
				hovered = -1;
				bestZ = core.z;
			}
			pos.forEach((p, i) => {
				if (Math.hypot(pointer.x - p.x, pointer.y - p.y) < 28 * p.s && p.z < bestZ) {
					hovered = i;
					bestZ = p.z;
				}
			});
			const isLit = (from: number, to: number) =>
				hovered !== -2 && (hovered === from || hovered === to);

			const drawables: Drawable[] = [];

			// Ring orbits, sketched in progressively during the intro.
			RINGS.forEach((ring, ri) => {
				const sweep = reduceMotion ? 1 : clamp01((time - 0.2 - ri * 0.3) / 1.4);
				const segs = Math.floor(RING_SEGMENTS * sweep);
				for (let k = 0; k < segs; k++) {
					if (ring.dotted && k % 2) continue;
					const a0 = (k / RING_SEGMENTS) * Math.PI * 2 + (reduceMotion ? 0 : time * ring.speed * 0.25);
					const a1 = ((k + 1) / RING_SEGMENTS) * Math.PI * 2 + (reduceMotion ? 0 : time * ring.speed * 0.25);
					const p0 = project(ri, a0, ring.r * R, spin);
					const p1 = project(ri, a1, ring.r * R, spin);
					const z = (p0.z + p1.z) / 2;
					drawables.push({
						z,
						draw: () => {
							const near = nearness(z);
							ctx!.globalAlpha = 0.18 + near * 0.62;
							ctx!.strokeStyle = ring.color;
							ctx!.lineWidth = (ring.dotted ? 3 : 2) * ((p0.s + p1.s) / 2);
							ctx!.lineCap = 'round';
							ctx!.beginPath();
							ctx!.moveTo(p0.x, p0.y);
							ctx!.lineTo(p1.x, p1.y);
							ctx!.stroke();
						}
					});
				}
			});

			// Spokes from each node to its parent.
			nodes.forEach((n, i) => {
				const a = posOf(n.parent);
				const b = pos[i];
				const z = (a.z + b.z) / 2;
				drawables.push({
					z,
					draw: () => {
						const lit = isLit(n.parent, i);
						ctx!.globalAlpha = nodeAlpha(i) * (lit ? 0.95 : 0.12 + nearness(z) * 0.3);
						ctx!.strokeStyle = lit ? YELLOW : CREAM;
						ctx!.lineWidth = lit ? 2 : 1;
						ctx!.setLineDash(lit ? [] : [3, 5]);
						ctx!.beginPath();
						ctx!.moveTo(a.x, a.y);
						ctx!.lineTo(b.x, b.y);
						ctx!.stroke();
						ctx!.setLineDash([]);
					}
				});
			});

			// Travelling signals.
			if (!reduceMotion && intro >= 1 && time - lastFire > 1.1 && pulses.length < 6) {
				fireFromCore();
				lastFire = time;
			}
			for (let i = pulses.length - 1; i >= 0; i--) {
				const p = pulses[i];
				p.t += p.speed * dt;
				if (p.t >= 1) {
					pulses.splice(i, 1);
					const kids = nodes[p.to].children;
					if (kids.length && Math.random() < 0.8) {
						const next = kids[Math.floor(Math.random() * kids.length)];
						pulses.push({ from: p.to, to: next, t: 0, speed: 0.9 + Math.random() * 0.4 });
					}
					continue;
				}
				const a = posOf(p.from);
				const b = pos[p.to];
				const x = a.x + (b.x - a.x) * p.t;
				const y = a.y + (b.y - a.y) * p.t;
				const z = a.z + (b.z - a.z) * p.t;
				const fade = Math.sin(p.t * Math.PI);
				drawables.push({
					z: z - 1,
					draw: () => {
						// comet tail
						const tx = a.x + (b.x - a.x) * Math.max(0, p.t - 0.18);
						const ty = a.y + (b.y - a.y) * Math.max(0, p.t - 0.18);
						const grad = ctx!.createLinearGradient(tx, ty, x, y);
						grad.addColorStop(0, 'rgba(255, 210, 63, 0)');
						grad.addColorStop(1, 'rgba(255, 210, 63, 0.9)');
						ctx!.globalAlpha = fade;
						ctx!.strokeStyle = grad;
						ctx!.lineWidth = 2.5;
						ctx!.beginPath();
						ctx!.moveTo(tx, ty);
						ctx!.lineTo(x, y);
						ctx!.stroke();
						ctx!.beginPath();
						ctx!.arc(x, y, 3, 0, Math.PI * 2);
						ctx!.fillStyle = CREAM;
						ctx!.shadowColor = YELLOW;
						ctx!.shadowBlur = 12;
						ctx!.fill();
						ctx!.shadowBlur = 0;
					}
				});
			}

			// Core concept.
			drawables.push({
				z: core.z,
				draw: () => {
					const r = R * 0.085 * (reduceMotion ? 1 : easeOutBack(clamp01(time / 0.8)));
					if (r <= 0) return;
					const breathe = reduceMotion ? 1 : 1 + Math.sin(time * 2) * 0.04;
					ctx!.globalAlpha = 1;
					const glow = ctx!.createRadialGradient(core.x, core.y, r * 0.5, core.x, core.y, r * 3.2);
					glow.addColorStop(0, 'rgba(255, 61, 129, 0.45)');
					glow.addColorStop(1, 'rgba(255, 61, 129, 0)');
					ctx!.fillStyle = glow;
					ctx!.beginPath();
					ctx!.arc(core.x, core.y, r * 3.2, 0, Math.PI * 2);
					ctx!.fill();

					// rotating dashed halo
					ctx!.strokeStyle = YELLOW;
					ctx!.lineWidth = 2;
					ctx!.setLineDash([6, 8]);
					ctx!.lineDashOffset = -time * 20;
					ctx!.beginPath();
					ctx!.arc(core.x, core.y, r * 1.55 * breathe, 0, Math.PI * 2);
					ctx!.stroke();
					ctx!.setLineDash([]);
					ctx!.lineDashOffset = 0;

					// hard-shadowed Memphis disc
					ctx!.fillStyle = INK;
					ctx!.beginPath();
					ctx!.arc(core.x + 4, core.y + 4, r * breathe, 0, Math.PI * 2);
					ctx!.fill();
					ctx!.fillStyle = PINK;
					ctx!.strokeStyle = INK;
					ctx!.lineWidth = 3;
					ctx!.beginPath();
					ctx!.arc(core.x, core.y, r * breathe, 0, Math.PI * 2);
					ctx!.fill();
					ctx!.stroke();

					drawLabel(CORE_WORD, core.x, core.y + r * 1.55 + 16, 1.15, 1, hovered === -1);
				}
			});

			// Word nodes.
			nodes.forEach((n, i) => {
				const p = pos[i];
				drawables.push({
					z: p.z,
					draw: () => {
						const near = nearness(p.z);
						const alpha = nodeAlpha(i) * (0.35 + near * 0.65);
						if (alpha <= 0) return;
						const lit = hovered === i || hovered === n.parent || n.children.includes(hovered);
						const r = (5 + near * 3) * p.s * (hovered === i ? 1.6 : 1);
						ctx!.globalAlpha = alpha;
						ctx!.fillStyle = INK;
						ctx!.beginPath();
						ctx!.arc(p.x + 2, p.y + 2, r, 0, Math.PI * 2);
						ctx!.fill();
						ctx!.fillStyle = RINGS[n.ring].color;
						ctx!.strokeStyle = INK;
						ctx!.lineWidth = 2;
						ctx!.beginPath();
						ctx!.arc(p.x, p.y, r, 0, Math.PI * 2);
						ctx!.fill();
						ctx!.stroke();
						drawLabel(n.label, p.x, p.y - r - 12, p.s, alpha, lit);
					}
				});
			});

			ctx!.clearRect(0, 0, width, height);
			drawables.sort((a, b) => b.z - a.z);
			for (const d of drawables) d.draw();
			ctx!.globalAlpha = 1;

			if (!reduceMotion && visible) raf = requestAnimationFrame(render);
		}

		function drawLabel(text: string, x: number, y: number, scale: number, alpha: number, lit: boolean) {
			const size = Math.round(12 * scale * (lit ? 1.25 : 1));
			ctx!.font = `700 ${size}px Inter, system-ui, -apple-system, sans-serif`;
			ctx!.textAlign = 'center';
			ctx!.textBaseline = 'middle';
			ctx!.globalAlpha = alpha;
			if (lit) {
				const w = ctx!.measureText(text).width + 16;
				const h = size + 10;
				ctx!.fillStyle = INK;
				ctx!.fillRect(x - w / 2 + 3, y - h / 2 + 3, w, h);
				ctx!.fillStyle = YELLOW;
				ctx!.fillRect(x - w / 2, y - h / 2, w, h);
				ctx!.strokeStyle = INK;
				ctx!.lineWidth = 2;
				ctx!.strokeRect(x - w / 2, y - h / 2, w, h);
				ctx!.fillStyle = INK;
				ctx!.fillText(text, x, y + 1);
				return;
			}
			ctx!.fillStyle = INK;
			ctx!.fillText(text, x + 1.5, y + 1.5);
			ctx!.fillStyle = CREAM;
			ctx!.fillText(text, x, y);
		}

		function start() {
			cancelAnimationFrame(raf);
			last = performance.now();
			raf = requestAnimationFrame(render);
		}
		start();

		// Pause when the hero scrolls out of view or the tab is hidden.
		const io = new IntersectionObserver(([entry]) => {
			const next = entry.isIntersecting && !document.hidden;
			if (next && !visible) {
				visible = true;
				start();
			} else if (!next) {
				visible = false;
			}
		});
		io.observe(canvas);
		const onVisibility = () => {
			if (document.hidden) visible = false;
			else if (!visible) {
				visible = true;
				start();
			}
		};

		const onResize = () => {
			size();
			if (reduceMotion) start();
		};
		window.addEventListener('resize', onResize);
		window.addEventListener('pointermove', onPointerMove);
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			cancelAnimationFrame(raf);
			io.disconnect();
			window.removeEventListener('resize', onResize);
			window.removeEventListener('pointermove', onPointerMove);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<canvas bind:this={canvasEl} class="absolute inset-0 h-full w-full" aria-hidden="true"></canvas>
