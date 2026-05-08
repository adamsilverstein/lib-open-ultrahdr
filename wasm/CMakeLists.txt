cmake_minimum_required(VERSION 3.20)
project(open_ultrahdr CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "open_ultrahdr is built with Emscripten only. Use 'emcmake cmake'.")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# libultrahdr build options. We only want the core library built for WASM —
# no examples, tests, benchmarks, fuzzers, java bindings, install targets.
set(UHDR_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(UHDR_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(UHDR_BUILD_BENCHMARK OFF CACHE BOOL "" FORCE)
set(UHDR_BUILD_FUZZERS  OFF CACHE BOOL "" FORCE)
set(UHDR_BUILD_JAVA     OFF CACHE BOOL "" FORCE)
set(UHDR_BUILD_PACKAGING OFF CACHE BOOL "" FORCE)
set(UHDR_ENABLE_INSTALL OFF CACHE BOOL "" FORCE)
# Use Emscripten's libjpeg port rather than building libjpeg-turbo from source.
set(UHDR_BUILD_DEPS OFF CACHE BOOL "" FORCE)

add_subdirectory(third_party/libultrahdr)

add_executable(open_ultrahdr
  src/bindings.cpp
  src/jpeg_meta.cpp
)

target_include_directories(open_ultrahdr PRIVATE
  third_party/libultrahdr
)

target_link_libraries(open_ultrahdr PRIVATE core)

target_compile_options(open_ultrahdr PRIVATE
  -O3
  -fexceptions
  --use-port=libjpeg
)

target_link_options(open_ultrahdr PRIVATE
  --bind
  --use-port=libjpeg
  -O3
  -fexceptions
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createOpenUltraHdrModule
  -sENVIRONMENT=web,worker,node
  -sALLOW_MEMORY_GROWTH=1
  -sFILESYSTEM=0
  -sINITIAL_MEMORY=33554432
  -sSTACK_SIZE=2097152
  -sNO_EXIT_RUNTIME=1
)

set_target_properties(open_ultrahdr PROPERTIES
  OUTPUT_NAME "open_ultrahdr"
  SUFFIX ".js"
)
