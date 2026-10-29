/** PDF extraction is loaded only after the reader explicitly selects a local file. */
export async function readPdf(file: File, first = 1, last = 20): Promise<string> {
	if (file.size > 10 * 1024 * 1024) throw new Error('Choose a PDF smaller than 10 MB.');
	if (
		!Number.isInteger(first) ||
		!Number.isInteger(last) ||
		first < 1 ||
		last < first ||
		last - first >= 100
	) {
		throw new Error('Choose a valid range of up to 100 PDF pages.');
	}
	const [pdfjs, worker] = await Promise.all([
		import('pdfjs-dist'),
		import('pdfjs-dist/build/pdf.worker.min.mjs?url')
	]);
	pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
	const task = pdfjs.getDocument({
		data: new Uint8Array(await file.arrayBuffer()),
		disableFontFace: true,
		useWorkerFetch: false
	});
	const deadline = setTimeout(() => {
		void task.destroy();
	}, 20_000);
	try {
		const pdf = await task.promise;
		if (first > pdf.numPages) throw new Error(`This PDF has ${pdf.numPages} pages.`);
		const sections: string[] = [];
		let size = 0;
		let readableCharacters = 0;
		for (let pageNumber = first; pageNumber <= Math.min(last, pdf.numPages); pageNumber++) {
			const page = await pdf.getPage(pageNumber);
			const content = await page.getTextContent();
			const text = content.items
				.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
				.join('')
				.trim();
			readableCharacters += text.length;
			size += text.length + 70;
			if (size > 100_000)
				throw new Error('This selection exceeds 100,000 characters. Choose fewer pages.');
			sections.push(`[PDF page ${pageNumber}]\n${text || '[No extractable text on this page]'}`);
			page.cleanup();
		}
		if (readableCharacters < 10)
			throw new Error(
				'This PDF has no readable text in the selected pages. Paste extracted text or OCR output instead.'
			);
		return sections.join('\n\n');
	} finally {
		clearTimeout(deadline);
		await task.destroy();
	}
}
