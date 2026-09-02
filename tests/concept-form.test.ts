import { describe, it, expect } from 'vitest';
import { mount, flushSync } from 'svelte';
import ConceptFormModal from '../src/lib/components/ConceptFormModal.svelte';

describe('ConceptFormModal', () => {
	it('allows submitting a concept with only a name and multiple source links', () => {
		const submitted: Array<{
			name: string;
			definition: string | null;
			literatureLink: string | null;
			quizQuestion: string | null;
		}> = [];
		const target = document.createElement('div');
		document.body.appendChild(target);

		mount(ConceptFormModal, {
			target,
			props: {
				mode: 'create',
				onSubmit: async (data) => {
					submitted.push({
						name: data.name,
						definition: data.definition ?? null,
						literatureLink: data.literatureLink ?? null,
						quizQuestion: data.quizQuestion ?? null
					});
				},
				onClose: () => {}
			}
		});

		const nameInput = target.querySelector('#c-name') as HTMLInputElement;
		const definitionInput = target.querySelector('#c-def') as HTMLTextAreaElement;
		const form = target.querySelector('#concept-form') as HTMLFormElement;
		const addSourceButton = Array.from(target.querySelectorAll('button')).find((button) =>
			button.textContent?.includes('Add another') && button.parentElement?.textContent?.includes('Sources')
		) as HTMLButtonElement;
		const addQuizButton = Array.from(target.querySelectorAll('button')).find((button) =>
			button.textContent?.includes('Add another') && button.parentElement?.textContent?.includes('Quiz question')
		) as HTMLButtonElement;

		nameInput.value = 'Homeostasis';
		nameInput.dispatchEvent(new Event('input'));
		definitionInput.value = '';
		definitionInput.dispatchEvent(new Event('input'));
		addSourceButton.click();
		flushSync();

		const sourceInputs = target.querySelectorAll('input[type="url"]') as NodeListOf<HTMLInputElement>;
		sourceInputs[0].value = 'https://example.com/a';
		sourceInputs[0].dispatchEvent(new Event('input'));
		sourceInputs[1].value = 'https://example.com/b';
		sourceInputs[1].dispatchEvent(new Event('input'));
		addQuizButton.click();
		flushSync();

		const quizInputs = target.querySelectorAll('textarea[id="c-quiz"], textarea:not([id])') as NodeListOf<HTMLTextAreaElement>;
		quizInputs[0].value = 'What is homeostasis?';
		quizInputs[0].dispatchEvent(new Event('input'));
		quizInputs[1].value = 'Why does it matter?';
		quizInputs[1].dispatchEvent(new Event('input'));

		flushSync();
		form.dispatchEvent(new Event('submit', { cancelable: true }));

		expect(submitted).toHaveLength(1);
		expect(submitted[0]).toMatchObject({
			name: 'Homeostasis',
			definition: null,
			literatureLink: 'https://example.com/a\nhttps://example.com/b',
			quizQuestion: 'What is homeostasis?\n\n---\n\nWhy does it matter?'
		});
		target.remove();
	});
});
