const { extractNotes } = require('./dist/audio/note-extract.js')
const f = 'out/vocal-new.wav'
require('fs').statSync(f)
const start = Date.now()
extractNotes(f).then(r => {
  console.log('文件: vocal-new.wav | 时长:', r.durationSec, 's | 处理耗时:', ((Date.now()-start)/1000).toFixed(1), 's')
  console.log('提取音符数:', r.notes.length)
  r.notes.slice(0, 30).forEach((nt,i) => console.log('  ['+i+'] midi='+nt.midi+' freq='+nt.freqHz+' 起'+nt.onsetSec+' 时'+nt.durationSec+' conf='+nt.confidence))
}).catch(e => console.log('err:', e.message))
