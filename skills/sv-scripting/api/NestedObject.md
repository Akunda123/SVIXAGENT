# NestedObject

Methods

### getIndexInParent () → {number}

Get index of the current object in its parent. In Lua, this index starts from 1. In JavaScript, this index starts from 0.

**Returns::**

Type number

### getParent () → { NestedObject |undefined}

Get the parent NestedObject . Return undefined if the current object is not attached to a parent.

**Returns::**

Type NestedObject | undefined

### isMemoryManaged () → {boolean}

Check whether or not the current object is memory managed (i.e. garbage collected by the script environment).

**Returns::**

Type boolean
