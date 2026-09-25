# MainEditorView

Extends

- NestedObject

Methods

### getCurrentGroup () → { NoteGroupReference }

Get the current NoteGroupReference that the user is working inside. If the user has not entered a NoteGroupReference , return the main group of the current track.

**Returns::**

Type NoteGroupReference

### getCurrentTrack () → { Track }

Get the current Track opened in the piano roll.

**Returns::**

Type Track

### getIndexInParent () → {number}

Inherited From: NestedObject#getIndexInParent

Get index of the current object in its parent. In Lua, this index starts from 1. In JavaScript, this index starts from 0.

**Returns::**

Type number

### getNavigation () → { CoordinateSystem }

Get the CoordinateSystem of the piano roll.

**Returns::**

Type CoordinateSystem

### getParent () → { NestedObject |undefined}

Inherited From: NestedObject#getParent

Get the parent NestedObject . Return undefined if the current object is not attached to a parent.

**Returns::**

Type NestedObject | undefined

### getSelection () → { TrackInnerSelectionState }

Get the selection state object for the piano roll.

**Returns::**

Type TrackInnerSelectionState

### isMemoryManaged () → {boolean}

Inherited From: NestedObject#isMemoryManaged

Check whether or not the current object is memory managed (i.e. garbage collected by the script environment).

**Returns::**

Type boolean
