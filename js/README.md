# Open UltraHDR

TypeScript/JavaScript library for UltraHDR (ISO 21496-1) gain map support.

See the [main README](../README.md) for full documentation.

## Installation

```bash
npm install open-ultrahdr
```

## Quick Start

```typescript
import { isUltraHdr, extractSdrBase, setLocation } from 'open-ultrahdr';

// Set WASM file location
setLocation('/assets/wasm/');

// Check if image is UltraHDR
const buffer = await file.arrayBuffer();
if (await isUltraHdr(buffer)) {
    const sdrBuffer = await extractSdrBase(buffer);
    // Use sdrBuffer for display on non-HDR screens
}
```

## License

GPL-2.0-or-later
