/**
 * Detection tests for isUltraHdr function.
 */
import { describe, it, expect } from 'vitest';
import { isUltraHdr } from '../src/index';
import {
	base64ToArrayBuffer,
	REGULAR_JPEG_BASE64,
	PNG_HEADER_BASE64,
} from './fixtures/test-data';

describe('isUltraHdr', () => {
	it('returns false for empty buffer', async () => {
		const emptyBuffer = new ArrayBuffer(0);
		const result = await isUltraHdr(emptyBuffer);
		expect(result).toBe(false);
	});

	it('returns false for PNG file', async () => {
		const pngBuffer = base64ToArrayBuffer(PNG_HEADER_BASE64);
		const result = await isUltraHdr(pngBuffer);
		expect(result).toBe(false);
	});

	it('returns false for regular JPEG without gain map', async () => {
		const jpegBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const result = await isUltraHdr(jpegBuffer);
		expect(result).toBe(false);
	});

	it('returns false for random bytes', async () => {
		const randomBuffer = new ArrayBuffer(1000);
		const view = new Uint8Array(randomBuffer);
		for (let i = 0; i < view.length; i++) {
			view[i] = Math.floor(Math.random() * 256);
		}
		const result = await isUltraHdr(randomBuffer);
		expect(result).toBe(false);
	});

	it('handles very small buffers gracefully', async () => {
		const tinyBuffer = new ArrayBuffer(2);
		const result = await isUltraHdr(tinyBuffer);
		expect(result).toBe(false);
	});
});
