import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Harness from './Harness.svelte';

describe('GraphCanvas', () => {
	let target: HTMLDivElement | null = null;
	let app: ReturnType<typeof mount> | null = null;

	afterEach(() => {
		if (app) unmount(app);
		target?.remove();
		app = null;
		target = null;
	});

	it('does not exceed the effect update depth when concepts are added one by one', () => {
		target = document.createElement('div');
		document.body.appendChild(target);

		const caughtErrors: unknown[] = [];
		const onUnhandled = (e: ErrorEvent) => caughtErrors.push(e.error ?? e.message);
		window.addEventListener('error', onUnhandled);

		app = mount(Harness, { target }) as ReturnType<typeof mount> & {
			addConcept: (id: string, name: string) => void;
			addRelation: (id: string, sourceId: string, targetId: string) => void;
		};
		flushSync();

		expect(() => {
			(app as any).addConcept('concept-1', 'Homeostasis');
			flushSync();
			(app as any).addConcept('concept-2', 'Negative feedback');
			flushSync();
			(app as any).addRelation('rel-1', 'concept-1', 'concept-2');
			flushSync();
			(app as any).addConcept('concept-3', 'Set point');
			flushSync();
			(app as any).renameConcept('concept-2', 'Negative feedback loop');
			flushSync();
			(app as any).removeConcept('concept-3');
			flushSync();
		}).not.toThrow();

		window.removeEventListener('error', onUnhandled);

		// GraphCanvas should have rendered two remaining nodes and one edge
		// after concept-3 was removed. Each edge renders two <line>s: an
		// invisible wide hit-area for easier clicking, plus the visible line.
		expect(target.querySelectorAll('circle').length).toBe(2);
		expect(target.querySelectorAll('line').length).toBe(2);
		expect(target.textContent).toContain('Negative feedback loop');
		expect(caughtErrors).toEqual([]);
	});
});
