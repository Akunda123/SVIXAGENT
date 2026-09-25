# .svp 音频轨 schema（v2 · 深层键路径实测）

扫描 .svp **1005** 个 · 音频轨 **26** 条 · 人声轨 294 条

## 音频轨 深层键路径（含出现率）

| 路径 | 出现 | 判定 | 类型 | 示例 |
|---|---|---|---|---|
| `name` | 26/26 | **必有** | string | `未命名音轨 1` |
| `dispColor` | 26/26 | **必有** | string | `ffd14f5b` |
| `dispOrder` | 26/26 | **必有** | number | `1` |
| `renderEnabled` | 26/26 | **必有** | boolean | `false` |
| `mixer.gainDecibel` | 26/26 | **必有** | number | `-4.099999999999998` |
| `mixer.pan` | 26/26 | **必有** | number | `0` |
| `mixer.mute` | 26/26 | **必有** | boolean | `false` |
| `mixer.solo` | 26/26 | **必有** | boolean | `false` |
| `mixer.display` | 26/26 | **必有** | boolean | `true` |
| `mainGroup.name` | 26/26 | **必有** | string | `main` |
| `mainGroup.uuid` | 26/26 | **必有** | string | `<uuid>` |
| `mainGroup.parameters.pitchDelta.mode` | 26/26 | **必有** | string | `cubic` |
| `mainGroup.parameters.vibratoEnv.mode` | 26/26 | **必有** | string | `cubic` |
| `mainGroup.parameters.loudness.mode` | 26/26 | **必有** | string | `cubic` |
| `mainGroup.parameters.tension.mode` | 26/26 | **必有** | string | `cubic` |
| `mainGroup.parameters.breathiness.mode` | 26/26 | **必有** | string | `cubic` |
| `mainGroup.parameters.voicing.mode` | 26/26 | **必有** | string | `cubic` |
| `mainGroup.parameters.gender.mode` | 26/26 | **必有** | string | `cubic` |
| `mainGroup.parameters.toneShift.mode` | 26/26 | **必有** | string | `cubic` |
| `mainRef.groupID` | 26/26 | **必有** | string | `<uuid>` |
| `mainRef.blickAbsoluteBegin` | 26/26 | **必有** | number | `0` |
| `mainRef.blickAbsoluteEnd` | 26/26 | **必有** | number | `-1` |
| `mainRef.blickOffset` | 26/26 | **必有** | number | `0` |
| `mainRef.pitchOffset` | 26/26 | **必有** | number | `0` |
| `mainRef.isInstrumental` | 26/26 | **必有** | boolean | `true` |
| `mainRef.audio.filename` | 26/26 | **必有** | string | `<path>/Projects/1024.wav` |
| `mainRef.audio.duration` | 26/26 | **必有** | number | `265.0909070294784` |
| `mainRef.database.name` | 26/26 | **必有** | string | `` |
| `mainRef.database.language` | 26/26 | **必有** | string | `` |
| `mainRef.database.phoneset` | 26/26 | **必有** | string | `` |
| `mainRef.database.languageOverride` | 26/26 | **必有** | string | `` |
| `mainRef.database.phonesetOverride` | 26/26 | **必有** | string | `` |
| `mainRef.database.backendType` | 26/26 | **必有** | string | `` |
| `mainRef.database.version` | 26/26 | **必有** | string | `-2` |
| `mainRef.dictionary` | 26/26 | **必有** | string | `` |
| `mainRef.voice.vocalModeInherited` | 26/26 | **必有** | boolean | `true` |
| `mainRef.voice.vocalModePreset` | 26/26 | **必有** | string | `` |
| `mainGroup.parameters.mouthOpening.mode` | 14/26 | 可选 | string | `cubic` |
| `mainRef.takes.activeTakeId` | 14/26 | 可选 | number | `0` |
| `mainRef.takes.takes[].id` | 14/26 | 可选 | number | `0` |
| `mainRef.takes.takes[].seedDuration` | 14/26 | 可选 | number | `0` |
| `mainRef.takes.takes[].seedPitch` | 14/26 | 可选 | number | `0` |
| `mainRef.takes.takes[].seedTimbre` | 14/26 | 可选 | number | `0` |
| `mainRef.takes.takes[].liked` | 14/26 | 可选 | boolean | `false` |
| `mainRef.voicePresetName` | 13/26 | 可选 | string | `` |
| `mainRef.systemPitchDelta.mode` | 12/26 | 可选 | string | `cubic` |
| `mainRef.pitchTakes.activeTakeId` | 12/26 | 可选 | number | `0` |
| `mainRef.pitchTakes.takes[].id` | 12/26 | 可选 | number | `0` |
| `mainRef.pitchTakes.takes[].expr` | 12/26 | 可选 | number | `0` |
| `mainRef.pitchTakes.takes[].liked` | 12/26 | 可选 | boolean | `false` |
| `mainRef.timbreTakes.activeTakeId` | 12/26 | 可选 | number | `0` |
| `mainRef.timbreTakes.takes[].id` | 12/26 | 可选 | number | `0` |
| `mainRef.timbreTakes.takes[].expr` | 12/26 | 可选 | number | `0` |
| `mainRef.timbreTakes.takes[].liked` | 12/26 | 可选 | boolean | `false` |
| `mainRef.mute` | 11/26 | 可选 | boolean | `false` |
| `mainRef.audio.bpm` | 11/26 | 可选 | number | `65.37905883789062` |
| `mainRef.audio.alternativeBPMs[]` | 7/26 | 可选 | number | `65.37905883789062` |
| `mainRef.audio.beatLocations[]` | 7/26 | 可选 | number | `0.052145833333333` |
| `mixer.fxPresetName` | 2/26 | 可选 | string | `` |
| `mixer.fxParams.room.enabled` | 2/26 | 可选 | boolean | `false` |
| `mixer.fxParams.room.positionX` | 2/26 | 可选 | number | `0` |
| `mixer.fxParams.room.positionY` | 2/26 | 可选 | number | `0` |
| `mixer.fxParams.room.size` | 2/26 | 可选 | number | `13` |
| `mixer.fxParams.room.reflectionGain` | 2/26 | 可选 | number | `4.799999237060547` |
| `mixer.fxParams.postRoomEq.enabled` | 2/26 | 可选 | boolean | `false` |
| `mixer.fxParams.postRoomEq.filters[].freq` | 2/26 | 可选 | number | `117.69999694824219` |
| `mixer.fxParams.postRoomEq.filters[].gain` | 2/26 | 可选 | number | `0` |
| `mixer.fxParams.postRoomEq.filters[].q` | 2/26 | 可选 | number | `0.709999978542328` |
| `mixer.fxParams.postRoomEq.lowShelf.freq` | 2/26 | 可选 | number | `25` |
| `mixer.fxParams.postRoomEq.lowShelf.gain` | 2/26 | 可选 | number | `0` |
| `mixer.fxParams.compressor.enabled` | 2/26 | 可选 | boolean | `false` |
| `mixer.fxParams.compressor.attack` | 2/26 | 可选 | number | `0` |
| `mixer.fxParams.compressor.ratio` | 2/26 | 可选 | number | `4` |
| `mixer.fxParams.compressor.threshold` | 2/26 | 可选 | number | `-10` |
| `mixer.fxParams.reverb.enabled` | 2/26 | 可选 | boolean | `false` |
| `mixer.fxParams.reverb.type` | 2/26 | 可选 | string | `clean` |
| `mixer.fxParams.reverb.preDelay` | 2/26 | 可选 | number | `0.050000000745058` |
| `mixer.fxParams.reverb.decay` | 2/26 | 可选 | number | `1` |
| `mixer.fxParams.reverb.dryWetRatio` | 2/26 | 可选 | number | `0.5` |
| `mainGroup.musicalScale.type` | 2/26 | 可选 | string | `Major` |
| `mainGroup.musicalScale.root` | 2/26 | 可选 | string | `C` |
| `mainRef.uuid` | 2/26 | 可选 | string | `<uuid>` |
| `mainRef.voice.choirSeatingSeparation` | 2/26 | 可选 | number | `0.699999988079071` |
| `mainRef.timestampLMR` | 2/26 | 可选 | number | `1787447048443` |
| `mainRef.timestampLRSR` | 2/26 | 可选 | number | `1787447437165` |

