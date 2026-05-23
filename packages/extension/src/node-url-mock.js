// Mock node:url module for browser compatibility.
// The extension build pulls this in via @sebastianwessel/quickjs >=3.0.1,
// which imports { fileURLToPath } at module top-level but only invokes it
// when enableTestUtils is set (a code path the extension never exercises).
export function fileURLToPath(url) {
  return typeof url === 'string' ? url : String(url);
}

export function pathToFileURL(path) {
  return new URL('file://' + path);
}

export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;

export default {
  fileURLToPath,
  pathToFileURL,
  URL,
  URLSearchParams,
};
