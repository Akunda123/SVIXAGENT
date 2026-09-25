# SelectionStateBase

Methods

### clearAll () → {boolean}

Unselects all object types supported by this selection state. Return true if the selection has changed.

**Returns::**

Type boolean

### hasSelectedContent () → {boolean}

Check if there's anything selected.

**Returns::**

Type boolean

### hasUnfinishedEdits () → {boolean}

Check if there's any unfinished edit on the selected objects. For example, this will return true if the user is dragging around a few notes/control points but has not yet released the mouse.

**Returns::**

Type boolean

### registerClearCallback (callback)

Attach a script function to be called when the selection is cleared. The callback function will receive one argument: the type of the cleared objects. Note: Registering a new callback function will NOT override existing callbacks. To prevent callbacks from slowing down the application, multiple clear events will be coalesced and handled asynchronously. There is no guarantee that the cleared selection will stay empty by the time the callback is executed.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| callback | function |  |

### registerSelectionCallback (callback)

Attach a script function to be called when objects are selected or deselected by the user. The callback function will receive two arguments: the type of the selected objects and whether this is a selection or deselection operation. Note: Registering a new callback function will NOT override existing callbacks. To prevent callbacks from slowing down the application, multiple selection/deselection events will be coalesced and handled asynchronously. There is no guarantee that objects selected will stay selected by the time the callback is executed.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| callback | function |  |
