<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// "Concept" (or "idea"/"knowledge") in a spread of languages — purely
	// decorative labels for the hero's floating knowledge-network animation.
	const WORDS = [
		'Concept', 'Concepto', 'Konzept', 'Concetto', 'Conceito', 'Idea',
		'Pojęcie', 'Понятие', '概念', '개념', 'مفهوم', 'अवधारणा',
		'Ý tưởng', 'Käsite', 'Begrip', 'Ιδέα', 'Fikra', 'Wazo'
	];

	// A tight, cohesive accent palette (cyan -> blue -> violet) so the graph
	// reads as one intentional gradient rather than random confetti.
	const PALETTE = ['#ff3d81', '#ffd23f', '#00c2d1', '#7c3aed'];

	let canvasEl: HTMLCanvasElement | undefined = $state();
	let raf = 0;

	type Node = {
		x: number;
		y: number;
		vx: number;
		vy: number;
		label: string;
		radius: number;
		color: string;
		phase: number; // per-node phase offset for the breathing/label pulse
	};

	type Pulse = { from: number; to: number; t: number; speed: number };

	onMount(() => {
		const canvas = canvasEl;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		let width = 0;
		let height = 0;

		function size() {
			const rect = canvas!.parentElement!.getBoundingClientRect();
			width = rect.width;
			height = rect.height;
			canvas!.width = width * dpr;
			canvas!.height = height * dpr;
			canvas!.style.width = `${width}px`;
			canvas!.style.height = `${height}px`;
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		size();

		const nodes: Node[] = WORDS.map((label, i) => ({
			x: Math.random() * width,
			y: Math.random() * height,
			vx: (Math.random() - 0.5) * (reduceMotion ? 0 : 0.16),
			vy: (Math.random() - 0.5) * (reduceMotion ? 0 : 0.16),
			label,
			radius: 2.5 + Math.random() * 2,
			color: PALETTE[i % PALETTE.length],
			phase: Math.random() * Math.PI * 2
		}));

		// A handful of little light-pulses that travel along an active edge,
		// like a signal firing between two connected ideas — the one bit of
		// motion that reads as deliberate "network activity" rather than
		// ambient drift.
		const pulses: Pulse[] = [];
		function spawnPulse() {
			if (reduceMotion || nodes.length < 2) return;
			const from = Math.floor(Math.random() * nodes.length);
			let to = Math.floor(Math.random() * nodes.length);
			if (to === from) to = (to + 1) % nodes.length;
			pulses.push({ from, to, t: 0, speed: 0.006 + Math.random() * 0.006 });
		}

		const pointer = { x: -9999, y: -9999, active: false };
		function onPointerMove(e: PointerEvent) {
			const rect = canvas!.getBoundingClientRect();
			pointer.x = e.clientX - rect.left;
			pointer.y = e.clientY - rect.top;
			pointer.active = true;
		}
		function onPointerLeave() {
			pointer.active = false;
		}

		let elapsed = 0;
		let lastSpawn = 0;

		function frame(t: number) {
			elapsed = t / 1000;

			for (const n of nodes) {
				n.x += n.vx;
				n.y += n.vy;
				if (n.x < 40 || n.x > width - 40) n.vx *= -1;
				if (n.y < 24 || n.y > height - 24) n.vy *= -1;

				// Gentle repulsion from the pointer — the network subtly
				// reacts to attention instead of feeling like a static loop.
				if (pointer.active && !reduceMotion) {
					const dx = n.x - pointer.x;
					const dy = n.y - pointer.y;
					const dist = Math.hypot(dx, dy);
					const radius = 140;
					if (dist < radius && dist > 0.01) {
						const force = ((radius - dist) / radius) * 0.02;
						n.vx += (dx / dist) * force;
						n.vy += (dy / dist) * force;
					}
				}
				// Mild damping keeps pointer nudges from accumulating into chaos.
				n.vx *= 0.995;
				n.vy *= 0.995;
			}

			ctx!.clearRect(0, 0, width, height);

			// Edges between nodes close enough to feel connected — brighter
			// and slightly thicker the closer the pair, like signal strength.
			const maxDist = Math.min(width, height) * 0.4;
			for (let i = 0; i < nodes.length; i++) {
				for (let j = i + 1; j < nodes.length; j++) {
					const a = nodes[i];
					const b = nodes[j];
					const dist = Math.hypot(a.x - b.x, a.y - b.y);
					if (dist < maxDist) {
						const strength = 1 - dist / maxDist;
						ctx!.strokeStyle = `rgba(255, 210, 63, ${strength * 0.3})`;
						ctx!.lineWidth = 0.6 + strength * 0.6;
						ctx!.beginPath();
						ctx!.moveTo(a.x, a.y);
						ctx!.lineTo(b.x, b.y);
						ctx!.stroke();
					}
				}
			}

			// Traveling pulses along whichever edges are currently active.
			if (!reduceMotion && elapsed - lastSpawn > 0.9 && pulses.length < 4) {
				spawnPulse();
				lastSpawn = elapsed;
			}
			for (let i = pulses.length - 1; i >= 0; i--) {
				const p = pulses[i];
				p.t += p.speed;
				if (p.t >= 1) {
					pulses.splice(i, 1);
					continue;
				}
				const a = nodes[p.from];
				const b = nodes[p.to];
				const x = a.x + (b.x - a.x) * p.t;
				const y = a.y + (b.y - a.y) * p.t;
				const fade = Math.sin(p.t * Math.PI); // ease in, ease out
				ctx!.beginPath();
				ctx!.arc(x, y, 1.8, 0, Math.PI * 2);
				ctx!.fillStyle = `rgba(255, 246, 233, ${fade * 0.9})`;
				ctx!.shadowColor = 'rgba(255, 61, 129, 0.9)';
				ctx!.shadowBlur = 6;
				ctx!.fill();
				ctx!.shadowBlur = 0;
			}

			// Nodes + their multilingual labels, with a slow shared "breathing"
			// pulse per node so the whole thing feels alive rather than static.
			ctx!.font = '600 11px system-ui, -apple-system, sans-serif';
			ctx!.textAlign = 'center';
			ctx!.textBaseline = 'middle';
			for (const n of nodes) {
				const pulse = reduceMotion ? 1 : 0.75 + Math.sin(elapsed * 1.1 + n.phase) * 0.25;

				ctx!.beginPath();
				ctx!.arc(n.x, n.y, n.radius * pulse, 0, Math.PI * 2);
				ctx!.fillStyle = n.color;
				ctx!.shadowColor = n.color;
				ctx!.shadowBlur = 8;
				ctx!.fill();
				ctx!.shadowBlur = 0;

				ctx!.fillStyle = `rgba(255, 246, 233, ${0.55 + pulse * 0.25})`;
				ctx!.fillText(n.label, n.x, n.y - 14);
			}

			raf = requestAnimationFrame(frame);
		}

		raf = requestAnimationFrame(frame);

		const onResize = () => size();
		window.addEventListener('resize', onResize);
		canvas.addEventListener('pointermove', onPointerMove);
		canvas.addEventListener('pointerleave', onPointerLeave);

		onDestroy(() => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', onResize);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('pointerleave', onPointerLeave);
		});
	});
</script>

<canvas bind:this={canvasEl} class="absolute inset-0 h-full w-full" aria-hidden="true"></canvas>
