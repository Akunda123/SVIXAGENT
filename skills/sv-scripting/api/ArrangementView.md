# ArrangementView

Extends

- NestedObject

Methods

### getIndexInParent () → {number}

Inherited From: NestedObject#getIndexInParent

Get index of the current object in its parent. In Lua, this index starts from 1. In JavaScript, this index starts from 0.

**Returns::**

Type number

### getNavigation () → { CoordinateSystem }

Get the coordinate system for the track arrangement area.

**Returns::**

Type CoordinateSystem

### getParent () → { NestedObject |undefined}

Inherited From: NestedObject#getParent

Get the parent NestedObject . Return undefined if the current object is not attached to a parent.

**Returns::**

Type NestedObject | undefined

### getSelection () → { ArrangementSelectionState }

Get the selection state object for arrangement view.

**Returns::**

Type ArrangementSelectionState

### isMemoryManaged () → {boolean}

Inherited From: NestedObject#isMemoryManaged

Check whether or not the current object is memory managed (i.e. garbage collected by the script environment).

**Returns::**

Type boolean
