const includePattern = /^[ \t]*#include +"([\w\d./]+)"/gm

export function resolveIncludes(
  source: string,
  libraries: Record<string, string>
): string {
  return source.replace(includePattern, (match, path) => {
    const library = libraries[path]
    if (library == null) {
      throw new Error(`Could not find library for ${path}.`)
    }
    return resolveIncludes(library, libraries)
  })
}
