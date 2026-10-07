import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const fft = require('ndarray-fft');
const ndarray = require('ndarray');
const cwise = require('cwise');
const baseline = process.env.AKD_BASELINE_SERVER
  ? createRequire(path.join(path.resolve(process.env.AKD_BASELINE_SERVER), 'package.json'))
  : null;
let checks = 0;

for (const size of [8, 12, 64, 6144]) {
  const input = Float64Array.from({ length: size }, (_, i) => Math.sin(i * 0.17) + Math.cos(i * 0.03) * 0.2);
  const real = input.slice();
  const imag = new Float64Array(size);
  fft(1, ndarray(real, [size]), ndarray(imag, [size]));
  if (baseline) {
    const oldReal = input.slice(), oldImag = new Float64Array(size);
    const oldNdarray = baseline('ndarray');
    baseline('ndarray-fft')(1, oldNdarray(oldReal, [size]), oldNdarray(oldImag, [size]));
    for (let i = 0; i < size; i++) {
      assert.ok(Math.abs(real[i] - oldReal[i]) < 1e-9, `FFT real mismatch: ${size}/${i}`);
      assert.ok(Math.abs(imag[i] - oldImag[i]) < 1e-9, `FFT imaginary mismatch: ${size}/${i}`);
    }
    checks++;
  }
  fft(-1, ndarray(real, [size]), ndarray(imag, [size]));
  for (let i = 0; i < size; i++) {
    assert.ok(Math.abs(real[i] - input[i]) < 1e-9, `FFT roundtrip: ${size}/${i}`);
    assert.ok(Math.abs(imag[i]) < 1e-9, `FFT residual: ${size}/${i}`);
  }
  checks++;
}

const values = new Float64Array([1, 2, 3]);
const add = cwise({ args: ['array', 'scalar'], body: function (value, amount) { value += amount; } });
add(ndarray(values, [3]), 2);
assert.deepEqual([...values], [3, 4, 5]);
checks++;

// Exercise the browserify transform as well as the FFT's object-based runtime API.
// This evaluates only a fixed synthetic fixture, never user-provided code.
const fixture = "var cw = require('cwise'); module.exports = cw({args:['array'],body:function(value){value += 1;}});";
const transform = cwise('dependency-fixture.js');
let generated = '';
await new Promise((resolve, reject) => {
  transform.on('data', chunk => { generated += String(chunk); });
  transform.once('error', reject);
  transform.once('end', resolve);
  transform.end(fixture);
});
assert.ok(generated.trim(), 'cwise transform returned no fixture');
const module = { exports: {} };
vm.runInNewContext(generated, { require, module, exports: module.exports }, { timeout: 1000 });
const transformedValues = new Float64Array([4, 5]);
module.exports(ndarray(transformedValues, [2]));
assert.deepEqual([...transformedValues], [5, 6]);
checks++;

console.log(JSON.stringify({ ok: true, checks, baselineCompared: Boolean(baseline), transformInlined: generated.includes('cwise/lib/wrapper'), modelsUsed: false, projectWrites: 0 }));