## 音频轨**独有**的路径

- `mainRef.audio.filename`  26/26  string  `<path>/Projects/1024.wav`
- `mainRef.audio.duration`  26/26  number  `265.0909070294784`
- `mainRef.audio.bpm`  11/26  number  `65.37905883789062`
- `mainRef.audio.alternativeBPMs[]`  7/26  number  `65.37905883789062`
- `mainRef.audio.beatLocations[]`  7/26  number  `0.052145833333333`

## 人声轨**独有**的路径

- `mainGroup.parameters.tension.points[]`  6/294  number
- `mainGroup.notes[].musicalType`  115/294  string
- `mainGroup.notes[].onset`  147/294  number
- `mainGroup.notes[].duration`  147/294  number
- `mainGroup.notes[].lyrics`  147/294  string
- `mainGroup.notes[].phonemes`  147/294  string
- `mainGroup.notes[].accent`  115/294  string
- `mainGroup.notes[].pitch`  147/294  number
- `mainGroup.notes[].detune`  147/294  number
- `mainGroup.notes[].instantMode`  113/294  boolean
- `mainGroup.notes[].attributes.dF0Left`  7/294  number
- `mainGroup.notes[].attributes.tF0VbrStart`  10/294  number
- `mainGroup.notes[].attributes.tF0VbrLeft`  5/294  number
- `mainGroup.notes[].attributes.tF0VbrRight`  5/294  number
- `mainGroup.notes[].attributes.pF0Vbr`  4/294  number
- `mainGroup.notes[].attributes.evenSyllableDuration`  111/294  boolean
- `mainGroup.notes[].systemAttributes.evenSyllableDuration`  109/294  boolean
- `mainGroup.notes[].pitchTakes.activeTakeId`  143/294  number
- `mainGroup.notes[].pitchTakes.takes[].id`  143/294  number
- `mainGroup.notes[].pitchTakes.takes[].expr`  143/294  number
- `mainGroup.notes[].pitchTakes.takes[].liked`  143/294  boolean
- `mainGroup.notes[].timbreTakes.activeTakeId`  143/294  number
- `mainGroup.notes[].timbreTakes.takes[].id`  143/294  number
- `mainGroup.notes[].timbreTakes.takes[].expr`  143/294  number
- `mainGroup.notes[].timbreTakes.takes[].liked`  143/294  boolean
- `mainRef.voice.paramTension`  32/294  number
- `mainGroup.parameters.pitchDelta.points[]`  38/294  number
- `groups[].groupID`  149/294  string
- `groups[].blickAbsoluteBegin`  149/294  number
- `groups[].blickAbsoluteEnd`  149/294  number
- `groups[].blickOffset`  149/294  number
- `groups[].pitchOffset`  149/294  number
- `groups[].isInstrumental`  149/294  boolean
- `groups[].systemPitchDelta.mode`  22/294  string
- `groups[].database.name`  149/294  string
- `groups[].database.language`  149/294  string
- `groups[].database.phoneset`  149/294  string
- `groups[].database.languageOverride`  149/294  string
- `groups[].database.phonesetOverride`  149/294  string
- `groups[].database.backendType`  149/294  string
- `groups[].database.version`  149/294  string
- `groups[].dictionary`  149/294  string
- `groups[].voice.vocalModeInherited`  149/294  boolean
- `groups[].voice.vocalModePreset`  149/294  string
- `groups[].pitchTakes.activeTakeId`  23/294  number
- `groups[].pitchTakes.takes[].id`  23/294  number
- `groups[].pitchTakes.takes[].expr`  23/294  number
- `groups[].pitchTakes.takes[].liked`  23/294  boolean
- `groups[].timbreTakes.activeTakeId`  23/294  number
- `groups[].timbreTakes.takes[].id`  23/294  number
- `groups[].timbreTakes.takes[].expr`  23/294  number
- `groups[].timbreTakes.takes[].liked`  23/294  boolean
- `mainGroup.notes[].attributes.dF0Vbr`  30/294  number
- `mainGroup.notes[].systemAttributes.tF0Offset`  69/294  number
- `mainGroup.notes[].systemAttributes.tF0Left`  69/294  number
- `mainGroup.notes[].systemAttributes.tF0Right`  69/294  number
- `mainGroup.notes[].systemAttributes.dF0Left`  69/294  number
- `mainGroup.notes[].systemAttributes.dF0Right`  69/294  number
- `mainGroup.notes[].systemAttributes.dF0Vbr`  69/294  number
- `mainGroup.notes[].systemAttributes.rTone`  18/294  number
- `mainGroup.notes[].systemAttributes.rIntonation`  18/294  number
- `mainRef.systemPitchDelta.points[]`  67/294  number
- `mainGroup.parameters.toneShift.points[]`  6/294  number
- `mainGroup.vocalModes.Opera.mode`  1/294  string
- `mainGroup.vocalModes.Opera.points[]`  1/294  number
- `mainGroup.notes[].attributes.fF0Vbr`  8/294  number
- `mainRef.voice.paramBreathiness`  19/294  number
- `mainGroup.vocalModes.Cool.mode`  3/294  string
- `mainGroup.vocalModes.Cool.points[]`  3/294  number
- `mainGroup.notes[].attributes.tF0Right`  6/294  number
- `mainGroup.notes[].attributes.dF0Right`  4/294  number
- `mainRef.voice.vocalModeParams.Airy`  1/294  number
- `mainRef.voice.vocalModeParams.Sweet`  4/294  number
- `mainGroup.notes[].systemAttributes.tF0VbrStart`  1/294  number
- `mainGroup.parameters.vibratoEnv.points[]`  6/294  number
- `mainGroup.parameters.voicing.points[]`  1/294  number
- `mainGroup.vocalModes.Mellow.mode`  1/294  string
- `mainGroup.vocalModes.Mellow.points[]`  1/294  number
- `mainGroup.vocalModes.Natural.mode`  1/294  string
- `mainGroup.vocalModes.Natural.points[]`  1/294  number
- `mainRef.voice.paramGender`  21/294  number
- `mainRef.voice.paramToneShift`  26/294  number
- `groups[].mute`  99/294  boolean
- `groups[].voicePresetName`  121/294  string
- `groups[].takes.activeTakeId`  126/294  number
- `groups[].takes.takes[].id`  126/294  number
- `groups[].takes.takes[].seedDuration`  126/294  number
- `groups[].takes.takes[].seedPitch`  126/294  number
- `groups[].takes.takes[].seedTimbre`  126/294  number
- `groups[].takes.takes[].liked`  126/294  boolean
- `mainGroup.notes[].attributes.muted`  1/294  boolean
- `mainGroup.notes[].takes.activeTakeId`  2/294  number
- `mainGroup.notes[].takes.takes[].id`  2/294  number
- `mainGroup.notes[].takes.takes[].seedDuration`  2/294  number
- `mainGroup.notes[].takes.takes[].seedPitch`  2/294  number
- `mainGroup.notes[].takes.takes[].seedTimbre`  2/294  number
- `mainGroup.notes[].takes.takes[].liked`  2/294  boolean
- `mainGroup.pitchControls[].pos`  3/294  number
- `mainGroup.pitchControls[].pitch`  3/294  number
- `mainGroup.pitchControls[].id`  3/294  string
- `mainGroup.pitchControls[].type`  3/294  string
- `mainGroup.pitchControls[].points[]`  2/294  number
- `mainGroup.parameters.loudness.points[]`  4/294  number
- `mainGroup.notes[].attributes.languageOverride`  15/294  string
- `mainGroup.notes[].attributes.phonesetOverride`  15/294  string
- `mainGroup.notes[].systemAttributes.languageOverride`  15/294  string
- `mainGroup.notes[].systemAttributes.phonesetOverride`  15/294  string
- `mainRef.voice.tF0VbrStart`  3/294  number
- `mainRef.voice.dF0VbrMod`  3/294  number
- `mainRef.voice.renderMode`  3/294  string
- `mainRef.voice.vocalModeParams.Firm`  7/294  number
- `mainRef.voice.vocalModeParams.Cool`  40/294  number
- `groups[].systemPitchDelta.points[]`  13/294  number
- `groups[].voice.paramTension`  10/294  number
- `groups[].voice.paramToneShift`  6/294  number
- `groups[].voice.vocalModeParams.Firm`  3/294  number
- `groups[].voice.vocalModeParams.Cool`  3/294  number
- `groups[].voice.vocalModeParams.Relaxed`  3/294  number
- `mainGroup.vocalModes..mode`  2/294  string
- `mainGroup.notes[].attributes.tF0Offset`  3/294  number
- `mainGroup.notes[].attributes.tF0Left`  5/294  number
- `mainGroup.notes[].attributes.dur[]`  9/294  number
- `mainGroup.notes[].attributes.strength[]`  1/294  number
- `mainGroup.notes[].systemAttributes.dur[]`  1/294  number
- `mainGroup.notes[].systemAttributes.strength[]`  1/294  number
- `mainRef.voice.tF0Left`  2/294  number
- `mainRef.voice.dF0Left`  2/294  number
- `groups[].voice.paramLoudness`  3/294  number
- `mainRef.voice.vocalModeParams.Relaxed`  3/294  number
- `groups[].uuid`  51/294  string
- `groups[].voice.choirNumStems`  44/294  number
- `groups[].voice.choirSeatingSeparation`  46/294  number
- `groups[].timestampLMR`  51/294  number
- `groups[].timestampLRSR`  51/294  number
- `groups[].voice.choirPartName`  30/294  string
- `groups[].voice.choirSeatingSeed`  4/294  number
- `mainGroup.vocalModes.Soft.mode`  3/294  string
- `mainGroup.vocalModes.Soft.points[]`  2/294  number
- `mainGroup.vocalModes.Open.mode`  2/294  string
- `mainGroup.vocalModes.Adsf.mode`  2/294  string
- `mainGroup.vocalModes.Adsf.points[]`  2/294  number
- `mainRef.voice.vocalModeParams.Operatic.pitch`  3/294  number
- `mainRef.voice.vocalModeParams.Operatic.timbre`  3/294  number
- `mainRef.voice.vocalModeParams.Operatic.pronunciation`  3/294  number
- `mainGroup.notes[].attributes.dF0Jitter`  2/294  number
- `mainGroup.vocalModes.2323324.mode`  1/294  string
- `mainGroup.vocalModes.Power.mode`  1/294  string
- `mainGroup.vocalModes.Power.points[]`  1/294  number
- `mainGroup.notes[].attributes.tNoteOffset`  2/294  number
- `mainRef.voice.tF0Right`  1/294  number
- `mainRef.voice.dF0Right`  1/294  number
- `mainRef.voice.vocalModeParams.Emotional`  5/294  number
- `mainGroup.vocalModes.Powerful.mode`  2/294  string
- `mainGroup.vocalModes.Powerful.points[]`  2/294  number
- `mainGroup.vocalModes.Bright.mode`  1/294  string
- `groups[].voice.paramBreathiness`  3/294  number
- `groups[].voice.paramGender`  3/294  number
- `groups[].voice.transposeCents`  2/294  number
- `groups[].voice.transposeSemitones`  2/294  number
- `groups[].voice.vocalModeParams.Open.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Open.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Open.pronunciation`  1/294  number
- `groups[].voice.vocalModeParams.Resonant.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Resonant.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Resonant.pronunciation`  1/294  number
- `groups[].voice.vocalModeParams.Closed.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Closed.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Closed.pronunciation`  1/294  number
- `mainGroup.notes[].attributes.exprGroup`  2/294  string
- `mainRef.voice.vocalModeParams.Soft.pitch`  1/294  number
- `mainRef.voice.vocalModeParams.Soft.timbre`  1/294  number
- `mainRef.voice.vocalModeParams.Soft.pronunciation`  1/294  number
- `mainRef.voice.vocalModeParams.Airy.pitch`  1/294  number
- `mainRef.voice.vocalModeParams.Airy.timbre`  1/294  number
- `mainRef.voice.vocalModeParams.Airy.pronunciation`  1/294  number
- `mainRef.voice.vocalModeParams.Dark`  2/294  number
- `mainRef.voice.vocalModeParams.Soft`  2/294  number
- `mainRef.voice.vocalModeParams.Solid`  2/294  number
- `mainRef.voice.vocalModeParams.Whisper`  2/294  number
- `mainRef.voice.vocalModeParams.Power`  1/294  number
- `groups[].voice.consonantStrength`  1/294  number
- `groups[].voice.consonantDuration`  1/294  number
- `groups[].voice.vocalModeParams.Bright.pitch`  6/294  number
- `groups[].voice.vocalModeParams.Bright.timbre`  6/294  number
- `groups[].voice.vocalModeParams.Bright.pronunciation`  6/294  number
- `groups[].voice.vocalModeParams.Rounded.pitch`  4/294  number
- `groups[].voice.vocalModeParams.Rounded.timbre`  4/294  number
- `groups[].voice.vocalModeParams.Rounded.pronunciation`  4/294  number
- `groups[].voice.vocalModeParams.Smooth.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Smooth.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Smooth.pronunciation`  1/294  number
- `mainRef.voice.vocalModeParams.Musical.pitch`  2/294  number
- `mainRef.voice.vocalModeParams.Musical.timbre`  2/294  number
- `mainRef.voice.vocalModeParams.Musical.pronunciation`  2/294  number
- `mainRef.voice.vocalModeParams.Power.pitch`  2/294  number
- `mainRef.voice.vocalModeParams.Power.timbre`  2/294  number
- `mainRef.voice.vocalModeParams.Power.pronunciation`  2/294  number
- `groups[].voice.vocalModeParams.Whisper.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Whisper.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Whisper.pronunciation`  1/294  number
- `groups[].voice.vocalModeParams.Adult.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Adult.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Adult.pronunciation`  1/294  number
- `groups[].voice.vocalModeParams.Sweet.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Sweet.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Sweet.pronunciation`  1/294  number
- `groups[].voice.vocalModeParams.Soft.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Soft.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Soft.pronunciation`  1/294  number
- `groups[].voice.vocalModeParams.Mellow.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Mellow.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Mellow.pronunciation`  1/294  number
- `groups[].voice.vocalModeParams.Breathy.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Breathy.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Breathy.pronunciation`  1/294  number
- `groups[].voice.vocalModeParams.Boyish.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Boyish.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Boyish.pronunciation`  1/294  number
- `groups[].voice.vocalModeParams.Downer.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Downer.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Downer.pronunciation`  1/294  number
- `groups[].voice.vocalModeParams.Emotional.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Emotional.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Emotional.pronunciation`  1/294  number
- `groups[].voice.vocalModeParams.Dark.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Dark.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Dark.pronunciation`  1/294  number
- `groups[].voice.vocalModeParams.Airy.pitch`  1/294  number
- `groups[].voice.vocalModeParams.Airy.timbre`  1/294  number
- `groups[].voice.vocalModeParams.Airy.pronunciation`  1/294  number

