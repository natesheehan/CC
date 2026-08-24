// jsdom doesn't implement ResizeObserver (used by Svelte's bind:clientWidth/clientHeight)
// or pointer capture (used by our drag handlers). Both are no-ops for our purposes in tests.
class ResizeObserverPolyfill {
	observe() {}
	unobserve() {}
	disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverPolyfill;

if (!('setPointerCapture' in Element.prototype)) {
	// @ts-expect-error - polyfill for jsdom
	Element.prototype.setPointerCapture = () => {};
	// @ts-expect-error - polyfill for jsdom
	Element.prototype.releasePointerCapture = () => {};
}
