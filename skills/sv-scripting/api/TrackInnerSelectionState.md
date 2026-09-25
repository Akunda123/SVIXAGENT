# TrackInnerSelectionState

Extends

- NestedObject
- SelectionStateBase
- GroupSelection

Methods

### clearAll () → {boolean}

Inherited From: SelectionStateBase#clearAll

Unselects all object types supported by this selection state. Return true if the selection has changed.

**Returns::**

Type boolean

### clearGroups () → {boolean}

Inherited From: GroupSelection#clearGroups

Unselect all NoteGroupReference . Return true if the selection has changed.

**Returns::**

Type boolean

### clearNotes () → {boolean}

Unselect all notes. Return true if the selection has changed.

**Returns::**

Type boolean

### clearPitchControls () → {boolean}

Clear all pitch control selections. (supported since 2.1.2)

**Returns::**

Type boolean

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

### getSelectedGroups () → {array}

Inherited From: GroupSelection#getSelectedGroups

Get an array of selected NoteGroupReference following the order of selection.

**Returns::**

an array of NoteGroupReference

Type array

### getSelectedNotes () → {array}

Get an array of selected Note following the order of selection.

**Returns::**

An array of Note

Type array

### getSelectedPitchControls () → {array}

Get an array of selected pitch control objects. (supported since 2.1.2)

**Returns::**

An array of PitchControlPoint or PitchControlCurve

Type array

### getSelectedPoints (parameterType) → {array}

Get an array of selected automation points for the specified parameter type. To get the values of the selected automation points, feed the returned positions to Automation#get .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| parameterType | string | The parameter type (e.g., "pitchDelta", "loudness", etc.) |

**Returns::**

An array of Blick positions

Type array

### hasSelectedContent () → {boolean}

Inherited From: SelectionStateBase#hasSelectedContent

Check if there's anything selected.

**Returns::**

Type boolean

### hasSelectedGroups () → {boolean}

Inherited From: GroupSelection#hasSelectedGroups

Check if there is at least one NoteGroupReference selected.

**Returns::**

Type boolean

### hasSelectedNotes () → {boolean}

Check if there is at least one Note selected.

**Returns::**

Type boolean

### hasSelectedPitchControls () → {boolean}

Check if there are any selected pitch control objects. (supported since 2.1.2)

**Returns::**

Type boolean

### hasUnfinishedEdits () → {boolean}

Inherited From: SelectionStateBase#hasUnfinishedEdits

Check if there's any unfinished edit on the selected objects. For example, this will return true if the user is dragging around a few notes/control points but has not yet released the mouse.

**Returns::**

Type boolean

### isMemoryManaged () → {boolean}

Inherited From: NestedObject#isMemoryManaged

Check whether or not the current object is memory managed (i.e. garbage collected by the script environment).

**Returns::**

Type boolean

### registerClearCallback (callback)

Inherited From: SelectionStateBase#registerClearCallback

Attach a script function to be called when the selection is cleared. The callback function will receive one argument: the type of the cleared objects. Note: Registering a new callback function will NOT override existing callbacks. To prevent callbacks from slowing down the application, multiple clear events will be coalesced and handled asynchronously. There is no guarantee that the cleared selection will stay empty by the time the callback is executed.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| callback | function |  |

### registerSelectionCallback (callback)

Inherited From: SelectionStateBase#registerSelectionCallback

Attach a script function to be called when objects are selected or deselected by the user. The callback function will receive two arguments: the type of the selected objects and whether this is a selection or deselection operation. Note: Registering a new callback function will NOT override existing callbacks. To prevent callbacks from slowing down the application, multiple selection/deselection events will be coalesced and handled asynchronously. There is no guarantee that objects selected will stay selected by the time the callback is executed.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| callback | function |  |

### selectGroup (reference)

Inherited From: GroupSelection#selectGroup

Add a NoteGroupReference to the selection. The argument must be part of the currently open project.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| reference | NoteGroupReference |  |

### selectNote (note)

Select a Note . The note must be inside the current NoteGroupReference opened in the piano roll (see MainEditorView#getCurrentGroup ).

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| note | Note |  |

### selectPitchControls (controls)

Select pitch control objects. (supported since 2.1.2)

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| controls | array | Array of PitchControlPoint or PitchControlCurve objects |

### selectPoints (parameterType, positions)

Select automation points for the specified parameter type.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| parameterType | string | The parameter type |
| positions | array | Array of Blick positions to select |

### unselectGroup (reference) → {boolean}

Inherited From: GroupSelection#unselectGroup

Unselect a NoteGroupReference . Return true if the selection has changed.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| reference | NoteGroupReference |  |

**Returns::**

Type boolean

### unselectNote (note) → {boolean}

Unselect a Note . Return true if the selection has changed.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| note | Note |  |

**Returns::**

Type boolean

### unselectPitchControls (controls)

Unselect pitch control objects. (supported since 2.1.2)

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| controls | array | Array of PitchControlPoint or PitchControlCurve objects |

### unselectPoints (parameterType, positions)

Unselect automation points for the specified parameter type.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| parameterType | string | The parameter type |
| positions | array | Array of Blick positions to unselect |
