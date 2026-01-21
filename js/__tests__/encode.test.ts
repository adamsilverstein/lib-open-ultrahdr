/**
 * Encode tests for encodeUltraHdr.
 */
import { describe, it, expect } from 'vitest';
import { encodeUltraHdr, defaultEncodeOptions } from '../src/index';
import {
	base64ToArrayBuffer,
	REGULAR_JPEG_BASE64,
	PNG_HEADER_BASE64,
	createSyntheticHdrData,
} from './fixtures/test-data';

describe('encodeUltraHdr', () => {
	it('produces valid JPEG output', async () => {
		const sdrBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const hdrData = createSyntheticHdrData(2, 2);

		const encoded = await encodeUltraHdr(
			'encode-1',
			sdrBuffer,
			hdrData.buffer,
			defaultEncodeOptions
		);

		// Check JPEG magic bytes (FFD8)
		const view = new Uint8Array(encoded);
		expect(view[0]).toBe(0xff);
		expect(view[1]).toBe(0xd8);

		// Check JPEG end marker (FFD9)
		expect(view[view.length - 2]).toBe(0xff);
		expect(view[view.length - 1]).toBe(0xd9);
	});

	it('throws error for non-JPEG SDR input', async () => {
		const pngBuffer = base64ToArrayBuffer(PNG_HEADER_BASE64);
		const hdrData = createSyntheticHdrData(1, 1);

		await expect(
			encodeUltraHdr('encode-png', pngBuffer, hdrData.buffer, defaultEncodeOptions)
		).rejects.toThrow();
	});

	it('throws error for empty SDR buffer', async () => {
		const emptyBuffer = new ArrayBuffer(0);
		const hdrData = createSyntheticHdrData(2, 2);

		await expect(
			encodeUltraHdr('encode-empty', emptyBuffer, hdrData.buffer, defaultEncodeOptions)
		).rejects.toThrow();
	});

	it('throws error for mismatched HDR buffer size', async () => {
		const sdrBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		// Wrong size - should be 2*2*3 = 12 floats for a 2x2 image
		const wrongSizeHdr = new Float32Array(100);

		await expect(
			encodeUltraHdr('encode-mismatch', sdrBuffer, wrongSizeHdr.buffer, defaultEncodeOptions)
		).rejects.toThrow();
	});

	it('throws error for empty HDR buffer', async () => {
		const sdrBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const emptyHdr = new ArrayBuffer(0);

		await expect(
			encodeUltraHdr('encode-empty-hdr', sdrBuffer, emptyHdr, defaultEncodeOptions)
		).rejects.toThrow();
	});

	it('handles various quality settings', async () => {
		const sdrBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const hdrData = createSyntheticHdrData(2, 2);

		// Low quality
		const lowQ = await encodeUltraHdr('q-low', sdrBuffer, hdrData.buffer, {
			...defaultEncodeOptions,
			baseQuality: 10,
			gainMapQuality: 10,
		});
		expect(lowQ.byteLength).toBeGreaterThan(0);

		// High quality
		const highQ = await encodeUltraHdr('q-high', sdrBuffer, hdrData.buffer, {
			...defaultEncodeOptions,
			baseQuality: 100,
			gainMapQuality: 100,
		});
		expect(highQ.byteLength).toBeGreaterThan(0);
	});

	it('handles different HDR capacity targets', async () => {
		const sdrBuffer = base64ToArrayBuffer(REGULAR_JPEG_BASE64);
		const hdrData = createSyntheticHdrData(2, 2);

		// Low HDR capacity
		const lowCap = await encodeUltraHdr('cap-low', sdrBuffer, hdrData.buffer, {
			...defaultEncodeOptions,
			targetHdrCapacity: 1.5,
		});
		expect(lowCap.byteLength).toBeGreaterThan(0);

		// High HDR capacity
		const highCap = await encodeUltraHdr('cap-high', sdrBuffer, hdrData.buffer, {
			...defaultEncodeOptions,
			targetHdrCapacity: 6.0,
		});
		expect(highCap.byteLength).toBeGreaterThan(0);
	});
});
