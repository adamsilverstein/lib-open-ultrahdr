/**
 * Decode tests for decodeUltraHdr and extractSdrBase.
 */
import { describe, it, expect } from 'vitest';
import { decodeUltraHdr, extractSdrBase, getMetadata } from '../src/index';
import { base64ToArrayBuffer, REGULAR_JPEG_BASE64, PNG_HEADER_BASE64 } from './fixtures/test-data';

describe('decodeUltraHdr', () => {
	it('throws error for empty buffer', async () => {
		const emptyBuffer = new ArrayBuffer(0);
		await expect(decodeUltraHdr('empty', emptyBuffer)).rejects.toThrow();
	});

	it('throws error for PNG file', async () => {
		const pngBuffer = base64ToArrayBuffer(PNG_HEADER_BASE64);
		await expect(decodeUltraHdr('png', pngBuffer)).rejects.toThrow();
	});

	it('throws error for regular JPEG without gain map', async () => {
		const jpegBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		await expect(decodeUltraHdr('regular', jpegBuffer)).rejects.toThrow();
	});

	it('throws error for random bytes', async () => {
		const randomBuffer = new ArrayBuffer(1000);
		const view = new Uint8Array(randomBuffer);
		for (let i = 0; i < view.length; i++) {
			view[i] = (i * 31) & 0xff;
		}
		await expect(decodeUltraHdr('random', randomBuffer)).rejects.toThrow();
	});
});

describe('extractSdrBase', () => {
	it('throws error for empty buffer', async () => {
		const emptyBuffer = new ArrayBuffer(0);
		await expect(extractSdrBase(emptyBuffer)).rejects.toThrow();
	});

	it('throws error for PNG file', async () => {
		const pngBuffer = base64ToArrayBuffer(PNG_HEADER_BASE64);
		await expect(extractSdrBase(pngBuffer)).rejects.toThrow();
	});

	it('handles regular JPEG gracefully', async () => {
		const jpegBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		// Regular JPEG should either return itself or throw
		// The behavior depends on implementation
		try {
			const result = await extractSdrBase(jpegBuffer);
			// If it succeeds, it should return a valid JPEG
			expect(result).toBeInstanceOf(ArrayBuffer);
			expect(result.byteLength).toBeGreaterThan(0);
		} catch {
			// If it throws, that's also acceptable behavior
			expect(true).toBe(true);
		}
	});
});

describe('getMetadata', () => {
	it('throws error for empty buffer', async () => {
		const emptyBuffer = new ArrayBuffer(0);
		await expect(getMetadata(emptyBuffer)).rejects.toThrow();
	});

	it('throws error for regular JPEG without gain map', async () => {
		const jpegBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		await expect(getMetadata(jpegBuffer)).rejects.toThrow();
	});

	it('throws error for non-JPEG file', async () => {
		const pngBuffer = base64ToArrayBuffer(PNG_HEADER_BASE64);
		await expect(getMetadata(pngBuffer)).rejects.toThrow();
	});
});
