#pragma once

#include <cstdint>
#include <cstddef>

namespace open_ultrahdr {

struct JpegDims {
  bool ok = false;
  uint32_t width = 0;
  uint32_t height = 0;
};

// Parses JPEG segments to find the first SOF marker and extract image dimensions.
// Returns ok=false for non-JPEG input or if no SOF marker is found.
JpegDims parseJpegDimensions(const uint8_t* data, size_t size);

}  // namespace open_ultrahdr
