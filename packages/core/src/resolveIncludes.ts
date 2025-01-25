const includePattern = /^[ \t]*#include +"([\w\d./]+)"/gm

interface Includes {
  [key: string]: string | Includes
}

export function resolveIncludes(source: string, includes: Includes): string {
  return source.replace(includePattern, (match, path: string) => {
    const components = path.split('/')
    const include = components.reduce<string | Includes | undefined>(
      (parent, component) =>
        typeof parent !== 'string' && parent != null
          ? parent[component]
          : undefined,
      includes
    )
    if (typeof include !== 'string') {
      throw new Error(`Could not find include for ${path}.`)
    }
    return resolveIncludes(include, includes)
  })
}
