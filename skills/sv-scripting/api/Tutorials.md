# Tutorials（5 篇教程）

> 来源：官方手册的 Tutorials（`Tutorial_ A Minimal Example` / `Custom Dialogs` / `Custom Side Panel Sections` / `Localization` / `Memory Management`），
> 从本地存档的 `Downloads\sv script\_api_base_tutorials.md` **逐行抽出**（该摘要**同时给出 JavaScript 与 Lua 两版代码**）。
> 2026-09-19 补入：此前本目录只镜像了 23 个**类**页，教程全缺。
> 本地存档：`C:\Users\<USER>\Downloads\sv script\Tutorial_*.html`

---
## Tutorial: A Minimal Example

A minimal working script consists of two global functions: `getClientInfo()` and `main()`.

- `getClientInfo()` is called when the script gets loaded by the host. It returns an object describing:
  - `name`: the script name
  - `category`: category name
  - `author`: author name
  - `versionNumber`: script version (integer)
  - `minEditorVersion`: minimal version number of Synthesizer V Studio required (65540 = version 2.0.4)

- `main()` is called when the user executes the script.

### Code Example (JavaScript)

```javascript
function getClientInfo() {
  return {
    "name" : "My Script",
    "category" : "Example",
    "author" : "Bob Alice",
    "versionNumber" : 1,
    "minEditorVersion" : 65540
  };
}

function main() {
  SV.showMessageBox("My Script", "Hello, world!");
  SV.finish();
}
```

### Code Example (Lua)

```lua
function getClientInfo()
  return {
    name = "My Script",
    category = "Example",
    author = "Bob Alice",
    versionNumber = 1,
    minEditorVersion = 65540
  }
end

function main()
  SV:showMessageBox("My Script", "Hello, world!")
  SV:finish()
end
```

---

## Tutorial: Custom Dialogs

`SV.showInputBox`, `SV.showYesNoCancelBox` and their asynchronous versions are good for simple inputs. For more involved user interactions that require multiple input fields and more diverse input widgets (e.g. sliders), use the customizable dialog API through `SV.showCustomDialog` and `SV.showCustomDialogAsync`.

`SV.showCustomDialog` takes a single argument that is a custom form object and returns an object for the results.

### Form Object Properties

- `title`: `string` -- the dialog's title
- `message`: `string` -- a message displayed in the top of the dialog
- `buttons`: `string` -- the preset buttons displayed in the bottom of the dialog. Can be `"YesNoCancel"` or `"OkCancel"`.
- `widgets`: `array` -- an array of widgets displayed in the body of the dialog.

---

## Tutorial: Custom Side Panel Sections

Custom side panel sections allow script authors to create persistent, interactive UI panels that remain embedded within the Synthesizer V Studio interface. Unlike dialogs and message boxes which are modal and temporary, side panel sections provide a continuous workspace for tools that benefit from always-on access.

### Creating a Side Panel Section

A side panel section script requires `getClientInfo()` to return `"type": "SidePanelSection"` and must implement the `getSidePanelSectionState()` function instead of `main()`. The `minEditorVersion` must be 131330 (version 2.1.2) or above.

### Basic Structure (JavaScript)

```javascript
function getClientInfo() {
  return {
    "name": "My Panel",
    "category": "Utilities",
    "author": "Your Name",
    "versionNumber": 1,
    "minEditorVersion": 131330,
    "type": "SidePanelSection"
  };
}

function getSidePanelSectionState() {
  return {
    "title": "My Panel",
    "rows": [
      // UI widgets defined here
    ]
  };
}
```

### Section Object Structure

The object returned by `getSidePanelSectionState()` has:
- `title`: `string` -- the panel's title displayed at the top
- `rows`: `array` -- an array of widget rows

### Layout System

Two-level row-and-column layout system:

1. **First level (Rows)**: The `rows` array can only contain `Label` or `Container` widgets.
2. **Second level (Columns)**: Inside a `Container`'s `columns` array, place interactive widgets like `TextBox`, `Button`, `Slider`, etc.

#### Rows Example

```javascript
"rows": [
  {
    "type": "Label",
    "text": "Search options:"
  },
  {
    "type": "Container",
    "columns": [
      {
        "type": "TextBox",
        "value": searchValue,
        "width": 1.0
      }
    ]
  }
]
```

#### Columns and Relative Widths

Each widget in a column specifies a `width` property representing its relative proportion of the available horizontal space:

```javascript
{
  "type": "Container",
  "columns": [
    {
      "type": "Button",
      "text": "Left",
      "value": leftButtonValue,
      "width": 0.3  // Takes 30% of width
    },
    {
      "type": "Button",
      "text": "Right",
      "value": rightButtonValue,
      "width": 0.7  // Takes 70% of width
    }
  ]
}
```

### Widget System

#### WidgetValue

Side panel sections use WidgetValue objects to transmit data between the UI and the script. Create them with `SV.create("WidgetValue")`.

```javascript
var myValue = SV.create("WidgetValue");
myValue.setValue(0);  // Initialize
myValue.setEnabled(true);  // Enable/disable the widget

myValue.setValueChangeCallback(function(newValue) {
  // Handle value change
});
```

