# TimeAxis

Extends

- ScriptableNestedObject

Methods

### addMeasureMark (measure, nomin, denom)

Insert a nomin / denom measure mark at position measure (a measure number). If a measure mark exists at measure , update the information.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| measure | number |  |
| nomin | number |  |
| denom | number |  |

### addTempoMark (b, bpm)

Insert a tempo mark with beats per minute of bpm at position b (blicks). If a tempo mark exists at position b , update the BPM.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |
| bpm | number |  |

### clearScriptData ()

Inherited From: ScriptableNestedObject#clearScriptData

Remove all script data from the object's storage. Note: use with caution as this could also remove data created by other scripts.

### clone () → { TimeAxis }

A deep copy of the current object.

**Returns::**

Type TimeAxis

### getAllMeasureMarks () → {array}

Get all measure marks in this TimeAxis . See TimeAxis#getMeasureMarkAt .

**Returns::**

an array of object

Type array

### getAllTempoMarks () → {array}

Get all tempo marks in this TimeAxis . See TimeAxis#getTempoMarkAt .

**Returns::**

an array of object

Type array

### getBlickFromSeconds (t) → {number}

Convert physical time t (second) to musical time (blicks).

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| t | number |  |

**Returns::**

Type number

### getIndexInParent () → {number}

Inherited From: NestedObject#getIndexInParent

Get index of the current object in its parent. In Lua, this index starts from 1. In JavaScript, this index starts from 0.

**Returns::**

Type number

### getMeasureAt (b) → {number}

Get the measure number at position b (blicks).

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |

**Returns::**

Type number

### getMeasureMarkAt (measureNumber) → {object}

Get the measure mark at measure measureNumber . The returned object contains the following properties. position : number the measure number at where the mark is placed positionBlick : number the position of the mark in blicks numerator : number the numerator (e.g. 3 if it's a 3/4 time signature) denominator : number the denominator (e.g. 4 if it's a 3/4 time signature)

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| measureNumber | number |  |

**Returns::**

Type object

### getMeasureMarkAtBlick (b) → {object}

Get the measure mark that is effective at position b (blicks). For the returned object, see TimeAxis#getMeasureMarkAt .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |

**Returns::**

Type object

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

### getSecondsFromBlick (b) → {number}

Convert musical time b (blicks) to physical time (seconds).

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |

**Returns::**

Type number

### getTempoMarkAt (b) → {TempoMark}

Get the tempo mark that is effective at position b (blicks). The returned object contains the following properties. position : number the position of the tempo mark in blicks positionSeconds : number the position of the tempo mark in seconds bpm : number beats per minute value that is effective between this tempo mark and the next tempo mark

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |

**Returns::**

Type TempoMark

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

### removeMeasureMark (measure) → {boolean}

Remove the measure mark at measure number measure . If a measure mark exists at measure , return true.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| measure | number |  |

**Returns::**

Type boolean

### removeScriptData (key)

Inherited From: ScriptableNestedObject#removeScriptData

Remove a key-value pair from the object's script data storage.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to remove |

### removeTempoMark (b) → {boolean}

Remove the tempo mark at position b (blicks). If a tempo mark exists at position b , return true.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |

**Returns::**

Type boolean

### setScriptData (key, value)

Inherited From: ScriptableNestedObject#setScriptData

Store a value with the specified key in the object's script data storage. The value must be JSON-serializable.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to store the value under |
| value | any | The value to store (must be JSON-serializable) |
