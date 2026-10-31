import type { ObjectType } from './model';
// Layered, self-contained SVGs: no shared IDs, external assets, or colour-only cues.
const drawings = {
	coin: [
		`<ellipse cx="50" cy="83" rx="29" ry="5" fill="#413a29" opacity=".12"/>
     <circle cx="50" cy="51" r="34" fill="#a47b38"/>
     <circle cx="50" cy="47" r="34" fill="#cba15a" stroke="#957039" stroke-width="1.5"/>
     <circle cx="50" cy="47" r="28" fill="#d8b773" stroke="#ead092" stroke-width="2"/>
     <circle cx="50" cy="47" r="23" fill="none" stroke="#b28b48" stroke-width="1.3"/>
     <path d="m50 31 4.8 10 11 1.5-8 7.7 1.9 10.8L50 56l-9.7 5 1.9-10.8-8-7.7 11-1.5Z" fill="#b18947"/>
     <path d="m50 32 4.6 9.6 10.7 1.5-7.8 7.4 1.8 10.3L50 56l-9.3 4.8 1.8-10.3-7.8-7.4 10.7-1.5Z" fill="#e4c784" transform="translate(0 -1.8)"/>
     <path d="M27 29a29 29 0 0 1 37-6" fill="none" stroke="#f1d9a4" stroke-width="2" stroke-linecap="round"/>`,
		`<ellipse cx="50" cy="83" rx="29" ry="5" fill="#413a29" opacity=".12"/>
     <circle cx="50" cy="51" r="33" fill="#a57c3e"/>
     <circle cx="50" cy="47" r="33" fill="#cba766" stroke="#95733f" stroke-width="1.5"/>
     <circle cx="50" cy="47" r="27" fill="#dbbc7f" stroke="#ecd49f" stroke-width="2"/>
     <circle cx="50" cy="47" r="22" fill="none" stroke="#b38e50" stroke-width="1.2"/>
     <path d="M39 59c-7-19 4-29 23-29 1 19-9 31-23 29Z" fill="#b28c4b"/>
     <path d="M40 57c-6-18 4-27 21-27 0 18-8 29-21 27Z" fill="#e8cc8e"/>
     <path d="m37 62 20-27m-13 17-1-10m6 4 9-1" fill="none" stroke="#b18b4b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M26 29a29 29 0 0 1 34-7" fill="none" stroke="#f1dcae" stroke-width="2" stroke-linecap="round"/>`
	],
	button: [
		`<ellipse cx="50" cy="83" rx="29" ry="5" fill="#4d322a" opacity=".12"/>
     <circle cx="50" cy="51" r="34" fill="#975c48"/>
     <circle cx="50" cy="47" r="34" fill="#ba7b64" stroke="#935a48" stroke-width="1.5"/>
     <circle cx="50" cy="47" r="26" fill="#ab6c57" stroke="#ce937c" stroke-width="2"/>
     <path d="M27 30a28 28 0 0 1 37-6" fill="none" stroke="#daa18a" stroke-width="2" stroke-linecap="round"/>
     <g fill="#643e33" stroke="#d2957c" stroke-width="1.1">
       <circle cx="42" cy="39" r="4.8"/><circle cx="58" cy="39" r="4.8"/>
       <circle cx="42" cy="55" r="4.8"/><circle cx="58" cy="55" r="4.8"/>
     </g>
     <path d="m42 40 16 14m0-14L42 54" fill="none" stroke="#e8c9a8" stroke-width="2.6" stroke-linecap="round"/>
     <path d="m42 40 16 14m0-14L42 54" fill="none" stroke="#f1d9bc" stroke-width=".8" stroke-linecap="round"/>`,
		`<ellipse cx="50" cy="83" rx="28" ry="5" fill="#4d322a" opacity=".12"/>
     <circle cx="50" cy="51" r="33" fill="#a46552"/>
     <circle cx="50" cy="47" r="33" fill="#c88e78" stroke="#a46a57" stroke-width="1.5"/>
     <circle cx="50" cy="47" r="25" fill="#b77c67" stroke="#dda58e" stroke-width="2"/>
     <path d="M28 29a28 28 0 0 1 35-5" fill="none" stroke="#e5b5a0" stroke-width="2" stroke-linecap="round"/>
     <g fill="#714a3e" stroke="#dda48d" stroke-width="1.1">
       <circle cx="42" cy="39" r="4.8"/><circle cx="58" cy="39" r="4.8"/>
       <circle cx="42" cy="55" r="4.8"/><circle cx="58" cy="55" r="4.8"/>
     </g>
     <path d="M42 40v14m16-14v14" fill="none" stroke="#e8cfaf" stroke-width="2.8" stroke-linecap="round"/>
     <path d="M42 40v14m16-14v14" fill="none" stroke="#f5e0c5" stroke-width=".8" stroke-linecap="round"/>`
	],
	stone: [
		`<ellipse cx="50" cy="83" rx="31" ry="5" fill="#343d34" opacity=".13"/>
     <path d="M17 58c-2-13 8-29 21-36 12-7 25-4 36 6 10 10 14 23 8 35-6 13-20 20-38 18-14-2-25-9-27-23Z" fill="#6f7b6c" stroke="#64705f" stroke-width="1.5"/>
     <path d="M19 54c0-12 9-25 21-31 11-6 23-3 32 5 8 8 13 20 9 28-7 12-21 18-36 15-13-2-24-8-26-17Z" fill="#95a08a"/>
     <path d="M26 44c5-12 17-20 29-18 5 0 10 2 14 5" fill="none" stroke="#b5bea7" stroke-width="2.4" stroke-linecap="round"/>
     <path d="M28 59c10 8 26 11 39 3" fill="none" stroke="#7f8c76" stroke-width="1.6" stroke-linecap="round"/>
     <path d="m60 34 5 2m-33 19 3 1m25 2 3-1" fill="none" stroke="#7d8974" stroke-width="1.5" stroke-linecap="round"/>`,
		`<ellipse cx="50" cy="83" rx="32" ry="5" fill="#343b37" opacity=".13"/>
     <path d="M15 55c1-13 11-22 24-29 11-6 23-8 32-1 11 8 17 25 12 38-5 13-19 19-34 18-18-1-35-10-34-26Z" fill="#75807b" stroke="#636e69" stroke-width="1.5"/>
     <path d="M17 53c2-12 13-20 24-26 10-5 20-7 29 0 9 7 14 20 11 30-6 11-18 17-33 15-15-1-30-8-31-19Z" fill="#9ca69c"/>
     <path d="M26 43c8-9 23-18 34-16" fill="none" stroke="#bec5b8" stroke-width="2.4" stroke-linecap="round"/>
     <path d="M34 59c12 7 26 6 38-2" fill="none" stroke="#859186" stroke-width="1.7" stroke-linecap="round"/>
     <path d="m32 49 4-2m24-9 4 1m-10 25 4-1" fill="none" stroke="#859186" stroke-width="1.5" stroke-linecap="round"/>`
	]
};

export function objectSvg(type: ObjectType, variant = 0): string {
	const options = drawings[type];
	if (!Array.isArray(options)) throw new RangeError(`Unknown object type: ${type}`);
	const index = Math.abs(Math.trunc(Number(variant) || 0)) % options.length;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${options[index]}</svg>`;
}
