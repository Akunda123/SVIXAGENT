# PitchControlCurve

Extends

- ScriptableNestedObject

Methods

### clearScriptData ()

Inherited From: ScriptableNestedObject#clearScriptData

Remove all script data from the object's storage. Note: use with caution as this could also remove data created by other scripts.

### clone () → { PitchControlCurve }

A deep copy of the current object.

**Returns::**

Type PitchControlCurve

### getIndexInParent () → {number}

Inherited From: NestedObject#getIndexInParent

Get index of the current object in its parent. In Lua, this index starts from 1. In JavaScript, this index starts from 0.

**Returns::**

Type number

### getParent () → { NestedObject |undefined}

Inherited From: NestedObject#getParent

Get the parent NestedObject . Return undefined if the current object is not attached to a parent.

**Returns::**

Type NestedObject | undefined

### getPitch () → {number}

Get the anchor pitch value of this pitch control curve in semitones relative to the pitch offset of the note group.

**Returns::**

pitch in semitones

Type number

### getPoints () → {Array.<Array.<number>>}

Get all control points of this pitch control curve. Returns an array of [time, value] pairs where time is in blicks relative to the curve's anchor position and value is the pitch offset from the anchor position in semitones.

**Returns::**

array of [time, value] pairs

Type Array.<Array.<number>>

### getPosition () → {number}

Get the anchor position of this pitch control curve relative to the time offset of the note group (in blicks).

**Returns::**

position in blicks

Type number

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

### getValueAt (time) → {number}

Get the interpolated pitch value at a specific time position. Returns the pitch offset in semitones at the given time, interpolated from the curve's control points.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| time | number | time in blicks relative to the curve's position |

**Returns::**

pitch offset in semitones

Type number

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

### setPitch (pitch)

Set the anchor pitch value of this pitch control curve.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| pitch | number | pitch in semitones |

### setPoints (points)

Set all control points of this pitch control curve. Each point should be an array of [time, value] where time is in blicks relative to the curve's anchor position and value is the pitch offset from the anchor position in semitones.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| points | Array.<Array.<number>> | array of [time, value] pairs |

### setPosition (position)

Set the anchor position of this pitch control curve.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| position | number | position in blicks |

### setScriptData (key, value)

Inherited From: ScriptableNestedObject#setScriptData

Store a value with the specified key in the object's script data storage. The value must be JSON-serializable.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to store the value under |
| value | any | The value to store (must be JSON-serializable) |
