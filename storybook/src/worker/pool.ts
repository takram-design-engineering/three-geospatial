import workerpool, { type Pool } from 'workerpool'
import type { ExecOptions } from 'workerpool/types/types'

import type { TransferResult } from './transfer'
import type { methods } from './worker'
import worker from './worker?worker&url'

let pool: Pool | undefined

function createPool(): Pool {
  return (pool ??= workerpool.pool(worker, {
    workerOpts: {
      type: 'module'
    }
  }))
}

type Method = keyof typeof methods
type MethodParams<T extends Method> = Parameters<(typeof methods)[T]>
type MethodReturnType<
  T extends Method,
  R = Awaited<ReturnType<(typeof methods)[T]>>
> = R extends TransferResult<infer U> ? U : R

export async function queueTask<T extends Method>(
  method: T,
  params?: MethodParams<T>,
  options?: ExecOptions
): Promise<MethodReturnType<T>> {
  return await createPool().exec(method, params, options)
}