## 共有的路径（80 条）

`name` · `dispColor` · `dispOrder` · `renderEnabled` · `mixer.gainDecibel` · `mixer.pan` · `mixer.mute` · `mixer.solo` · `mixer.display` · `mainGroup.name` · `mainGroup.uuid` · `mainGroup.parameters.pitchDelta.mode` · `mainGroup.parameters.vibratoEnv.mode` · `mainGroup.parameters.loudness.mode` · `mainGroup.parameters.tension.mode` · `mainGroup.parameters.breathiness.mode` · `mainGroup.parameters.voicing.mode` · `mainGroup.parameters.gender.mode` · `mainGroup.parameters.toneShift.mode` · `mainRef.groupID` · `mainRef.blickAbsoluteBegin` · `mainRef.blickAbsoluteEnd` · `mainRef.blickOffset` · `mainRef.pitchOffset` · `mainRef.isInstrumental` · `mainRef.systemPitchDelta.mode` · `mainRef.database.name` · `mainRef.database.language` · `mainRef.database.phoneset` · `mainRef.database.languageOverride` · `mainRef.database.phonesetOverride` · `mainRef.database.backendType` · `mainRef.database.version` · `mainRef.dictionary` · `mainRef.voice.vocalModeInherited` · `mainRef.voice.vocalModePreset` · `mainRef.pitchTakes.activeTakeId` · `mainRef.pitchTakes.takes[].id` · `mainRef.pitchTakes.takes[].expr` · `mainRef.pitchTakes.takes[].liked` · `mainRef.timbreTakes.activeTakeId` · `mainRef.timbreTakes.takes[].id` · `mainRef.timbreTakes.takes[].expr` · `mainRef.timbreTakes.takes[].liked` · `mainGroup.parameters.mouthOpening.mode` · `mainRef.mute` · `mainRef.voicePresetName` · `mainRef.takes.activeTakeId` · `mainRef.takes.takes[].id` · `mainRef.takes.takes[].seedDuration` · `mainRef.takes.takes[].seedPitch` · `mainRef.takes.takes[].seedTimbre` · `mainRef.takes.takes[].liked` · `mixer.fxPresetName` · `mixer.fxParams.room.enabled` · `mixer.fxParams.room.positionX` · `mixer.fxParams.room.positionY` · `mixer.fxParams.room.size` · `mixer.fxParams.room.reflectionGain` · `mixer.fxParams.postRoomEq.enabled` · `mixer.fxParams.postRoomEq.filters[].freq` · `mixer.fxParams.postRoomEq.filters[].gain` · `mixer.fxParams.postRoomEq.filters[].q` · `mixer.fxParams.postRoomEq.lowShelf.freq` · `mixer.fxParams.postRoomEq.lowShelf.gain` · `mixer.fxParams.compressor.enabled` · `mixer.fxParams.compressor.attack` · `mixer.fxParams.compressor.ratio` · `mixer.fxParams.compressor.threshold` · `mixer.fxParams.reverb.enabled` · `mixer.fxParams.reverb.type` · `mixer.fxParams.reverb.preDelay` · `mixer.fxParams.reverb.decay` · `mixer.fxParams.reverb.dryWetRatio` · `mainGroup.musicalScale.type` · `mainGroup.musicalScale.root` · `mainRef.uuid` · `mainRef.voice.choirSeatingSeparation` · `mainRef.timestampLMR` · `mainRef.timestampLRSR`

