import zlib from "node:zlib";

const FONT = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
};

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

export function encodePng(width, height, background, paint) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * stride;
    raw[start] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = start + 1 + x * 3;
      raw[i] = background[0];
      raw[i + 1] = background[1];
      raw[i + 2] = background[2];
    }
  }
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * stride + 1 + x * 3;
    raw[i] = color[0];
    raw[i + 1] = color[1];
    raw[i + 2] = color[2];
  };
  paint(set);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function rect(set, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) set(xx, yy, color);
  }
}

function text(set, phrase, x, y, scale, color) {
  let cursor = x;
  for (const ch of phrase) {
    const glyph = FONT[ch] || FONT[" "];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== "1") continue;
        rect(set, cursor + col * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += (glyph[0].length + 1) * scale;
  }
}

const CREAM = [239, 230, 212];
const INK = [28, 25, 21];
const TEAL = [13, 92, 86];
const CARD = [255, 250, 242];

export function ogPng() {
  return encodePng(1200, 630, CREAM, (set) => {
    rect(set, 64, 64, 1072, 502, CARD);
    rect(set, 64, 64, 18, 502, TEAL);
    rect(set, 120, 150, 92, 18, TEAL);
    rect(set, 136, 182, 76, 18, INK);
    rect(set, 120, 214, 92, 18, TEAL);
    text(set, "3D PRINT COST", 260, 170, 8, INK);
    text(set, "CALCULATOR", 260, 250, 8, TEAL);
    text(set, "ESTIMATE ONLY", 260, 360, 4, INK);
  });
}

export function faviconPng() {
  return encodePng(32, 32, CREAM, (set) => {
    rect(set, 6, 8, 20, 4, TEAL);
    rect(set, 9, 14, 14, 4, INK);
    rect(set, 6, 20, 20, 4, TEAL);
  });
}
