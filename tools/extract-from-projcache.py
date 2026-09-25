# -*- coding: utf-8 -*-
"""
从 DSH 项目缓存里抢救文件内容（本次用于恢复被双重编码毁掉的 README.md）

背景：我误用 PowerShell 对中文文件做字符串往返（Get-Content -Raw 在 PS 5.1 下按 GBK
解码 UTF-8），把 README.md 写成了"双重编码"的乱码，且 .NET 解码器对无法映射的字节
输出 '?'（不是 U+FFFD）⇒ **有损**，无法纯机械还原。
但 DSH 的 storages/session_projcache.json 里缓存着**损坏前**的文件内容 ⇒ 从这里抽回。

用法：python tools/extract-from-projcache.py <projcache.json> <输出文件> [必需子串...]
"""
import json
import os
import sys


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    src, out = sys.argv[1], sys.argv[2]
    markers = sys.argv[3:]

    print('读取 %s ...' % src)
    with open(src, 'r', encoding='utf-8') as f:
        data = json.load(f)

    found = []

    def walk(node, path=''):
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, path + '/' + str(k))
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, path + '/%d' % i)
        elif isinstance(node, str):
            if all(m in node for m in markers):
                found.append((len(node), path, node))

    walk(data)
    found.sort(key=lambda t: -t[0])
    print('命中 %d 处，最长 %d 字符' % (len(found), found[0][0] if found else 0))
    for ln, path, _ in found[:8]:
        print('  len=%-8d %s' % (ln, path[:130]))
    if not found:
        print('未找到包含全部标记的内容')
        return 1

    best = found[0][2]
    # 还原为文件的原始字节（UTF-8，无 BOM）；缓存里存的是文本，行尾可能是 \n
    with open(out, 'wb') as f:
        f.write(best.encode('utf-8'))
    print('已写出 %s（%d 字节）' % (out, os.path.getsize(out)))
    print('前 3 行：')
    for line in best.splitlines()[:3]:
        print('  ' + line[:100])
    return 0


if __name__ == '__main__':
    sys.exit(main())
