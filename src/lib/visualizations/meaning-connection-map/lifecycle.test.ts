import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockMeaningMapScroll, ownMeaningMapResources } from './lifecycle';

class InlineStyle {
	private values = new Map<string, { value: string; priority: string }>();

	getPropertyValue(name: string): string {
		if (name === 'overflow') {
			const x = this.getPropertyValue('overflow-x');
			const y = this.getPropertyValue('overflow-y');
			return x && y ? (x === y ? x : `${x} ${y}`) : '';
		}
		return this.values.get(name)?.value ?? '';
	}

	getPropertyPriority(name: string): string {
		if (name === 'overflow') {
			const x = this.getPropertyPriority('overflow-x');
			return x === this.getPropertyPriority('overflow-y') ? x : '';
		}
		return this.values.get(name)?.priority ?? '';
	}

	setProperty(name: string, value: string | null, priority = ''): void {
		if (name === 'overflow') {
			const [x, y = x] = (value ?? '').split(/\s+/);
			this.setProperty('overflow-x', x, priority);
			this.setProperty('overflow-y', y, priority);
		} else {
			this.values.set(name, { value: value ?? '', priority });
		}
	}

	removeProperty(name: string): string {
		const previous = this.getPropertyValue(name);
		if (name === 'overflow') {
			this.values.delete('overflow-x');
			this.values.delete('overflow-y');
		} else {
			this.values.delete(name);
		}
		return previous;
	}
}

describe('Meaning Map route scroll ownership', () => {
	it('restores distinct prior root/body overflow values and priorities after navigation', () => {
		const document = {
			body: { style: new InlineStyle() },
			documentElement: { style: new InlineStyle() }
		};
		document.body.style.setProperty('overflow-x', 'clip', 'important');
		document.body.style.setProperty('overflow-y', 'scroll');
		document.documentElement.style.setProperty('overflow', 'auto', 'important');

		const release = lockMeaningMapScroll(document);
		expect(document.body.style.getPropertyValue('overflow')).toBe('hidden');
		expect(document.documentElement.style.getPropertyValue('overflow')).toBe('hidden');
		document.body.style.setProperty('color', 'tomato');
		release();

		expect(document.body.style.getPropertyValue('overflow-x')).toBe('clip');
		expect(document.body.style.getPropertyPriority('overflow-x')).toBe('important');
		expect(document.body.style.getPropertyValue('overflow-y')).toBe('scroll');
		expect(document.body.style.getPropertyPriority('overflow-y')).toBe('');
		expect(document.documentElement.style.getPropertyValue('overflow')).toBe('auto');
		expect(document.documentElement.style.getPropertyPriority('overflow')).toBe('important');
		expect(document.body.style.getPropertyValue('color')).toBe('tomato');
	});

	it('allows repeated visits and idempotent cleanup without leaving an inline scroll lock', () => {
		const document = {
			body: { style: new InlineStyle() },
			documentElement: { style: new InlineStyle() }
		};
		for (let visit = 0; visit < 3; visit += 1) {
			const release = lockMeaningMapScroll(document);
			expect(document.body.style.getPropertyValue('overflow')).toBe('hidden');
			release();
			release();
			expect(document.body.style.getPropertyValue('overflow')).toBe('');
			expect(document.documentElement.style.getPropertyValue('overflow')).toBe('');
		}
	});
});

describe('Meaning Map D3 resource ownership', () => {
	afterEach(() => vi.useRealTimers());

	it('cancels settling, simulation work and transitions before removing the SVG on unmount', () => {
		vi.useFakeTimers();
		const tick = vi.fn();
		const transitionEnd = vi.fn();
		const simulationTimer = setInterval(tick, 16);
		const childTransition = setTimeout(transitionEnd, 300);
		const rootTransition = setTimeout(transitionEnd, 500);
		const simulation = {
			on: vi.fn(),
			stop: vi.fn(() => clearInterval(simulationTimer))
		};
		const descendants = {
			interrupt: vi.fn(() => clearTimeout(childTransition)),
			on: vi.fn()
		};
		const svg = {
			selectAll: vi.fn(() => descendants),
			interrupt: vi.fn(() => clearTimeout(rootTransition)),
			on: vi.fn(),
			remove: vi.fn()
		};

		const releaseZoom = vi.fn();
		const dispose = ownMeaningMapResources(simulation, svg, releaseZoom);
		vi.advanceTimersByTime(32);
		expect(tick).toHaveBeenCalledTimes(2);
		dispose();
		dispose();
		expect(simulation.on).toHaveBeenCalledWith('tick', null);
		expect(simulation.stop).toHaveBeenCalledTimes(1);
		expect(releaseZoom).toHaveBeenCalledTimes(1);
		expect(svg.selectAll).toHaveBeenCalledWith('*');
		expect(descendants.interrupt).toHaveBeenCalledTimes(1);
		expect(descendants.on).toHaveBeenCalledWith('click', null);
		expect(svg.interrupt).toHaveBeenCalledTimes(1);
		expect(svg.on).toHaveBeenCalledWith('.zoom', null);
		expect(svg.on).toHaveBeenCalledWith('click', null);
		expect(svg.remove).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);

		vi.advanceTimersByTime(20_000);
		expect(tick).toHaveBeenCalledTimes(2);
		expect(transitionEnd).not.toHaveBeenCalled();
		expect(simulation.stop).toHaveBeenCalledTimes(1);
	});

	it('retains the eight second settling limit while mounted and cleans up after it fires', () => {
		vi.useFakeTimers();
		const simulation = { on: vi.fn(), stop: vi.fn() };
		const descendants = { interrupt: vi.fn(), on: vi.fn() };
		const svg = {
			selectAll: vi.fn(() => descendants),
			interrupt: vi.fn(),
			on: vi.fn(),
			remove: vi.fn()
		};
		const dispose = ownMeaningMapResources(simulation, svg, vi.fn());
		vi.advanceTimersByTime(7999);
		expect(simulation.stop).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(simulation.stop).toHaveBeenCalledTimes(1);
		dispose();
		expect(simulation.stop).toHaveBeenCalledTimes(2);
		expect(svg.remove).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});
});
