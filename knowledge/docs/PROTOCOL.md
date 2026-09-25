# AKDAgent 桥协议 v1（**文件通道**）

> ⚠️ **2026-09-12 起：剪贴板通道已整体退役**（用户裁定）。桥只有文件通道，实现只有
> `sv/lua/AKDAgentBridge.lua`（Lua）。本文件里凡提到 `SVCMD:`/`SVRES:`、剪贴板、`SVAgentBridge.js`
> 的内容都**只作历史记录**。
> 📌 **2026-09-19 据实重写**（原版还是剪贴板时代的选路/格式/18 op）：事实以
> `sv/lua/AKDAgentBridge.lua`（现 **1.0.0**）与 `server/src/fileipc.ts` 为准；
> **面向模型的同一份规范在 `skills/akdagent-protocol/SKILL.md`，两处改协议要一起改。**

通信双方：**Bridge**（宿主内常驻 Lua 脚本，执行方）与 **Client**（MCP server / Electron 客户端，请求方）。

## 传输通道（只有文件）

| 通道 | 承载 | 谁提供 | 代价 |
|---|---|---|---|
| ~~剪贴板~~（**已退役** 2026-09-12；实现与归档目录 `legacy/` **2026-09-19 已删除**） | `SVCMD:`/`SVRES:` 文本 | ~~JS 桥~~ | 占用用户剪贴板 ⇒ 已删除 |
| **文件（唯一通道）** | `<dir>\akdagent-{req,res,hb,boot}-<host>.json`（另有 `akdagent-log-<host>.txt` / `akdagent-diag-*`） | **Lua 桥（29 op）** | 不碰剪贴板；需 `io` 库（SV 的 JS 沙箱没有） |

- **`<dir>` 解析顺序（两端同序）**：① `%USERPROFILE%\AKDAgent\ipc`（**存在且可写才用** —— Lua 不能 mkdir）② `os.tmpdir()`（`%TEMP%`）。
- ⚠️ 客户端环境变量 `AKDAGENT_IPC_DIR` 可覆盖目录，**桥不读它** ⇒ 设了就必须让桥也落在同一目录。
  **"两端目录不一致"是本通道的头号故障**（心跳文件里写了桥的实际 `dir`，先对一眼）。
- **没有回落**：剪贴板退役后不再有 `routeTransport` / `FILE_SAFE_OPS` 白名单 / `AKDAGENT_TRANSPORT` 开关；
  能不能发只剩一条判据 —— **桥的心跳里声明了这个 op 吗**（`fileipc.canServe()`：心跳新鲜 ≤ 15s + `ops` 含该 op）。

## 消息格式

**请求** `<dir>\akdagent-req-<host>.json` —— 客户端**原子替换**写入（写 `.tmp` 再 rename）：

```jsonc
{ "v": 1, "seq": 1789175384220009, "id": "fileipc-1789175384220009",
  "op": "get_selected_notes", "args": {} }
```

**响应** `<dir>\akdagent-res-<host>.json` —— 桥写 `.tmp` 后改名（失败则先删再改）：

```jsonc
{ "v": 1, "id": "fileipc-1789175384220009", "seq": 1789175384220009, "ok": true,
  "ts": 1789175384, "host": "sv", "result": { … } }
{ "v": 1, "id": "…", "seq": …, "ok": false, "ts": …, "host": "sv", "error": "…" }
```

| 字段 | 出现处 | 说明 |
|---|---|---|
| `v` | 双向 | 协议版本，恒为 `1` |
| **`id`** | 双向 | 请求唯一 id（客户端生成 `fileipc-<seq>`）。**两端的一切匹配与去重都以它为准** |
| `seq` | 双向 | 客户端生成的**单调递增**序号（`Date.now()*1000+计数器`）。⚠️ **只作观测**：桥不按它去重，也不要求响应 seq 数值相等 |
| `op` | 请求 | 操作名（见下） |
| `args` | 请求 | 参数对象（可省略） |
| `ok` / `ts` / `host` | 响应 | 是否成功 / Unix 秒 / 应答宿主（`sv` \| `ix`） |
| `result` / `error` | 响应 | 成功结果 / 错误描述（二选一） |

