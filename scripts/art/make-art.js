// Renders Timber's brand artwork: a sunrise with a check mark that becomes an upward arrow.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const OUT = process.argv[2];

const BG = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#3AA3FF"/><stop offset="1" stop-color="#1558D6"/></linearGradient>`;
const SUN = `<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFD66B"/><stop offset="1" stop-color="#FF9A2E"/></linearGradient>`;

/** The glyph on a 1024 canvas. `mono` draws everything in one flat color. */
function glyph({ mono = null, sun = true, horizon = true } = {}) {
  const white = mono ?? '#FFFFFF';
  const sunFill = mono ?? 'url(#sun)';
  // Nudged up so the glyph's visual center sits on the canvas center.
  return `<g transform="translate(0,-40)">
    ${sun ? `<clipPath id="above"><rect x="0" y="0" width="1024" height="742"/></clipPath>
    <circle cx="512" cy="742" r="236" fill="${sunFill}" clip-path="url(#above)"/>` : ''}
    ${horizon ? `<line x1="214" y1="742" x2="810" y2="742" stroke="${white}" stroke-width="30" stroke-linecap="round" opacity="${mono ? 1 : 0.95}"/>` : ''}
    <polyline points="318,548 452,682 716,418" fill="none" stroke="${white}" stroke-width="84" stroke-linecap="round" stroke-linejoin="round"/>
    <polygon points="792,342 768,500 634,366" fill="${white}" stroke="${white}" stroke-width="26" stroke-linejoin="round"/></g>`;
}

function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;
}

function render(name, markup, width) {
  const png = new Resvg(markup, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } }).render().asPng();
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(name, png.length);
}

// App icon (iOS + fallback): full-bleed, no transparency.
render('icon.png', svg(1024, 1024, `<rect width="1024" height="1024" fill="url(#bg)"/>${glyph()}`, BG + SUN), 1024);

// Android adaptive icon: glyph scaled into the 66% safe zone over a separate background layer.
const scaled = (inner, s = 0.72) => `<g transform="translate(${512 * (1 - s)},${512 * (1 - s)}) scale(${s})">${inner}</g>`;
render('android-icon-foreground.png', svg(1024, 1024, scaled(glyph()), SUN), 1024);
render('android-icon-background.png', svg(1024, 1024, `<rect width="1024" height="1024" fill="url(#bg)"/>`, BG), 1024);
render('android-icon-monochrome.png', svg(1024, 1024, scaled(glyph({ mono: '#FFFFFF' }))), 1024);

// Splash: the glyph alone on transparent (the splash background is the brand blue).
render('splash-icon.png', svg(1024, 1024, scaled(glyph(), 0.95), SUN), 512);

// Android notification icon: white silhouette, no sun (it would read as a blob at 24dp).
render('notification-icon.png', svg(1024, 1024, scaled(glyph({ mono: '#FFFFFF', sun: false }), 0.92)), 96);

// Favicon.
render('favicon.png', svg(1024, 1024, `<rect width="1024" height="1024" rx="224" fill="url(#bg)"/>${glyph()}`, BG + SUN), 48);

// Google Play feature graphic (1024x500).
render('feature-graphic.png', svg(1024, 500, `
  <rect width="1024" height="500" fill="url(#bg)"/>
  <g transform="translate(40,20) scale(0.45)">${glyph()}</g>
  <text x="520" y="230" font-family="SF Pro Display, Helvetica Neue, Helvetica, Arial" font-weight="800" font-size="120" fill="#FFFFFF">Timber</text>
  <text x="524" y="300" font-family="SF Pro Text, Helvetica Neue, Helvetica, Arial" font-weight="600" font-size="40" fill="#FFFFFF" opacity="0.92">Small wins. Every day.</text>
  <text x="524" y="352" font-family="SF Pro Text, Helvetica Neue, Helvetica, Arial" font-weight="500" font-size="28" fill="#FFFFFF" opacity="0.8">Build good habits · Break bad ones</text>`, BG + SUN), 1024);
