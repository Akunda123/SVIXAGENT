#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
离线 Lua VM 运行器（Windows / ctypes）

用途：在**没有 Synthesizer V** 的情况下跑 `sv/lua/AKDAgentBridge.lua` 的内部 op，
配合 `sv/lua/tests/fake-sv.lua`（假 SV 宿主）做单元测试。
**为什么必须离线测**：SV 的 Lua 绑定在出错时会**弹出脚本错误对话框且穿透 pcall**，
所以"在真机里试错"代价极高；能离线跑的部分必须先跑绿。

实现说明（踩坑记录）：
- Lua 5.3 的 `luaL_loadfile` / `lua_pcall` 是**宏**，DLL 里没有这些符号，
  必须调 `luaL_loadfilex` / `lua_pcallk`（见 lua.h 的 #define）。
- 解释器来源：`C:\\Program Files\\Cheat Engine\\lua53-64.dll`（x64、标准 5.3 C API）。
  SV 自带的是 Lua 5.4；5.3 用于测试足够，但**不能用 5.4 独有语法**（<const>/<close>），
  脚本里若有这类语法会在真机才通过 —— 故 `lua-vm.py --check-syntax` 也应跑一次真 SV。

用法：
  python tools/lua-vm.py sv/lua/tests/test-ops.lua
  python tools/lua-vm.py --dll "<路径>" 脚本.lua
退出码：0 = 通过（无 FAIL 行）；1 = 有 FAIL；2 = 加载/运行期错误
"""
import ctypes
import os
import re
import sys

DEFAULT_DLLS = [
    r"C:\Program Files\Cheat Engine\lua53-64.dll",
    r"C:\Program Files\Cheat Engine\lua53-32.dll",
    r"C:\Program Files\bililive\livehime\6.24.0.8301\lua51.dll",
]

LUA_OK = 0
LUA_GLOBALSINDEX = -10002  # 5.2+ 已废弃，仅注释留痕


def find_dll(explicit=None):
    for p in ([explicit] if explicit else []) + DEFAULT_DLLS:
        if p and os.path.isfile(p):
            return p
    raise SystemExit("找不到 Lua DLL，请用 --dll 指定")


class LuaVM:
    def __init__(self, dll_path):
        self.lib = ctypes.CDLL(dll_path)
        L = ctypes.c_void_p
        self.lib.luaL_newstate.restype = L
        self.lib.luaL_newstate.argtypes = []
        self.lib.luaL_openlibs.argtypes = [L]
        self.lib.luaL_loadfilex.restype = ctypes.c_int
        self.lib.luaL_loadfilex.argtypes = [L, ctypes.c_char_p, ctypes.c_char_p]
        self.lib.lua_pcallk.restype = ctypes.c_int
        self.lib.lua_pcallk.argtypes = [L, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_longlong, ctypes.c_void_p]
        self.lib.lua_tolstring.restype = ctypes.c_char_p
        self.lib.lua_tolstring.argtypes = [L, ctypes.c_int, ctypes.POINTER(ctypes.c_size_t)]
        self.lib.lua_settop.argtypes = [L, ctypes.c_int]
        self.lib.lua_gettop.restype = ctypes.c_int
        self.lib.lua_gettop.argtypes = [L]
        self.lib.lua_pushstring.argtypes = [L, ctypes.c_char_p]
        self.lib.lua_setglobal.argtypes = [L, ctypes.c_char_p]
        self.lib.lua_pushboolean.argtypes = [L, ctypes.c_int]
        self.lib.luaL_len = getattr(self.lib, "luaL_len", None)
        self.L = self.lib.luaL_newstate()
        if not self.L:
            raise SystemExit("luaL_newstate 失败")
        self.lib.luaL_openlibs(self.L)

    def _err(self):
        msg = self.lib.lua_tolstring(self.L, -1, None)
        return msg.decode("utf-8", "replace") if msg else "(无法读取错误信息)"

    def set_global_str(self, name, value):
        self.lib.lua_pushstring(self.L, value.encode("utf-8"))
        self.lib.lua_setglobal(self.L, name.encode("utf-8"))

    def set_global_bool(self, name, value):
        self.lib.lua_pushboolean(self.L, 1 if value else 0)
        self.lib.lua_setglobal(self.L, name.encode("utf-8"))

    def run_file(self, path):
        self.lib.lua_settop(self.L, 0)
        rc = self.lib.luaL_loadfilex(self.L, path.encode("utf-8"), None)
        if rc != LUA_OK:
            print("[load error] " + self._err())
            return 2
        rc = self.lib.lua_pcallk(self.L, 0, 0, 0, 0, None)
        if rc != LUA_OK:
            print("[runtime error] " + self._err())
            return 2
        return 0


def main(argv):
    dll = None
    script = None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--dll":
            i += 1
            dll = argv[i]
        else:
            script = a
        i += 1
    if not script:
        print(__doc__)
        return 2
    dll_path = find_dll(dll)
    print("[lua-vm] dll = %s" % dll_path)
    script = os.path.abspath(script)
    print("[lua-vm] script = %s" % script)
    vm = LuaVM(dll_path)
    vm.set_global_bool("__AKDAGENT_TEST__", True)
    vm.set_global_str("__AKDAGENT_TEST_DIR__", os.path.dirname(script).replace("\\", "/"))
    rc = vm.run_file(script)
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