> 🔑 **按 `id` 字符串比较，别比 seq**：Lua 曾把 16 位 `seq` 编成科学计数法（`1789175384220009 → 1.78917538422e+15`）丢精度
> ⇒ 客户端只按 `id` 判等，数字比较只当冗余条件 —— 否则会把"对端数字序列化不精确"放大成"桥不响应"。
> 🔑 **宿主标识写在文件名里**：`-sv`（Synthesizer V，SV1/SV2 共用）/ `-ix`（Instrument X）
> ⇒ "SV1 与 SV2 互相抢答"在文件通道下**不复存在**；但**同一宿主开两个实例**仍会互抢同一份文件名。

**心跳** `akdagent-hb-<host>.json`（桥每拍刷新；`fileipc` 用它判活与能力）：

```jsonc
{ "host": "sv", "hostName": "Synthesizer V Studio 2 Pro", "version": "2.2.1",
  "isSV2": true, "indexBase": 1, "dir": "C:\\Users\\…\\Temp", "ts": 1789175384,
  "pollTicks": 2512, "pollErrors": 0, "reqSeen": 82, "opsRun": 82, "lastSeq": 1789175384220009,
  "ops": ["ping", "get_project_info", "…共 29 个…"], "panel": true, "panelVersion": "0.1.0" }
```

**启动结果** `akdagent-boot-<host>.json`：`{ok, lua, bridge, host, hostName, hostVersion, dir, indexBase, reason?, ts}`（成功/致命错误，供外部排障）。

## 规则

1. **心跳声明能力**：发之前看心跳 —— ① 文件存在 ② `ts` 新鲜（**≤ 15s**）③ `ops` 里**明确声明**了该 op。三条都过才发。
2. **id 去重（主键是 `id`，不是 `seq`）**：桥内存存 `done[id]`；**重复 id ⇒ 不重复执行，直接重发缓存响应**（客户端超时重试靠这条）；
   缓存被淘汰后再来同 id ⇒ `ok:false, error:"duplicate request id (response evicted from cache)"`。
   ⚠️ 别用 `seq > lastSeq` 去重 —— 不同客户端 seq 尺度可差 1000 倍，会让后到的小 seq 请求被**永久静默忽略**；桥里 `lastSeq` 仅作统计。
3. **应答后必须消费请求文件（`consumeReq`）**：应答/重发缓存后删 `req`，**且只在"文件内容仍等于读到的快照"时删**（客户端原子 rename 写入，避免误删新请求）。
   不消费的后果实测过：每拍重读同一请求 ⇒ 命中缓存 ⇒ **每拍重发响应**（日志每秒 2~3 条 `resent cached response`、持续 90s）。
4. **同一时刻只允许一个在途请求**：客户端串行化（server 侧已做互斥）⇒ 模型侧不要并发下发。
5. **超时**：客户端默认 **10s**、轮询 **40ms**；桥侧轮询 **300ms**（`POLL_MS`）。超时是**模糊**的（宿主可能仍在写）
   ⇒ **先读回**，确要重试就**用同一个 id**（命中缓存、不会重复执行）。
6. **执行方语义**：写操作执行前先 `newUndoRecord()`（`run_script` 缺则拒绝、`readonly:true` 跳过）——
   它是**撤销边界，不是自动回滚**。
7. **写后必须重读**：指纹 / 守卫 / 体量护栏 / 共享组写保护**都还没实现**（桥里 `fingerprint`、`guardToken`、`STALE_SELECTION`、`maxChars`、`referenceCount` 全 0 命中）
   ⇒ 只有 `get_layout` / `get_melody_notes` / `get_selected_notes` 读回才算数。

## 操作清单（v1 · **共 32 个 op**）

