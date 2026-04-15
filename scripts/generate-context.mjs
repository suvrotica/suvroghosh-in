import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
const ROOT_DIR = process.cwd();
const OUTPUT_FILE = path.join(ROOT_DIR, 'TheApp.txt');

// Define files and directories to include/exclude
const DIRS_TO_INCLUDE_IN_CONTENT = ['src'];
const TOP_LEVEL_FILES_TO_INCLUDE_IN_CONTENT = [
	'package.json',
	'svelte.config.js',
	'vite.config.ts',
	'tailwind.config.cjs',
	'tsconfig.json'
];
const IGNORE_PATTERNS = new Set(['.git', 'node_modules', '.svelte-kit', 'build', 'dist', '.env']);
const IGNORE_EXTENSIONS_IN_CONTENT = new Set(['.log', '.ico', '.png', '.jpg', '.jpeg', '.gif','.webp']);

// --- SCRIPT LOGIC ---
const output = [];

/**
 * Generates a visual tree structure of a directory.
 * @param {string} directory - The directory to start from.
 * @param {string} prefix - The prefix for the current line, used for indentation.
 */
function generateTree(directory, prefix = '') {
	const entries = fs.readdirSync(directory).filter(entry => !IGNORE_PATTERNS.has(entry));
	entries.forEach((entry, index) => {
		const fullPath = path.join(directory, entry);
		const isLast = index === entries.length - 1;
		const connector = isLast ? '└──' : '├──';
		output.push(`${prefix}${connector} ${entry}`);

		try {
			const stats = fs.statSync(fullPath);
			if (stats.isDirectory()) {
				const newPrefix = prefix + (isLast ? '    ' : '│   ');
				generateTree(fullPath, newPrefix);
			}
		} catch {
			// Ignore if we can't get stats (e.g., broken symlink)
		}
	});
}

/**
 * Reads the content of a file and appends it to the output array.
 * @param {string} filePath - The full path to the file.
 */
function appendFileContent(filePath) {
	const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
	const extension = path.extname(filePath);
	if (IGNORE_EXTENSIONS_IN_CONTENT.has(extension)) return;

	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		output.push(`\n# File: ${relativePath}\n`);
		output.push(content);
	} catch (err) {
		console.error(`Error reading file ${filePath}:`, err);
	}
}

/**
 * Recursively traverses directories to process files.
 * @param {string} directory - The directory to traverse.
 */
function traverseAndProcess(directory) {
	const entries = fs.readdirSync(directory);
	for (const entry of entries) {
		if (IGNORE_PATTERNS.has(entry)) continue;
		const fullPath = path.join(directory, entry);
		const stats = fs.statSync(fullPath);
		if (stats.isDirectory()) {
			traverseAndProcess(fullPath);
		} else {
			appendFileContent(fullPath);
		}
	}
}

// --- MAIN EXECUTION ---
try {
	// NEW: Create and add a readable timestamp for your timezone
	const now = new Date();
	const timestamp = now.toLocaleString('en-US', {
		dateStyle: 'full',
		timeStyle: 'long',
		timeZone: 'Asia/Kolkata' // IST timezone
	});
	output.push(`# Context file generated on: ${timestamp}`);
	output.push('---');

	// 1. Add the file layout tree to the output
	output.push('\n# Project File Layout\n');
	output.push('.\n');
	generateTree(ROOT_DIR);

	// 2. Add a separator and heading for file contents
	output.push('\n---\n# File Contents\n---');

	// 3. Add content of top-level files
	for (const fileName of TOP_LEVEL_FILES_TO_INCLUDE_IN_CONTENT) {
		const filePath = path.join(ROOT_DIR, fileName);
		if (fs.existsSync(filePath)) appendFileContent(filePath);
	}

	// 4. Add content of specified directories
	for (const dirName of DIRS_TO_INCLUDE_IN_CONTENT) {
		const dirPath = path.join(ROOT_DIR, dirName);
		if (fs.existsSync(dirPath)) traverseAndProcess(dirPath);
	}

	// 5. Write everything to TheApp.txt
	fs.writeFileSync(OUTPUT_FILE, output.join('\n'));

	console.log(`✅ Successfully generated context file at: ${OUTPUT_FILE}`);
} catch (err) {
	console.error('❌ Failed to generate context file:', err);
}