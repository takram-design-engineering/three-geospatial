import { resolveIncludes } from './resolveIncludes'

describe('resolveIncludes', () => {
  test('delimited paths', () => {
    expect(
      resolveIncludes('#include "scope/lib"', {
        scope: {
          lib: 'imported'
        }
      })
    ).toBe('imported')

    expect(() =>
      resolveIncludes('#include "scope/lib"', {
        other: {
          lib: 'imported'
        }
      })
    ).toThrow()
  })
})
