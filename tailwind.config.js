/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				sans: [
					'Inter',
					'ui-sans-serif',
					'system-ui',
					'-apple-system',
					'sans-serif'
				],
				display: ['"Archivo Black"', 'Inter', 'ui-sans-serif', 'sans-serif']
			},
			// Muted text greys follow the theme; values live in src/app.css.
			textColor: {
				slate: {
					300: 'rgb(var(--grey-300) / <alpha-value>)',
					400: 'rgb(var(--grey-400) / <alpha-value>)',
					500: 'rgb(var(--grey-500) / <alpha-value>)',
					600: 'rgb(var(--grey-600) / <alpha-value>)'
				}
			},
			colors: {
				memphis: {
					pink: '#ff3d81',
					pinkDeep: '#c81762',
					yellow: '#ffd23f',
					cyan: '#00c2d1',
					purple: '#7c3aed',
					ink: '#14110f',
					cream: '#fff6e9'
				}
			}
		}
	},
	plugins: []
};