## `takes` 出现在哪

- `mainRef` × 26
- `mainRef.takes` × 14

## 音频轨完整样本 1（来自 1024svp.svp；UUID→`<uuid>`、长路径→`<path>…`）

```json
{
  "name": "未命名音轨 1",
  "dispColor": "ffd14f5b",
  "dispOrder": 1,
  "renderEnabled": false,
  "mixer": {
    "gainDecibel": -4.099999999999998,
    "pan": 0,
    "mute": false,
    "solo": false,
    "display": true
  },
  "mainGroup": {
    "name": "main",
    "uuid": "<uuid>",
    "parameters": {
      "pitchDelta": {
        "mode": "cubic",
        "points": []
      },
      "vibratoEnv": {
        "mode": "cubic",
        "points": []
      },
      "loudness": {
        "mode": "cubic",
        "points": []
      },
      "tension": {
        "mode": "cubic",
        "points": []
      },
      "breathiness": {
        "mode": "cubic",
        "points": []
      },
      "voicing": {
        "mode": "cubic",
        "points": []
      },
      "gender": {
        "mode": "cubic",
        "points": []
      },
      "toneShift": {
        "mode": "cubic",
        "points": []
      }
    },
    "vocalModes": {},
    "notes": []
  },
  "mainRef": {
    "groupID": "<uuid>",
    "blickAbsoluteBegin": 0,
    "blickAbsoluteEnd": -1,
    "blickOffset": 0,
    "pitchOffset": 0,
    "isInstrumental": true,
    "systemPitchDelta": {
      "mode": "cubic",
      "points": []
    },
    "audio": {
      "filename": "<path>/Projects/1024.wav",
      "duration": 265.0909070294784
    },
    "database": {
      "name": "",
      "language": "",
      "phoneset": "",
      "languageOverride": "",
      "phonesetOverride": "",
      "backendType": "",
      "version": "-2"
    },
    "dictionary": "",
    "voice": {
      "vocalModeInherited": true,
      "vocalModePreset": "",
      "vocalModeParams": {}
    },
    "pitchTakes": {
      "activeTakeId": 0,
      "takes": [
        {
          "id": 0,
          "expr": 0,
          "liked": false
        }
      ]
    },
    "timbreTakes": {
      "activeTakeId": 0,
      "takes": [
        {
          "id": 0,
          "expr": 0,
          "liked": false
        }
      ]
    }
  },
  "groups": []
}
```

