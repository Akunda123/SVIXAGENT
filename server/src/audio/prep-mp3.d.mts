/** prep-mp3.mjs 的类型声明 */
export interface PrepMp3Result {
  path: string;
  seconds: number;
  srcSr: number;
}
export interface WavInfo {
  sr: number;
  ch: number;
  n: number;
  channelData: Float32Array[];
}
export function prepMp3ToWav(input: string, outPath: string, maxSeconds?: number): Promise<PrepMp3Result>;
export function prepareWav(input: string, outPath: string, maxSeconds?: number): Promise<PrepMp3Result>;
export function readWavPcm(path: string): WavInfo;
export function sniffAudioKind(buf: Buffer): string | null;
