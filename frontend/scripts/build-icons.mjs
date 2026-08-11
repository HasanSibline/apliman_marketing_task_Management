/**
 * Build the tab icons from public/favicon.svg.
 *
 * The .ico used to hold a single 16x16 image while index.html advertised it as 32x32.
 * A browser picks an icon by the size it is told about, so it asked for 32, got 16,
 * and upscaled it; on any high-density screen, where a tab icon is drawn at 32 device
 * pixels, that is a blurred smudge rather than a logo.
 *
 * So the .ico carries 16, 32 and 48 now, each rendered from the vector at its own
 * size rather than resampled from another raster. A PNG at 32 is emitted alongside it
 * for browsers that prefer one.
 *
 * icon-192, icon-512 and apple-touch-icon are deliberately not rebuilt here. They
 * carry the full three-arc mark, which reads correctly at the sizes they are shown
 * at, and replacing them with the simplified tab version would lose detail nothing
 * gains by losing.
 *
 * Run with: node scripts/build-icons.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')

/** Sizes inside the .ico. 48 is what Windows uses for a pinned or desktop shortcut. */
const ICO_SIZES = [16, 32, 48]

/**
 * Pack PNGs into an .ico.
 *
 * The format is a six byte header, then one sixteen byte directory entry per image,
 * then the payloads. A width or height byte of zero means 256, which is why nothing
 * here may exceed 255 without that convention.
 */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(images.length * 16)
  let offset = header.length + directory.length

  images.forEach(({ size, data }, i) => {
    const at = i * 16
    directory[at] = size >= 256 ? 0 : size
    directory[at + 1] = size >= 256 ? 0 : size
    directory[at + 2] = 0 // palette colours, 0 for true colour
    directory[at + 3] = 0 // reserved
    directory.writeUInt16LE(1, at + 4) // colour planes
    directory.writeUInt16LE(32, at + 6) // bits per pixel
    directory.writeUInt32LE(data.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += data.length
  })

  return Buffer.concat([header, directory, ...images.map((i) => i.data)])
}

const svg = await readFile(join(publicDir, 'favicon.svg'))

// Rendered from the vector at each size. Resampling one raster into another softens
// edges that are only a pixel or two wide to begin with.
const images = []
for (const size of ICO_SIZES) {
  const data = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  images.push({ size, data })
  await writeFile(join(publicDir, `icon-${size}.png`), data)
}

await writeFile(join(publicDir, 'favicon.ico'), buildIco(images))

console.log(
  `favicon.ico written with ${images.map((i) => `${i.size}x${i.size}`).join(', ')}, ` +
    `plus icon-16, icon-32 and icon-48 as PNG`,
)
