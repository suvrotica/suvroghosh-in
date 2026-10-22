/** Invented teaching assumptions, not measured rates or manufacturing estimates. */
export const MODEL_VERSION = 1;
export const ASSUMPTIONS = Object.freeze({
	productiveMinutesPerDay: 420,
	stockCapacity: 20,
	materialWaitDays: 5,
	cutting: Object.freeze({ original: 25, guide: 8, preparation: 180 }),
	assembly: Object.freeze({ original: 15, instructions: 10, preparation: 90 }),
	finishing: 15,
	packing: Object.freeze({ original: 5, protective: 8 }),
	fixMinutes: 20,
	fixEvery: Object.freeze({ original: 10, instructions: 50 }),
	deliveryProblemEvery: Object.freeze({ original: 20, protective: 100 })
});

export interface WorkshopInput {
	quantity: number;
	cuttingGuide: boolean;
	instructions: boolean;
	protectivePackaging: boolean;
}
export type Area = 'cutting' | 'material' | 'assembly' | 'packing' | 'customer';
export const DEFAULT_INPUT: Readonly<WorkshopInput> = Object.freeze({
	quantity: 1,
	cuttingGuide: false,
	instructions: false,
	protectivePackaging: false
});

export function validateInput(input: WorkshopInput): void {
	if (!input || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000)
		throw new RangeError('Quantity must be a whole number from 1 to 1,000.');
	for (const key of ['cuttingGuide', 'instructions', 'protectivePackaging'] as const)
		if (typeof input[key] !== 'boolean') throw new TypeError(`${key} must be true or false.`);
}

/** UI normalisation never interprets truthy strings as decisions. */
export function normaliseInput(input: Partial<WorkshopInput>): WorkshopInput {
	return {
		quantity: Number.isFinite(input.quantity)
			? Math.max(1, Math.min(1000, Math.round(input.quantity!)))
			: DEFAULT_INPUT.quantity,
		cuttingGuide: input.cuttingGuide === true,
		instructions: input.instructions === true,
		protectivePackaging: input.protectivePackaging === true
	};
}

export function calculateWorkshop(input: WorkshopInput) {
	validateInput(input);
	const a = ASSUMPTIONS;
	const cuttingMinutes = input.cuttingGuide ? a.cutting.guide : a.cutting.original;
	const assemblyMinutes = input.instructions ? a.assembly.instructions : a.assembly.original;
	const packingMinutes = input.protectivePackaging ? a.packing.protective : a.packing.original;
	const preparationMinutes =
		(input.cuttingGuide ? a.cutting.preparation : 0) +
		(input.instructions ? a.assembly.preparation : 0);
	const workshopFixes = Math.floor(
		input.quantity / (input.instructions ? a.fixEvery.instructions : a.fixEvery.original)
	);
	const deliveryProblems = Math.floor(
		input.quantity /
			(input.protectivePackaging
				? a.deliveryProblemEvery.protective
				: a.deliveryProblemEvery.original)
	);
	const unitMinutes = cuttingMinutes + assemblyMinutes + a.finishing + packingMinutes;
	const fixMinutes = a.fixMinutes * workshopFixes;
	const handsOnMinutes = preparationMinutes + input.quantity * unitMinutes + fixMinutes;
	const workingDayCapacityUsed = handsOnMinutes / a.productiveMinutesPerDay;
	const materialWaitDays = input.quantity > a.stockCapacity ? a.materialWaitDays : 0;
	return Object.freeze({
		version: MODEL_VERSION,
		input: Object.freeze({
			quantity: input.quantity,
			cuttingGuide: input.cuttingGuide,
			instructions: input.instructions,
			protectivePackaging: input.protectivePackaging
		}),
		cuttingMinutes,
		assemblyMinutes,
		finishingMinutes: a.finishing,
		packingMinutes,
		preparationMinutes,
		unitMinutes,
		workshopFixes,
		fixMinutes,
		deliveryProblems,
		handsOnMinutes,
		workingDayCapacityUsed,
		materialWaitDays,
		readyToSendDay: materialWaitDays + Math.ceil(workingDayCapacityUsed),
		hours: Math.floor(handsOnMinutes / 60),
		minutes: handsOnMinutes % 60
	});
}
export type WorkshopSnapshot = ReturnType<typeof calculateWorkshop>;
export function originalSetup(input: WorkshopInput): WorkshopSnapshot {
	validateInput(input);
	return calculateWorkshop({ ...DEFAULT_INPUT, quantity: input.quantity });
}
export function resetWorkshop(): WorkshopInput {
	return { ...DEFAULT_INPUT };
}
export function countedBundles(quantity: number): ReadonlyArray<Readonly<{ count: number }>> {
	validateInput({ ...DEFAULT_INPUT, quantity });
	const size = quantity <= 10 ? 1 : quantity <= 100 ? 10 : 100;
	return Object.freeze(
		Array.from({ length: Math.ceil(quantity / size) }, (_, index) =>
			Object.freeze({ count: Math.min(size, quantity - index * size) })
		)
	);
}
export function formatMinutes(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const remainder = minutes % 60;
	return `${hours ? `${hours.toLocaleString('en-GB')} h` : ''}${hours && remainder ? ' ' : ''}${remainder || !hours ? `${remainder} min` : ''}`;
}
