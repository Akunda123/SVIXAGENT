# CoordinateSystem

Extends

- NestedObject

Methods

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

### getTimePxPerUnit () → {number}

Get the scaling factor in the horizontal direction. The unit is pixels per blick so expect this to be a very small number.

**Returns::**

Type number

### getTimeViewRange () → {array}

Get the current visible time range. It returns an array with two number elements corresponding to the starting time and ending time. The time unit is blicks.

**Returns::**

an array of number

Type array

### getValuePxPerUnit () → {number}

Get the scaling factor in the vertical direction. For the piano roll, the unit is pixels per semitone.

**Returns::**

Type number

### getValueViewRange () → {array}

Get the current visible value range. It returns an array with two number elements corresponding to the lower value and upper value. For the piano roll, the unit is MIDI number (semitones); for arrangement view, its value bears no meaning.

**Returns::**

an array of number

Type array

### isMemoryManaged () → {boolean}

Inherited From: NestedObject#isMemoryManaged

Check whether or not the current object is memory managed (i.e. garbage collected by the script environment).

**Returns::**

Type boolean

### setTimeLeft (time)

Move the visible area so the left end is at time .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| time | number |  |

### setTimeRight (time)

Move the visible area so the right end is at time .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| time | number |  |

### setTimeScale (scale)

Set the horizontal scaling factor to scale . The unit is pixels per blick so it expects a very small number.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| scale | number |  |

### setValueCenter (v)

Move the visible area so the vertical center is at v .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| v | number |  |

### snap (b) → {number}

Round a time position b based on snapping settings.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |

**Returns::**

Type number

### t2x (t) → {number}

Convert a time position to an x-position (pixels).

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| t | number |  |

**Returns::**

Type number

### v2y (v) → {number}

Convert a value to a y-position (pixels).

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| v | number |  |

**Returns::**

Type number

### x2t (x) → {number}

Convert an x-position (pixels) to a time position.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| x | number |  |

**Returns::**

Type number

### y2v (y) → {number}

Convert a y-position (pixels) to a value.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| y | number |  |

**Returns::**

Type number
