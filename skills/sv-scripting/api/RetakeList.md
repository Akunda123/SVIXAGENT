# RetakeList

Extends

- ScriptableNestedObject

Methods

### clearScriptData ()

Inherited From: ScriptableNestedObject#clearScriptData

Remove all script data from the object's storage. Note: use with caution as this could also remove data created by other scripts.

### deleteTake (takeId)

Delete a retake by its ID. Note: The default retake (ID 0) cannot be deleted.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| takeId | number | the ID of the retake to delete |

### generateTake (newDuration, newPitch, newTimbre) → {number}

Generate a new retake with the specified variation parameters. Returns the ID of the newly generated retake.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| newDuration | boolean | whether to generate new duration variation |
| newPitch | boolean | whether to generate new pitch variation |
| newTimbre | boolean | whether to generate new timbre variation |

**Returns::**

the ID of the newly generated retake

Type number

### getIndexInParent () → {number}

Inherited From: NestedObject#getIndexInParent

Get index of the current object in its parent. In Lua, this index starts from 1. In JavaScript, this index starts from 0.

**Returns::**

Type number

### getNumTakes () → {number}

Get the number of retakes in this list.

**Returns::**

number of retakes

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

### removeScriptData (key)

Inherited From: ScriptableNestedObject#removeScriptData

Remove a key-value pair from the object's script data storage.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to remove |

### setActiveTake (takeId)

Set the active retake by its ID. The active retake determines which variation is used for rendering.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| takeId | number | the ID of the retake to set as active |

### setScriptData (key, value)

Inherited From: ScriptableNestedObject#setScriptData

Store a value with the specified key in the object's script data storage. The value must be JSON-serializable.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to store the value under |
| value | any | The value to store (must be JSON-serializable) |
