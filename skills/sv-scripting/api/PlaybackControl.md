# PlaybackControl

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

### getPlayhead () → {number}

Get the current playhead position in seconds. To get the position in blicks, use this with the current project's TimeAxis .

**Returns::**

Type number

### getStatus () → {string}

Get the current playback status. It can be one of the following. "playing" "looping" "stopped"

**Returns::**

Type string

### isMemoryManaged () → {boolean}

Inherited From: NestedObject#isMemoryManaged

Check whether or not the current object is memory managed (i.e. garbage collected by the script environment).

**Returns::**

Type boolean

### loop (tBegin, tEnd)

Start looping between tBegin and tEnd in seconds.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| tBegin | number |  |
| tEnd | number |  |

### pause ()

Stop playing but without resetting the playhead.

### play ()

Start playing audio.

### seek (t)

Set the playhead position to t in seconds. If the audio is playing, this does not pause the audio but resumes playing at the new position.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| t | number |  |

### stop ()

Stop playing and reset the playhead to where the playback started.
