# Note

Extends

- ScriptableNestedObject

Methods

### clearScriptData ()

Inherited From: ScriptableNestedObject#clearScriptData

Remove all script data from the object's storage. Note: use with caution as this could also remove data created by other scripts.

### clone () → { Note }

A deep copy of the current object.

**Returns::**

Type Note

### getAttributes () → {object}


Get an object holding note properties. The object has the following properties. rTone : number rap - tone (since 1.9.0b2) rIntonation : number rap - intonation (since 1.9.0b2) dF0VbrMod : number pitch - vibrato modulation (since 1.9.0b2) expValueX : number expression pad parameter X (since 2.1.1) expValueY : number expression pad parameter Y (since 2.1.1) phonemes : array of objects for per-phoneme attributes (since 2.1.1) leftOffset : number offset added to the phoneme's left boundary position : number the phoneme's position activity : number phoneme activity strength : number phoneme pronunciation strength muted : boolean whether the note is muted (since 2.1.1) evenSyllableDuration : boolean whether to split the note evenly when there are multiple syllables (since 2.1.1) languageOverride : string override the group's language setting for this note (since 2.1.1) phonesetOverride : string override the group's phoneset setting for this note (since 2.1.1) Properties only available in version 1: tF0Offset : number pitch transition - offset (seconds) tF0Left : number pitch transition - duration left (seconds) tF0Right : number pitch transition - duration right (seconds) dF0Left : number pitch transition - depth left (semitones) dF0Right : number pitch transition - depth right (semitones) tF0VbrStart : number vibrato - start (seconds) tF0VbrLeft : number vibrato - left (seconds) tF0VbrRight : number vibrato - right (seconds) dF0Vbr : number vibrato - depth (semitones) pF0Vbr : number vibrato - phase (radian, from -π to π) fF0Vbr : number vibrato - frequency (Hz) tNoteOffset : number timing and phonemes - note offset (seconds) exprGroup (optional): string expression group dur : array of number for phoneme duration scaling alt : array of number for phoneme alternative pronunciation For numeric properties, the value is NaN if the note uses the default value based on the NoteGroupReference it is in.

**Returns::**

Type object

### getDetune () → {number}

Get the pitch adjustment in cents. 100 cents equals one semitone. This adjustment is applied on top of the base pitch of the note. (supported since 2.1.1)

**Returns::**

Type number

### getDuration () → {number}

Get the duration of the note. The unit is blicks.

**Returns::**

Type number

### getEnd () → {number}

Get the end position (start + duration) of the note. The unit is blicks.

**Returns::**

Type number

### getIndexInParent () → {number}

Inherited From: NestedObject#getIndexInParent

Get index of the current object in its parent. In Lua, this index starts from 1. In JavaScript, this index starts from 0.

**Returns::**

Type number

### getLanguageOverride () → {string}

Get the note-specific language. This returns empty when the note is using the group/track's default language. (supported since 1.9.0b2)

**Returns::**

Type string

### getLyrics () → {string}

Get the lyrics for this note.

**Returns::**

Type string

### getMusicalType () → {string}

Get the type of the note ("sing" or "rap"). (supported since 1.9.0b2)

**Returns::**

Type string

### getOnset () → {number}

Get the start position of the note. The unit is blicks.

**Returns::**

Type number

### getParent () → { NestedObject |undefined}

Inherited From: NestedObject#getParent

Get the parent NestedObject . Return undefined if the current object is not attached to a parent.

**Returns::**

Type NestedObject | undefined

### getPhonemes () → {string}

Returns the user-specified phonemes, delimited by spaces. For example, "hh ah ll ow". If there's no phoneme specified, this will return an empty string, instead of the default pronunciation (see SV#getPhonemesForGroup ).

**Returns::**

Type string

### getPitch () → {number}

Get the pitch as a MIDI number. C4 maps to 60.

**Returns::**

Type number

### getPitchAutoMode () → {boolean}

Get the pitch mode of the note: true for auto, false for manual. (supported since 1.9.0b2)

