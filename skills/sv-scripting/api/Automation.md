# Automation

Extends

- ScriptableNestedObject

Methods

### add (b, v) → {boolean}

Add a control point with position b (blicks) and parameter value v . If there is already a point on b , the parameter value will get updated to v . Return true if a new point has been created.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |
| v | number |  |

**Returns::**

Type boolean

### clearScriptData ()

Inherited From: ScriptableNestedObject#clearScriptData

Remove all script data from the object's storage. Note: use with caution as this could also remove data created by other scripts.

### clone () → { Automation }

A deep copy of the current object.

**Returns::**

Type Automation

### get (b) → {number}

Get the interpolated parameter value at position b (blicks). If a point exists at b , the interpolation is guaranteed to return the value for the point, whatever the interpolation method is.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |

**Returns::**

Type number

### getAllPoints () → {array}

A version of Automation#getPoints with unlimited range.

**Returns::**

an array of array of number

Type array

### getDefinition () → {object}

Get a definition object with the following properties, displayName : string typeName : string range : length-2 array of number defaultValue : number displayName typeName range units/parameter value meaning defaultValue "Pitch Deviation" "pitchDelta" -1200, 1200 cents 0 "Vibrato Envelope" "vibratoEnv" 0, 2 x 1 "Loudness" "loudness" -48, 12 dB 0 "Tension" "tension" -1.0, 1.0 Tense <-> Relaxed 0 "Breathiness" "breathiness" -1.0, 1.0 Breathy <-> Clean 0 "Voicing" "voicing" 0.0, 1.0 Voiced <-> Unvoiced 1 "Gender" "gender" -1.0, 1.0 Masculine <-> Feminine 0 Vocal Mode "vocalMode_Name" 0, 150 0

**Returns::**

Type object

### getIndexInParent () → {number}

Inherited From: NestedObject#getIndexInParent

Get index of the current object in its parent. In Lua, this index starts from 1. In JavaScript, this index starts from 0.

**Returns::**

Type number

### getInterpolationMethod () → {string}

Returns how values between control points are interpolated: "Linear" - linear interpolation "Cosine" - cosine interpolation "Cubic" - modified Catmull-Rom spline interpolation

**Returns::**

Type string

### getLinear (b) → {number}

A version of Automation#get that uses linear interpolation (even if Automation#getInterpolationMethod is not "Linear").

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |

**Returns::**

Type number

### getParent () → { NestedObject |undefined}

Inherited From: NestedObject#getParent

Get the parent NestedObject . Return undefined if the current object is not attached to a parent.

**Returns::**

Type NestedObject | undefined

### getPoints (begin, end) → {array}

Get an array of control points whose positions are between begin and end (blicks). Each element in the array is an array of two elements: a number for the position (blicks) and a number for the parameter value. For example, [[0, 0.1], [5000, 0], [10000, -0.1]] .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| begin | number |  |
| end | number |  |

**Returns::**

an array of array of number

Type array

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

### getType () → {string}

Get the parameter type for this Automation . See the typeName column of the table in Automation#getDefinition .

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

### remove (b) → {boolean}

Remove the control point at position b (blicks) if there is one. Return true if any point has been removed.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |

**Returns::**

Type boolean

### remove (begin, end) → {boolean}

Remove all control points between position begin (blicks) and end (blicks). Return true if any point has been removed; return false if there's no point in the specified range.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| begin | number |  |
| end | number |  |

**Returns::**

Type boolean

### removeAll ()

Remove all control points in the Automation .

### removeScriptData (key)

Inherited From: ScriptableNestedObject#removeScriptData

Remove a key-value pair from the object's script data storage.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to remove |

### setScriptData (key, value)

Inherited From: ScriptableNestedObject#setScriptData

Store a value with the specified key in the object's script data storage. The value must be JSON-serializable.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| key | string | The key to store the value under |
| value | any | The value to store (must be JSON-serializable) |

### simplify (begin, end, threshold) → {boolean}

Simplify the parameter curve from position begin (blicks) to position end (blicks) by removing control points that do not significantly contribute to the curve's shape. If threshold is not provided, it will be set to 0.002. Higher values of threshold will result in more simplification. Return true if any point has been removed.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| begin | number |  |
| end | number |  |
| threshold | number | (optional) |

**Returns::**

Type boolean
