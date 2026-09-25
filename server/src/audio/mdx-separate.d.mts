/** mdx-separate.mjs 的类型声明 */
export interface SeparateAudioResult {
  vocal: string;
  accompaniment: string;
  seconds: number;
  chunks: number;
}
export function separateAudio(inputPath: string, outDir: string, modelFileName?: string): Promise<SeparateAudioResult>;
