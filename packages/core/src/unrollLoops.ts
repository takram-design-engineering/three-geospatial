// Based on: https://github.com/mrdoob/three.js/blob/r170/src/renderers/webgl/WebGLProgram.js#L294

const unrollLoopPattern =
  /#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*(?:i\s*\+\+|\+\+\s*i)\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g

function loopReplacer(
  match: string,
  start: string,
  end: string,
  snippet: string
): string {
  let string = ''
  for (let i = parseInt(start, 10); i < parseInt(end, 10); ++i) {
    string += snippet
      .replace(/\[\s*i\s*\]/g, '[' + i + ']')
      .replace(/UNROLLED_LOOP_INDEX/g, `${i}`)
  }
  return string
}

export function unrollLoops(string: string): string {
  return string.replace(unrollLoopPattern, loopReplacer)
}
