import path from 'node:path'
import minimist from 'minimist'

import atmosphere from './targets/atmosphere'
import stars from './targets/stars'
import stbn from './targets/stbn'

const targets: Record<string, () => Promise<void> | undefined> = {
  atmosphere,
  stars,
  stbn
}

function printTargets(): void {
  console.log('Available targets:')
  Object.keys(targets).forEach(name => {
    console.log(`  - ${path.parse(name).name}`)
  })
}

async function main(): Promise<void> {
  const argv = minimist(process.argv.slice(2))
  const target = targets[argv.target]
  if (target == null) {
    printTargets()
    process.exit(0)
  }
  await target()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
