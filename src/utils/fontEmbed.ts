/**
 * Utility to build a `fontEmbedCSS` string with all custom Arabic fonts
 * inlined as base64 data-URIs.
 *
 * `html-to-image` serialises the DOM into an SVG `<foreignObject>` and then
 * rasterises it. During serialisation it tries to locate `@font-face` rules
 * and convert the `src` URLs to data-URIs. This heuristic often *fails* for
 * locally-hosted TTF files (especially complex Arabic fonts with advanced
 * OpenType shaping), resulting in garbled / fragmented glyphs.
 *
 * By pre-computing the base64 data-URIs and passing them through the
 * `fontEmbedCSS` option, we bypass the library's unreliable font-inlining
 * logic entirely.
 */

let _cachedFontCSS: string | null = null;

async function fileToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Returns a CSS string containing `@font-face` declarations for LPMQ,
 * Uthmanic and Amiri with the font data fully inlined as base64.
 *
 * The result is cached so the (relatively expensive) fetch+encode step
 * only runs once per session.
 */
export async function getFontEmbedCSS(): Promise<string> {
  if (_cachedFontCSS) return _cachedFontCSS;

  const fonts: { family: string; url: string }[] = [
    { family: 'LPMQ', url: '/fonts/LPMQ.ttf' },
    { family: 'Uthmanic', url: '/fonts/Uthmanic.ttf' },
  ];

  const parts: string[] = [];

  for (const font of fonts) {
    try {
      const dataUri = await fileToBase64(font.url);
      parts.push(`
@font-face {
  font-family: '${font.family}';
  src: url('${dataUri}') format('truetype');
  font-weight: normal;
  font-style: normal;
}`.trim());
    } catch (e) {
      console.warn(`Failed to embed font ${font.family}:`, e);
    }
  }

  _cachedFontCSS = parts.join('\n');
  return _cachedFontCSS;
}
