# SV

Members

### QUARTER :number

Number of blicks in a quarter. The value is 705600000. We denote musical time (e.g. a quarter, a beat) differently from physical time (e.g. one second). A blick is the smallest unit of musical time that the GUI works with internally. It is a large number chosen to be divisible by a lot of similarly purposed numbers used in music software. The name originates from Flicks .

**Type::**

- number

Methods

### T (text) → {string}

Get a localized version of text based on the current UI language settings. See Localization for more information.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| text | string |  |

**Returns::**

Type string

### blackKey (k) → {boolean}

Check whether the key (passed in as a MIDI number) is a black key on a piano. Conversions between musical and physical time in the context of a project are done by TimeAxis .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| k | number |  |

**Returns::**

Type boolean

### blick2Quarter (b) → {number}

Convert b from number of blicks into number of quarters. Equivalent to b / SV.QUARTER . Conversions between musical and physical time in the context of a project are done by TimeAxis .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |

**Returns::**

Type number

### blick2Seconds (b, bpm) → {number}

Convert b from blicks into seconds with the specified beats per minute bpm . Equivalent to b / SV.QUARTER * 60 / bpm . Conversions between musical and physical time in the context of a project are done by TimeAxis .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |
| bpm | number |  |

**Returns::**

Type number

### blickRoundDiv (dividend, divisor) → {number}

Rounded division of dividend (blicks) over divisor (blicks). Conversions between musical and physical time in the context of a project are done by TimeAxis .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| dividend | number |  |
| divisor | number |  |

**Returns::**

Type number

### blickRoundTo (b, interval) → {number}

Returns the closest multiple of interval (blicks) from b (blick). Equivalent to blickRoundDiv(b, interval) * interval . Conversions between musical and physical time in the context of a project are done by TimeAxis .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| b | number |  |
| interval | number |  |

**Returns::**

Type number

### create (type) → {object}

Create a new object. type can be one of the following type-specifying strings. type Description " Note " A note defined by pitch, lyrics, onset, duration, etc. " Automation " A set of points controlling a particular parameter type (e.g. Pitch Deviation) inside a NoteGroup . " PitchControlPoint " A discrete anchor point for guiding the pitch generation inside a NoteGroup . " PitchControlCurve " A continuous curve for overriding the generated pitch inside a NoteGroup . " NoteGroup " A set of notes and parameters grouped together for convenient reuse. " NoteGroupReference " A reference to a NoteGroup with optional time and pitch offset and voice/database properties. " TrackMixer " A set of attributes describing the mixer states of a track (e.g. gain, pan, mute, solo). " Track " A collection of NoteGroupReference . " TimeAxis " A project-wide object storing tempo and time signature marks; handles the conversion between physical time and musical time. " Project " The largest object to be worked with. Contains Track , TimeAxis , NoteGroup , etc. " WidgetValue " A helper object for binding custom UI widgets in the script panel with variables controlled by the script.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| type | string | A type-specifying string. |

**Returns::**

Type object

### finish ()

Mark the finish of a script. All subsequent async callbacks will not be executed. Note that this does not cause the current script to exit immediately.

### freq2Pitch (f) → {number}

Convert a frequency in Hz to a MIDI number (semitones, where C4 is 60). Conversions between musical and physical time in the context of a project are done by TimeAxis .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| f | number |  |

**Returns::**

Type number

### getArrangement () → { ArrangementView }

Get the UI state object for arrangement view.

**Returns::**

Type ArrangementView

### getComputedAttributesForGroup (group) → {array}

Get computed attributes for all notes in a group (passed in as a group reference). (supported since 2.1.1) This is a more comprehensive version of SV#getPhonemesForGroup that returns detailed phoneme-level information and rap attributes for each note. Returns an array of objects, one for each note in the group. Each object contains: accent : string - the computed accent (if applicable) rapTone : number or null - the computed rap tone (if applicable) rapIntonation : number or null - the computed rap intonation (if applicable) phonemes : array of objects, each containing: symbol : string - the phoneme symbol language : string - the language of the phoneme activity : number or null - the consonant activity level (if applicable) position : number or null - the consonant position (if applicable) Like SV#getPhonemesForGroup , this function does not block and may return an empty array if processing hasn't completed.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| group | NoteGroupReference |  |

