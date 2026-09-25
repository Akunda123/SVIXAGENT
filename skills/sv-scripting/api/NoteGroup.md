# NoteGroup

Extends

- ScriptableNestedObject

Methods

### addNote (note) → {number}

Add a note to this NoteGroup and return the index of the added note. The notes are kept sorted by ascending onset positions.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| note | Note |  |

**Returns::**

Type number

### addPitchControl (pitchControl) → {number}

Add a pitch control object to this NoteGroup and return the index of the added object. The pitch control objects are kept sorted by ascending anchor positions. (supported since 2.1.0)

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| pitchControl | PitchControlPoint | PitchControlCurve |  |

**Returns::**

Type number

### clearScriptData ()

Inherited From: ScriptableNestedObject#clearScriptData

Remove all script data from the object's storage. Note: use with caution as this could also remove data created by other scripts.

### clone () → { NoteGroup }

A deep copy of the current object.

**Returns::**

Type NoteGroup

### getIndexInParent () → {number}

Inherited From: NestedObject#getIndexInParent

Get index of the current object in its parent. In Lua, this index starts from 1. In JavaScript, this index starts from 0.

**Returns::**

Type number

### getName () → {string}

Get the user-specified name of this NoteGroup .

**Returns::**

Type string

### getNote (index) → { Note }

Get the note at index . The notes inside a NoteGroup are always sorted by onset positions.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| index | number |  |

**Returns::**

Type Note

### getNumNotes () → {number}

Get the number of notes in the NoteGroup .

**Returns::**

Type number

### getNumPitchControls () → {number}

Get the number of pitch control objects in the NoteGroup . (supported since 2.1.0)

**Returns::**

Type number

### getParameter (type) → { Automation }

Get the Automation object for parameter type . It is case-insensitive. type should be one of the strings in the typeName column in the table shown in Automation#getDefinition .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| type | string |  |

**Returns::**

Type Automation

### getParent () → { NestedObject |undefined}

Inherited From: NestedObject#getParent

Get the parent NestedObject . Return undefined if the current object is not attached to a parent.

**Returns::**

Type NestedObject | undefined

### getPitchControl (index) → { PitchControlPoint | PitchControlCurve }

Get the pitch control object at index . The pitch control objects inside a NoteGroup are kept sorted by anchor positions. (supported since 2.1.0)

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| index | number |  |

**Returns::**

Type PitchControlPoint | PitchControlCurve

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

### getUUID () → {string}

Get the Universally Unique Identifier. Unlike the name, a UUID is unique across the project and can be used to associate a NoteGroupReference with a NoteGroup . A UUID looks like this: "ab85d637-d80b-4628-9c27-007ea74029af".

**Returns::**

Type string

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

### removeNote (index)

Remove the note at index .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| index | number |  |

### removePitchControl (index)

Remove the pitch control object at index . (supported since 2.1.0)

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

### setName (name)

Set the name of this NoteGroup .

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
