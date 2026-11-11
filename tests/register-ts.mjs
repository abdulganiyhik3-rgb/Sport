import fs from 'node:fs'
import { registerHooks, stripTypeScriptTypes } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

function resolveTsFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mjs`,
    `${basePath}.js`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href
    }
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') {
      return nextResolve('next/server.js', context)
    }
    if (specifier === 'next/headers') {
      return nextResolve('next/headers.js', context)
    }

    if (specifier.startsWith('@/')) {
      const target = path.join(repoRoot, specifier.slice(2))
      const resolvedUrl = resolveTsFile(target)
      if (resolvedUrl) {
        return { url: resolvedUrl, shortCircuit: true }
      }
    }

    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL?.startsWith('file://')
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL))
      const target = path.resolve(parentDir, specifier)
      const resolvedUrl = resolveTsFile(target)
      if (resolvedUrl) {
        return { url: resolvedUrl, shortCircuit: true }
      }
    }

    return nextResolve(specifier, context)
  },

  load(url, context, nextLoad) {
    if (url.endsWith('.ts') || url.endsWith('.tsx')) {
      const source = fs.readFileSync(fileURLToPath(url), 'utf8')
      const stripped = stripTypeScriptTypes(source, {
        mode: 'strip',
        sourceUrl: url,
      })
      return {
        format: 'module',
        source: stripped,
        shortCircuit: true,
      }
    }

    return nextLoad(url, context)
  },
})