#### Widget Types

**TextBox** -- Single-line text input:
```javascript
var textValue = SV.create("WidgetValue");
textValue.setValue("initial text");
{
  "type": "TextBox",
  "value": textValue,
}
```

**TextArea** -- Multi-line text display or input:
```javascript
var textAreaValue = SV.create("WidgetValue");
textAreaValue.setValue("Multi-line\ntext here");
{
  "type": "TextArea",
  "value": textAreaValue,
  "height": 80,      // Height in pixels
}
```

**Button** -- Clickable button that triggers an action:
```javascript
var buttonValue = SV.create("WidgetValue");
buttonValue.setValueChangeCallback(function() {
  SV.showMessageBox("Info", "Button pressed!");
});
{
  "type": "Button",
  "text": "Click Me",
  "value": buttonValue,
}
```

**Slider** -- Numeric slider with configurable range and formatting:
```javascript
var sliderValue = SV.create("WidgetValue");
sliderValue.setValue(3);
{
  "type": "Slider",
  "text": "Volume",
  "format": "%3.1f dB",  // printf-style format string
  "minValue": -6,
  "maxValue": 6,
  "interval": 0.1,
  "value": sliderValue,
}
```
Example format strings: `"%3.2f beats"`, `"%3.0f %%"`, `"%2.1f Hz"`

**CheckBox** -- Boolean toggle:
```javascript
var checkValue = SV.create("WidgetValue");
checkValue.setValue(true);
{
  "type": "CheckBox",
  "text": "Apply this to all notes in the group",
  "value": checkValue,
}
```

**ComboBox** -- Dropdown selection:
```javascript
var comboValue = SV.create("WidgetValue");
comboValue.setValue(0);  // Index of selected item
{
  "type": "ComboBox",
  "choices": ["Option 1", "Option 2", "Option 3"],
  "value": comboValue,
}
```

### Responding to Editor Events

#### Selection Changes

```javascript
SV.getMainEditor().getSelection().registerSelectionCallback(function(selectionType, isSelected) {
  if(selectionType == "note") {
    // A note was selected or deselected, update the UI
  }
});

SV.getMainEditor().getSelection().registerClearCallback(function(selectionType) {
  if(selectionType == "notes") {
    // All notes were deselected, update the UI
  }
});
```

### Toy Example: Selected Note Counter (Full Script)

```javascript
var SCRIPT_TITLE = "Selected Note Counter";

function getClientInfo() {
  return {
    "name": SCRIPT_TITLE,
    "category": "Utilities",
    "author": "Dreamtonics",
    "versionNumber": 1,
    "minEditorVersion": 131330,
    "type": "SidePanelSection"
  };
}

var countValue = SV.create("WidgetValue");
var setLyricsButtonValue = SV.create("WidgetValue");

countValue.setValue("0 notes selected");
countValue.setEnabled(false);

function updateSelectionCount() {
  var selection = SV.getMainEditor().getSelection();
  var selectedNotes = selection.getSelectedNotes();
  var count = selectedNotes.length;
  countValue.setValue(count + " note" + (count === 1 ? "" : "s") + " selected");
  setLyricsButtonValue.setEnabled(count > 0);
}

setLyricsButtonValue.setValueChangeCallback(function() {
  var selection = SV.getMainEditor().getSelection();
  var selectedNotes = selection.getSelectedNotes();
  if(selectedNotes.length === 0) return;
  SV.getProject().newUndoRecord();
  for(var i = 0; i < selectedNotes.length; i ++) {
    selectedNotes[i].setLyrics("a");
  }
});

SV.getMainEditor().getSelection().registerSelectionCallback(function(selectionType, isSelected) {
  if(selectionType == "note") {
    updateSelectionCount();
  }
});

SV.getMainEditor().getSelection().registerClearCallback(function(selectionType) {
  if(selectionType == "notes") {
    updateSelectionCount();
  }
});

updateSelectionCount();

function getSidePanelSectionState() {
  return {
    "title": SCRIPT_TITLE,
    "rows": [
      {
        "type": "Label",
        "text": "Selection:"
      },
      {
        "type": "Container",
        "columns": [
          {
            "type": "TextBox",
            "value": countValue,
            "width": 1.0
          }
        ]
      },
      {
        "type": "Container",
        "columns": [
          {
            "type": "Button",
            "text": "Set lyrics to 'a'",
            "value": setLyricsButtonValue,
            "width": 1.0
          }
        ]
      }
    ]
  };
}
```

---

## Tutorial: Localization

`SV.T(text)` is a handy function for translating a string based on the host's current language settings. The translation is based on a dictionary provided by the script author. If an out-of-dictionary string is encountered, it fallbacks to the host's translation file, and if a translation is still not found, the original string will be returned.

### Embed a Translation Dictionary

The script author implements the `getTranslations(langCode)` callback to provide a script-specific translation dictionary. This function is executed when Synthesizer V Studio loads the script. It takes a `string` argument for the language code and returns an array of pairs (array) of `string`.

### Code Example (JavaScript)

