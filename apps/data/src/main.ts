import { readdir } from 'fs/promises'
import path from 'path'
import minimist from 'minimist'
import invariant from 'tiny-invariant'

async function printTargets(targetDir: string): Promise<void> {
  console.log('Available targets:')
  ;(await readdir(targetDir))
    .filter(name => name.endsWith('.js'))
    .forEach(name => {
      console.log(`  - ${path.parse(name).name}`)
    })
}

async function main(): Promise<void> {
  const argv = minimist(process.argv.slice(2))
  const targetDir = path.resolve(__dirname, 'targets')
  if (argv.target == null) {
    await printTargets(targetDir)
    process.exit(0)
  }

  const importPath = path.join(targetDir, argv.target)
  invariant(importPath.startsWith(targetDir))
  let target
  try {
    target = await import(`${importPath}.js`)
  } catch (error) {
    console.error(error)
    await printTargets(targetDir)
    process.exit(1)
  }
  await target.main(argv)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
