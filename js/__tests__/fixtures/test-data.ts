/**
 * Test fixtures for e2e tests.
 *
 * Contains base64-encoded test images and helper functions.
 */

/**
 * Minimal 2x2 pixel red JPEG image (no gain map).
 * This is a valid JPEG that should NOT be detected as UltraHDR.
 */
export const REGULAR_JPEG_BASE64 =
	'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsK' +
	'CwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQU' +
	'FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIA' +
	'AhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEB' +
	'AQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==';

/**
 * PNG file header (should not be detected as JPEG or UltraHDR).
 */
export const PNG_HEADER_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Converts base64 string to ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}

/**
 * Creates synthetic HDR data for a given image size.
 * Applies a simple highlight boost to simulate HDR.
 *
 * @param width - Image width
 * @param height - Image height
 * @returns Float32Array with RGB values (3 per pixel)
 */
export function createSyntheticHdrData(width: number, height: number): Float32Array {
	const pixelCount = width * height;
	const data = new Float32Array(pixelCount * 3);

	for (let i = 0; i < pixelCount; i++) {
		const x = i % width;
		const y = Math.floor(i / width);

		// Create a gradient with highlight boost
		const normalizedX = width > 1 ? x / (width - 1) : 0;
		const normalizedY = height > 1 ? y / (height - 1) : 0;

		// Base SDR values with highlight boost for HDR
		const r = Math.min(normalizedX * 2.0, 2.0); // Up to 2x boost
		const g = Math.min(normalizedY * 2.0, 2.0);
		const b = Math.min((normalizedX + normalizedY) * 1.5, 2.0);

		data[i * 3] = r;
		data[i * 3 + 1] = g;
		data[i * 3 + 2] = b;
	}

	return data;
}

/**
 * Creates a simple grayscale JPEG-like buffer for testing.
 * This is a minimal valid JPEG structure.
 */
export function createMinimalJpegBuffer(_width: number, _height: number): ArrayBuffer {
	// Return the pre-encoded 2x2 JPEG for simplicity
	// In a real scenario, we'd use a library like sharp or canvas
	return base64ToArrayBuffer(REGULAR_JPEG_BASE64);
}