```javascript
function getTranslations(langCode) {
  if(langCode == "ja-jp") {
    return [
      ["Please enter a number here:", "数字を入力してください："],
      ["Please enter some text here:", "テキストを入力してください："]
    ];
  } else
  if(langCode == "zh-cn") {
    return [
      ["Please enter a number here:", "请输入一个数字："],
      ["Please enter some text here:", "请输入一段文本："]
    ];
  }
  return [];
}

function main() {
  SV.showInputBox("My Script", SV.T("Please enter a number here:"), "");
  SV.showInputBox("My Script", SV.T("Please enter some text here:"), "");
  SV.finish();
}
```

### Code Example (Lua)

```lua
function getTranslations(langCode)
  if langCode == "ja-jp" then
    return {
      {"Please enter a number here:", "数字を入力してください："},
      {"Please enter some text here:", "テキストを入力してください："}
    }
  elseif langCode == "zh-cn" then
    return {
      {"Please enter a number here:", "请输入一个数字："},
      {"Please enter some text here:", "请输入一段文本："}
    }
  end
  return {}
end

function main()
  SV:showInputBox("My Script", SV:T("Please enter a number here:"), "")
  SV:showInputBox("My Script", SV:T("Please enter some text here:"), "")
  SV:finish()
end
```

---

## Tutorial: Memory Management

The scripting system of Synthesizer V Studio uses a reference-counting technique to share objects and safely transfer ownership between the host (which runs native code with hard-coded memory management) and the client (which uses garbage collection).

In most cases, script authors do not need to know the underlying mechanism to write working and memory-safe code as most misuses will be detected by the script environment, causing error messages to pop up, e.g. "failed to access a deleted object". There however could be edge cases that go undetected, and in very rare cases, causing crashes.

### Managed and Unmanaged Objects

- A NestedObject can be garbage-collected (**managed**) by the client environment if it has no parent, unless it is a top-level host-owned object (e.g. the main project).
- If a NestedObject has a parent, then it is always **unmanaged**.

For example, if a NoteGroup is created from a script with a few notes added to it:

- NoteGroup (managed)
  - Note 1 (unmanaged)
  - Note 2 (unmanaged)
  - Note 3 (unmanaged)
  - Automation 1 (unmanaged)
  - Automation 2 (unmanaged)
  - ...

If the parent NoteGroup gets garbage-collected by the client, the host-side destructor for NoteGroup will be triggered, cleaning up all of its unmanaged children.

If the client environment has a reference to one of the unmanaged notes in the NoteGroup, the reference will be marked as deleted when the unmanaged note gets deleted -- either when the parent NoteGroup gets garbage-collected, or when the user explicitly deletes the note. Any attempt to access the invalid reference will be detected and result in an error message "failed to access a deleted 'Note' object".

When the managed NoteGroup is added to a Project, it gets converted into an unmanaged object. This conversion is a simple state change that signals the bypass of garbage collection and does not involve any memory allocation/free/copy.

---

## Appendix: Key API Entry Points (from navigation)

The main `SV` global object exposes these key methods for script development:

- **SV.T(text)**: Localization/translation
- **SV.blackKey(pitch)**: Check if a pitch is a black key
- **SV.blick2Quarter(b)**, **SV.quarter2Blick(q)**: Time unit conversion
- **SV.blick2Seconds(b)**, **SV.seconds2Blick(s)**: Time unit conversion
- **SV.blickRoundDiv(b, div)**, **SV.blickRoundTo(b, base)**: Time rounding
- **SV.create(type)**: Create objects (e.g. `SV.create("WidgetValue")`)
- **SV.finish()**: Mark script as complete
- **SV.freq2Pitch(freq)**, **SV.pitch2freq(pitch)**: Pitch/frequency conversion
- **SV.getArrangement()**: Get arrangement view
- **SV.getMainEditor()**: Get main editor view
- **SV.getPlayback()**: Get playback control
- **SV.getProject()**: Get the current project
- **SV.getHostClipboard()**, **SV.setHostClipboard(text)**: Clipboard access
- **SV.getHostInfo()**: Get host information
- **SV.print(text)**: Print to log
- **SV.refreshSidePanel()**: Refresh side panel UI
- **SV.setTimeout(callback, ms)**: Set a timeout
- **SV.showMessageBox(title, message)**, **SV.showMessageBoxAsync(title, message)**: Simple message dialog
- **SV.showInputBox(title, message, defaultText)**, **SV.showInputBoxAsync(...)**: Simple text input dialog
- **SV.showOkCancelBox(title, message)**, **SV.showOkCancelBoxAsync(...)**: OK/Cancel dialog
- **SV.showYesNoCancelBox(title, message)**, **SV.showYesNoCancelBoxAsync(...)**: Yes/No/Cancel dialog
- **SV.showCustomDialog(form)**, **SV.showCustomDialogAsync(form)**: Custom multi-widget dialog
- **SV.getComputedAttributesForGroup(group)**: Get computed attributes
- **SV.getComputedPitchForGroup(group)**: Get computed pitch
- **SV.getPhonemesForGroup(group)**: Get phonemes for a group