> **正本（含每条的说明与返回要点）= `skills/akdagent-protocol/SKILL.md` 的「操作清单」节**（本文件不再复制一份，避免两处漂移）。
> 真源 = `sv/lua/AKDAgentBridge.lua` 的 `OPS.*`；心跳的 `ops` 数组就是这张表。
> 分组速览：**读 13** = `ping` · `selftest` · `get_project_info` · `get_current_group` · `get_selected_notes` · `get_melody_notes` · `get_measure_info` · `get_note_time` · `get_layout` · `get_lyrics_attrs` · `get_phonemes` · `get_computed_pitch` · `get_computed_attributes`；
> **写 18** = `transpose_selected_notes` · `set_selected_lyrics` · `apply_lyrics` · `fill_track_lyrics` · `set_note_languages` · `set_note_rap_accents` · `set_note_phonemes` · `set_note_phoneme_attrs` · `set_note_dur` · `write_chords` · `create_harmony_group` · `write_pit` · `align_audio` · `apply_tempo` · `playback` · `run_script` · 🆕 `apply_ornaments` · 🆕 `set_automation`；
> **维护 1** = `stop`（桥常驻，改了桥源码必须 `stop` 后在宿主里重跑）。
> 关系：**32 op ↔ 44 个 MCP 工具**（`knowledge/docs/MCP工具清单.md`）—— 工具更多，因为分离/分析/生成/织体渲染完全本地算。

> ⚠️ **写操作的通用约束**（见 `skills/sv-scripting/references/04-notes.md` 音符布局铁律）：
> SV **发声组**内同时间不得重叠（**重叠 = 违规**）；**缝隙允许但要告知**，消缝须经用户同意；**IX 乐器轨允许并列**。

## 时序示例

```
Client（MCP / Electron）                          Bridge（宿主内常驻 Lua，轮询 300ms）
  │ ① 读 akdagent-hb-sv.json：心跳新鲜？ops 里有这个 op？   ← canServe() 判据
  │ ② 删掉旧的 akdagent-res-sv.json（防止读到上一轮响应）
  │ ③ 原子写 akdagent-req-sv.json {v,seq,id:"fileipc-<seq>",op,args}
  │ 轮询 res（40ms/次，超时 10s）                        ──▶  读到 req → 解析
  │                                                         id 已在 done[]？→ 重发缓存响应 + consumeReq
  │                                                         否则 newUndoRecord() → dispatch(op,args)
  │ ◀───────────────────────────────────────────────────  写 res（.tmp → rename）
  │ res.id === 我发的 id ⇒ 命中（按字符串比 id，不比 seq）→ 返回给模型
  │                                                         consumeReq(快照)：内容没变才删 req
```

## 边界情况处理

- **两端目录不一致**（**头号故障**）：请求写了但桥永远读不到，表现为"一直超时、心跳又看不到"。先比心跳里的 `dir`。
- **桥未运行 / 宿主没开**：无心跳文件 ⇒ 客户端直接报"无心跳文件（桥未运行）"，不白等 10 秒。
- **心跳过期（>15s）**：判"桥可能已停"；但**别据此断言宿主状态** —— 看 `boot` 文件与 `akdagent-log-<host>.txt`。
- **重复响应**：客户端发请求前先删旧 `res`；桥应答后消费 `req`（内容没变才删）⇒ 旧的"每拍重发响应"已消除。
- **同一宿主开两个实例**：互抢同一份 `akdagent-*-<host>.json`（文件名只带宿主、不带实例号）⇒ 同宿主只开一个。
- **不许探测**：Lua 绑定的错误**穿透 `pcall`**（直接弹脚本错误框）⇒ 桥内不做探测，模型侧也别拿"试一下"当查询手段。

> **载荷过大的坑（形态已变）**：剪贴板时代经 base64 + `powershell -EncodedCommand` 有 ~32KB 命令行上限；
> 现在载荷走文件 ⇒ 命令行不再是瓶颈，但**请求/响应仍不宜塞上千个展开后的音符**（响应体量护栏还没实现）。
> 对策：**把"展开/生成"放到桥端做，只传短指令**（和弦序列而非展开音符、模板而非成品织体）。
> 历史实测见 `skills/sv-scripting/examples/载荷过大-ENAMETOOLONG.md`。
