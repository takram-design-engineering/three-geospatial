/* eslint-disable @typescript-eslint/no-explicit-any */

declare module '*.svg' {
  const content: any
  export const ReactComponent: any
  export default content
}

declare module '*.glsl' {
  const content: string
  export default content
}

declare module '*.frag' {
  const content: string
  export default content
}

declare module '*.vert' {
  const content: string
  export default content
}
