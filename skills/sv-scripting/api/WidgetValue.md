# WidgetValue

Methods

### getEnabled () → {boolean}

Get the enable/disable status currently set for the UI widget.

**Returns::**

true if enabled

Type boolean

### getValue () → {number|string}

Get the value currently set for the UI widget.

**Returns::**

The current value.

Type number | string

### setEnabled (enabled)

Enable or disable the UI widget. In the disabled state, the user will not be able to change the widget's value.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| enabled | boolean |  |

### setValue (value)

Update the UI widget with a new value.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| value | number | string | The value to be set. |

### setValueChangeCallback (callback)

Set a script function to be called when the UI widget's value is changed by the user. The callback function will receive the new value as its sole argument.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| callback | function |  |
