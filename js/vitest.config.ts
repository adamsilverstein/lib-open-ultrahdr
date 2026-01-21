import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['__tests__/**/*.test.ts'],
		setupFiles: ['__tests__/setup.ts'],
		testTimeout: 30000,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['__tests__/**', 'dist/**'],
		},
	},
	resolve: {
		alias: {
			'open-ultrahdr-wasm': resolve(__dirname, '../wasm/pkg/open_ultrahdr.js'),
		},
	},
});
