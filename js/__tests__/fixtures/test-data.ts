/**
 * Test fixtures for e2e tests.
 *
 * Contains base64-encoded test images and helper functions.
 */

/**
 * 16x16 pixel JPEG image (no gain map). Width is libultrahdr's minimum
 * supported dimension (8x8) — we use 16x16 for a small but representative
 * fixture. This is a valid JPEG that should NOT be detected as UltraHDR.
 */
export const REGULAR_JPEG_WIDTH = 16;
export const REGULAR_JPEG_HEIGHT = 16;
export const REGULAR_JPEG_BASE64 =
	'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/' +
	'2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/' +
	'wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDwzw74Q+7+6/SvSfDnhD7v7r9K7vw54Q+7+6/SvSfDvhD7v7r9KMNiQ4K41+H3j//Z';

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
