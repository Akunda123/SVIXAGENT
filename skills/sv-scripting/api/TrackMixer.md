# TrackMixer

Extends

- ScriptableNestedObject

Methods

### clearScriptData ()

Inherited From: ScriptableNestedObject#clearScriptData

Remove all script data from the object's storage. Note: use with caution as this could also remove data created by other scripts.

### getGainDecibel () → {number}

Get the gain in decibels.

**Returns::**

The gain value in decibels

Type number

### getIndexInParent () → {number}

Inherited From: NestedObject#getIndexInParent

Get index of the current object in its parent. In Lua, this index starts from 1. In JavaScript, this index starts from 0.

**Returns::**

Type number

### getPan () → {number}

Get the pan position.

**Returns::**

The pan position (-1.0 for left, 0.0 for center, 1.0 for right)

Type number

### getParent () → { NestedObject |undefined}

Inherited From: NestedObject#getParent

Get the parent NestedObject . Return undefined if the current object is not attached to a parent.

**Returns::**

Type NestedObject | undefined

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

### isMuted () → {boolean}

Check if the track is muted.

**Returns::**

True if the track is muted, false otherwise

Type boolean

### isSolo () → {boolean}

Check if the track is soloed.

**Returns::**

True if the track is soloed, false otherwise

Type boolean

### removeScriptData (key)

Inherited From: ScriptableNestedObject#removeScriptData

Remove a key-value pair from the object's script data storage.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to remove |

### setGainDecibel (gainDecibel)

Set the gain in decibels.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| gainDecibel | number | The gain value in decibels (between -24.0 and 24.0) |

### setMuted (muted)

Set the mute state of the track.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| muted | boolean | True to mute the track, false to unmute |

### setPan (pan)

Set the pan position.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| pan | number | The pan position (-1.0 for left, 0.0 for center, 1.0 for right) |

### setScriptData (key, value)

Inherited From: ScriptableNestedObject#setScriptData

Store a value with the specified key in the object's script data storage. The value must be JSON-serializable.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to store the value under |
| value | any | The value to store (must be JSON-serializable) |

### setSolo (solo)

Set the solo state of the track.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| solo | boolean | True to solo the track, false to unsolo |
