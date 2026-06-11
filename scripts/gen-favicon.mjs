// Genera favicon.ico (16/32/48, PNG-in-ICO) e favicon-32.png da icon-512.png
// Usa solo moduli Node.js built-in (zlib, fs, Buffer) — nessuna dipendenza esterna
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync, deflateSync, constants as zlibConst } from 'node:zlib'

const SRC = new URL('../public/icon-512.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const OUT_ICO = new URL('../public/favicon.ico', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const OUT_32  = new URL('../public/favicon-32.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')

// ── Minimal PNG decoder ────────────────────────────────────────────────────
function readU32BE(buf, off) { return (buf[off]<<24|buf[off+1]<<16|buf[off+2]<<8|buf[off+3]) >>> 0 }

function parsePNG(buf) {
  let off = 8 // skip signature
  let width, height, bitDepth, colorType, idat = []
  while (off < buf.length) {
    const len  = readU32BE(buf, off); off += 4
    const type = buf.slice(off, off+4).toString('ascii'); off += 4
    const data = buf.slice(off, off+len); off += len + 4 // +4 for crc
    if (type === 'IHDR') {
      width     = readU32BE(data, 0)
      height    = readU32BE(data, 4)
      bitDepth  = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    }
  }
  if (colorType !== 2 && colorType !== 6) throw new Error(`Unsupported color type: ${colorType}`)
  const channels = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels + 1 // +1 for filter byte
  // Convert to RGBA
  const rgba = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride + 1
    for (let x = 0; x < width; x++) {
      const si = rowStart + x * channels
      const di = (y * width + x) * 4
      rgba[di]   = raw[si]
      rgba[di+1] = raw[si+1]
      rgba[di+2] = raw[si+2]
      rgba[di+3] = channels === 4 ? raw[si+3] : 255
    }
  }
  return { width, height, rgba }
}

// ── Nearest-neighbour resize ───────────────────────────────────────────────
function resize(src, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4)
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(Math.floor(x * srcW / dstW), srcW - 1)
      const sy = Math.min(Math.floor(y * srcH / dstH), srcH - 1)
      const si = (sy * srcW + sx) * 4
      const di = (y  * dstW + x)  * 4
      dst[di]   = src[si]
      dst[di+1] = src[si+1]
      dst[di+2] = src[si+2]
      dst[di+3] = src[si+3]
    }
  }
  return dst
}

// ── Minimal PNG encoder ───────────────────────────────────────────────────
function crc32(buf) {
  let c = 0xFFFFFFFF
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let v = i
    for (let k = 0; k < 8; k++) v = (v & 1) ? (0xEDB88320 ^ (v >>> 1)) : (v >>> 1)
    t[i] = v
  }
  for (const b of buf) c = t[(c ^ b) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([lenBuf, t, data, crcBuf])
}

function encodePNG(rgba, w, h) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0 // filter None
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const idat = deflateSync(raw, { level: zlibConst.Z_BEST_COMPRESSION })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ── ICO assembler (PNG-in-ICO) ─────────────────────────────────────────────
function buildICO(pngs, sizes) {
  const n = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(n, 4)
  let dataOffset = 6 + n * 16
  const entries = pngs.map((png, i) => {
    const e = Buffer.alloc(16)
    e[0] = sizes[i] >= 256 ? 0 : sizes[i]
    e[1] = sizes[i] >= 256 ? 0 : sizes[i]
    e[2] = 0; e[3] = 0
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(dataOffset, 12)
    dataOffset += png.length
    return e
  })
  return Buffer.concat([header, ...entries, ...pngs])
}

// ── Main ───────────────────────────────────────────────────────────────────
const srcBuf = readFileSync(SRC)
const { width: srcW, height: srcH, rgba: srcRGBA } = parsePNG(srcBuf)
console.log(`Source: ${srcW}×${srcH}`)

const pngs = [16, 32, 48].map(sz => {
  const r = resize(srcRGBA, srcW, srcH, sz, sz)
  return encodePNG(r, sz, sz)
})

writeFileSync(OUT_ICO, buildICO(pngs, [16, 32, 48]))
writeFileSync(OUT_32,  pngs[1])
console.log(`favicon.ico written (${pngs.reduce((s,p)=>s+p.length,0)} bytes of PNG data)`)
console.log(`favicon-32.png written (${pngs[1].length} bytes)`)