**Returns::**

an array of object

Type array

### getComputedPitchForGroup (groupReference, blickStart, blickInterval, numFrames) → {array}


Get computed pitch values for a group (passed in as a group reference) over a specified time range. (supported since 2.1.1) This function samples the computed pitch curve at regular intervals and returns the pitch values as an array of numbers. The pitch values are in semitones (MIDI note numbers as floating point). Note: blickStart is the absolute position after adding the time offset of the target NoteGroupReference (see NoteGroupReference#getTimeOffset ). This is because even the same NoteGroup may have different pitch values computed when there are multiple NoteGroupReferences pointing to it, for example, when the tempo or vocal mode is different for each NoteGroupReference.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| groupReference | NoteGroupReference | The group to get pitch data from |
| blickStart | number | The starting position in blicks |
| blickInterval | number | The interval between samples in blicks |
| numFrames | number | The number of samples to retrieve |

**Returns::**

an array of number (or null where no pitch data is available) Like other computed data functions, this function does not block and uses the current pitch computation state. If pitch computation hasn't completed for the group, this function returns an empty array.

Type array

### getHostClipboard () → {string}

Get the text on the system clipboard.

**Returns::**

Type string

### getHostInfo () → {object}

Get an object with the following properties. osType : string taking one of "Windows", "macOS", "Linux", "Unknown" osName : string the full name of the operating system hostName : string "Synthesizer V Studio Pro" or "Synthesizer V Studio Basic" hostVersion : string the version string of Synthesizer V Studio e.g. "1.0.4" hostVersionNumber : number the version number defined as taking major, minor and revision as 2-digit hexadecimals (e.g. 0x010004 for "1.0.4") languageCode : string language code for the UI, e.g. "en-us", "ja-jp", "zh-cn"

**Returns::**

Type object

### getMainEditor () → { MainEditorView }

Get the UI state object for the piano roll.

**Returns::**

Type MainEditorView

### getPhonemesForGroup (group) → {array}

Get the phonemes for all notes in a group (passed in as a group reference). The group must be part of the currently open project. Note that getPhonemesForGroup returns the output of Synthesizer V Studio's internal text-to-phoneme converter. That means even for notes with no user-specified phonemes, getPhonemesForGroup will return the default pronunciation, whereas Note#getPhonemes will return an empty string. Also note that the text-to-phoneme converter runs on a different thread. getPhonemesForGroup does not block the current thread. There's a slight chance of returning an empty array if text-to-phoneme conversion has not yet finished on the group. We recommend script authors to wrap getPhonemesForGroup in a SV#setTimeout call in such cases.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| group | NoteGroupReference |  |

**Returns::**

an array of string

Type array

### getPlayback () → {PlayBackControl}

Get the UI state object for controlling the playback.

**Returns::**

Type PlayBackControl

### getProject () → { Project }

Get the currently open project.

**Returns::**

Type Project

### pitch2freq (p) → {number}

Convert a MIDI number (semitones, where C4 is 60) to a frequency in Hz. Conversions between musical and physical time in the context of a project are done by TimeAxis .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| p | number |  |

**Returns::**

Type number

### print (…args)

Print any number of arguments to the standard output stream. This is only useful for debugging your script. To see the output, you need to run Synthesizer V Studio from the command line. (supported since 2.1.1)

**Parameters::**

| Name | Type | Attributes | Description |
|------|------|------------|-------------|
| args | any | <repeatable> |  |

### quarter2Blick (q) → {number}

Convert q from number of quarters into number of blick. Equivalent to q * SV.QUARTER . Conversions between musical and physical time in the context of a project are done by TimeAxis .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| q | number |  |

**Returns::**

Type number

### refreshSidePanel ()

Force Synthesizer V Studio to reload the side panel section for the current script. This function is only available for scripts of type 'SidePanelSection'. When called, it will trigger a refresh of the side panel UI, causing the script's getSidePanelSectionState function to be called again to update the displayed content. Note that you don't typically need to call this function. If you want to update the values displayed, simply bind a WidgetValue to the object returned by the script's getSidePanelSectionState function, and call WidgetValue#setValue . You will need to call this function if you want to update the UI layout, change the number of widgets, or change the static labels or other properties of the widgets. (supported since 2.1.2)

### seconds2Blick (s, bpm) → {number}

Convert s from seconds into blicks with the specified beats per minute bpm . Equivalent to s / 60 * bpm * SV.QUARTER . Conversions between musical and physical time in the context of a project are done by TimeAxis .

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| s | number |  |
| bpm | number |  |

**Returns::**

Type number

### setHostClipboard (text)

Set the system clipboard.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| text | string |  |

### setTimeout (timeOut, callback)

Schedule a delayed call to callback after timeOut milliseconds. After calling setTimeout , the script will continue instead of immediately executing callback . The callback function is pushed onto a queue and delayed. This is not a preemptive callback, i.e. the execution of callback will not interrupt the currently running task.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| timeOut | number |  |
| callback | function |  |

### showCustomDialog (form) → {object}

The synchronous version of SV#showCustomDialogAsync that blocks the script execution until the user closes the dialog. It returns the inputs (the completed form) from the user.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| form | object |  |

**Returns::**

Type object

### showCustomDialogAsync (form, callback)

Display a custom dialog defined in form , without blocking the script execution. callback will be invoked once the dialog is closed. The callback function takes one argument which contains the results. See Custom Dialogs for more information.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| form | object |  |
| callback | function |  |

### showInputBox (title, message, defaultText) → {string}

The synchronous version of SV#showInputBoxAsync that blocks the script execution until the user closes the dialog. It returns the text input from the user.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| title | string |  |
| message | string |  |
| defaultText | string |  |

**Returns::**

Type string

### showInputBoxAsync (title, message, defaultText, callback)

Display a dialog with a text box and an "OK" button, without blocking the script execution. callback will be invoked once the dialog is closed. The callback function takes one string argument that is the content of the text box.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| title | string |  |
| message | string |  |
| defaultText | string |  |
| callback | function |  |

### showMessageBox (title, message)

The synchronous version of SV#showMessageBoxAsync that blocks the script execution until the user closes the message box.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| title | string |  |
| message | string |  |

### showMessageBoxAsync (title, message, callback)

Cause a message box to pop up without blocking the script execution. If a callback is given, it is invoked once the message box is closed. The callback function takes no argument.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| title | string |  |
| message | string |  |
| callback | function | (optional) |

### showOkCancelBox (title, message) → {boolean}

The synchronous version of SV#showOkCancelBoxAsync that blocks the script execution until the user closes the message box. It returns true if "OK" button is pressed.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| title | string |  |
| message | string |  |

**Returns::**

Type boolean

### showOkCancelBoxAsync (title, message, callback)

Display a message box with an "OK" button and a "Cancel" button, without blocking the script execution. callback will be invoked once the message box is closed. The callback function takes one boolean argument that is true if "OK" button is pressed.

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| title | string |  |
| message | string |  |
| callback | function |  |

### showYesNoCancelBox (title, message) → {string}

The synchronous version of SV#showYesNoCancelBoxAsync that blocks the script execution until the user closes the message box. It returns "yes", "no" or "cancel".

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| title | string |  |
| message | string |  |

**Returns::**

Type string

### showYesNoCancelBoxAsync (title, message, callback)

Display a message box with a "Yes" button, an "No" button and a "Cancel" button, without blocking the script execution. callback will be invoked once the message box is closed. The callback function takes one string argument that can be "yes", "no" or "cancel".

**Parameters::**

| Name | Type | Description |
|------|------|-------------|
| title | string |  |
| message | string |  |
| callback | function |  |