## 音频轨完整样本 2（来自 15_Jan_2026_34201528.svp；UUID→`<uuid>`、长路径→`<path>…`）

```json
{
  "name": "未命名音轨 1",
  "dispColor": "ff4794cb",
  "dispOrder": 1,
  "renderEnabled": false,
  "mixer": {
    "gainDecibel": 0,
    "pan": 0,
    "mute": true,
    "solo": false,
    "display": true
  },
  "mainGroup": {
    "name": "main",
    "uuid": "<uuid>",
    "parameters": {
      "pitchDelta": {
        "mode": "cubic",
        "points": []
      },
      "vibratoEnv": {
        "mode": "cubic",
        "points": []
      },
      "loudness": {
        "mode": "cubic",
        "points": []
      },
      "tension": {
        "mode": "cubic",
        "points": []
      },
      "breathiness": {
        "mode": "cubic",
        "points": []
      },
      "voicing": {
        "mode": "cubic",
        "points": []
      },
      "gender": {
        "mode": "cubic",
        "points": []
      },
      "toneShift": {
        "mode": "cubic",
        "points": []
      }
    },
    "vocalModes": {},
    "notes": []
  },
  "mainRef": {
    "groupID": "<uuid>",
    "blickAbsoluteBegin": 0,
    "blickAbsoluteEnd": -1,
    "blickOffset": 0,
    "pitchOffset": 0,
    "isInstrumental": true,
    "systemPitchDelta": {
      "mode": "cubic",
      "points": []
    },
    "audio": {
      "filename": "<path>ts/billievocal.wav",
      "duration": 382.4198639455782
    },
    "database": {
      "name": "",
      "language": "",
      "phoneset": "",
      "languageOverride": "",
      "phonesetOverride": "",
      "backendType": "",
      "version": "-2"
    },
    "dictionary": "",
    "voice": {
      "vocalModeInherited": true,
      "vocalModePreset": "",
      "vocalModeParams": {}
    },
    "pitchTakes": {
      "activeTakeId": 0,
      "takes": [
        {
          "id": 0,
          "expr": 0,
          "liked": false
        }
      ]
    },
    "timbreTakes": {
      "activeTakeId": 0,
      "takes": [
        {
          "id": 0,
          "expr": 0,
          "liked": false
        }
      ]
    }
  },
  "groups": []
}
```

