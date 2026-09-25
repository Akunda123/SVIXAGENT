# -*- coding: utf-8 -*-
"""
双重编码损坏的逆向修复（Python + Windows CP936 真实映射表）

伤害链：
    原始 UTF-8 字节 B  --(Windows cp936 解码)-->  字符串 S  --(UTF-8 编码)-->  当前文件字节 B'
逆运算：
    B' --(UTF-8 解码)--> S --(按 Windows cp936 表反查字节)--> B

为什么需要 tools/cp936-table.txt：Python 自带 cp936 表与 Windows 的**不完全一致**
（实测 342 个字符对查不到），所以先用 tools/dump-cp936.ps1 从 .NET 导出真实映射表，
再据此逐字符反查，做到字节级还原。

安全阀：
  ① 严格 UTF-8 解码必须成功（失败即判定不可逆，不写回）
  ② 不得出现替换字符 U+FFFD
  ③ 关键汉字码点必须出现
用法：python tools/fix-double-encoding.py <文件> [--apply]
"""
import os
import sys

TABLE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cp936-table.txt')


def load_table(path=TABLE):
    rev = {}
    # ASCII 恒等（导出脚本只导了高位字节；0x00-0x7F 在任何单字节/GBK 解码下都是自身）
    for cp in range(0x00, 0x80):
        rev[chr(cp)] = bytes([cp])
    if not os.path.isfile(path):
        print('缺少映射表：%s（先运行 tools/dump-cp936.ps1）' % path)
        return rev
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or '=' not in line:
                continue
            left, right = line.split('=')
            left = left.strip()
            try:
                cp = int(right.strip(), 16)
            except ValueError:
                continue
            if len(left) == 4:
                b = bytes([int(left[0:2], 16), int(left[2:4], 16)])
            elif len(left) == 2:
                b = bytes([int(left, 16)])
            else:
                continue
            ch = chr(cp)
            if ch not in rev:      # 表里双字节在前 ⇒ 优先双字节
                rev[ch] = b
    return rev


def pua_to_bytes(cp):
    """兜底：Windows CP936 的用户自定义区 -> 字节（表里若已有则不走到这里）"""
    if 0xE000 <= cp <= 0xE233:
        i = cp - 0xE000
        return bytes([0xAA + i // 94, 0xA1 + i % 94])
    if 0xE234 <= cp <= 0xE4C5:
        i = cp - 0xE234
        return bytes([0xF8 + i // 94, 0xA1 + i % 94])
    return b''


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    apply_ = '--apply' in sys.argv
    if not args:
        print(__doc__)
        return 2
    path = os.path.abspath(args[0])
    raw = open(path, 'rb').read()
    print('file      : %s' % path)
    print('cur bytes : %d' % len(raw))

    text = raw.decode('utf-8')
    print('U+FFFD    : %d' % text.count('\ufffd'))

    rev = load_table()
    print('table     : %d mappings' % len(rev))

    out = bytearray()
    miss = []
    for ch in text:
        b = rev.get(ch)
        if b is None:
            b = pua_to_bytes(ord(ch)) or None
        if b is None:
            miss.append(ch)
            out += b'?'
        else:
            out += b
    print('miss      : %d' % len(miss))
    if miss:
        print('   miss cps: %s' % ' '.join('U+%04X' % ord(c) for c in miss[:20]))
    print('rest bytes: %d' % len(out))

    try:
        s2 = out.decode('utf-8')          # 严格 UTF-8
    except UnicodeDecodeError as e:
        print('NOT VALID UTF-8 -> 不可逆: %s' % e)
        return 2

    keys = {
        '架构': '\u67b6\u6784',
        '快速开始': '\u5feb\u901f\u5f00\u59cb',
        '工具清单': '\u5de5\u5177\u6e05\u5355',
        '关键能力': '\u5173\u952e\u80fd\u529b',
        '路线图': '\u8def\u7ebf\u56fe',
        'Lua 桥': 'Lua \u6865',
        '剪贴板': '\u526a\u8d34\u677f',
        '声库': '\u58f0\u5e93',
    }
    bad = 0
    for label, k in keys.items():
        ok = k in s2
        if not ok:
            bad += 1
        print('key %-8s %s' % ('ok' if ok else 'MISS', label))
    print('lines     : %d' % len(s2.splitlines()))
    print('first line: %s' % s2.splitlines()[0][:60])

    cand = path + '.restored'
    with open(cand, 'wb') as f:
        f.write(out)
    print('wrote     : %s' % cand)

    if bad == 0 and not miss and s2.count('\ufffd') == 0:
        if apply_:
            with open(path, 'wb') as f:
                f.write(out)
            print('APPLIED   : %s' % path)
        return 0
    print('VERIFY FAILED -> 未写回')
    return 1


if __name__ == '__main__':
    sys.exit(main())
