import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: 'Eleven Views Harness',
    short_name: 'EV Harness',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  })
})

it('ships transparent Eleven Views icon assets', async () => {
  await expect(readFile(join(DIST_ROOT, 'favicon.png'))).resolves.not.toHaveLength(0)
  await expect(readFile(join(DIST_ROOT, 'icon-192.png'))).resolves.not.toHaveLength(0)
  await expect(readFile(join(DIST_ROOT, 'icon-512.png'))).resolves.not.toHaveLength(0)
})