**Returns::**

Type boolean

### getRapAccent () → {string}

Get the accent (if available) for a rap note. (supported since 1.9.0b2)

**Returns::**

Type string

### getRetakes () → { RetakeList }

Get the retake list for this note. Retakes allow generating different rendering variations for the same note by using different seeds for duration, pitch, and timbre parameters. (supported since 2.1.1)

**Returns::**

Type RetakeList

### getScriptData (key) → {any}

Inherited From: ScriptableNestedObject#getScriptData

Retrieve a value from the object's script data storage by key. Returns undefined if the key does not exist.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to retrieve the value for |

**Returns::**

The stored value, or undefined if key doesn't exist

Type any

### getScriptDataKeys () → {Array.<string>}

Inherited From: ScriptableNestedObject#getScriptDataKeys

Get all keys currently stored in the object's script data storage.

**Returns::**

Array of all stored keys

Type Array.<string>

### hasScriptData (key) → {boolean}

Inherited From: ScriptableNestedObject#hasScriptData

Check whether a key exists in the object's script data storage.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to check for |

**Returns::**

true if the key exists, false otherwise

Type boolean

### isMemoryManaged () → {boolean}

Inherited From: NestedObject#isMemoryManaged

Check whether or not the current object is memory managed (i.e. garbage collected by the script environment).

**Returns::**

Type boolean

### removeScriptData (key)

Inherited From: ScriptableNestedObject#removeScriptData

Remove a key-value pair from the object's script data storage.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to remove |

### setAttributes (object)

Set note properties based on an attribute object. The attribute object does not have to be complete; only the given properties will be updated. For example, note.setAttributes({ "dF0VbrMod" : 0.2, "phonemes" : [ { "leftOffset": -0.1, "position": 0.5, "strength": 0.8 }, { "leftOffset": 0.05, "position": 0.7, "activity": 0.9 } ] });

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| object | attributes | For the definition, see Note#getAttributes . |

### setDetune (detune)

Set the pitch adjustment in cents. 100 cents equals one semitone. This adjustment is applied on top of the base pitch of the note. (supported since 2.1.1)

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| detune | number | The pitch adjustment in cents |

### setDuration (t)

Resize the note to duration t . The unit is blicks. This changes the end as well, but not the onset.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| t | number |  |

### setLanguageOverride (language)

Set the language for the note to override the track/group level language settings. Available options : "mandarin", "japanese", "english", "cantonese" (supported since 1.9.0b2)

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| language | string |  |

### setLyrics (lyrics)

Change the lyrics.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| lyrics | string |  |

### setMusicalType (type)

Set the note type ("sing" or "rap"). (supported since 1.9.0b2)

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| type | string |  |

### setOnset (t)

Move the note to start at t . The unit is blicks. This does not change the duration.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| t | number |  |

### setPhonemes (phoneme_str)

Change the phonemes to phoneme_str . For example, "hh ah ll ow".

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| phoneme_str | string | A space-delimited list of phonemes. |

### setPitch (pitchNumber)

Set the note pitch to pitchNumber , a MIDI number.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| pitchNumber | number |  |

### setPitchAutoMode (isAuto)

Set whether the note has auto pitch mode (true) or manual pitch mode (false). (supported since 1.9.0b2)

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| isAuto | boolean |  |

### setRapAccent (accent)

Set the accent for rap notes. Note that rap accent is only used in Mandarin Chinese where there are five accent types (1, 2, 3, 4, 5). (supported since 1.9.0b2)

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| accent | string |  |

### setScriptData (key, value)

Inherited From: ScriptableNestedObject#setScriptData

Store a value with the specified key in the object's script data storage. The value must be JSON-serializable.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to store the value under |
| value | any | The value to store (must be JSON-serializable) |

### setTimeRange (onset, duration)

Set both onset and duration. This is a shorthand for calling setOnset(onset) and setDuration(duration) .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| onset | number |  |
| duration | number |  |
