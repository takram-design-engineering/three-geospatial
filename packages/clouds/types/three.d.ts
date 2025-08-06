export {}

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
    isOrthographicCamera?: boolean
  }
}
