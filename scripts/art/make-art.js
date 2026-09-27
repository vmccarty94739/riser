// Renders Timber's brand artwork: growth rings (a tree's cross-section) closed by a mint
// progress arc, the same ring the app uses for a check-in. Flat, three colors, no text.
//   node scripts/art/make-art.js assets/images   (needs @resvg/resvg-js installed outside the project)
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const OUT = process.argv[2];

const WALNUT = '#2B1A10';
const AMBER = '#F2A33A';
const MINT = '#3FE0A5';

/**
 * The rings on a 1024 canvas, centred. `mono` draws everything in one flat color (Android
 * monochrome and notification icons); `bold` thickens the lines for tiny sizes.
 */
function glyph({ mono = null, bold = false } = {}) {
  const ring = mono ?? AMBER;
  const arc = mono ?? MINT;
  const w = bold ? 52 : 30;
  const C = 2 * Math.PI * 352;
  return `
    <circle cx="500" cy="524" r="${bold ? 90 : 74}" fill="${ring}"/>
    ${bold ? '' : `<circle cx="504" cy="520" r="146" fill="none" stroke="${ring}" stroke-width="${w}"/>`}
    <circle cx="508" cy="516" r="222" fill="none" stroke="${ring}" stroke-width="${w}"/>
    ${bold ? '' : `<circle cx="512" cy="512" r="292" fill="none" stroke="${ring}" stroke-width="${w}"/>`}
    <circle cx="512" cy="512" r="352" fill="none" stroke="${arc}" stroke-width="${bold ? 72 : 56}"
      stroke-linecap="round" stroke-dasharray="${(C * 0.78).toFixed(1)} ${C.toFixed(1)}"
      transform="rotate(-90 512 512)"/>`;
}

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

function render(name, markup, width, { opaque = false, dir = OUT } = {}) {
  const image = new Resvg(markup, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true },
  }).render();
  const png = opaque ? rgbPng(image.width, image.height, image.pixels) : image.asPng();
  fs.writeFileSync(path.join(dir, name), png);
  console.log(name, png.length);
}

/** Encodes RGBA pixels as an RGB PNG. The App Store and Play reject an icon with an alpha channel. */
function rgbPng(w, h, rgba) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0, o = 0; y < h; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw[o++] = rgba[i];
      raw[o++] = rgba[i + 1];
      raw[o++] = rgba[i + 2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const scaled = (inner, s) =>
  `<g transform="translate(${512 * (1 - s)},${512 * (1 - s)}) scale(${s})">${inner}</g>`;

// App icon (iOS + fallback): full-bleed walnut, no transparency.
render(
  'icon.png',
  svg(1024, 1024, `<rect width="1024" height="1024" fill="${WALNUT}"/>${glyph()}`),
  1024,
  {
    opaque: true,
  }
);

// Android adaptive icon: rings inside the 66% safe zone over a separate walnut layer.
render('android-icon-foreground.png', svg(1024, 1024, scaled(glyph(), 0.64)), 1024);
render(
  'android-icon-background.png',
  svg(1024, 1024, `<rect width="1024" height="1024" fill="${WALNUT}"/>`),
  1024
);
render(
  'android-icon-monochrome.png',
  svg(1024, 1024, scaled(glyph({ mono: '#FFFFFF' }), 0.64)),
  1024
);

// Splash and launch overlay: the rings alone on transparent (the splash background is walnut).
render('splash-icon.png', svg(1024, 1024, scaled(glyph(), 0.9)), 512);

// Android notification icon: white silhouette with fewer, thicker rings so it reads at 24dp.
render(
  'notification-icon.png',
  svg(1024, 1024, scaled(glyph({ mono: '#FFFFFF', bold: true }), 0.9)),
  96
);

// Email header icon, hosted by GitHub Pages at /timber/email-icon.png for the account emails.
render(
  'email-icon.png',
  svg(1024, 1024, `<rect width="1024" height="1024" fill="${WALNUT}"/>${glyph()}`),
  144,
  { opaque: true, dir: path.join(OUT, '../../docs') }
);

// Favicon.
render(
  'favicon.png',
  svg(1024, 1024, `<rect width="1024" height="1024" rx="224" fill="${WALNUT}"/>${glyph()}`),
  48
);

// Google Play feature graphic (1024x500), written to store/.
render(
  'feature-graphic.png',
  svg(
    1024,
    500,
    `<rect width="1024" height="500" fill="${WALNUT}"/>
  <g transform="translate(40,30) scale(0.43)">${glyph()}</g>
  <text x="520" y="230" font-family="SF Pro Display, Helvetica Neue, Helvetica, Arial" font-weight="800" font-size="120" fill="#FFFFFF">Timber</text>
  <text x="524" y="300" font-family="SF Pro Text, Helvetica Neue, Helvetica, Arial" font-weight="600" font-size="40" fill="${AMBER}">Small wins. Every day.</text>
  <text x="524" y="352" font-family="SF Pro Text, Helvetica Neue, Helvetica, Arial" font-weight="500" font-size="28" fill="#FFFFFF" opacity="0.8">Build good habits · Break bad ones</text>`
  ),
  1024,
  { opaque: true, dir: path.join(OUT, '../../store') }
);
