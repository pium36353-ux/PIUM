// Genera favicon.ico (16/32/48 PNG-in-ICO) e favicon-32.png da icon-512.png
// Usa sharp per il resize corretto e png-to-ico per l'assemblaggio ICO
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC     = resolve(__dirname, '../public/icon-512.png')
const OUT_ICO = resolve(__dirname, '../public/favicon.ico')
const OUT_32  = resolve(__dirname, '../public/favicon-32.png')

const sizes = [16, 32, 48]
const pngBuffers = await Promise.all(
  sizes.map(sz =>
    sharp(SRC)
      .resize(sz, sz)
      .png()
      .toBuffer()
  )
)

writeFileSync(OUT_32, pngBuffers[1])
console.log(`favicon-32.png written: ${pngBuffers[1].length} bytes`)

const ico = await pngToIco(pngBuffers)
writeFileSync(OUT_ICO, ico)
console.log(`favicon.ico written: ${ico.length} bytes`)
