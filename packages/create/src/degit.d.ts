declare module 'degit' {
  interface Emitter {
    clone(dest: string): Promise<void>
  }
  export default function degit(src: string, opts?: { cache?: boolean; force?: boolean }): Emitter
}
