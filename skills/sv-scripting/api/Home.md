> 来源：官方 **Synthesizer V Studio Scripting Manual** 首页（JSDoc 4.0.4 · 2025-10-09）。 > 2026-09-19 补入：此前本目录只镜像了 23 个**类**页，**首页与 5 篇教程全缺**（用户报「Home 等内容不见了」）。 > 本地存档：`C:\Users\<USER>\Downloads\sv script\Home - Synthesizer V Studio Scripting Manual.html`

---
# Synthesizer V Studio Scripting Manual

English（/scripting/index.md） | 日本語

Synthesizer V Studio 2 Pro supports scripting. Users can add new features to the editor with their own scripts.

The idea of scripting is similar to a plugin system but instead of loading dynamically linked objects (e.g. `.dll`), Synthesizer V Studio loads scripts in the source code form. Therefore a text editor is all what's needed for developing scripts. Once written, the scripts are portable across all platforms Synthesizer V Studio supports (Windows and macOS).

## Supported Languages
- JavaScript (ECMAScript 5.1, powered by Duktape)
- Lua 5.4 (the official implementation（https://www.lua.org/）)

## Capabilities

What is possible with scripting?
- Read, add, edit and remove notes/groups/parameters/tracks...
- Access and modify the current selection (of notes and groups)
- Navigate across the project (e.g. scroll and zoom onto a certain range)
- Control the playback
- Interact with the user via customizable dialogs
- Asynchronous callback capabilities (e.g. call `SV#setTimeout` to delay the execution of a function)
- This means that a script can run in the background for as long as possible.

## How to get started
- Look at the A Minimal Example（tutorial-A Minimal Example.md）.
- Here is a more advanced example.
- Learn from the test scripts.
- If you don't understand, check the class reference.
- Use Localization（tutorial-Localization.md） in your scripts and go international.
- Advanced users: understand Memory Management.

## Programming Concepts

Synthesizer V Studio's scripting API is object-oriented. JavaScript and Lua scripts share the same API, albeit with slightly different calling conventions (see next section).

There are two types of objects the user can interact with: data objects and UI state objects.
- Data objects are parts of a project that can be tracks, notes, parameters ..., and you may already be familiar with these if you have worked with similar scriptable software.
- UI state objects are more interesting. They are an abstraction of the user interface. For example, a `PlaybackControl` object manages play, pause, loop and seek behaviors.

### Differences from other plugin systems

Many other plugins and DAWs offer scripting features similar to those in Synthesizer V Studio. For instance, VOCALOID provides "Job Plugin" support, and REAPER includes ReaScript. If you have experience scripting for these platforms, you may find it easier to get started with Synthesizer V Studio scripting. However, there are important differences in the programming model:
- In many scripting environments, APIs are exposed as global functions. In contrast, Synthesizer V Studio exposes only a single global object, SV（SV.md）, and most interactions with project data are performed through methods on specific data type objects.
- The Job Plugin system in VOCALOID is based on MIDI event concepts, whereas Synthesizer V Studio represents notes, parameters, groups, and tracks as objects, closely reflecting their structure in the project file.

## Important Differences between JavaScript and Lua

### Indexing

JavaScript uses zero-based indexing and Lua uses one-based indexing. This also applies to the scripting API. For example, `NoteGroup.getNote(0)` in JavaScript is the same as `NoteGroup:getNote(1)` in Lua.

### Calling methods

Object-oriented programming is prototype-based in JavaScript API, which means the calling convention is `Class.Method(...)`. The Lua API is based on metatable, and the calling convention is `Class:Method(...)`. However, member objects are still accessed with dot even in Lua (e.g. SV#QUARTER（SV.html#QUARTER）).
