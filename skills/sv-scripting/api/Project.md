# Project

Extends

- ScriptableNestedObject

Methods

### addNoteGroup (group, suggestedIndex) → {number}

Insert a NoteGroup to the project library at suggestedIndex . If suggestedIndex is not given, the NoteGroup is added at the end. Return the index of the added NoteGroup .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| group | NoteGroup |  |
| suggestedIndex | number | (optional) |

**Returns::**

Type number

### addTrack (track) → {number}

Add a Track to the Project . Return the index of the added Track .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| track | Track |  |

**Returns::**

Type number

### clearScriptData ()

Inherited From: ScriptableNestedObject#clearScriptData

Remove all script data from the object's storage. Note: use with caution as this could also remove data created by other scripts.

### getDuration () → {number}

Get the duration of the Project (blicks), defined as the duration of the longest Track .

**Returns::**

Type number

### getFileName () → {string}

Get the absolute path of the project on the file system.

**Returns::**

Type string

### getIndexInParent () → {number}

Inherited From: NestedObject#getIndexInParent

Get index of the current object in its parent. In Lua, this index starts from 1. In JavaScript, this index starts from 0.

**Returns::**

Type number

### getNoteGroup (id) → { NoteGroup |undefined}

If id is a number, get the id -th NoteGroup in the project library. If id is a string, look for a NoteGroup in the project library with id as its UUID; return undefined if no such NoteGroup exists.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| id | number | string |  |

**Returns::**

Type NoteGroup | undefined

### getNumNoteGroupsInLibrary () → {number}

Get the number of NoteGroup in the project library. It does not count the main groups and is unrelated to the number of NoteGroupReference .

**Returns::**

Type number

### getNumTracks () → {number}

Get the number of tracks.

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

### getTimeAxis () → { TimeAxis }

Get the TimeAxis object of this Project .

**Returns::**

Type TimeAxis

### getTrack (index) → { Track }

Get the index -th Track . The indexing is based on the storage order rather than display order.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| index | number |  |

**Returns::**

Type Track

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

### newUndoRecord ()

Add a new undo record for this Project . This means that all edits following the last undo record will be undone/redone together when the users press Ctrl + Z or Ctrl + Y . A new undo record is automatically added to the currently open project at the beginning of script execution.

### removeNoteGroup (index)

Remove index -th NoteGroup from the project library. This also removes all NoteGroupReference that refer to the NoteGroup .

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

### removeTrack (index)

Remove the index -th Track from the Project .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| index | number |  |

### setScriptData (key, value)

Inherited From: ScriptableNestedObject#setScriptData

Store a value with the specified key in the object's script data storage. The value must be JSON-serializable.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to store the value under |
| value | any | The value to store (must be JSON-serializable) |
