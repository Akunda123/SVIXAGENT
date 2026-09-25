# GroupSelection

Methods

### clearGroups () → {boolean}

Unselect all NoteGroupReference . Return true if the selection has changed.

**Returns::**

Type boolean

### getSelectedGroups () → {array}

Get an array of selected NoteGroupReference following the order of selection.

**Returns::**

an array of NoteGroupReference

Type array

### hasSelectedGroups () → {boolean}

Check if there is at least one NoteGroupReference selected.

**Returns::**

Type boolean

### selectGroup (reference)

Add a NoteGroupReference to the selection. The argument must be part of the currently open project.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| reference | NoteGroupReference |  |

### unselectGroup (reference) → {boolean}

Unselect a NoteGroupReference . Return true if the selection has changed.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| reference | NoteGroupReference |  |

**Returns::**

Type boolean
