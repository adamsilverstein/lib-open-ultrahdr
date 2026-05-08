#include "jpeg_meta.h"

namespace open_ultrahdr {

namespace {

// All SOFn markers (excluding DHT=0xC4, JPG=0xC8, DAC=0xCC) carry frame-header
// payload starting with precision (1 byte), height (2 bytes BE), width (2 bytes BE).
inline bool isSofMarker(uint8_t marker) {
  if (marker < 0xC0 || marker > 0xCF) return false;
  return marker != 0xC4 && marker != 0xC8 && marker != 0xCC;
}

}  // namespace

JpegDims parseJpegDimensions(const uint8_t* data, size_t size) {
  JpegDims out;
  if (!data || size < 4) return out;
  if (data[0] != 0xFF || data[1] != 0xD8) return out;  // SOI

  size_t i = 2;
  while (i + 1 < size) {
    if (data[i] != 0xFF) return out;
    // Skip fill bytes.
    while (i < size && data[i] == 0xFF) ++i;
    if (i >= size) return out;
    uint8_t marker = data[i++];

    if (marker == 0xD8 || marker == 0xD9) {
      // SOI / EOI — no payload.
      if (marker == 0xD9) return out;
      continue;
    }
    if (marker >= 0xD0 && marker <= 0xD7) {
      // RSTn — no payload.
      continue;
    }
    if (i + 2 > size) return out;
    uint16_t segLen = (static_cast<uint16_t>(data[i]) << 8) | data[i + 1];
    if (segLen < 2 || i + segLen > size) return out;

    if (isSofMarker(marker)) {
      // segLen covers itself (2 bytes) + precision (1) + height (2) + width (2) + ...
      if (segLen < 7) return out;
      uint16_t h = (static_cast<uint16_t>(data[i + 3]) << 8) | data[i + 4];
      uint16_t w = (static_cast<uint16_t>(data[i + 5]) << 8) | data[i + 6];
      out.ok = true;
      out.width = w;
      out.height = h;
      return out;
    }

    i += segLen;
  }
  return out;
}

}  // namespace open_ultrahdr