## 音频轨完整样本 3（来自 27_Feb_2026_c1bfe515.svp；UUID→`<uuid>`、长路径→`<path>…`）

```json
{
  "name": "未命名音轨",
  "dispColor": "ff9153d4",
  "dispOrder": 5,
  "renderEnabled": false,
  "mixer": {
    "gainDecibel": 0,
    "pan": 0,
    "mute": false,
    "solo": false,
    "display": true
  },
  "mainGroup": {
    "name": "main",
    "uuid": "<uuid>",
    "parameters": {
      "pitchDelta": {
        "mode": "cubic",
        "points": []
      },
      "vibratoEnv": {
        "mode": "cubic",
        "points": []
      },
      "loudness": {
        "mode": "cubic",
        "points": []
      },
      "tension": {
        "mode": "cubic",
        "points": []
      },
      "breathiness": {
        "mode": "cubic",
        "points": []
      },
      "voicing": {
        "mode": "cubic",
        "points": []
      },
      "gender": {
        "mode": "cubic",
        "points": []
      },
      "toneShift": {
        "mode": "cubic",
        "points": []
      }
    },
    "vocalModes": {},
    "notes": []
  },
  "mainRef": {
    "groupID": "<uuid>",
    "blickAbsoluteBegin": -352800000,
    "blickAbsoluteEnd": -1,
    "blickOffset": -352800000,
    "pitchOffset": 0,
    "isInstrumental": true,
    "systemPitchDelta": {
      "mode": "cubic",
      "points": []
    },
    "audio": {
      "filename": "<path> 花/藤井风 花/花-人声.flac",
      "duration": 246.6999092970522
    },
    "database": {
      "name": "",
      "language": "",
      "phoneset": "",
      "languageOverride": "",
      "phonesetOverride": "",
      "backendType": "",
      "version": "-2"
    },
    "dictionary": "",
    "voice": {
      "vocalModeInherited": true,
      "vocalModePreset": "",
      "vocalModeParams": {}
    },
    "pitchTakes": {
      "activeTakeId": 0,
      "takes": [
        {
          "id": 0,
          "expr": 0,
          "liked": false
        }
      ]
    },
    "timbreTakes": {
      "activeTakeId": 0,
      "takes": [
        {
          "id": 0,
          "expr": 0,
          "liked": false
        }
      ]
    }
  },
  "groups": []
}
```