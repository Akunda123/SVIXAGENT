# Track

Extends

- ScriptableNestedObject

Methods

### addGroupReference (group) → {number}

Add a NoteGroupReference to this Track and return the index of the added group. It keeps all groups sorted by onset position.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| group | NoteGroupReference |  |

**Returns::**

Type number

### clearScriptData ()

Inherited From: ScriptableNestedObject#clearScriptData

Remove all script data from the object's storage. Note: use with caution as this could also remove data created by other scripts.

### clone () → { Track }

A deep copy of the current object.

**Returns::**

Type Track

### getDisplayColor () → {string}

Get the track's color as a hex string.

**Returns::**

Type string

### getDisplayOrder () → {number}

Get the display order of the track inside the parent Project . A track's display order can be different from its storage index. The order of tracks as displayed in arrangement view is always based on the display order.

**Returns::**

Type number

### getDuration () → {number}

Get the duration of the Track in blicks, defined as the ending position of the last NoteGroupReference .

**Returns::**

Type number

### getGroupReference (index) → { NoteGroupReference }

Get the index -th NoteGroupReference . The first is always the main group, followed by groups that refer to NoteGroup in the project library. The groups are sorted in ascending onset positions.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| index | number |  |

**Returns::**

Type NoteGroupReference

### getIndexInParent () → {number}

Inherited From: NestedObject#getIndexInParent

Get index of the current object in its parent. In Lua, this index starts from 1. In JavaScript, this index starts from 0.

**Returns::**

Type number

### getMixer () → { TrackMixer }

Get the track's mixer. The mixer allows you to adjust gain, pan, mute, and solo settings for the track. (supported since 2.1.1)

**Returns::**

Type TrackMixer

### getName () → {string}

Get the track name.

**Returns::**

Type string

### getNumGroups () → {number}

Get the number of NoteGroupReference in this Track , including the main group.

**Returns::**

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

### isBounced () → {boolean}

An option for whether or not to be exported to files, shown in Render Panel.

**Returns::**

Type boolean

### isMemoryManaged () → {boolean}

Inherited From: NestedObject#isMemoryManaged

Check whether or not the current object is memory managed (i.e. garbage collected by the script environment).

**Returns::**

Type boolean

### removeGroupReference (index)

Remove the index -th NoteGroupReference from this Track .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| index | number |  |

### removeScriptData (key)

Inherited From: ScriptableNestedObject#removeScriptData

Remove a key-value pair from the object's script data storage.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to remove |

### setBounced (enabled)

Set whether or not to have the Track exported to files. See Track#isBounced .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| enabled | boolean |  |

### setDisplayColor (colorStr)

Set the display color of the Track to a hex string.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| colorStr | string |  |

### setName (name)

Set the name of the Track .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| name | string |  |

### setScriptData (key, value)

Inherited From: ScriptableNestedObject#setScriptData

Store a value with the specified key in the object's script data storage. The value must be JSON-serializable.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to store the value under |
| value | any | The value to store (must be JSON-serializable) |
