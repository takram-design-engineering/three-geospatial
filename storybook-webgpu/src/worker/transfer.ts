import workerpool from 'workerpool'

// Type parameter is for inference.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface TransferResult<T> {}

export function Transfer<T extends object>(
  message: T,
  transfer: Transferable[]
): TransferResult<T> {
  return new workerpool.Transfer(message, transfer)
}
