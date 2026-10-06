import { E as isMetaKey, C as addMeta, h as creatorOf, l as isLyricCjk, f as PU_LYRIC_QUOTES, m as isLyricOpenQuote, n as isLyricTrailingPunct, R as applyPageMetaToDefaults, T as Fraction, U as lcm, V as typeOfDuration, D as getMeta, i as creatorTypeOf, d as PU_LYRIC_PUNCTUATION } from "./pagemeta.js";
const SIMPLE_DIVISIONS = 48;
const zh = {
  // 应用与页头
  "app.windowTitle": "悦谱",
  "header.home": "返回开始",
  "header.brandAria": "悦谱 Dolce",
  "header.subtitle": "乐谱工作台",
  "header.save": "保存",
  "header.saveAs": "另存为",
  "header.export": "导出",
  "header.more": "更多",
  "status.recogView": "核对",
  "status.code": "源码",
  "status.code.title": "显示代码区（取消勾选收起，谱面占满；并排时原图与排版稿各占一半）",
  "status.compare.title": "对着原图核对的方式：不核对（只看排版稿）、并排原图、原图片段，或进核对视图叠加识别结果",
  "status.compare.aria": "核对方式",
  "status.compare.none": "不核对",
  "toolbar.recogGroup": "识别",
  // 工具栏
  "toolbar.aria": "乐谱工具栏",
  "toolbar.lines": "分行",
  "toolbar.linesAria": "分行方式",
  "toolbar.layoutOriginal": "原始排版",
  "toolbar.layoutOriginal.title": "保留导入或识别时的行结构",
  "toolbar.phrase": "按乐句重排",
  "toolbar.phrase.title": "根据歌词和音乐乐句重新安排换行",
  "toolbar.recognize": "原图对照",
  "toolbar.recognize.title": "将识别结果与上传原图进行对照",
  "toolbar.recogView": "原图对照方式",
  "toolbar.recogView.floating": "附近浮窗",
  "toolbar.recogView.inplace": "原位叠加",
  "toolbar.recogView.original": "仅原图",
  "toolbar.listen": "试听",
  "toolbar.mobileView": "移动端工作区视图",
  "toolbar.mobileCode": "源码",
  "toolbar.mobileScore": "预览",
  "toolbar.zoom": "缩放",
  "toolbar.zoomOut": "缩小",
  "toolbar.zoomOut.title": "缩小 (Ctrl/⌘ -)",
  "toolbar.zoomReset.title": "复位 (Ctrl/⌘ 0)",
  "toolbar.zoomIn": "放大",
  "toolbar.zoomIn.title": "放大 (Ctrl/⌘ +)",
  "toolbar.page": "页面",
  "toolbar.prev": "上一页",
  "toolbar.next": "下一页",
  "toolbar.hanzi": "简繁",
  "toolbar.hanzi.title": "整篇转换源码中的中文（简体 ⇄ 繁体）",
  "toolbar.options": "设置",
  "toolbar.help": "帮助",
  "toolbar.help.title": "功能帮助、123 格式与记谱法说明",
  // 试听
  "play.play": "播放",
  "play.pause": "暂停",
  "play.stop": "停止",
  "play.stop.title": "停止试听（回到曲首）",
  "play.progress": "播放进度",
  "play.time": "播放时间",
  "play.speed": "播放速度",
  // 窗格
  "pane.code": "乐谱源码",
  "pane.docFormat": "源码格式",
  "pane.docFormat.title": "切换源码格式（识别结果不重新识别；打开的文件切回「原文」可还原）",
  "pane.score": "排版",
  "pane.visualMode.title": "可视化编辑：编辑模式（方块光标）改选中的元素，插入模式（竖线光标）在光标处插入；Insert / Esc 切换",
  "pane.beatCount.title": "点一下跳到下一处",
  "pane.palette": "面板",
  "pane.palette.title": "记号面板：用鼠标点唱名、八度、时值、记号、换行",
  "pane.paletteAria": "记号面板",
  "pane.beatCheck": "拍",
  "pane.beatCheck.title": "小节时值自检：拍数与拍号对不上的小节标红",
  "pane.formatMarks.title": "显示格式标记：换行符 ↵ 与换页符 ⤓（Ctrl/⌘+Shift+M）",
  // 排版档
  "view.aria": "排版模式",
  "view.expanded": "展开",
  "view.expanded.title": "反复与多段歌词逐段展开，一段一页（投影用）",
  "view.original": "原样",
  "view.original.title": "按原谱排一遍，多段歌词叠排、反复不展开",
  "view.staff": "五线谱",
  "view.staff.title": "五线谱（需有 MusicXML 底本）",
  "view.mixed": "混排",
  "view.mixed.title": "五线谱叠加简谱层（需有 MusicXML 底本）",
  // 开始页
  "start.eyebrow": "开始创作",
  "start.title": "把乐谱带进来，可编辑，可导出",
  "start.lead": "本地识别、校对排版、简谱与五线谱切换、在线试听和多格式导出。",
  "start.image": "图片识谱",
  "start.image.sub": "上传图片，自动识别",
  "start.score": "导入乐谱",
  "start.score.sub": "继续编辑已有谱面",
  "start.score.formats": "123 · JPWABC · jianpu-ly · 文本谱 · MusicXML · ABC",
  "start.privacy": "图片在本地识别，不会上传",
  "start.sample": "查看示例乐谱",
  "start.progress": "正在识别并生成排版",
  "start.progress.sub": "完成后将直接显示可编辑的乐谱",
  "start.recognizeFailed": "识别失败，请更换图片后重试",
  "start.filterImage": "乐谱图片 / PDF",
  // 编辑器状态（app.ts）
  "status.bookSheet.ref": "文件指定",
  "status.bookSheet.manual": "手动指定",
  "status.bookSheet.auto": "自动",
  "status.bookSheet.using": "诗集样式（{where}）：{name}",
  "status.bookSheet.others": "（同目录另有 {n} 份，可在设置里改选）",
  "status.bookSheet.bad": "诗集样式表读不了（{name}）：{error}",
  "filter.bookSheet": "诗集样式表",
  "filter.scoreDocs": "简谱 / 123 / jianpu-ly / 文本谱 / MusicXML / ABC / Muse",
  "fmt.textScore": "文本谱",
  "status.staffFailed": "转五线谱失败：{error}",
  "status.parseFailed": "{what} 解析失败：{error}",
  "status.puFatal": "文本谱无法解析：{error}",
  "status.j123Fatal": "123 无法解析：第 {line} 行 {error}",
  "status.abcNoNotes": "ABC 解析失败：没读出音符",
  "status.jcxNoNotes": "Muse 简谱解析失败：没读出音符",
  "status.noLines": "这份{what}里没有可排的曲行",
  "status.layoutFailed": "{what}排版失败：{error}",
  "status.diagnostics": "{what}：{n} 处需要留意（第 {line} 行 {message}）",
  "xmlImport.title": "导入 MusicXML",
  "xmlImport.body": "这是单声部歌谱，可以转成简谱来编辑（原 MusicXML 文件不动）。",
  "xmlImport.convertTo": "转成 {format} 编辑",
  "xmlImport.keep": "保持 MusicXML（看五线谱）",
  "xmlImport.remember": "记住选择，以后不再询问（可在设置里改回）",
  "status.notPu": "这不像文本谱：{reason}",
  "status.omrLosses": "识别结果已转成 123 核对文本；有 {n} 样 123 表达不了，已略去",
  "status.xmlReadFailed": "MusicXML 读取失败：{error}",
  "status.xmlNoNotes": "这份 MusicXML 里没有音符",
  "status.xmlUnreadable": "这份 MusicXML 读不出来，无法转换",
  "status.phraseSame": "行结构没变：乐句断点与现在的分行一致",
  "status.phraseFailed": "按乐句重排失败：{error}",
  "status.hanUnparsable": "谱面解析不出来，无法简繁转换",
  "status.loading": "加载中",
  "status.toTraditional": "已转为繁体",
  "status.toSimplified": "已转为简体",
  "status.hanMissed": "{done}（{n} 处未能写回原文）",
  "status.hanFailed": "简繁转换失败",
  "pane.readOnly": "只读",
  "saveAs.lossTitle": "另存为会丢东西",
  "status.saveAsUnsupported": "暂不支持另存为 {target}",
  "status.savedAs": "已另存为 {format}（{ext}）",
  "file.untitled": "未命名",
  "pick.lyric": "歌词: {text}",
  "pick.note": "音符: {text}",
  "pick.text": "文本: {text}",
  "pick.classes": "已选: {list}",
  "pick.element": "已选: 元素",
  // 格式名
  "fmt.target.123": "简谱 123",
  "fmt.target.jpwabc": "简谱 JPWABC",
  "fmt.target.abc": "ABC",
  "fmt.target.tomato": "番茄简谱",
  "fmt.target.shige": "诗歌本文本谱",
  "fmt.target.jly": "jianpu-ly 文本（.jly）",
  "fmt.target.jcx": "Muse 简谱（.jcx）",
  "fmt.jcx.label": "Muse 简谱",
  "fmt.pu.label": "文本谱",
  "fmt.pu.labelWith": "文本谱·{dialect}",
  "fmt.short.tomato": "番茄",
  "fmt.short.shige": "诗歌本",
  // 对话框（dialogs.ts）
  "dlg.ok": "确定",
  "dlg.cancel": "取消",
  "han.auto": "自动检测",
  "han.s2t": "简体 → 繁体",
  "han.t2s": "繁体 → 简体",
  "han.hint": "转换源码中的歌词、标题与词曲信息，乐谱代码不变；可用 Ctrl/⌘+Z 撤销。",
  "han.direction": "转换方向",
  "han.title": "简繁转换",
  "paper.longImage": "长图",
  "paper.landscape": "横",
  "paper.portrait": "竖",
  "paper.landscapeOpt": "横",
  "paper.portraitOpt": "竖",
  "paper.followFile": "跟随文件（{what}）",
  "paper.top": "上",
  "paper.right": "右",
  "paper.bottom": "下",
  "paper.left": "左",
  "paper.marginTitle": "{side}边距（mm），留空 = 自动",
  "paper.paper": "纸张",
  "paper.orientation": "方向",
  "paper.margins": "边距（mm）",
  "font.hei": "黑体",
  "font.song": "宋体",
  "font.kai": "楷体",
  "font.fangsong": "仿宋",
  "font.weibei": "魏碑",
  "font.yuan": "圆体",
  "font.default": "默认",
  "font.sizeTitle": "字号（pt），留空 = {fallback}",
  "font.followFile": "跟随文件",
  "font.factory": "出厂",
  "role.group": "页眉（各模式共用）",
  "role.title": "标题",
  "role.scripture": "经文",
  "role.credit": "词曲作者",
  "settings.linesPlaceholder": "例如 4 或 4|3|3（留空=自动）",
  "settings.linesPerPage": "每页行数",
  "settings.ratio": "谱面比例",
  "settings.fontSize": "基础字号",
  "settings.color": "前景色",
  "settings.bgColor": "背景色",
  "settings.staffFollow": "跟随文件（{v}）",
  "settings.factoryValue": "出厂 {v}",
  "settings.staffSize": "谱表大小（mm）",
  "settings.lyricSize": "歌词字号（pt）",
  "settings.hideBarNumbers": "隐藏小节号",
  "settings.puNote": "改字号会整块等比缩放版式量好的尺寸（纸与页边距不跟着缩），与谱面自带的 FontSize 指令同一语义；展开档与 .jpwabc 共用同一套设置。",
  "settings.staffNote": "谱表大小是五条线的总高度，字号随之按比例看起来变小/变大；留空跟随文件。换了纸或谱表大小，就按新版面重新铺排，谱里原来的分行坐标不再用。",
  "settings.noteSound": "改音时发声",
  "settings.bookSheet.manual": "手动",
  "settings.bookSheet.none": "无",
  "settings.bookSheet.choose": "选择…",
  "settings.bookSheet.disable": "不用",
  "settings.bookSheet.auto": "自动查找",
  "settings.bookSheet.write": "写入文件",
  "settings.bookSheet": "诗集样式",
  "settings.xml.ask": "每次询问",
  "settings.xml.keep": "保持 MusicXML",
  "settings.xml.convert": "转成 {format}",
  "settings.xml.open": "打开 MusicXML",
  "settings.tab.layout": "版面",
  "settings.tab.header": "页眉与样式",
  "settings.tab.other": "其他",
  "settings.title": "设置",
  "settings.reset": "恢复本档默认",
  "settings.lang": "界面语言",
  "settings.lang.auto": "跟随系统",
  "role.subtitle": "副标题",
  "lang.zh": "中文",
  "lang.en": "English",
  // 可视化编辑动作（visual/keys.ts）
  "va.group.mode": "模式",
  "va.group.nav": "移动与选择",
  "va.group.note": "音符",
  "va.group.dur": "时值",
  "va.group.mark": "记号",
  "va.group.brk": "换行",
  "va.group.edit": "编辑",
  "va.group.meas": "小节",
  "va.group.voice": "声部",
  "va.mode.insert.label": "插入模式",
  "va.mode.edit.label": "编辑模式",
  "va.nav.prev.label": "前一个",
  "va.nav.next.label": "后一个",
  "va.nav.extendPrev.label": "向前扩选",
  "va.nav.extendNext.label": "向后扩选",
  "va.nav.measPrev.label": "上一小节",
  "va.nav.measNext.label": "下一小节",
  "va.nav.extendMeasNext.label": "向后扩选一小节",
  "va.nav.extendMeasPrev.label": "向前扩选一小节",
  "va.nav.gotoMeasure.label": "跳到小节…",
  "va.sel.all.label": "全选",
  "va.nav.home.label": "行首",
  "va.nav.end.label": "行尾",
  "va.note.digit.label": "唱名 / 休止",
  "va.note.letter.label": "音名",
  "va.step.up.label": "音级升",
  "va.step.down.label": "音级降",
  "va.semi.up.label": "升半音",
  "va.semi.down.label": "降半音",
  "va.oct.up.label": "升高八度",
  "va.oct.down.label": "降低八度",
  "va.acc.sharp.label": "升号",
  "va.acc.flat.label": "降号",
  "va.acc.natural.label": "还原号",
  "va.dur.halve.label": "时值减半",
  "va.dur.double.label": "时值加倍",
  "va.dur.dot.label": "附点",
  "va.sus.add.label": "增时线",
  "va.bar.insert.label": "小节线",
  "va.brk.line.label": "换行",
  "va.brk.page.label": "换页",
  "va.del.forward.label": "删除",
  "va.del.back.label": "退格",
  "va.slur.toggle.label": "圆滑线",
  "va.tie.toggle.label": "延音线",
  "va.tuplet.toggle.label": "连音",
  "va.deco.fermata.label": "延长号",
  "va.deco.accent.label": "重音",
  "va.mark.next.label": "下一个记号",
  "va.mark.prev.label": "上一个记号",
  "va.chord.add.label": "加和弦音",
  "va.voice.set.label": "声部",
  "va.meas.append.label": "追加小节",
  "va.meas.insert.label": "前插小节",
  "va.meas.delete.label": "删除小节",
  "va.meas.key.label": "调号…",
  "va.meas.time.label": "拍号…",
  "va.meas.tempo.label": "速度…",
  "va.bar.single.label": "普通小节线",
  "va.bar.double.label": "双小节线",
  "va.bar.final.label": "终止线",
  "va.bar.repeatStart.label": "反复开始",
  "va.bar.repeatEnd.label": "反复结束",
  "va.volta.1.label": "第一房",
  "va.volta.2.label": "第二房",
  "va.jump.segno.label": "𝄋 记号",
  "va.jump.coda.label": "⊕ 尾声",
  "va.jump.dc.label": "D.C.",
  "va.jump.ds.label": "D.S.",
  "va.jump.fine.label": "Fine",
  "va.view.formatMarks.label": "显示格式标记",
  "va.edit.copy.label": "复制",
  "va.edit.cut.label": "剪切",
  "va.edit.paste.label": "粘贴",
  "va.edit.repeat.label": "重复",
  "va.lyric.entry.label": "歌词录入",
  "va.chord.entry.label": "和弦名录入",
  "va.text.entry.label": "文字",
  "va.dyn.entry.label": "力度",
  "va.edit.transpose.label": "移调…",
  "va.edit.undo.label": "撤销",
  "va.edit.redo.label": "重做",
  "va.mode.insert.help": "方块光标变成竖线，落在选中元素的后面",
  "va.mode.edit.help": "竖线光标变成方块，罩住光标前面那个元素",
  "va.nav.prev.help": "编辑模式选中前一个元素；插入模式把光标往前挪一格",
  "va.nav.next.help": "编辑模式选中后一个元素；插入模式把光标往后挪一格",
  "va.nav.extendPrev.help": "选区往前多罩一个元素",
  "va.nav.extendNext.help": "选区往后多罩一个元素",
  "va.nav.measPrev.help": "跳到本小节开头；已在开头就跳到上一小节开头（编辑模式选中那里的第一个元素，插入模式光标落在它前面）",
  "va.nav.measNext.help": "跳到下一小节开头",
  "va.nav.extendMeasNext.help": "选区往后扩到下一小节末尾",
  "va.nav.extendMeasPrev.help": "选区往前扩到上一小节开头",
  "va.nav.gotoMeasure.help": "输入小节号跳过去（多声部时在当前声部里数；小节号同右上角读数）",
  "va.sel.all.help": "谱面有焦点时选中全曲（代码区有焦点时照旧全选文本）",
  "va.nav.home.help": "跳到本行（到上一个换行符为止）的第一个元素",
  "va.nav.end.help": "跳到本行的最后一个元素",
  "va.note.digit.help": "编辑模式改选中音符的唱名（八度、时值不变）；插入模式按当前时值插入一个音符",
  "va.note.letter.help": "按调号换成唱名（G 调里 G 是 1、F 是升 4 照调号不另写）。编辑模式改选中的音，八度取离原来那个音最近的；插入模式插一个音，八度取离前一个音最近的",
  "va.step.up.help": "按调内音阶往上走一级（7 往上成高音 1），临时升降号去掉；选了一段整段一起走。插入模式改光标前刚插的那个音",
  "va.step.down.help": "按调内音阶往下走一级（1 往下成低音 7）",
  "va.semi.up.help": "升高半音：落在调内音上写本音，否则升号调写升号、降号调写降号（C 调往上写升号）",
  "va.semi.down.help": "降低半音（C 调往下写降号）",
  "va.oct.up.help": "加一个高音点（或去掉一个低音点），选了一段就整段一起移；插入模式改光标前刚插的那个音",
  "va.oct.down.help": "加一个低音点（或去掉一个高音点）",
  "va.acc.sharp.help": "加升号，再按一次取消",
  "va.acc.flat.help": "加降号，再按一次取消",
  "va.acc.natural.help": "加还原号，再按一次取消",
  "va.dur.halve.help": "编辑模式：有增时线先去掉一半，否则加一条减时线；插入模式：改「当前时值」",
  "va.dur.double.help": "编辑模式：有减时线先去一条，否则拍数翻倍（加增时线）；插入模式：改「当前时值」",
  "va.dur.dot.help": "加上或去掉附点",
  "va.sus.add.help": "编辑模式在选中音符后面加一条增时线；插入模式在光标处插入一条",
  "va.bar.insert.help": "在选中元素后面（插入模式：光标处）插入一根小节线",
  "va.brk.line.help": "在选中元素后面（插入模式：光标处）换行；这一行曲下的歌词跟着按对位格拆成两半",
  "va.brk.page.help": "同上，换页",
  "va.del.forward.help": "编辑模式删掉选中的元素（音符连同它的增时线、和弦名、装饰；换行符删掉后两行并一行，歌词接起来）；插入模式删光标后面那个",
  "va.del.back.help": "编辑模式同 Delete；插入模式删光标前面那个",
  "va.slur.toggle.help": "选区首尾两个音之间加上圆滑线；已有同样起止的就去掉",
  "va.tie.toggle.help": "选中的音与后面同音高的音之间加上或去掉延音线",
  "va.tuplet.toggle.help": "选中的几个音做成连音（选 3 个是三连音，按选中的个数），已经是一组就拆回去。123 写 (3: … )、ABC 写 (3、MusicXML 改时值比例",
  "va.deco.fermata.help": "选中的音加上或去掉延长号",
  "va.deco.accent.help": "选中的音加上或去掉重音记号",
  "va.mark.next.help": "在选中音符挂的记号（和弦名、延长号等装饰、注记、圆滑线）之间轮换选中",
  "va.mark.prev.help": "反方向轮换",
  "va.chord.add.help": "往选中的音上叠一个音（唱名，放在最高音之上最近处），成为和弦。MusicXML 可用；Alt+点击和弦里的某个符头单独选中它、按 Delete 只删它",
  "va.voice.set.help": "插入模式下新插的音落在第几声部（同一谱表上的第二、三、四条旋律，符干各朝一边）。MusicXML 可用",
  "va.meas.append.help": "在曲末追加一个空小节（整小节休止），所有声部一起加",
  "va.meas.insert.help": "在选中（光标所在）那一小节前面插一个空小节",
  "va.meas.delete.help": "删掉选中的小节（选了几小节就删几小节）；MusicXML 所有声部一起删",
  "va.meas.key.help": "从这一小节起换调号：输入 1=G、G、bB、F# 之类",
  "va.meas.time.help": "从这一小节起换拍号：输入 3/4、6/8 之类",
  "va.meas.tempo.help": "这一小节开头标速度：输入每分钟拍数（♩= 几），0 或留空去掉",
  "va.bar.single.help": "选中小节线（或所在小节的尾线）改回普通单线",
  "va.bar.double.help": "所在小节的尾线改成双线",
  "va.bar.final.help": "所在小节的尾线改成终止线",
  "va.bar.repeatStart.help": "所在小节的头线改成反复开始 |:",
  "va.bar.repeatEnd.help": "所在小节的尾线改成反复结束 :|",
  "va.volta.1.help": "选中的小节标成第一房（再点一次去掉）",
  "va.volta.2.help": "选中的小节标成第二房（再点一次去掉）",
  "va.jump.segno.help": "这一小节开头标 segno（D.S. 跳回这里）",
  "va.jump.coda.help": "这一小节开头标 coda",
  "va.jump.dc.help": "这一小节末尾标 D.C.（从头反复）",
  "va.jump.ds.help": "这一小节末尾标 D.S.（从 𝄋 处反复）",
  "va.jump.fine.help": "这一小节末尾标 Fine（反复后到此结束）",
  "va.view.formatMarks.help": "谱面上显示或隐藏换行符 ↵ 与换页符 ⤓（点一下即选中）",
  "va.edit.copy.help": "复制选中的音（连同增时线、小节线）。谱面有焦点时才接管，代码区里照旧复制文本",
  "va.edit.cut.help": "复制后删掉",
  "va.edit.paste.help": "插入模式贴在光标处，编辑模式贴在选区后面（不覆盖），贴完选中贴进来的那段。同一种格式原样贴；贴到别的格式只带音、增时线、小节线，按唱名走（换了调的照唱名）",
  "va.edit.repeat.help": "把选中的那段原样再贴一遍在后面，并选中新贴的——接着按 R 一直往后重复（不动剪贴板）",
  "va.lyric.entry.help": "在选中的音下面开一个框逐字填词：空格 / Tab 下一个音，- 连字符（接下一个音），_ 一字多音（跳过下一个音），/ 这个音不填，Shift+空格 上一个音，Enter 下一段，Esc 结束。一次打几个汉字自动一字一音往后分",
  "va.chord.entry.help": "在选中的音上面开一个框填和弦名（C、Am7、G/B…）：空格填好跳到下一个音，Shift+空格 上一个，Enter 填好结束，Esc 放弃；清空 = 去掉和弦名",
  "va.text.entry.help": "在选中的音上方加一段文字（渐慢、副歌、反复两遍……），已有的改它；清空 = 去掉",
  "va.dyn.entry.help": "给选中的音标力度（p、mp、mf、f、ff、sfz……）：空格填好跳到下一个音，Enter 结束；清空 = 去掉",
  "va.edit.transpose.help": "全曲换调（简谱唱名不变、只改调号；ABC、MusicXML 的音一起移），或选中的音移几个半音",
  "va.edit.undo.help": "与代码区共用同一份撤销记录",
  "va.edit.redo.help": "同上",
  // 可视化编辑状态（visual/*）
  "beat.short": "差 {d} 拍（该 {want} 拍，实际 {got} 拍）",
  "beat.over": "多 {d} 拍（该 {want} 拍，实际 {got} 拍）",
  "beat.measure": "第 {n} 小节{issue}",
  "beat.count": "{n} 小节拍数不对",
  "beat.emptyCursor": "这一小节是空的：光标已放进去，可以接着输入音符",
  "beat.empty": "空小节：这一小节的音都删掉了",
  "beat.cmTitle": "这一小节的拍数与拍号对不上",
  "vis.modeEdit": "编辑",
  "vis.modeInsert": "插入 · {dur}",
  "vis.dur0": "四分",
  "vis.dur1": "八分",
  "vis.dur2": "十六分",
  "vis.dur3": "三十二分",
  "vis.dur4": "六十四分",
  "vis.durN": "{n} 条减时线",
  "vis.puBreakSelected": "选中了换行（文本谱另起一行 Q:），按 Delete 与下一行合并",
  "vis.unsupported": "这种格式暂不支持在谱面上改谱，请在源码区修改",
  "vis.cantBreak": "这里没法换行",
  "vis.cantUnbreak": "这处换行删不掉",
  "vis.lineStart": "行首不用再换行",
  "vis.durMax": "当前时值最长到四分音符（更长的用增时线 -）",
  "vis.durMin": "减时线最多四条",
  "vis.selectNote": "先选中一个音符",
  "vis.nothingToDelete": "没有选中可删的东西",
  "vis.breakAlone": "换行符请单独选中再删",
  "vis.noMarks": "这个音符上没有挂记号",
  "vis.markSelected": "选中记号：{mark}",
  "mark.harmony": "和弦 {name}",
  "mark.annotation": "注记 {name}",
  "mark.dynamic": "力度 {name}",
  "mark.slur": "圆滑线/延音线",
  "mark.other": "记号 {name}",
  "vis.rest": "休止",
  "vis.degree": "唱名 {d}",
  "vis.contLyrics": "这行曲的歌词用了 +: 续行，暂不能自动拆分，请在源码里改",
  "vis.noPageBreak": "这种格式没有换页符号",
  "vis.breakNotSymbol": "这种格式的换行不是符号",
  "vis.notMusicLine": "光标不在音乐行上",
  "vis.unreadableNote": "看不懂这个音符的写法：{src}",
  "vis.unreadableNoteShort": "看不懂这个音符的写法",
  "vis.octMax": "八度点最多三个",
  "vis.longEnough": "已经够长了",
  "vis.slurNest": "这种格式的弧不能嵌套或交叠（括号按先开先闭配对），请先去掉相交的那条",
  "vis.slurTwo": "圆滑线至少连两个音",
  "vis.slurBrackets": "找不到这条弧的括号",
  "vis.slurSelect": "先选中要连起来的几个音（至少两个）",
  "vis.noNext": "后面没有音了",
  "vis.tieSamePitch": "延音线只连同音高的两个音；不同音用圆滑线（s）",
  "vis.noDeco": "这种格式暂不支持在谱面上加记号",
  "jpw.dashMix": "JP-Word 的增时线不能与减时线、附点连写",
  "jpw.doubleDot": "JP-Word 不支持双附点",
  "jpw.doubleAcc": "JP-Word 没有重升重降",
  // 导出 / 另存为 / 切格式 / 识别 / 试听
  "export.noPageSize": "无法读取乐谱页面尺寸",
  "export.noSvg": "当前页面没有可导出的乐谱",
  "export.pngName": "{name}-第{n}页.png",
  "export.noLines": "这份谱里没有可导出的曲行",
  "export.noPuLines": "这份文本谱里没有可导出的曲行",
  "export.jpwUnreadable": "这份 .jpwabc 读不出来",
  "export.mixedName": "混排",
  "export.staffName": "五线谱",
  "export.currentFormat": "{format}（当前格式）",
  "export.title": "导出",
  "export.failed": "导出失败",
  "saveAs.title": "另存为",
  "saveAs.failed": "另存失败",
  "fs.confirmTitle": "切换格式",
  "fs.confirmBody": "源码已手工修改过。切换格式会重新生成文本，这些修改将丢失。要继续吗？",
  "fs.origin": "{format}（原文）",
  "fs.unreadable": "这份谱现在读不出来，无法转换格式",
  "fs.backToOrigin": "已切回原文（{format}）",
  "fs.lossTitle": "转换会丢东西",
  "fs.failed": "转换失败：{error}",
  "fs.converted": "已转成 {format}（未保存，原文件未改动；切回「原文」可还原）",
  "omr.formatSwitched": "已切换输出格式：{format}（未重新识别）",
  "omr.running": "识别中…可能需要几十秒",
  "omr.done": "识别完成（{sec}s）",
  "omr.beatIssues": "；{n} 个小节拍数与拍号对不上（核对视图已标红，多半是增时线/减时线读错）",
  "omr.failed": "识别失败：{error}",
  "omr.staffProgress": "五线谱识别中… {done}/{total} 页",
  "omr.noStaff": "这份 PDF 里没找到五线谱",
  "omr.staffDone": "五线谱识别完成（{sec}s）：{pages} 页 / {parts} 个声部 / {notes} 个音符",
  "omr.staffSkipped": "，{n} 页无谱表已跳过",
  "omr.staffNoJp": "；简谱文本未变——五线谱装不进 .jpwabc，请从「导出 → MusicXML」取产物",
  "omr.compare": "原图对照",
  "omr.back": "返回排版稿",
  "play.normal": "原速",
  "play.marked": "谱面 ♩={tempo}",
  "play.unmarked": "谱面未标速度，按 ♩=90",
  "play.speedTitle": "播放速度：{marked}，当前 ♩={bpm}",
  "play.noLines": "这份谱里没有可试听的曲行",
  "play.loadFailed": "试听加载失败：{error}",
  "play.timeTitle": "已播 {at}，剩余 {left}，总长 {total}（点击切换已播 / 剩余）",
  "play.loading": "加载中",
  "play.resume": "继续",
  "play.titlePause": "暂停试听",
  "play.titleResume": "从暂停处接着播",
  "play.titleLoading": "正在加载试听音色",
  "play.titlePlay": "播放试听",
  "feedback.envHeader": "--- 以下为环境信息，便于定位问题，可自行删除 ---",
  "feedback.version": "版本：{v}",
  "feedback.system": "系统：{v}",
  "feedback.date": "日期：{v}",
  "feedback.subject": "悦谱 Dolce 反馈 v{v}",
  "feedback.body": "请描述问题或建议：",
  "update.title": "发现新版本",
  "update.body": "当前版本 {cur}，最新版本 {latest}。是否打开下载页面？",
  // 另存为丢失清单（model/capability.ts）
  "feat.harmony": "和弦符号",
  "feat.harmonyOffset": "长音中间不在整拍上的和弦（会提前到音符上）",
  "feat.multiVoice": "多声部",
  "feat.noteStack": "同一声部里同时发声的音（和弦内音、声部内第二声部，只留简谱印的旋律）",
  "feat.dynamics": "力度与渐强渐弱",
  "feat.playOrder": "演唱顺序（房号跳转、第几遍配第几段词）",
  "feat.style": "样式表引用",
  "feat.layoutDirectives": "版面指令（字号、页边距等）",
  "feat.keyChange": "曲中转调",
  "feat.multiVerse": "多段歌词",
  "feat.volta": "房号",
  "feat.grace": "倚音",
  "feat.slur": "圆滑线",
  "feat.textLine": "段落词与注记",
  "feat.multiSong": "一个文件里的多首曲子",
  "feat.pageText": "页眉页脚",
  "feat.meta": "扩展曲目信息（英文标题、经文、标签等）",
  "feat.paper": "谱里写的纸张、页边距、五线谱谱表大小与歌词字号、页眉字体（改记进设置）",
  "feat.verseLabel": "印刷段号",
  "feat.rhythmNote": "节奏音符（有声无音高）",
  "feat.invisibleRest": "不可见休止",
  "feat.nestedArc": "套在另一条弧线里的弧线（外面那条或里面那条会丢一条）",
  "feat.oddTuplet": "比例特殊的多连音（按 n 个音占 n−1 拍写不出来）",
  "feat.slurCrossTuplet": "跨出多连音组的弧线（会截到组的边界）",
  "feat.lyricOnRest": "挂在休止符上的歌词",
  "feat.pageBreak": "换页（会改成换行）",
  "loss.body": "这份谱里有 {n} 样东西，存成 {format} 之后会丢：",
  "loss.continue": "要继续吗？",
  // 解析诊断（随解析按界面语言产出）
  "diag.pu.graceChar": "倚音里无法识别的字符 '{ch}'",
  "diag.pu.tempMeter": "临时拍号无法解析：'{body}'",
  "diag.pu.orphanAnchor": "'@' 前面没有可跟词的符号",
  "diag.pu.badBarline": "无法识别的小节线 '{ch}'",
  "diag.pu.extraParen": "多余的 ')'",
  "diag.pu.extraBang": "多余的 '!'",
  "diag.pu.graceOpen": "倚音的 '[' 没有闭合",
  "diag.pu.extraBracket": "多余的 ']'",
  "diag.pu.orphanCommand": "记号 &{name} 前面没有可挂载的符号",
  "diag.pu.unknownCommand": "未知记号 &{name}",
  "diag.pu.quoteOpen": "双引号没有闭合",
  "diag.pu.orphanAnnotation": '注释 "{body}" 前面没有可挂载的符号',
  "diag.pu.layerOpen": "'{' 没有闭合",
  "diag.pu.badChar": "无法识别的字符 '{ch}'",
  "diag.pu.wedgeOpen": "渐强/渐弱没有用 '!' 收尾",
  "diag.pu.lyricNoteOpen": "歌词说明文字没有闭合",
  "diag.pu.lyricGroupOpen": "歌词里的 '{' 没有闭合",
  "diag.pu.lyricChar": "歌词里无法识别的字符 '{text}'",
  "diag.pu.badKey": "调号 '{v}' 不是 A–G（可带升降号）的形式",
  "diag.pu.badMeter": "拍号 '{v}' 无法解析",
  "diag.pu.unknownField": "未知头部字段 '{key}'",
  "diag.pu.lyricNoMusic": "空的 Q: 行下面的歌词没有音符可对，已忽略",
  "diag.pu.orphanLyric": "歌词行前面没有曲行",
  "diag.pu.noQ": "像曲行但没有 Q: 前缀：'{text}'",
  "diag.jly.graceChord": "倚音和弦（`g[1&3&5]`）",
  "diag.jly.graceBad": "倚音组里读不动的写法",
  "diag.jly.backslash": "反斜杠时值（`1\\`）",
  "diag.jly.unknownWord": "认不出的词",
  "diag.jly.hanInL": "拉丁歌词行（`L:`）里的连续汉字：上游把整串当一个音节，要逐字分开请写成 `H:`",
  "diag.jly.anacrusis": "弱起拍号（`4/4,8`）",
  "diag.jly.chordToken": "和弦符号行里读不动的 token",
  "diag.jly.chordPitch": "和弦符号行里读不动的音名",
  "diag.jly.jumpNoBar": "跳转记号（还没有小节）",
  "diag.jly.textNoNote": "谱上文字（前面没有音）",
  "diag.jly.dynNoNote": "力度记号（前面没有音）",
  "diag.jly.fermataNoNote": "延长记号 `\\fermata`（前面没有音）",
  "diag.jly.breakNoBar": "换行/换页（前面还没有小节）",
  "diag.jly.barStyleNoBar": "小节线样式 `\\bar`（前面还没有小节）",
  "diag.jly.barStyle": "小节线样式 `\\bar`",
  "diag.jly.altNoClose": "反复跳跃 `A{`（前面没有配对的 `}`）",
  "diag.jly.closeNoOpen": "反复跳跃 `}`（前面没有 `R{` / `A{`）",
  "diag.jly.closeExtra": "反复跳跃 `}`（多出来的）",
  "diag.jly.breakNoNote": "换行/换页（后面没有音）",
  "diag.jly.slurUnpaired": "配不上对的圆滑线 `( )`",
  "diag.jly.phraseUnpaired": "配不上对的乐句线 `\\( \\)`",
  "diag.jly.nyPercussion": "打击乐 `x`",
  "diag.jly.nyLp": "原样 LilyPond 代码块（`LP: … :LP`）",
  "diag.jly.nyLayout": "布局 / 结构开关",
  "diag.jly.nyChords": "和弦符号 / 指板图 / 乐器",
  "diag.jly.nyArp": "琶音",
  "diag.jly.nyErhu": "二胡符号",
  "diag.jly.nyMisc": "排练记号 / 滑音 / 泛音",
  "diag.jly.nyOctaveShift": "基准八度切换",
  "diag.jly.nyOctaveKey": "八度快捷键（`8`=`1'`）",
  "diag.jly.nyCommand": "LilyPond 指令",
  "diag.jly.header": "页头字段 `{key}=`",
  "diag.jly.key": "调号 `{v}`",
  "diag.jly.extraSyl": "歌词第 {verse} 段多出 {n} 个音节",
  "diag.jly.chordsTooLong": "和弦符号行比曲子长（超出 {n} 个全音符）",
  "diag.jly.skipped": "{what}：本版不收，已跳过（没有写进模型）",
  "diag.jly.example": "{what}（例：{raw}）",
  "diag.j123.oldSkip": "歌词跳音符已改用 `/`，`*` 暂按跳音符读",
  "diag.j123.orphanSustain": "增时线前面没有音符",
  "diag.j123.orphanTie": "延音线前面没有音符",
  "diag.j123.emptyTuplet": "多连音里没有音符",
  "diag.j123.extraParen": "多余的 `)`",
  "diag.j123.emptySlur": "圆滑线里没有音符",
  "diag.j123.tupletOpen": "多连音缺 `)`",
  "diag.j123.slurOverlay": "圆滑线跨过了 `&`",
  "diag.j123.tupletOverlay": "多连音跨过了 `&`",
  "diag.j123.overlayBefore": "`&` 前面这个临时声部是空的",
  "diag.j123.overlayAfter": "`&` 后面这个临时声部是空的",
  "diag.j123.lyricOverflow": "第 {verse} 段歌词比这几行的音符多 {left} 个音节，多出的被忽略",
  "diag.j123.contUnsupported": "`+:` 只支持歌词行续写（紧跟在 `w:` 之后）",
  "diag.j123.verseNumber": "歌词行不带段号（`w{n}:` 已废）：写 `w:`，一行曲下按出现顺序编段，同段续写用 `+:`。这一行已丢弃",
  "diag.j123.badLength": "看不懂的默认音长：{v}",
  "diag.badKey": "看不懂的调号：{v}",
  "diag.noSuchKey": "没有这个调：{v}（已保留原文）",
  "diag.badTime": "看不懂的拍号：{v}",
  "diag.badPlayOrder": "看不懂的演唱顺序项：{v}",
  "diag.abc.chordSpace": "和弦 `{body}` 后面必须跟空格和它所属的音符",
  "diag.abc.badChord": "看不懂的和弦名 `{body}`（不合规的名字请加引号）",
  "diag.abc.multiVoice": "尚未支持的多声部写法 `{run}`",
  "diag.abc.inlineOpen": "inline 字段缺 `]`",
  "diag.abc.decoOpen": "装饰记号缺右 `!`",
  "diag.abc.quoteOpen": "和弦/注记缺右引号",
  "diag.abc.graceOpen": "倚音缺 `}`",
  "diag.abc.badChar": "认不出的记号 `{ch}`",
  "diag.jcx.wedge": "渐强/渐弱的括号没有配对（`(<` … `<)`、`(>` … `>)`）",
  "diag.jcx.textOpen": "`%%begintext` 没有对应的 `%%endtext`：后面的内容都当成了文字块",
  "diag.jcx.trackSkipped": "Muse 的 {style} 音轨（吉他谱/尤克里里谱）暂不支持，这一轨没有读入",
  "diag.jcx.gbkMissing": "GBK 写不出这些字，存成了 ?：{chars}",
  // 文本谱方言嗅探与杂项错误
  "sniff.noHeader": "找到了 Q:/C: 谱行，但没有任何头部字段，无法判断是番茄还是诗歌本文本谱",
  "sniff.notPu": "不像文本谱：既没有头部字段，也没有 Q:/C: 谱行",
  "sniff.tomato": "番茄头部字段 {n} 项",
  "sniff.shige": "诗歌本头部字段 {n} 项",
  "sniff.tie": "两方言特征持平，按番茄解析",
  "err.noSong": "这份文档里没有曲子",
  "err.xmlParse": "MusicXML 无法解析",
  "err.noVoice": "没有 .Voice",
  "err.noLines": "没有可写出的曲行",
  // 帮助对话框
  "help.title": "帮助",
  "help.tab.features": "功能帮助",
  "help.tab.visual": "可视化编辑",
  "help.tab.notation": "JPWABC 记谱",
  "help.tab.about": "关于",
  "help.close": "关闭",
  "help.badge.desktop": "🖥 仅桌面版",
  "help.badge.browser": "🌐 仅浏览器",
  "help.badge.mac": "🍎 仅 macOS 桌面",
  "help.featuresIntro": "下面列出编辑器已有的功能，点标题展开查看详情。带徽标的功能在桌面版与浏览器版行为不同。",
  "help.visualIntro": "在谱面上直接选中、插入、修改音符与记号，改动实时写回左侧源码。适用于所有格式（123、`.jpwabc`、文本谱、ABC 改左侧源码，MusicXML 改乐谱本身），「展开」「原样」「五线谱」「混排」四档都能用。",
  "help.notationIntro": "`.jpwabc` 是 JP-Word 使用的**纯文本简谱格式**，用普通文本分段描述乐谱：`.Title`（抬头）、`.Voice`（旋律，必需）、`.Words`（歌词）等，段头独占一行、以 `.` 开头。下面按**常用在前**的顺序介绍常见记号，每条都附实时渲染的效果。",
  "help.glossary": "术语速查（点开）",
  "help.level.common": "常用",
  "help.level.adv": "进阶",
  "help.onlyMode": "（仅{mode}）",
  "help.modeEdit": "编辑模式",
  "help.modeInsert": "插入模式",
  "about.name": "悦谱 Dolce",
  "about.version": "版本 {v}",
  "about.home": "项目主页",
  "about.check": "检查更新",
  "about.checking": "正在检查…",
  "about.checkFailed": "检查失败，请确认网络后重试",
  "about.latest": "已是最新版本",
  "about.found": "发现新版本 {v}",
  "about.feedback": "意见反馈",
  "about.noMail": "无法唤起邮件客户端，请手动发信至 {email}",
  "about.autoCheck": " 启动时自动检查更新",
  // 帮助（123 页与页签）
  "help.tab.123": "123 格式",
  "help.spec123": "完整规范（docs/格式/123格式.md）",
  // 识别、声部、编辑动作补充
  "vis.modeVoice": " · 声部{n}",
  "vis.letter": "音名 {d}（按调号换成唱名）",
  "vis.chordAdd": "加和弦音：唱名 {d}",
  "vis.voiceShort": "声{d}",
  "vis.voiceTitle": "新插的音落在第 {d} 声部",
  "vis.measSubmenu": "插删小节、调号拍号速度、小节线样式、房号、跳转记号",
  "export.project": "识别项目（.dolce）",
  "settings.partsHint": "各声部的试听音量、静音、独奏在工具条「声部」面板里调。",
  "help.webKeys": "{keys}（网页版 {web}）",
  "toolbar.doubt.title": "识别时把握不大的音与歌词字（核对视图里黄框标出）：点一下跳到下一处",
  "toolbar.srcPages": "原图页",
  "toolbar.srcPages.title": "这次识别用的原图：调顺序、删减、加图、旋转、裁剪，再按这些页重新识别",
  "toolbar.srcSide": "并排原图",
  "toolbar.srcSide.title": "排版稿左边铺整页原图：选中的音框出来，点原图上的音选中排版稿里那个",
  "toolbar.srcFollow": "原图片段",
  "toolbar.srcFollow.title": "在排版稿里选中音符时，右下角小窗显示原图上对应的那一行并框出这个音",
  "toolbar.recogKind": "识别类型",
  "toolbar.recogKind.title": "识别为：自动判断 / 简谱 / 五线谱。改了就用刚才那份图重新识别",
  "recogKind.auto": "自动判断",
  "recogKind.jianpuAs": "按简谱识别",
  "recogKind.staffAs": "按五线谱识别",
  "recogKind.jianpu": "简谱",
  "recogKind.staff": "五线谱",
  "toolbar.parts": "声部",
  "toolbar.parts.title": "声部：增删、排序、改名、谱号、拆合闭合谱、歌词复制；试听静音 / 独奏 / 音量",
  "pane.selInfo.title": "选中的元素：声部、第几小节第几拍、音高、时值",
  "start.recogKind": "识别为",
  "start.adjustFirst": "识别前先调整原图",
  "start.adjustFirst.title": "选好图之后先弹「原图页」：横着拍的转过来、页边裁掉、几张图排好顺序，再开始识别",
  // 并排原图收起源码
  // 声部面板、原图页、识别项目、草稿恢复、识别状态
  "parts.title": "声部",
  "parts.done": "完成",
  "parts.confirmTitle": "改声部",
  "parts.confirmComments": "「{what}」要按模型整份重出源码，源码里的 % 注释会丢掉（可撤销）。继续吗？",
  "parts.failed": "没能{what}",
  "parts.doneStatus": "已{what}（可撤销）",
  "parts.note.jpw": "JP-Word（.jpwabc）只有一个声部；这里只能调试听。",
  "parts.note.pu": "文本谱的声部在源码里改（Q1–Q4 行）；这里只能调试听与简谱旋律。",
  "parts.note.none": "当前没有可列的声部。",
  "parts.col.name": "名称",
  "parts.col.abbr": "简称",
  "parts.col.clef": "谱号",
  "parts.col.transpose": "移调",
  "parts.col.staves": "谱表",
  "parts.col.visible": "可见",
  "parts.col.mute": "静音",
  "parts.col.solo": "独奏",
  "parts.col.volume": "音量",
  "parts.col.jianpu": "简谱",
  "parts.col.lyrics": "歌词",
  "parts.defaultName": "声部 {n}",
  "parts.abbrPlaceholder": "如 S、A",
  "parts.op.rename": "改名",
  "parts.op.clef": "改谱号",
  "parts.tr.other": "（原谱另有设定）",
  "parts.tr.title": "移调乐器：按记谱写、试听按实际音高发声",
  "parts.tr.onlyXml": "只有 MusicXML 能记移调乐器",
  "parts.op.transpose": "改移调",
  "parts.staves.title": "这个声部用几行谱（大谱表为 2）",
  "parts.visible.title": "五线谱 / 混排里显示这个声部（只影响显示，试听照样出声；不写进文件）",
  "parts.mute.title": "试听时不出这个声部",
  "parts.solo.title": "只听这个声部（练声部用）",
  "parts.volume.title": "试听与导出 MIDI 的音量",
  "parts.melody.title": "混排的简谱层与 MusicXML 的简谱档取这个声部",
  "parts.lyric.textFmt": "文本格式的歌词就是简谱下的词行",
  "parts.lyric.title": "简谱展开档：旋律仍取「简谱」那个声部，歌词改取这个声部的（按时刻配上去）。都不勾 = 自动，排带词的声部",
  "parts.up": "上移",
  "parts.op.up": "上移声部",
  "parts.down": "下移",
  "parts.op.down": "下移声部",
  "parts.dup": "复制",
  "parts.dup.title": "复制这个声部（插在它后面）",
  "parts.op.dup": "复制声部",
  "parts.splitVoice": "按声线拆",
  "parts.splitVoice.title": "闭合谱：第二条声线拆成下面一个新声部（如 S/A 一行谱拆成两行）",
  "parts.op.splitVoice": "按声线拆分",
  "parts.splitChord": "按和弦拆",
  "parts.splitChord.title": "闭合谱：和弦里最低的音拆成下面一个新声部（单音两边各一份）",
  "parts.op.splitChord": "按和弦拆分",
  "parts.merge": "并入上一个",
  "parts.merge.title": "合成闭合谱：这个声部并进上一个声部当第二声线",
  "parts.merge.onlyXml": "合成闭合谱只对 MusicXML（123 / ABC 的一个声部只写一路旋律）",
  "parts.op.merge": "合并声部",
  "parts.delete": "删除",
  "parts.delete.title": "删掉这个声部",
  "parts.op.delete": "删除声部",
  "parts.delete.confirm": "删掉「{name}」？（可撤销）",
  "parts.add": "新建声部",
  "parts.add.title": "在最后加一个声部（整小节休止，小节结构照第一声部）",
  "parts.lyricFrom": "歌词从",
  "parts.lyricTo": "复制到",
  "parts.copyLyrics": "复制歌词",
  "parts.copyLyrics.title": "按同一时刻把歌词抄给目标声部（目标已有的那一段不覆盖）。SATB 中间一排词供几部共用时用",
  "parts.assign.title": "谱表 ↔ 声部（识别结果）",
  "parts.assign.note": "识别把每个系统里的各行谱对到声部上；对错了（比如某个系统少印了一个声部、钢琴伴奏不要）就在这里改，「应用」后按新的对应重建，不重新识别。",
  "parts.assign.system": "系统",
  "parts.assign.staff": "第 {n} 行谱",
  "parts.assign.sysPage": "{n}（第 {page} 页）",
  "parts.assign.row": "声部行 {n}",
  "parts.assign.new": "新声部",
  "parts.assign.ignore": "忽略",
  "parts.assign.apply": "应用",
  "parts.assign.apply.title": "按上面的对应重建乐谱（不重新识别；谱面上的改动会丢，事先会问）",
  "parts.clef.treble": "高音谱号",
  "parts.clef.treble-8": "高音谱号（低八度，男高音）",
  "parts.clef.bass": "低音谱号",
  "parts.clef.alto": "中音谱号",
  "parts.clef.tenor": "次中音谱号",
  "parts.tr.none": "不移调",
  "parts.tr.Bb": "B♭ 调（单簧管、小号：实际低大二度）",
  "parts.tr.A": "A 调（实际低小三度）",
  "parts.tr.F": "F 调（圆号：实际低纯五度）",
  "parts.tr.Eb": "E♭ 调（中音萨克斯：实际低大六度）",
  "parts.tr.8vb": "低八度发声（记谱高八度）",
  "parts.tr.8va": "高八度发声（短笛、钢片琴）",
  "parts.copyName": "{name}（副本）",
  "pages.encodeFailed": "图片写不出",
  "pages.crop.hint": "按住拖出要留下的部分",
  "pages.cancel": "取消",
  "pages.hint": "按列表顺序合成一首（简谱一次只认第一份），行可以拖动换顺序。改完点「按这些页重新识别」整首重跑；谱面上已做的修改会丢，事先会问。",
  "pages.nth": "第 {n} 份",
  "pages.failed": "处理失败：",
  "pages.up": "往前挪",
  "pages.down": "往后挪",
  "pages.rotate": "旋转",
  "pages.rotate.title": "顺时针转 90°（拍歪、横着拍的图）",
  "pages.crop": "裁剪",
  "pages.crop.title": "只留下拖出的那块（裁掉页边、旁边的另一页）",
  "pages.delete": "删除",
  "pages.delete.title": "这份不要了",
  "pages.add": "加图…",
  "pages.title": "原图页",
  "pages.rerun": "按这些页重新识别",
  "pages.start": "开始识别",
  "pages.beforeHint": "识别前先把原图摆好：横着拍的转过来，页边、旁边的另一页裁掉，几张图按顺序排好（行可以拖动）。",
  "proj.notZip": "这不是一个识别项目文件（读不出 zip）",
  "proj.noManifest": "识别项目缺 manifest.json",
  "proj.badManifest": "识别项目的 manifest.json 坏了",
  "proj.noVersion": "识别项目的 manifest.json 没有版本号",
  "proj.tooNew": "这个识别项目是新版本存的，请升级悦谱（Dolce）后再打开",
  "proj.badKind": "识别项目的识别路认不出：{v}",
  "proj.badFormat": "识别项目的谱格式认不出：{v}",
  "start.retryAdjust": "旋转 / 裁剪原图后重试…",
  "start.recogFailed": "识别失败，请更换图片后重试",
  "status.xmlUnaligned": "这份 MusicXML 的原文与读出来的对不齐，谱面上只能看、不能改",
  "status.partsFailed": "改声部失败：{error}",
  "draft.session": "识别会话（连原图）",
  "draft.untitled": "未命名的谱",
  "draft.title": "恢复未保存的内容",
  "draft.body": "发现上次没有保存的内容：{what}（{when}）。要恢复吗？不恢复会把它丢掉。",
  "draft.restored": "已恢复上次未保存的内容（还没存盘）",
  "unsaved.title": "未保存的内容",
  "unsaved.body": "当前内容还没有保存，继续会被新内容替换。要继续吗？",
  "unsaved.closeBody": "当前内容还没有保存。要关闭吗？（下次打开时可以恢复）",
  "proj.nothing": "没有识别会话可存（识别项目要有原图）",
  "proj.defaultName": "识别项目",
  "proj.saved": "已存为识别项目（原图、识别结果与在改的谱一起）",
  "proj.openFailed": "打不开识别项目：{error}",
  "proj.opened": "已打开识别项目（{kind}，{n} 份原图）",
  "omr.staffFailed": "五线谱识别失败：{error}",
  "omr.firstOnly": "；简谱一次识别一张，只认了第一张（{n} 张）",
  "omr.staffRunning": "五线谱识别中…（按 Esc 取消）",
  "omr.escCancel": "（按 Esc 取消）",
  "omr.cancelled": "已取消识别",
  "omr.noStaffFound": "没找到五线谱表（可在工具栏把「识别为」改成简谱再试）",
  "omr.fullBars": "，满拍小节 {pct}%",
  "omr.editOnScore": "。谱面上可直接校对修改",
  "omr.loadingPdf": "正在从原 PDF 载入对照数据…",
  "omr.loadFailed": "载入对照数据失败：{error}",
  "omr.loadingImg": "正在从原图载入对照数据…",
  "omr.loadingImgPages": "正在从原图载入对照数据… {done}/{total} 页",
  "omr.doubts": "{n} 处可疑",
  "omr.doubtAt": "第 {i} / {n} 处可疑：",
  "omr.restLabel": "休",
  "omr.rebuildFailed": "重建失败：{error}",
  "omr.rebuilt": "已按新的谱表指派重建（未重新识别）",
  // 谱面编辑提示、选中读数、移调对话框、模型编辑报错
  "ve.chordNotePicked": "选中了和弦里从低往高第 {n} 个音，Delete 只删它",
  "ve.chordOnlyXml": "简谱一个声部只印一路旋律：和弦音请另起声部（123 的 V:），这里只对 MusicXML 生效",
  "ve.hint.key": "调号，如 1=G、bB、F#",
  "ve.hint.time": "拍号，如 3/4、6/8",
  "ve.hint.tempo": "速度（每分钟拍数），0 去掉",
  "ve.voiceNow": "插入模式新插的音落在第 {n} 声部",
  "ve.voiceOnlyXml": "文本格式的多声部在源码里用 V: 分开写（123 / ABC），这里只对 MusicXML 生效",
  "ve.gotoPrompt": "跳到第几小节",
  "ve.selectToCopy": "先选中要复制的音符（编辑模式）",
  "ve.copied": "已复制 {n} 个音",
  "ve.pasteXmlOnly": "MusicXML 里只能贴从谱面上复制的音",
  "ve.clipEmpty": "剪贴板是空的",
  "ve.verseN": "第 {n} 段歌词",
  "ve.chordName": "和弦名",
  "ve.notDynamic": "「{v}」不是力度记号（p、mp、mf、f、ff、sfz、fp……）",
  "ve.text": "文字",
  "ve.dynamic": "力度（p mf f…）",
  "ve.measureInt": "小节号要是整数",
  "ve.noMeasure": "没有第 {n} 小节",
  "ve.selectNote": "先选中一个音符",
  "ve.fillVerseFirst": "先填第 {n} 段",
  "ve.lyricNoSlot": "这种格式只能改已有的字；这个音还没配字，请在源码的词行里补",
  "ve.measSrcOnly": "这种格式的小节操作请在源码里改（123 / ABC / MusicXML 可在谱面上改）",
  "ve.noNotes": "谱里还没有音符",
  "ve.selectInMeasure": "先选中一个小节里的音",
  "ve.badKey": "读不懂调号「{v}」",
  "ve.badTime": "读不懂拍号「{v}」",
  "ve.badTempo": "读不懂速度「{v}」",
  "ve.noTempo": "这一小节没有速度记号",
  "ve.measUnsupported": "这个小节操作这种格式还不支持",
  "ve.xmlUnreadable": "这份 MusicXML 读不出来，没法在谱面上改",
  "ve.cantInsert": "这里插不进音符",
  "ve.cantPaste": "这里贴不进音符",
  "ve.selectToMove": "先选中要移的音",
  "ve.noBarline": "找不到这条小节线",
  "ve.noBreak": "找不到这处换行",
  "ve.cantDeleteXml": "这个在 MusicXML 里暂不能在谱面上删",
  "ve.selectMeasToDelete": "先选中要删的小节",
  "ve.selectMeasOrBar": "先选中一个小节里的音或小节线",
  "ve.selectVolta": "先选中要标房号的小节",
  "ve.slurTwo": "圆滑线要选中两个以上的音",
  "ve.noBreakPos": "找不到换行位置",
  "ve.breakAtBar": "五线谱只能在小节线处换行：先在这里加一条小节线（|）",
  "ve.octaveMax": "八度点最多三个",
  "ve.chordSrcOnly": "这种格式的和弦名请在源码里改",
  "ve.chordQuote": "和弦名里不能有英文双引号",
  "ve.noChord": "这个音没有和弦名",
  "ve.chordUnwritable": "上游的和弦语法写不出这个名字：{name}（只认 C / Am / G7 / Cmaj7 / G/B 这类）",
  "ve.textSrcOnly": "这种格式的文字请在源码里改",
  "ve.dynSrcOnly": "这种格式的力度请在源码里改",
  "ve.textQuote": "文字里不能有英文双引号（可用中文引号）",
  "ve.dynQuote": "力度里不能有 ! 或引号",
  "ve.nothingToRemove": "这个音上没有可去掉的",
  "ve.tupletSrcOnly": "这种格式的连音请在源码里改",
  "ve.tupletTwo": "选中两个以上的音再做连音",
  "ve.tupletPartial": "选中的音一部分在连音里：选中整组连音再按可拆回",
  "sel.dot": "附点",
  "sel.tuplet": "（{n} 连音）",
  "sel.pos": "第 {m} 小节 · 第 {b} 拍",
  "sel.rest": "休止",
  "sel.degree": "唱名 {d}",
  "sel.chord": "和弦 {n} 音",
  "sel.sep": "，",
  "sel.type.maxima": "八全",
  "sel.type.long": "四全",
  "sel.type.breve": "倍全",
  "sel.type.whole": "全",
  "sel.type.half": "二分",
  "sel.type.quarter": "四分",
  "sel.type.eighth": "八分",
  "sel.type.16th": "十六分",
  "sel.type.32nd": "三十二分",
  "sel.type.64th": "六十四分",
  "sel.type.128th": "128 分",
  "sel.type.256th": "256 分",
  "tp.iv.m2": "小二度",
  "tp.iv.M2": "大二度",
  "tp.iv.m3": "小三度",
  "tp.iv.M3": "大三度",
  "tp.iv.P4": "纯四度",
  "tp.iv.A4": "增四度",
  "tp.iv.P5": "纯五度",
  "tp.iv.m6": "小六度",
  "tp.iv.M6": "大六度",
  "tp.iv.m7": "小七度",
  "tp.iv.M7": "大七度",
  "tp.iv.P8": "纯八度",
  "tp.noKey": "这份谱里没找到能换的调号",
  "tp.octave": "移了整八度：简谱唱名不变、调号也不变。要整体移八度，全选后按 ' 或 ,",
  "tp.all": "全曲（换调号，简谱唱名不变）",
  "tp.sel": "选中的音（调号不动）",
  "tp.option": "{dir} {iv}（{k} 个半音）{to}",
  "tp.hint": "现在是 1={key}。简谱是首调唱名：全曲移调只改调号，数字不变；ABC、MusicXML 的音一起移过去。和弦记号不跟着移。可用 Ctrl/⌘+Z 撤销。",
  "tp.scope": "移哪些",
  "tp.by": "移多少",
  "tp.title": "移调",
  "tp.up": "往上",
  "tp.down": "往下",
  "me.tupletDur": "连音里的音暂不能在谱面上改时值",
  "me.divCoarse": "这份谱的时值单位太粗，写不出这个时值",
  "me.durInvalid": "写不出这个时值（超过两个附点或不是二的幂）",
  "me.restOctave": "选中的是休止，没有八度可改",
  "me.noInsertPos": "找不到插入位置",
  "me.degree07": "唱名只有 0–7",
  "me.nothingToDelete": "没有可删的音符",
  "me.atMeasureEnd": "这里已经是小节末尾",
  "me.crossBar": "{part}在这个位置有音跨过去，不能在这里加小节线",
  "me.noMeasure": "找不到小节",
  "me.lastBar": "最后一条小节线删不掉",
  "me.mergeKeyTime": "下一小节换了调号或拍号，不能并成一节",
  "me.mergeDiv": "下一小节的时值单位不同，不能并成一节",
  "me.breakFirst": "第一小节前不用换行",
  "me.selectToSlur": "先选中要连的音",
  "me.slurCrossPart": "圆滑线不能跨声部",
  "me.tieSamePitch": "延音线只连同音高：后面那个音与它不同",
  "me.keepOneMeasure": "至少要留一个小节",
  "me.timeFormat": "拍号写成「3/4」这样，分母是 2 的幂",
  "me.selectNoteNoRest": "先选中一个音符（休止不能加和弦音）",
  "me.degree17": "唱名只有 1–7",
  "me.lastChordNote": "和弦里只剩一个音了，要删整个音请按 Delete",
  "me.noNote": "找不到这个音",
  "me.voiceBusy": "第 {n} 声线在这一刻已经有音：选中它改，或换个位置",
  "me.nothingToMove": "没有要移的",
  "me.stepAG": "音名只有 A–G",
  "me.tupletSame": "连音只能在同一小节、同一声部里",
  "me.tupletAlready": "选中的音已经在别的连音里",
  "me.clipNoNotes": "剪贴板里没有音符",
  "me.otherPart": "别的声部",
  // 试听：循环、节拍器
  "play.loop": "循环",
  "play.loop.title": "循环播放：谱面上选了一段就循环这一段，没选循环整首",
  "play.metronome": "节拍",
  "play.metronome.title": "节拍器：试听时每拍响一声（小节第一拍高一些）",
  // 识别对照：可疑理由
  "omr.doubt.reasons": "可疑：{list}",
  "omr.doubt.lyric": "可疑：第 {n} 段这个字认得没把握",
  "omr.doubt.sep": "；",
  "omr.doubt.note.offRow": "比同一行的音高出或低出一截，可能不是音（小字、附注）",
  "omr.doubt.oct.inkAbove": "正上方有像高音点的墨（粘在弧上），可能漏了高音点",
  "omr.doubt.oct.oddShape": "八度点形状不像点，可能把别的记号当成了八度点",
  "omr.doubt.oct.offCenter": "旁边有个偏了一点的点，可能漏了八度点"
};
const en = {
  // 应用与页头
  "app.windowTitle": "Dolce",
  "header.home": "Home",
  "header.brandAria": "Dolce",
  "header.subtitle": "Score Workbench",
  "header.save": "Save",
  "header.saveAs": "Save As",
  "header.export": "Export",
  "header.more": "More",
  "status.recogView": "Proof",
  "status.code": "Source",
  "status.code.title": "Show the code pane (untick to hide it and give the score the full width; side by side then splits page and score in half)",
  "status.compare.title": "How to proof against the source: off (score only), side by side, a source snippet, or an overlay in the proofing view",
  "status.compare.aria": "Proofing",
  "status.compare.none": "Off",
  "toolbar.recogGroup": "Recognition",
  // 工具栏
  "toolbar.aria": "Score toolbar",
  "toolbar.lines": "Lines",
  "toolbar.linesAria": "Line breaking",
  "toolbar.layoutOriginal": "Original",
  "toolbar.layoutOriginal.title": "Keep the line structure from import or recognition",
  "toolbar.phrase": "By phrase",
  "toolbar.phrase.title": "Re-break lines by lyric and musical phrases",
  "toolbar.recognize": "Compare",
  "toolbar.recognize.title": "Compare the recognition result with the uploaded image",
  "toolbar.recogView": "Comparison view",
  "toolbar.recogView.floating": "Nearby popup",
  "toolbar.recogView.inplace": "Overlay in place",
  "toolbar.recogView.original": "Original only",
  "toolbar.listen": "Playback",
  "toolbar.mobileView": "Workspace view",
  "toolbar.mobileCode": "Code",
  "toolbar.mobileScore": "Preview",
  "toolbar.zoom": "Zoom",
  "toolbar.zoomOut": "Zoom out",
  "toolbar.zoomOut.title": "Zoom out (Ctrl/⌘ -)",
  "toolbar.zoomReset.title": "Reset (Ctrl/⌘ 0)",
  "toolbar.zoomIn": "Zoom in",
  "toolbar.zoomIn.title": "Zoom in (Ctrl/⌘ +)",
  "toolbar.page": "Page",
  "toolbar.prev": "Previous page",
  "toolbar.next": "Next page",
  "toolbar.hanzi": "简/繁",
  "toolbar.hanzi.title": "Convert Chinese text in the source (Simplified ⇄ Traditional)",
  "toolbar.options": "Settings",
  "toolbar.help": "Help",
  "toolbar.help.title": "Features, the 123 format and notation guide",
  // 试听
  "play.play": "Play",
  "play.pause": "Pause",
  "play.stop": "Stop",
  "play.stop.title": "Stop (back to the beginning)",
  "play.progress": "Playback position",
  "play.time": "Playback time",
  "play.speed": "Playback speed",
  // 窗格
  "pane.code": "Source",
  "pane.docFormat": "Source format",
  "pane.docFormat.title": "Switch source format (recognition is not re-run; switch back to “Original” to restore an opened file)",
  "pane.score": "Score",
  "pane.visualMode.title": "Visual editing: Edit mode (block cursor) changes the selected element, Insert mode (bar cursor) inserts at the cursor; toggle with Insert / Esc",
  "pane.beatCount.title": "Click to jump to the next one",
  "pane.palette": "Palette",
  "pane.palette.title": "Symbol palette: click to enter notes, octaves, durations, marks and breaks",
  "pane.paletteAria": "Symbol palette",
  "pane.beatCheck": "Beats",
  "pane.beatCheck.title": "Beat check: highlight measures whose length doesn't match the time signature",
  "pane.formatMarks.title": "Show formatting marks: line break ↵ and page break ⤓ (Ctrl/⌘+Shift+M)",
  // 排版档
  "view.aria": "View mode",
  "view.expanded": "Expanded",
  "view.expanded.title": "Repeats and verses unrolled, one verse per page (for projection)",
  "view.original": "As printed",
  "view.original.title": "Laid out as printed: verses stacked, repeats kept",
  "view.staff": "Staff",
  "view.staff.title": "Staff notation",
  "view.mixed": "Mixed",
  "view.mixed.title": "Staff notation with a jianpu layer",
  // 开始页
  "start.eyebrow": "Get started",
  "start.title": "Bring in a score — edit it, export it",
  "start.lead": "On-device recognition, proofing, jianpu ⇄ staff views, playback and multi-format export.",
  "start.image": "Recognize image",
  "start.image.sub": "Upload a photo or scan",
  "start.score": "Open score",
  "start.score.sub": "Continue editing a score file",
  "start.score.formats": "123 · JPWABC · jianpu-ly · Text jianpu · MusicXML · ABC",
  "start.privacy": "Images are recognized locally and never uploaded",
  "start.sample": "Open a sample score",
  "start.progress": "Recognizing and typesetting…",
  "start.progress.sub": "The editable score will appear when done",
  "start.recognizeFailed": "Recognition failed. Please try another image.",
  "start.filterImage": "Score image / PDF",
  // 编辑器状态（app.ts）
  "status.bookSheet.ref": "set by file",
  "status.bookSheet.manual": "chosen manually",
  "status.bookSheet.auto": "auto",
  "status.bookSheet.using": "Songbook style ({where}): {name}",
  "status.bookSheet.others": " ({n} more in the same folder — pick another in Settings)",
  "status.bookSheet.bad": "Can't read songbook style sheet ({name}): {error}",
  "filter.bookSheet": "Songbook style sheet",
  "filter.scoreDocs": "Jianpu / 123 / jianpu-ly / Text jianpu / MusicXML / ABC / Muse",
  "fmt.textScore": "text jianpu",
  "status.staffFailed": "Couldn't convert to staff notation: {error}",
  "status.parseFailed": "Couldn't parse {what}: {error}",
  "status.puFatal": "Can't parse the text jianpu: {error}",
  "status.j123Fatal": "Can't parse 123: line {line}: {error}",
  "status.abcNoNotes": "ABC parse failed: no notes found",
  "status.jcxNoNotes": "Muse jianpu parse failed: no notes found",
  "status.noLines": "This {what} has no music lines to lay out",
  "status.layoutFailed": "Layout of {what} failed: {error}",
  "status.diagnostics": "{what}: {n} issue(s) to check (line {line}: {message})",
  "xmlImport.title": "Import MusicXML",
  "xmlImport.body": "This is a single-part song. You can convert it to jianpu for editing (the original MusicXML file is left untouched).",
  "xmlImport.convertTo": "Convert to {format} and edit",
  "xmlImport.keep": "Keep MusicXML (view as staff)",
  "xmlImport.remember": "Remember my choice and don't ask again (change it in Settings)",
  "status.notPu": "This doesn't look like text jianpu: {reason}",
  "status.omrLosses": "Recognition result converted to 123 for proofing; {n} item(s) 123 can't express were dropped",
  "status.xmlReadFailed": "Couldn't read MusicXML: {error}",
  "status.xmlNoNotes": "This MusicXML has no notes",
  "status.xmlUnreadable": "This MusicXML can't be read, so it can't be converted",
  "status.phraseSame": "No change: phrase breaks already match the current lines",
  "status.phraseFailed": "Re-breaking by phrase failed: {error}",
  "status.hanUnparsable": "The score can't be parsed, so it can't be converted",
  "status.loading": "Loading…",
  "status.toTraditional": "Converted to Traditional Chinese",
  "status.toSimplified": "Converted to Simplified Chinese",
  "status.hanMissed": "{done} ({n} place(s) couldn't be written back)",
  "status.hanFailed": "Simplified/Traditional conversion failed",
  "pane.readOnly": "Read-only",
  "saveAs.lossTitle": "Saving in this format will lose some content",
  "status.saveAsUnsupported": "Saving as {target} isn't supported yet",
  "status.savedAs": "Saved as {format} ({ext})",
  "file.untitled": "Untitled",
  "pick.lyric": "Lyric: {text}",
  "pick.note": "Note: {text}",
  "pick.text": "Text: {text}",
  "pick.classes": "Selected: {list}",
  "pick.element": "Selected: element",
  // 格式名
  "fmt.target.123": "Jianpu 123",
  "fmt.target.jpwabc": "Jianpu JPWABC",
  "fmt.target.abc": "ABC",
  "fmt.target.tomato": "Fanqie jianpu",
  "fmt.target.shige": "Shigeben text jianpu",
  "fmt.target.jly": "jianpu-ly (.jly)",
  "fmt.target.jcx": "Muse jianpu (.jcx)",
  "fmt.jcx.label": "Muse jianpu",
  "fmt.pu.label": "Text jianpu",
  "fmt.pu.labelWith": "Text jianpu · {dialect}",
  "fmt.short.tomato": "Fanqie",
  "fmt.short.shige": "Shigeben",
  // 对话框（dialogs.ts）
  "dlg.ok": "OK",
  "dlg.cancel": "Cancel",
  "han.auto": "Auto-detect",
  "han.s2t": "Simplified → Traditional",
  "han.t2s": "Traditional → Simplified",
  "han.hint": "Converts lyrics, titles and credits in the source; music code is unchanged. Undo with Ctrl/⌘+Z.",
  "han.direction": "Direction",
  "han.title": "Simplified / Traditional Chinese",
  "paper.longImage": "Long image",
  "paper.landscape": "landscape",
  "paper.portrait": "portrait",
  "paper.landscapeOpt": "Landscape",
  "paper.portraitOpt": "Portrait",
  "paper.followFile": "Follow file ({what})",
  "paper.top": "Top",
  "paper.right": "Right",
  "paper.bottom": "Bottom",
  "paper.left": "Left",
  "paper.marginTitle": "{side} margin (mm); empty = auto",
  "paper.paper": "Paper",
  "paper.orientation": "Orientation",
  "paper.margins": "Margins (mm)",
  "font.hei": "Sans (Hei)",
  "font.song": "Serif (Song)",
  "font.kai": "Kai",
  "font.fangsong": "FangSong",
  "font.weibei": "Weibei",
  "font.yuan": "Rounded (Yuan)",
  "font.default": "Default",
  "font.sizeTitle": "Font size (pt); empty = {fallback}",
  "font.followFile": "follow file",
  "font.factory": "built-in",
  "role.group": "Header (shared by all views)",
  "role.title": "Title",
  "role.scripture": "Scripture",
  "role.credit": "Credits",
  "settings.linesPlaceholder": "e.g. 4 or 4|3|3 (empty = auto)",
  "settings.linesPerPage": "Lines per page",
  "settings.ratio": "Aspect ratio",
  "settings.fontSize": "Base font size",
  "settings.color": "Foreground color",
  "settings.bgColor": "Background color",
  "settings.staffFollow": "Follow file ({v})",
  "settings.factoryValue": "Built-in {v}",
  "settings.staffSize": "Staff size (mm)",
  "settings.lyricSize": "Lyric size (pt)",
  "settings.hideBarNumbers": "Hide measure numbers",
  "settings.puNote": "Changing the font size scales the whole measured layout proportionally (paper and margins stay), same as the score's own FontSize directive; the Expanded view and .jpwabc share one set of settings.",
  "settings.staffNote": "Staff size is the height of the five lines; text scales with it. Empty = follow the file. Changing the paper or staff size re-lays out the score and drops the file's original line positions.",
  "settings.noteSound": "Sound when editing notes",
  "settings.bookSheet.manual": "manual",
  "settings.bookSheet.none": "None",
  "settings.bookSheet.choose": "Choose…",
  "settings.bookSheet.disable": "Don't use",
  "settings.bookSheet.auto": "Auto-find",
  "settings.bookSheet.write": "Write to file",
  "settings.bookSheet": "Songbook style",
  "settings.xml.ask": "Ask every time",
  "settings.xml.keep": "Keep MusicXML",
  "settings.xml.convert": "Convert to {format}",
  "settings.xml.open": "Opening MusicXML",
  "settings.tab.layout": "Layout",
  "settings.tab.header": "Header & style",
  "settings.tab.other": "Other",
  "settings.title": "Settings",
  "settings.reset": "Reset this view",
  "settings.lang": "Language",
  "settings.lang.auto": "System default",
  "role.subtitle": "Subtitle",
  "lang.zh": "中文",
  "lang.en": "English",
  // 可视化编辑动作（visual/keys.ts）
  "va.group.mode": "Mode",
  "va.group.nav": "Move & select",
  "va.group.note": "Notes",
  "va.group.dur": "Duration",
  "va.group.mark": "Marks",
  "va.group.brk": "Breaks",
  "va.group.edit": "Edit",
  "va.group.meas": "Measures",
  "va.group.voice": "Voices",
  "va.mode.insert.label": "Insert mode",
  "va.mode.edit.label": "Edit mode",
  "va.nav.prev.label": "Previous",
  "va.nav.next.label": "Next",
  "va.nav.extendPrev.label": "Extend left",
  "va.nav.extendNext.label": "Extend right",
  "va.nav.measPrev.label": "Previous measure",
  "va.nav.measNext.label": "Next measure",
  "va.nav.extendMeasNext.label": "Extend to next measure",
  "va.nav.extendMeasPrev.label": "Extend to previous measure",
  "va.nav.gotoMeasure.label": "Go to measure…",
  "va.sel.all.label": "Select all",
  "va.nav.home.label": "Line start",
  "va.nav.end.label": "Line end",
  "va.note.digit.label": "Note / rest",
  "va.note.letter.label": "Note name",
  "va.step.up.label": "Step up",
  "va.step.down.label": "Step down",
  "va.semi.up.label": "Semitone up",
  "va.semi.down.label": "Semitone down",
  "va.oct.up.label": "Octave up",
  "va.oct.down.label": "Octave down",
  "va.acc.sharp.label": "Sharp",
  "va.acc.flat.label": "Flat",
  "va.acc.natural.label": "Natural",
  "va.dur.halve.label": "Halve duration",
  "va.dur.double.label": "Double duration",
  "va.dur.dot.label": "Dot",
  "va.sus.add.label": "Extension dash",
  "va.bar.insert.label": "Barline",
  "va.brk.line.label": "Line break",
  "va.brk.page.label": "Page break",
  "va.del.forward.label": "Delete",
  "va.del.back.label": "Backspace",
  "va.slur.toggle.label": "Slur",
  "va.tie.toggle.label": "Tie",
  "va.tuplet.toggle.label": "Tuplet",
  "va.deco.fermata.label": "Fermata",
  "va.deco.accent.label": "Accent",
  "va.mark.next.label": "Next mark",
  "va.mark.prev.label": "Previous mark",
  "va.chord.add.label": "Add chord note",
  "va.voice.set.label": "Voice",
  "va.meas.append.label": "Append measure",
  "va.meas.insert.label": "Insert measure",
  "va.meas.delete.label": "Delete measures",
  "va.meas.key.label": "Key signature…",
  "va.meas.time.label": "Time signature…",
  "va.meas.tempo.label": "Tempo…",
  "va.bar.single.label": "Normal barline",
  "va.bar.double.label": "Double barline",
  "va.bar.final.label": "Final barline",
  "va.bar.repeatStart.label": "Start repeat",
  "va.bar.repeatEnd.label": "End repeat",
  "va.volta.1.label": "First ending",
  "va.volta.2.label": "Second ending",
  "va.jump.segno.label": "𝄋 Segno",
  "va.jump.coda.label": "⊕ Coda",
  "va.jump.dc.label": "D.C.",
  "va.jump.ds.label": "D.S.",
  "va.jump.fine.label": "Fine",
  "va.view.formatMarks.label": "Show formatting marks",
  "va.edit.copy.label": "Copy",
  "va.edit.cut.label": "Cut",
  "va.edit.paste.label": "Paste",
  "va.edit.repeat.label": "Repeat",
  "va.lyric.entry.label": "Lyric entry",
  "va.chord.entry.label": "Chord name entry",
  "va.text.entry.label": "Text",
  "va.dyn.entry.label": "Dynamics",
  "va.edit.transpose.label": "Transpose…",
  "va.edit.undo.label": "Undo",
  "va.edit.redo.label": "Redo",
  "va.mode.insert.help": "Turns the block cursor into a bar placed after the selected element",
  "va.mode.edit.help": "Turns the bar cursor into a block covering the element before it",
  "va.nav.prev.help": "Edit mode selects the previous element; Insert mode moves the cursor back one step",
  "va.nav.next.help": "Edit mode selects the next element; Insert mode moves the cursor forward one step",
  "va.nav.extendPrev.help": "Extends the selection by one element to the left",
  "va.nav.extendNext.help": "Extends the selection by one element to the right",
  "va.nav.measPrev.help": "Jumps to the start of this measure, or of the previous one if already there (Edit mode selects its first element; Insert mode puts the cursor before it)",
  "va.nav.measNext.help": "Jumps to the start of the next measure",
  "va.nav.extendMeasNext.help": "Extends the selection to the end of the next measure",
  "va.nav.extendMeasPrev.help": "Extends the selection to the start of the previous measure",
  "va.nav.gotoMeasure.help": "Type a measure number to jump there (counted in the current part; same numbering as the readout at the top right)",
  "va.sel.all.help": "Selects the whole piece when the score has focus (in the code editor it still selects all text)",
  "va.nav.home.help": "Jumps to the first element of this line (back to the previous line break)",
  "va.nav.end.help": "Jumps to the last element of this line",
  "va.note.digit.help": "Edit mode changes the selected note's degree (octave and duration kept); Insert mode inserts a note at the current duration",
  "va.note.letter.help": "Converted to a degree by the key signature (in G, G is 1 and F is the sharp 4 the key already implies). Edit mode changes the selected note, octave nearest the old note; Insert mode inserts a note, octave nearest the previous note",
  "va.step.up.help": "Moves up one scale step in the key (7 becomes high 1) and drops any accidental; a selected range moves together. In Insert mode it changes the note just inserted",
  "va.step.down.help": "Moves down one scale step in the key (1 becomes low 7)",
  "va.semi.up.help": "Raises a semitone: a note in the key is written plainly, otherwise sharp keys use sharps and flat keys use flats (C uses a sharp going up)",
  "va.semi.down.help": "Lowers a semitone (C uses a flat going down)",
  "va.oct.up.help": "Adds a high dot (or removes a low dot); a selected range moves together; in Insert mode it changes the note just inserted",
  "va.oct.down.help": "Adds a low dot (or removes a high dot)",
  "va.acc.sharp.help": "Adds a sharp; press again to remove",
  "va.acc.flat.help": "Adds a flat; press again to remove",
  "va.acc.natural.help": "Adds a natural; press again to remove",
  "va.dur.halve.help": "Edit mode: removes half of the extension dashes, otherwise adds an underline; Insert mode: changes the current duration",
  "va.dur.double.help": "Edit mode: removes an underline, otherwise doubles the beats (adds dashes); Insert mode: changes the current duration",
  "va.dur.dot.help": "Adds or removes an augmentation dot",
  "va.sus.add.help": "Edit mode adds a dash after the selected note; Insert mode inserts one at the cursor",
  "va.bar.insert.help": "Inserts a barline after the selected element (Insert mode: at the cursor)",
  "va.brk.line.help": "Breaks the line after the selected element (Insert mode: at the cursor); lyrics under the line split at the matching syllable",
  "va.brk.page.help": "Same as above, but a page break",
  "va.del.forward.help": "Edit mode deletes the selection (a note together with its dashes, chord name and ornaments; deleting a line break joins two lines and their lyrics); Insert mode deletes the element after the cursor",
  "va.del.back.help": "Edit mode: same as Delete; Insert mode deletes the element before the cursor",
  "va.slur.toggle.help": "Adds a slur between the first and last notes of the selection; removes an identical one",
  "va.tie.toggle.help": "Adds or removes a tie between the selected note and the next note of the same pitch",
  "va.tuplet.toggle.help": "Turns the selected notes into a tuplet (3 selected makes a triplet; the count follows the selection), or splits an existing group back. 123 writes (3: … ), ABC writes (3, MusicXML changes the time ratio",
  "va.deco.fermata.help": "Adds or removes a fermata on the selected note",
  "va.deco.accent.help": "Adds or removes an accent on the selected note",
  "va.mark.next.help": "Cycles through the marks attached to the selected note (chord name, fermata and other ornaments, annotations, slurs)",
  "va.mark.prev.help": "Cycles in the opposite direction",
  "va.chord.add.help": "Stacks a note (by degree, nearest above the top note) on the selected note to make a chord. Available for MusicXML; Alt+click a notehead in a chord to select it alone, and Delete removes only that one",
  "va.voice.set.help": "Which voice newly inserted notes go into in Insert mode (the second, third or fourth line on the same staff, stems in opposite directions). Available for MusicXML",
  "va.meas.append.help": "Appends an empty measure (whole-bar rest) at the end, in all parts",
  "va.meas.insert.help": "Inserts an empty measure before the selected one (or the one with the cursor)",
  "va.meas.delete.help": "Deletes the selected measures; in MusicXML all parts together",
  "va.meas.key.help": "Changes the key from this measure on: type 1=G, G, bB, F# and so on",
  "va.meas.time.help": "Changes the time from this measure on: type 3/4, 6/8 and so on",
  "va.meas.tempo.help": "Marks a tempo at the start of this measure: beats per minute (♩ = n); 0 or empty removes it",
  "va.bar.single.help": "Turns the selected barline (or the measure's closing barline) back into a single line",
  "va.bar.double.help": "Makes the measure's closing barline a double line",
  "va.bar.final.help": "Makes the measure's closing barline a final barline",
  "va.bar.repeatStart.help": "Makes the measure's opening barline a start repeat |:",
  "va.bar.repeatEnd.help": "Makes the measure's closing barline an end repeat :|",
  "va.volta.1.help": "Marks the selected measures as the first ending (click again to remove)",
  "va.volta.2.help": "Marks the selected measures as the second ending (click again to remove)",
  "va.jump.segno.help": "Marks a segno at the start of this measure (D.S. jumps back here)",
  "va.jump.coda.help": "Marks a coda at the start of this measure",
  "va.jump.dc.help": "Marks D.C. at the end of this measure (repeat from the beginning)",
  "va.jump.ds.help": "Marks D.S. at the end of this measure (repeat from the 𝄋)",
  "va.jump.fine.help": "Marks Fine at the end of this measure (the repeat ends here)",
  "va.view.formatMarks.help": "Shows or hides line breaks ↵ and page breaks ⤓ on the score (click one to select it)",
  "va.edit.copy.help": "Copies the selected notes (with their dashes and barlines). Only when the score has focus; in the code editor it copies text as usual",
  "va.edit.cut.help": "Copies, then deletes",
  "va.edit.paste.help": "Insert mode pastes at the cursor, Edit mode after the selection (nothing is overwritten), then selects what was pasted. The same format pastes verbatim; another format brings only notes, dashes and barlines, by degree (a different key keeps the degrees)",
  "va.edit.repeat.help": "Pastes the selection again right after it and selects the copy, so pressing R keeps repeating (the clipboard is untouched)",
  "va.lyric.entry.help": "Opens a box under the selected note to type lyrics syllable by syllable: Space / Tab next note, - hyphen (joins the next note), _ melisma (skips the next note), / leave this note empty, Shift+Space previous note, Enter next verse, Esc done. Several Chinese characters typed at once are spread one per note",
  "va.chord.entry.help": "Opens a box above the selected note for a chord name (C, Am7, G/B…): Space confirms and moves to the next note, Shift+Space the previous one, Enter confirms and closes, Esc cancels; empty removes the chord name",
  "va.text.entry.help": "Adds text above the selected note (rit., refrain, repeat twice…), or edits the existing one; empty removes it",
  "va.dyn.entry.help": "Marks a dynamic on the selected note (p, mp, mf, f, ff, sfz…): Space confirms and moves to the next note, Enter closes; empty removes it",
  "va.edit.transpose.help": "Changes the key of the whole piece (jianpu keeps its degrees and only changes the key; ABC and MusicXML notes move too), or moves the selected notes by semitones",
  "va.edit.undo.help": "Shares one undo history with the code editor",
  "va.edit.redo.help": "Same as above",
  // 可视化编辑状态（visual/*）
  "beat.short": "{d} beat(s) short (expected {want}, got {got})",
  "beat.over": "{d} beat(s) over (expected {want}, got {got})",
  "beat.measure": "Measure {n}: {issue}",
  "beat.count": "{n} measure(s) with wrong beats",
  "beat.emptyCursor": "This measure is empty: the cursor is inside, type notes to fill it",
  "beat.empty": "Empty measure: all its notes were deleted",
  "beat.cmTitle": "This measure's beats don't match the time signature",
  "vis.modeEdit": "Edit",
  "vis.modeInsert": "Insert · {dur}",
  "vis.dur0": "quarter",
  "vis.dur1": "eighth",
  "vis.dur2": "16th",
  "vis.dur3": "32nd",
  "vis.dur4": "64th",
  "vis.durN": "{n} underlines",
  "vis.puBreakSelected": "Line break selected (a new Q: line in text jianpu); press Delete to join with the next line",
  "vis.unsupported": "This format can't be edited on the score yet; edit the source instead",
  "vis.cantBreak": "Can't break the line here",
  "vis.cantUnbreak": "This line break can't be removed",
  "vis.lineStart": "Already at the start of a line",
  "vis.durMax": "The longest current duration is a quarter note (use dashes - for longer)",
  "vis.durMin": "At most four underlines",
  "vis.selectNote": "Select a note first",
  "vis.nothingToDelete": "Nothing selected to delete",
  "vis.breakAlone": "Select the line break on its own to delete it",
  "vis.noMarks": "This note has no marks",
  "vis.markSelected": "Selected mark: {mark}",
  "mark.harmony": "Chord {name}",
  "mark.annotation": "Annotation {name}",
  "mark.dynamic": "Dynamic {name}",
  "mark.slur": "Slur/tie",
  "mark.other": "Mark {name}",
  "vis.rest": "Rest",
  "vis.degree": "Note {d}",
  "vis.contLyrics": "This line's lyrics use +: continuation and can't be split automatically; edit the source",
  "vis.noPageBreak": "This format has no page break symbol",
  "vis.breakNotSymbol": "Line breaks aren't symbols in this format",
  "vis.notMusicLine": "The cursor isn't on a music line",
  "vis.unreadableNote": "Can't understand this note: {src}",
  "vis.unreadableNoteShort": "Can't understand this note",
  "vis.octMax": "At most three octave dots",
  "vis.longEnough": "Already long enough",
  "vis.slurNest": "Slurs can't nest or overlap in this format (brackets pair first-open-first-close); remove the crossing one first",
  "vis.slurTwo": "A slur needs at least two notes",
  "vis.slurBrackets": "Can't find this slur's brackets",
  "vis.slurSelect": "Select the notes to connect first (at least two)",
  "vis.noNext": "No following note",
  "vis.tieSamePitch": "A tie only joins two notes of the same pitch; use a slur (s) for different notes",
  "vis.noDeco": "This format can't add marks on the score yet",
  "jpw.dashMix": "JP-Word can't combine extension dashes with underlines or dots",
  "jpw.doubleDot": "JP-Word doesn't support double dots",
  "jpw.doubleAcc": "JP-Word has no double sharps or flats",
  // 导出 / 另存为 / 切格式 / 识别 / 试听
  "export.noPageSize": "Can't read the score page size",
  "export.noSvg": "There's no score on this page to export",
  "export.pngName": "{name}-page{n}.png",
  "export.noLines": "This score has no music lines to export",
  "export.noPuLines": "This text jianpu has no music lines to export",
  "export.jpwUnreadable": "This .jpwabc can't be read",
  "export.mixedName": "Mixed",
  "export.staffName": "Staff",
  "export.currentFormat": "{format} (current format)",
  "export.title": "Export",
  "export.failed": "Export failed",
  "saveAs.title": "Save As",
  "saveAs.failed": "Save failed",
  "fs.confirmTitle": "Switch format",
  "fs.confirmBody": "The source was edited by hand. Switching formats regenerates the text and these edits will be lost. Continue?",
  "fs.origin": "{format} (original)",
  "fs.unreadable": "The score can't be read right now, so the format can't be switched",
  "fs.backToOrigin": "Back to the original ({format})",
  "fs.lossTitle": "Converting will lose some content",
  "fs.failed": "Conversion failed: {error}",
  "fs.converted": "Converted to {format} (not saved; the original file is untouched — switch back to “original” to restore)",
  "omr.formatSwitched": "Output format switched to {format} (not re-recognized)",
  "omr.running": "Recognizing… this may take a few dozen seconds",
  "omr.done": "Recognition done ({sec}s)",
  "omr.beatIssues": "; {n} measure(s) don't match the time signature (marked red in the proofing view — usually a misread dash or underline)",
  "omr.failed": "Recognition failed: {error}",
  "omr.staffProgress": "Recognizing staff notation… page {done}/{total}",
  "omr.noStaff": "No staff notation found in this PDF",
  "omr.staffDone": "Staff recognition done ({sec}s): {pages} page(s) / {parts} part(s) / {notes} note(s)",
  "omr.staffSkipped": ", {n} page(s) without staves skipped",
  "omr.staffNoJp": "; the jianpu text is unchanged — staff notation doesn't fit in .jpwabc, get the result via Export → MusicXML",
  "omr.compare": "Compare",
  "omr.back": "Back to score",
  "play.normal": "Normal",
  "play.marked": "Score ♩={tempo}",
  "play.unmarked": "No tempo marked; using ♩=90",
  "play.speedTitle": "Speed: {marked}, now ♩={bpm}",
  "play.noLines": "This score has no music lines to play",
  "play.loadFailed": "Couldn't load playback: {error}",
  "play.timeTitle": "Played {at}, remaining {left}, total {total} (click to toggle elapsed / remaining)",
  "play.loading": "Loading",
  "play.resume": "Resume",
  "play.titlePause": "Pause playback",
  "play.titleResume": "Resume from where it paused",
  "play.titleLoading": "Loading instrument sounds",
  "play.titlePlay": "Play",
  "feedback.envHeader": "--- Environment info below helps us locate the problem; feel free to delete it ---",
  "feedback.version": "Version: {v}",
  "feedback.system": "System: {v}",
  "feedback.date": "Date: {v}",
  "feedback.subject": "Dolce feedback v{v}",
  "feedback.body": "Please describe the problem or suggestion:",
  "update.title": "New version available",
  "update.body": "You have {cur}; the latest is {latest}. Open the download page?",
  // 另存为丢失清单（model/capability.ts）
  "feat.harmony": "Chord symbols",
  "feat.harmonyOffset": "Chords in the middle of a long note off the beat (moved onto the note)",
  "feat.multiVoice": "Multiple parts",
  "feat.noteStack": "Simultaneous notes in one part (chord tones, second voice — only the printed jianpu melody is kept)",
  "feat.dynamics": "Dynamics and hairpins",
  "feat.playOrder": "Singing order (volta jumps, which verse on which pass)",
  "feat.style": "Style sheet reference",
  "feat.layoutDirectives": "Layout directives (font size, margins, etc.)",
  "feat.keyChange": "Key changes",
  "feat.multiVerse": "Multiple verses",
  "feat.volta": "Volta brackets",
  "feat.grace": "Grace notes",
  "feat.slur": "Slurs",
  "feat.textLine": "Section words and annotations",
  "feat.multiSong": "Several songs in one file",
  "feat.pageText": "Headers and footers",
  "feat.meta": "Extended song info (English title, scripture, tags, etc.)",
  "feat.paper": "Paper, margins, staff size, lyric size and header fonts written in the score (moved into settings)",
  "feat.verseLabel": "Printed verse numbers",
  "feat.rhythmNote": "Rhythm notes (unpitched)",
  "feat.invisibleRest": "Invisible rests",
  "feat.nestedArc": "Slurs nested inside another slur (one of them will be lost)",
  "feat.oddTuplet": "Tuplets with unusual ratios (n notes in n−1 beats can't express them)",
  "feat.slurCrossTuplet": "Slurs crossing a tuplet group (cut at the group boundary)",
  "feat.lyricOnRest": "Lyrics on rests",
  "feat.pageBreak": "Page breaks (turned into line breaks)",
  "loss.body": "This score has {n} thing(s) that will be lost when saved as {format}:",
  "loss.continue": "Continue?",
  // 解析诊断（随解析按界面语言产出）
  "diag.pu.graceChar": "Unrecognized character '{ch}' in grace notes",
  "diag.pu.tempMeter": "Can't parse the temporary time signature '{body}'",
  "diag.pu.orphanAnchor": "Nothing before '@' to attach lyrics to",
  "diag.pu.badBarline": "Unrecognized barline '{ch}'",
  "diag.pu.extraParen": "Unmatched ')'",
  "diag.pu.extraBang": "Unmatched '!'",
  "diag.pu.graceOpen": "Grace note '[' is not closed",
  "diag.pu.extraBracket": "Unmatched ']'",
  "diag.pu.orphanCommand": "Nothing before mark &{name} to attach it to",
  "diag.pu.unknownCommand": "Unknown mark &{name}",
  "diag.pu.quoteOpen": "Double quote is not closed",
  "diag.pu.orphanAnnotation": 'Nothing before annotation "{body}" to attach it to',
  "diag.pu.layerOpen": "'{' is not closed",
  "diag.pu.badChar": "Unrecognized character '{ch}'",
  "diag.pu.wedgeOpen": "Crescendo/diminuendo isn't closed with '!'",
  "diag.pu.lyricNoteOpen": "Lyric annotation is not closed",
  "diag.pu.lyricGroupOpen": "'{' in lyrics is not closed",
  "diag.pu.lyricChar": "Unrecognized character '{text}' in lyrics",
  "diag.pu.badKey": "Key '{v}' isn't A–G (optionally with a sharp or flat)",
  "diag.pu.badMeter": "Can't parse time signature '{v}'",
  "diag.pu.unknownField": "Unknown header field '{key}'",
  "diag.pu.lyricNoMusic": "Lyrics under an empty Q: line have no notes to align with and were ignored",
  "diag.pu.orphanLyric": "Lyric line has no music line before it",
  "diag.pu.noQ": "Looks like a music line but has no Q: prefix: '{text}'",
  "diag.jly.graceChord": "Grace-note chord (`g[1&3&5]`)",
  "diag.jly.graceBad": "Unreadable grace-note group",
  "diag.jly.backslash": "Backslash durations (`1\\`)",
  "diag.jly.unknownWord": "Unrecognised word",
  "diag.jly.hanInL": "Consecutive Chinese characters in an `L:` lyric line are one syllable upstream; use `H:` to split them per character",
  "diag.jly.anacrusis": "Pickup time signature (`4/4,8`)",
  "diag.jly.chordToken": "Unreadable token in the chords line",
  "diag.jly.chordPitch": "Unreadable pitch name in the chords line",
  "diag.jly.jumpNoBar": "Jump mark before any bar",
  "diag.jly.textNoNote": "Score text with no note before it",
  "diag.jly.dynNoNote": "Dynamic with no note before it",
  "diag.jly.fermataNoNote": "`\\fermata` with no note before it",
  "diag.jly.breakNoBar": "Line/page break before any bar",
  "diag.jly.barStyleNoBar": "`\\bar` style before any bar",
  "diag.jly.barStyle": "`\\bar` style",
  "diag.jly.altNoClose": "`A{` without a preceding `}`",
  "diag.jly.closeNoOpen": "`}` without `R{` / `A{`",
  "diag.jly.closeExtra": "Extra `}`",
  "diag.jly.breakNoNote": "Line/page break with no note after it",
  "diag.jly.slurUnpaired": "Unpaired slur `( )`",
  "diag.jly.phraseUnpaired": "Unpaired phrasing slur `\\( \\)`",
  "diag.jly.nyPercussion": "Percussion `x`",
  "diag.jly.nyLp": "Raw LilyPond blocks (`LP: … :LP`)",
  "diag.jly.nyLayout": "Layout / structure switches",
  "diag.jly.nyChords": "Chord symbols / fret diagrams / instrument",
  "diag.jly.nyArp": "Arpeggio",
  "diag.jly.nyErhu": "Erhu symbols",
  "diag.jly.nyMisc": "Rehearsal marks / glissando / harmonics",
  "diag.jly.nyOctaveShift": "Base-octave switch",
  "diag.jly.nyOctaveKey": "Octave shortcuts (`8` = `1'`)",
  "diag.jly.nyCommand": "LilyPond commands",
  "diag.jly.header": "Header field `{key}=`",
  "diag.jly.key": "Key `{v}`",
  "diag.jly.extraSyl": "Verse {verse} has {n} extra syllable(s)",
  "diag.jly.chordsTooLong": "The chords line is longer than the music (by {n} whole notes)",
  "diag.jly.skipped": "{what}: not supported yet, skipped (not in the model)",
  "diag.jly.example": "{what} (e.g. {raw})",
  "diag.j123.oldSkip": "Lyric skips now use `/`; `*` is read as a skip for now",
  "diag.j123.orphanSustain": "Extension dash has no note before it",
  "diag.j123.orphanTie": "Tie has no note before it",
  "diag.j123.emptyTuplet": "Tuplet has no notes",
  "diag.j123.extraParen": "Unmatched `)`",
  "diag.j123.emptySlur": "Slur has no notes",
  "diag.j123.tupletOpen": "Tuplet is missing `)`",
  "diag.j123.slurOverlay": "Slur crosses `&`",
  "diag.j123.tupletOverlay": "Tuplet crosses `&`",
  "diag.j123.overlayBefore": "The overlay voice before `&` is empty",
  "diag.j123.overlayAfter": "The overlay voice after `&` is empty",
  "diag.j123.lyricOverflow": "Verse {verse} has {left} more syllable(s) than notes on these lines; the extra ones were ignored",
  "diag.j123.contUnsupported": "`+:` only continues lyric lines (right after `w:`)",
  "diag.j123.verseNumber": "Lyric lines no longer carry verse numbers (`w{n}:` is obsolete): write `w:` — verses are numbered in order under a music line; continue a verse with `+:`. This line was dropped",
  "diag.j123.badLength": "Can't understand the default note length: {v}",
  "diag.badKey": "Can't understand the key: {v}",
  "diag.noSuchKey": "No such key: {v} (original text kept)",
  "diag.badTime": "Can't understand the time signature: {v}",
  "diag.badPlayOrder": "Can't understand the singing-order item: {v}",
  "diag.abc.chordSpace": "Chord `{body}` must be followed by a space and its note",
  "diag.abc.badChord": "Can't understand chord name `{body}` (quote non-standard names)",
  "diag.abc.multiVoice": "Unsupported multi-voice syntax `{run}`",
  "diag.abc.inlineOpen": "Inline field is missing `]`",
  "diag.abc.decoOpen": "Decoration is missing the closing `!`",
  "diag.abc.quoteOpen": "Chord/annotation is missing the closing quote",
  "diag.abc.graceOpen": "Grace notes are missing `}`",
  "diag.abc.badChar": "Unrecognized symbol `{ch}`",
  "diag.jcx.wedge": "Unpaired crescendo/diminuendo brackets (`(<` … `<)`, `(>` … `>)`)",
  "diag.jcx.textOpen": "`%%begintext` has no matching `%%endtext`; everything after it was read as a text block",
  "diag.jcx.trackSkipped": "Muse {style} tracks (guitar/ukulele tablature) are not supported yet; this track was not read",
  "diag.jcx.gbkMissing": "These characters cannot be written in GBK and were saved as ?: {chars}",
  // 文本谱方言嗅探与杂项错误
  "sniff.noHeader": "Found Q:/C: lines but no header fields, so it can't tell Fanqie from Shigeben",
  "sniff.notPu": "Doesn't look like text jianpu: no header fields and no Q:/C: lines",
  "sniff.tomato": "{n} Fanqie header field(s)",
  "sniff.shige": "{n} Shigeben header field(s)",
  "sniff.tie": "Both dialects match equally; parsing as Fanqie",
  "err.noSong": "This document has no songs",
  "err.xmlParse": "Can't parse the MusicXML",
  "err.noVoice": "No .Voice section",
  "err.noLines": "No music lines to write",
  // 帮助对话框
  "help.title": "Help",
  "help.tab.features": "Features",
  "help.tab.visual": "Visual editing",
  "help.tab.notation": "JPWABC notation",
  "help.tab.about": "About",
  "help.close": "Close",
  "help.badge.desktop": "🖥 Desktop only",
  "help.badge.browser": "🌐 Browser only",
  "help.badge.mac": "🍎 macOS desktop only",
  "help.featuresIntro": "The editor's features are listed below; click a title to expand it. Badged features behave differently in the desktop and browser versions.",
  "help.visualIntro": "Select, insert and change notes and marks right on the score; changes are written back to the source on the left. Works for every format (123, `.jpwabc`, text jianpu and ABC edit the source; MusicXML edits the score itself) in all four views: Expanded, As printed, Staff and Mixed.",
  "help.notationIntro": "`.jpwabc` is the **plain-text jianpu format** used by JP-Word; it describes a score in sections: `.Title` (header), `.Voice` (melody, required), `.Words` (lyrics) and so on; each section header is on its own line and starts with `.`. Common notation comes first below, each with a live-rendered example.",
  "help.glossary": "Quick glossary (click to open)",
  "help.level.common": "Basic",
  "help.level.adv": "Advanced",
  "help.onlyMode": " ({mode} only)",
  "help.modeEdit": "Edit mode",
  "help.modeInsert": "Insert mode",
  "about.name": "Dolce",
  "about.version": "Version {v}",
  "about.home": "Homepage",
  "about.check": "Check for updates",
  "about.checking": "Checking…",
  "about.checkFailed": "Check failed; please check your network and try again",
  "about.latest": "You're up to date",
  "about.found": "New version {v} available",
  "about.feedback": "Send feedback",
  "about.noMail": "Couldn't open a mail client; please write to {email}",
  "about.autoCheck": " Check for updates on startup",
  // 帮助（123 页与页签）
  "help.tab.123": "123 format",
  "help.spec123": "Full specification (docs/格式/123格式.md, Chinese)",
  // 识别、声部、编辑动作补充
  "vis.modeVoice": " · voice {n}",
  "vis.letter": "Note name {d} (converted to a degree by the key)",
  "vis.chordAdd": "Add chord note: degree {d}",
  "vis.voiceShort": "V{d}",
  "vis.voiceTitle": "New notes go into voice {d}",
  "vis.measSubmenu": "Insert / delete measures, key, time and tempo, barline styles, endings, jump marks",
  "export.project": "Recognition project (.dolce)",
  "settings.partsHint": "Per-part playback volume, mute and solo are in the Parts panel on the toolbar.",
  "help.webKeys": "{keys} (web: {web})",
  "toolbar.doubt.title": "Notes and lyric characters the recognizer was unsure of (yellow boxes in the check view): click to go to the next one",
  "toolbar.srcPages": "Source pages",
  "toolbar.srcPages.title": "The images used for this recognition: reorder, remove, add, rotate, crop, then recognize again from these pages",
  "toolbar.srcSide": "Side by side",
  "toolbar.srcSide.title": "Shows the full source page left of the engraved score: the selected note is boxed, and clicking a note on the source selects it in the score",
  "toolbar.srcFollow": "Source snippet",
  "toolbar.srcFollow.title": "When a note is selected in the score, a small window at the bottom right shows that line of the source with the note boxed",
  "toolbar.recogKind": "Recognize as",
  "toolbar.recogKind.title": "Recognize as: auto / jianpu / staff. Changing it recognizes the same images again",
  "recogKind.auto": "Auto detect",
  "recogKind.jianpuAs": "As jianpu",
  "recogKind.staffAs": "As staff notation",
  "recogKind.jianpu": "Jianpu",
  "recogKind.staff": "Staff",
  "toolbar.parts": "Parts",
  "toolbar.parts.title": "Parts: add, remove, reorder, rename, clef, split / merge shared staves, copy lyrics; playback mute / solo / volume",
  "pane.selInfo.title": "Selection: part, measure and beat, pitch, duration",
  "start.recogKind": "Recognize as",
  "start.adjustFirst": "Adjust images before recognizing",
  "start.adjustFirst.title": "After picking images, open Source pages first: rotate sideways photos, crop margins, order the pages, then start recognizing",
  // 并排原图收起源码
  // 声部面板、原图页、识别项目、草稿恢复、识别状态
  "parts.title": "Parts",
  "parts.done": "Done",
  "parts.confirmTitle": "Edit parts",
  "parts.confirmComments": "“{what}” rewrites the whole source from the model; % comments in the source will be lost (undoable). Continue?",
  "parts.failed": "Could not {what}",
  "parts.doneStatus": "{what}: done (undoable)",
  "parts.note.jpw": "JP-Word (.jpwabc) has a single part; only playback settings apply here.",
  "parts.note.pu": "Text-score parts are edited in the source (Q1–Q4 lines); only playback and the jianpu melody apply here.",
  "parts.note.none": "No parts to list.",
  "parts.col.name": "Name",
  "parts.col.abbr": "Short",
  "parts.col.clef": "Clef",
  "parts.col.transpose": "Transpose",
  "parts.col.staves": "Staves",
  "parts.col.visible": "Visible",
  "parts.col.mute": "Mute",
  "parts.col.solo": "Solo",
  "parts.col.volume": "Volume",
  "parts.col.jianpu": "Jianpu",
  "parts.col.lyrics": "Lyrics",
  "parts.defaultName": "Part {n}",
  "parts.abbrPlaceholder": "e.g. S, A",
  "parts.op.rename": "Rename",
  "parts.op.clef": "Change clef",
  "parts.tr.other": "(custom in source)",
  "parts.tr.title": "Transposing instrument: written at notated pitch, played back at concert pitch",
  "parts.tr.onlyXml": "Only MusicXML can store transposing instruments",
  "parts.op.transpose": "Change transposition",
  "parts.staves.title": "Number of staves for this part (2 for a grand staff)",
  "parts.visible.title": "Show this part in staff / mixed view (display only; still plays back; not saved to the file)",
  "parts.mute.title": "Silence this part during playback",
  "parts.solo.title": "Play only this part (for part practice)",
  "parts.volume.title": "Volume for playback and MIDI export",
  "parts.melody.title": "Use this part for the jianpu layer in mixed view and the jianpu view of MusicXML",
  "parts.lyric.textFmt": "In text formats the lyrics are the lyric lines under the jianpu",
  "parts.lyric.title": "Jianpu expanded view: the melody still comes from the “Jianpu” part, lyrics come from this part (aligned by time). None checked = automatic, uses the part with lyrics",
  "parts.up": "Move up",
  "parts.op.up": "Move part up",
  "parts.down": "Move down",
  "parts.op.down": "Move part down",
  "parts.dup": "Duplicate",
  "parts.dup.title": "Duplicate this part (inserted after it)",
  "parts.op.dup": "Duplicate part",
  "parts.splitVoice": "Split voices",
  "parts.splitVoice.title": "Closed score: move the second voice into a new part below (e.g. split S/A on one staff into two)",
  "parts.op.splitVoice": "Split by voice",
  "parts.splitChord": "Split chords",
  "parts.splitChord.title": "Closed score: move the lowest chord note into a new part below (single notes go to both)",
  "parts.op.splitChord": "Split by chord",
  "parts.merge": "Merge up",
  "parts.merge.title": "Closed score: merge this part into the previous one as its second voice",
  "parts.merge.onlyXml": "Merging into a closed score works only for MusicXML (a 123 / ABC part holds a single melody)",
  "parts.op.merge": "Merge parts",
  "parts.delete": "Delete",
  "parts.delete.title": "Delete this part",
  "parts.op.delete": "Delete part",
  "parts.delete.confirm": "Delete “{name}”? (undoable)",
  "parts.add": "Add part",
  "parts.add.title": "Add a part at the end (whole-measure rests, measure structure copied from the first part)",
  "parts.lyricFrom": "Lyrics from",
  "parts.lyricTo": "copy to",
  "parts.copyLyrics": "Copy lyrics",
  "parts.copyLyrics.title": "Copy lyrics to the target part by time (verses it already has are kept). Useful when one lyric line in SATB is shared by several parts",
  "parts.assign.title": "Staves ↔ parts (recognition)",
  "parts.assign.note": "Recognition maps each staff in every system to a part. If it got it wrong (a system printed one part fewer, or you don't want the piano accompaniment), fix it here; “Apply” rebuilds with the new mapping without re-recognizing.",
  "parts.assign.system": "System",
  "parts.assign.staff": "Staff {n}",
  "parts.assign.sysPage": "{n} (page {page})",
  "parts.assign.row": "Part row {n}",
  "parts.assign.new": "New part",
  "parts.assign.ignore": "Ignore",
  "parts.assign.apply": "Apply",
  "parts.assign.apply.title": "Rebuild the score with the mapping above (no re-recognition; edits on the score are lost, you'll be asked first)",
  "parts.clef.treble": "Treble clef",
  "parts.clef.treble-8": "Treble clef 8vb (tenor)",
  "parts.clef.bass": "Bass clef",
  "parts.clef.alto": "Alto clef",
  "parts.clef.tenor": "Tenor clef",
  "parts.tr.none": "Not transposing",
  "parts.tr.Bb": "in B♭ (clarinet, trumpet: sounds a major 2nd lower)",
  "parts.tr.A": "in A (sounds a minor 3rd lower)",
  "parts.tr.F": "in F (horn: sounds a perfect 5th lower)",
  "parts.tr.Eb": "in E♭ (alto sax: sounds a major 6th lower)",
  "parts.tr.8vb": "Sounds an octave lower (written 8va)",
  "parts.tr.8va": "Sounds an octave higher (piccolo, celesta)",
  "parts.copyName": "{name} (copy)",
  "pages.encodeFailed": "Could not encode the image",
  "pages.crop.hint": "Drag to select the part to keep",
  "pages.cancel": "Cancel",
  "pages.hint": "Pages are combined into one piece in list order (jianpu uses only the first). Drag rows to reorder. Click “Re-recognize these pages” to rerun the whole piece; edits made on the score are lost, and you'll be asked first.",
  "pages.nth": "Item {n}",
  "pages.failed": "Failed: ",
  "pages.up": "Move up",
  "pages.down": "Move down",
  "pages.rotate": "Rotate",
  "pages.rotate.title": "Rotate 90° clockwise (for sideways photos)",
  "pages.crop": "Crop",
  "pages.crop.title": "Keep only the dragged area (trim margins or a neighboring page)",
  "pages.delete": "Delete",
  "pages.delete.title": "Remove this item",
  "pages.add": "Add images…",
  "pages.title": "Source pages",
  "pages.rerun": "Re-recognize these pages",
  "pages.start": "Start recognition",
  "pages.beforeHint": "Get the images ready before recognizing: rotate sideways photos, crop margins and neighboring pages, and put the images in order (drag rows).",
  "proj.notZip": "Not a recognition project file (not a readable zip)",
  "proj.noManifest": "The recognition project is missing manifest.json",
  "proj.badManifest": "The recognition project's manifest.json is corrupt",
  "proj.noVersion": "The recognition project's manifest.json has no version",
  "proj.tooNew": "This recognition project was saved by a newer version; please update Dolce and open it again",
  "proj.badKind": "Unknown recognition kind in project: {v}",
  "proj.badFormat": "Unknown score format in project: {v}",
  "start.retryAdjust": "Rotate / crop the images and retry…",
  "start.recogFailed": "Recognition failed; try another image",
  "status.xmlUnaligned": "This MusicXML source doesn't line up with what was read; the score is view-only",
  "status.partsFailed": "Editing parts failed: {error}",
  "draft.session": "Recognition session (with source images)",
  "draft.untitled": "Untitled score",
  "draft.title": "Restore unsaved work",
  "draft.body": "Found unsaved work from last time: {what} ({when}). Restore it? If not, it will be discarded.",
  "draft.restored": "Restored unsaved work from last time (not saved yet)",
  "unsaved.title": "Unsaved work",
  "unsaved.body": "The current score has unsaved changes and will be replaced. Continue?",
  "unsaved.closeBody": "The current score has unsaved changes. Close anyway? (You can restore it next time.)",
  "proj.nothing": "No recognition session to save (a recognition project needs source images)",
  "proj.defaultName": "Recognition project",
  "proj.saved": "Saved as a recognition project (source images, recognition result and the score being edited)",
  "proj.openFailed": "Could not open the recognition project: {error}",
  "proj.opened": "Opened recognition project ({kind}, {n} source images)",
  "omr.staffFailed": "Staff recognition failed: {error}",
  "omr.firstOnly": "; jianpu recognizes one image at a time, only the first was used ({n} images)",
  "omr.staffRunning": "Recognizing staff notation… (Esc to cancel)",
  "omr.escCancel": " (Esc to cancel)",
  "omr.cancelled": "Recognition cancelled",
  "omr.noStaffFound": "No staves found (try setting “Recognize as” to jianpu in the toolbar)",
  "omr.fullBars": ", full measures {pct}%",
  "omr.editOnScore": ". You can proofread and edit directly on the score",
  "omr.loadingPdf": "Loading comparison data from the source PDF…",
  "omr.loadFailed": "Loading comparison data failed: {error}",
  "omr.loadingImg": "Loading comparison data from the source images…",
  "omr.loadingImgPages": "Loading comparison data from the source images… {done}/{total} pages",
  "omr.doubts": "{n} doubtful",
  "omr.doubtAt": "Doubtful {i} / {n}: ",
  "omr.restLabel": "rest",
  "omr.rebuildFailed": "Rebuild failed: {error}",
  "omr.rebuilt": "Rebuilt with the new staff assignment (not re-recognized)",
  // 谱面编辑提示、选中读数、移调对话框、模型编辑报错
  "ve.chordNotePicked": "Selected chord note {n} from the bottom; Delete removes only it",
  "ve.chordOnlyXml": "A jianpu part prints a single melody: put chord notes in another part (V: in 123); this works only for MusicXML",
  "ve.hint.key": "Key, e.g. 1=G, bB, F#",
  "ve.hint.time": "Time signature, e.g. 3/4, 6/8",
  "ve.hint.tempo": "Tempo (beats per minute), 0 to remove",
  "ve.voiceNow": "New notes in insert mode go to voice {n}",
  "ve.voiceOnlyXml": "In text formats, write multiple voices in the source with V: (123 / ABC); this works only for MusicXML",
  "ve.gotoPrompt": "Go to measure",
  "ve.selectToCopy": "Select the notes to copy first (edit mode)",
  "ve.copied": "Copied {n} notes",
  "ve.pasteXmlOnly": "In MusicXML you can only paste notes copied from the score",
  "ve.clipEmpty": "The clipboard is empty",
  "ve.verseN": "Verse {n} lyrics",
  "ve.chordName": "Chord name",
  "ve.notDynamic": "“{v}” is not a dynamic (p, mp, mf, f, ff, sfz, fp…)",
  "ve.text": "Text",
  "ve.dynamic": "Dynamic (p mf f…)",
  "ve.measureInt": "The measure number must be an integer",
  "ve.noMeasure": "There is no measure {n}",
  "ve.selectNote": "Select a note first",
  "ve.fillVerseFirst": "Fill in verse {n} first",
  "ve.lyricNoSlot": "This format can only change existing syllables; this note has none yet, add it in the source lyric line",
  "ve.measSrcOnly": "Edit measures of this format in the source (123 / ABC / MusicXML can be edited on the score)",
  "ve.noNotes": "The score has no notes yet",
  "ve.selectInMeasure": "Select a note in a measure first",
  "ve.badKey": "Can't read key “{v}”",
  "ve.badTime": "Can't read time signature “{v}”",
  "ve.badTempo": "Can't read tempo “{v}”",
  "ve.noTempo": "This measure has no tempo marking",
  "ve.measUnsupported": "This measure operation isn't supported for this format yet",
  "ve.xmlUnreadable": "This MusicXML can't be read, so it can't be edited on the score",
  "ve.cantInsert": "Can't insert a note here",
  "ve.cantPaste": "Can't paste notes here",
  "ve.selectToMove": "Select the notes to move first",
  "ve.noBarline": "Can't find this barline",
  "ve.noBreak": "Can't find this line break",
  "ve.cantDeleteXml": "This can't be deleted on the score in MusicXML yet",
  "ve.selectMeasToDelete": "Select the measures to delete first",
  "ve.selectMeasOrBar": "Select a note or barline in a measure first",
  "ve.selectVolta": "Select the measures for the ending first",
  "ve.slurTwo": "Select two or more notes for a slur",
  "ve.noBreakPos": "Can't find where to break the line",
  "ve.breakAtBar": "Staff notation can only break at a barline: add a barline (|) here first",
  "ve.octaveMax": "At most three octave dots",
  "ve.chordSrcOnly": "Edit chord names of this format in the source",
  "ve.chordQuote": "Chord names can't contain double quotes",
  "ve.chordUnwritable": "The upstream chord syntax cannot express this name: {name} (it knows C / Am / G7 / Cmaj7 / G/B and the like)",
  "ve.noChord": "This note has no chord name",
  "ve.textSrcOnly": "Edit text of this format in the source",
  "ve.dynSrcOnly": "Edit dynamics of this format in the source",
  "ve.textQuote": "Text can't contain double quotes (use “ ” instead)",
  "ve.dynQuote": "Dynamics can't contain ! or quotes",
  "ve.nothingToRemove": "Nothing to remove on this note",
  "ve.tupletSrcOnly": "Edit tuplets of this format in the source",
  "ve.tupletTwo": "Select two or more notes to make a tuplet",
  "ve.tupletPartial": "Some selected notes are in a tuplet: select the whole tuplet and press again to undo it",
  "sel.dot": "dotted ",
  "sel.tuplet": " ({n}-tuplet)",
  "sel.pos": "m. {m} · beat {b}",
  "sel.rest": "rest",
  "sel.degree": "degree {d}",
  "sel.chord": "{n}-note chord",
  "sel.sep": ", ",
  "sel.type.maxima": "maxima",
  "sel.type.long": "long",
  "sel.type.breve": "breve",
  "sel.type.whole": "whole",
  "sel.type.half": "half",
  "sel.type.quarter": "quarter",
  "sel.type.eighth": "eighth",
  "sel.type.16th": "16th",
  "sel.type.32nd": "32nd",
  "sel.type.64th": "64th",
  "sel.type.128th": "128th",
  "sel.type.256th": "256th",
  "tp.iv.m2": "minor 2nd",
  "tp.iv.M2": "major 2nd",
  "tp.iv.m3": "minor 3rd",
  "tp.iv.M3": "major 3rd",
  "tp.iv.P4": "perfect 4th",
  "tp.iv.A4": "augmented 4th",
  "tp.iv.P5": "perfect 5th",
  "tp.iv.m6": "minor 6th",
  "tp.iv.M6": "major 6th",
  "tp.iv.m7": "minor 7th",
  "tp.iv.M7": "major 7th",
  "tp.iv.P8": "octave",
  "tp.noKey": "No key signature to change was found in this score",
  "tp.octave": "That's a whole octave: jianpu degrees and key stay the same. To shift by an octave, select all and press ' or ,",
  "tp.all": "Whole piece (changes the key; jianpu degrees stay)",
  "tp.sel": "Selected notes (key unchanged)",
  "tp.option": "{dir} {iv} ({k} semitones){to}",
  "tp.hint": "Currently 1={key}. Jianpu uses movable do: transposing the whole piece changes only the key, the numbers stay; ABC and MusicXML notes move too. Chord symbols don't move. Undo with Ctrl/⌘+Z.",
  "tp.scope": "What",
  "tp.by": "By",
  "tp.title": "Transpose",
  "tp.up": "Up",
  "tp.down": "Down",
  "me.tupletDur": "Durations inside a tuplet can't be changed on the score yet",
  "me.divCoarse": "This score's duration unit is too coarse for this duration",
  "me.durInvalid": "Can't write this duration (more than two dots or not a power of two)",
  "me.restOctave": "A rest is selected; it has no octave",
  "me.noInsertPos": "Can't find the insertion point",
  "me.degree07": "Degrees are 0–7 only",
  "me.nothingToDelete": "No notes to delete",
  "me.atMeasureEnd": "This is already the end of the measure",
  "me.crossBar": "{part} has a note spanning this point; can't add a barline here",
  "me.noMeasure": "Can't find the measure",
  "me.lastBar": "The last barline can't be deleted",
  "me.mergeKeyTime": "The next measure changes key or time signature; can't merge",
  "me.mergeDiv": "The next measure uses a different duration unit; can't merge",
  "me.breakFirst": "No line break needed before the first measure",
  "me.selectToSlur": "Select the notes to connect first",
  "me.slurCrossPart": "Slurs can't cross parts",
  "me.tieSamePitch": "Ties connect only equal pitches: the next note differs",
  "me.keepOneMeasure": "At least one measure must remain",
  "me.timeFormat": "Write the time signature like “3/4”, with a power-of-two denominator",
  "me.selectNoteNoRest": "Select a note first (rests can't take chord notes)",
  "me.degree17": "Degrees are 1–7 only",
  "me.lastChordNote": "Only one note left in the chord; press Delete to remove the whole note",
  "me.noNote": "Can't find this note",
  "me.voiceBusy": "Voice {n} already has a note at this point: select it to change it, or pick another spot",
  "me.nothingToMove": "Nothing to move",
  "me.stepAG": "Note names are A–G only",
  "me.tupletSame": "A tuplet must be within one measure and one voice",
  "me.tupletAlready": "The selected notes are already in another tuplet",
  "me.clipNoNotes": "The clipboard has no notes",
  "me.otherPart": "Another part",
  // 试听：循环、节拍器
  "play.loop": "Loop",
  "play.loop.title": "Loop playback: loops the selected passage, or the whole piece if nothing is selected",
  "play.metronome": "Click",
  "play.metronome.title": "Metronome: clicks every beat during playback (higher on the downbeat)",
  // 识别对照：可疑理由
  "omr.doubt.reasons": "Doubtful: {list}",
  "omr.doubt.lyric": "Doubtful: unsure about this syllable in verse {n}",
  "omr.doubt.sep": "; ",
  "omr.doubt.note.offRow": "sits noticeably higher or lower than the rest of the row; may not be a note (small print, annotation)",
  "omr.doubt.oct.inkAbove": "ink like an upper octave dot right above (touching a slur); an octave dot may be missing",
  "omr.doubt.oct.oddShape": "the octave dot doesn't look like a dot; another mark may have been read as one",
  "omr.doubt.oct.offCenter": "a slightly offset dot nearby; an octave dot may be missing"
};
const DICTS = { zh, en };
let current = "zh";
function getLang() {
  return current;
}
function t(key, params) {
  const s = DICTS[current][key] ?? zh[key] ?? key;
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => k in params ? String(params[k]) : m) : s;
}
const BARLINES = [
  ["[|]", "none"],
  // 双线接反复起（`… ||:`）：Muse 的谱常这么写（谱例 45 首里 12 首），ABC 规范没有、123 以前报「认不出 `:`」
  ["||:", "repeat-start"],
  ["|::", "heavy-light:3"],
  ["::|", "light-heavy:3"],
  [":|:", "repeat-both"],
  ["::", "repeat-both"],
  ["|:", "repeat-start"],
  [":|", "repeat-end"],
  ["|]", "final"],
  ["[|", "reverse-final"],
  ["||", "double"],
  [".|", "dotted"],
  ["|", "normal"],
  // 落单的 `]`：规范里没有，但野外的 ABC 常用它收尾（`… z2]`）。`[|]`/`|]` 都已在前面匹配掉，
  // 和弦 `[CEG]`、行内字段 `[K:G]` 的 `]` 也早被各自的扫描吃掉了，所以走到这里的一定是收尾线。
  // **只在 ABC 那一档认**（`strayBracketIsFinal`）：这是给野外文件的容错，123 不背这个包袱。
  ["]", "final"]
];
function expandEndingNumbers(s) {
  const out = [];
  for (const part of s.split(",")) {
    const r = /^(\d+)-(\d+)$/.exec(part);
    if (r) {
      const a = Number(r[1]);
      const b = Number(r[2]);
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) out.push(k);
    } else if (/^\d+$/.test(part)) {
      out.push(Number(part));
    }
  }
  return out;
}
function splitBarlineValue(v) {
  const m = /^(.*):(\d+)$/.exec(v);
  if (!m) return [v, void 0];
  return [m[1], Number(m[2])];
}
const WEDGE_PARENS = {
  "(<": "crescendo start",
  "<)": "crescendo stop",
  "(>": "diminuendo start",
  ">)": "diminuendo stop"
};
function matchBarline(line, i, strayBracket) {
  for (const [text, value] of BARLINES) {
    if (text === "]" && !strayBracket) continue;
    if (line.startsWith(text, i)) return { text, value };
  }
  return null;
}
class AbcFamilyLexer {
  /** 音乐体里的 `&` 是不是小节内临时多声部分隔（ABC §7.4 voice overlay）。123 没有这个记号。 */
  voiceOverlay = false;
  /** 落单的 `]` 算不算收尾线（野外 ABC 的容错）。123 不认。 */
  strayBracketIsFinal = false;
  /** 后置 `~` 是不是「弧连到下一个音」（123 扩展，规范 §4.1）。ABC 的 `~` 是 roll 装饰，走 `shorthandDecoration`。 */
  arcNextTilde = false;
  /** 节奏音符（有声无音高）用哪几个字母。123 是大写 `X`（ABC 里 X 是音名以外的保留字，那一档没有）；
   *  Muse `.jcx` 大小写都是（说明书 §3.2.3.4「X 音符」）。 */
  rhythmLetters = "";
  /** 不可见休止（占时值不显示）用哪个字符。123、ABC 是 `x`；Muse `.jcx` 是 `@`，它的 `x` 是节奏音符。 */
  invisibleRest = "x";
  /** 渐强渐弱的成对括号 `(<` … `<)` / `(>` … `>)`（Muse `.jcx`，说明书 FAQ「如何输入渐强、渐弱」）。
   *  123 与 ABC 没有这种写法：`(` 后跟 `<` 在 ABC 里是圆滑线 + 破碎节奏。 */
  wedgeParens = false;
  /** 倚音花括号里打头的这个字符表示**后倚音**（Muse 的 `{@C}`，排在主音之后）。null = 没有这种写法。 */
  postGraceMark = null;
  /** 方言特有的单字符装饰（ABC 的 `.` `~` `H`–`W`）。不认返回 null。 */
  shorthandDecoration(line, i) {
    return null;
  }
  /** 同时发声的和弦（ABC 的 `[CEG]`）。123 靠多声部表达，这一档没有。 */
  scanChordGroup(line, i) {
    return null;
  }
  /** 不带引号的和弦（123 扩展：`Am7 1`）。ABC 里 A–G 是音名，这一档没有。
   *  返回和弦文本的长度与可选的诊断；**有诊断也照样当和弦**（半截文本也要给出大部分结果）。 */
  scanBareChord(line, i) {
    return null;
  }
  /** 破碎节奏（ABC 的 `>` / `<`）。123 用附点与减时线直接写，这一档没有。 */
  scanBroken(line, i) {
    return null;
  }
  // ────────── 共用扫描 ──────────
  /**
   * 扫一行音乐体。
   * @param line 行文本（不含字段前缀）
   * @param lineNo 0 基行号
   * @param lineOffset 该行在全文里的 0 基偏移
   * @param columnBase 行内起始列（字段前缀的长度）
   */
  lexLine(line, lineNo, lineOffset, columnBase = 0) {
    const tokens = [];
    const errors = [];
    let i = 0;
    const span2 = (col, len) => ({
      line: lineNo,
      column: columnBase + col,
      offset: lineOffset + columnBase + col,
      length: len
    });
    const push2 = (t2, col, len) => {
      tokens.push({ ...t2, source: t2.source ?? span2(col, len) });
    };
    while (i < line.length) {
      const ch = line[i];
      const start = i;
      if (ch === "%") break;
      if (ch === " " || ch === "	") {
        while (i < line.length && (line[i] === " " || line[i] === "	")) i++;
        push2({ kind: "space", text: line.slice(start, i) }, start, i - start);
        continue;
      }
      if (ch === "`") {
        i++;
        continue;
      }
      if (ch === "$") {
        if (line[i + 1] === "$") {
          i += 2;
          push2({ kind: "break", text: "$$", value: "page" }, start, 2);
        } else {
          i++;
          push2({ kind: "break", text: "$", value: "line" }, start, 1);
        }
        continue;
      }
      if (ch === "&" && this.voiceOverlay) {
        const run = /^&+/.exec(line.slice(i))[0];
        if (run.length > 1) {
          i += run.length;
          errors.push({ message: t("diag.abc.multiVoice", { run }), source: span2(start, run.length) });
          push2({ kind: "unknown", text: run }, start, run.length);
          continue;
        }
        i++;
        push2({ kind: "overlay", text: "&" }, start, 1);
        continue;
      }
      if (ch === "~" && this.arcNextTilde) {
        i++;
        push2({ kind: "arcNext", text: "~" }, start, 1);
        continue;
      }
      if (this.wedgeParens) {
        const two = line.slice(i, i + 2);
        const w = WEDGE_PARENS[two];
        if (w) {
          i += 2;
          push2({ kind: "wedge", text: two, value: w }, start, 2);
          continue;
        }
      }
      if (ch === "-") {
        i++;
        push2({ kind: this.hyphen, text: "-" }, start, 1);
        continue;
      }
      if (ch === "[" && /^\[[A-Za-z]\s*[:：]/.test(line.slice(i))) {
        const close = line.indexOf("]", i);
        if (close < 0) {
          errors.push({ message: t("diag.abc.inlineOpen"), source: span2(start, line.length - start) });
          i = line.length;
          continue;
        }
        const body = line.slice(i + 1, close);
        i = close + 1;
        push2({ kind: "inlineField", text: line.slice(start, i), value: body }, start, i - start);
        continue;
      }
      if (ch === "[" && /^\[\d/.test(line.slice(i))) {
        const m = /^\[([\d,\-]+)/.exec(line.slice(i));
        const nums = expandEndingNumbers(m[1]);
        i += m[0].length;
        push2({ kind: "ending", text: m[0], numbers: nums }, start, m[0].length);
        continue;
      }
      {
        const bl = matchBarline(line, i, this.strayBracketIsFinal);
        if (bl) {
          i += bl.text.length;
          const [style, times] = splitBarlineValue(bl.value);
          const t2 = { kind: "barline", text: bl.text, value: style };
          if (times) t2.repeatTimes = times;
          push2(t2, start, bl.text.length);
          const after = /^(\d[\d,\-]*)/.exec(line.slice(i));
          if (after) {
            const s2 = i;
            i += after[0].length;
            push2(
              { kind: "ending", text: after[0], numbers: expandEndingNumbers(after[1]) },
              s2,
              after[0].length
            );
          }
          continue;
        }
      }
      const tup = this.matchTuplet(line, i);
      if (tup) {
        i += tup.text.length;
        const t2 = { kind: "tuplet", text: tup.text, value: String(tup.n) };
        if (tup.p !== void 0 || tup.q !== void 0) t2.numbers = [tup.n, tup.p ?? 0, tup.q ?? 0];
        push2(t2, start, tup.text.length);
        continue;
      }
      if (ch === "(") {
        i++;
        push2({ kind: "slurStart", text: "(" }, start, 1);
        continue;
      }
      if (ch === ")") {
        i++;
        push2({ kind: "slurEnd", text: ")" }, start, 1);
        continue;
      }
      if (ch === "!") {
        const close = line.indexOf("!", i + 1);
        if (close < 0) {
          errors.push({ message: t("diag.abc.decoOpen"), source: span2(start, line.length - start) });
          i = line.length;
          continue;
        }
        const body = line.slice(i + 1, close);
        i = close + 1;
        push2({ kind: "deco", text: line.slice(start, i), value: body }, start, i - start);
        continue;
      }
      if (ch === '"') {
        const close = line.indexOf('"', i + 1);
        if (close < 0) {
          errors.push({ message: t("diag.abc.quoteOpen"), source: span2(start, line.length - start) });
          i = line.length;
          continue;
        }
        const body = line.slice(i + 1, close);
        i = close + 1;
        const isAnno = /^[\^_<>@]/.test(body);
        push2(
          { kind: isAnno ? "annotation" : "chord", text: line.slice(start, i), value: body },
          start,
          i - start
        );
        continue;
      }
      const bare = this.scanBareChord(line, i);
      if (bare) {
        const body = line.slice(i, i + bare.len);
        if (bare.error) errors.push({ message: bare.error, source: span2(start, bare.len) });
        i += bare.len;
        push2({ kind: "chord", text: body, value: body }, start, bare.len);
        continue;
      }
      if (ch === "{") {
        const close = line.indexOf("}", i);
        if (close < 0) {
          errors.push({ message: t("diag.abc.graceOpen"), source: span2(start, line.length - start) });
          i = line.length;
          continue;
        }
        let body = line.slice(i + 1, close);
        let bodyAt = i + 1;
        const acciaccatura = body.startsWith("/");
        if (acciaccatura) {
          body = body.slice(1);
          bodyAt += 1;
        }
        const after = this.postGraceMark !== null && body.startsWith(this.postGraceMark);
        if (after) {
          body = body.slice(1);
          bodyAt += 1;
        }
        const inner = this.lexLine(body, lineNo, lineOffset, columnBase + bodyAt);
        i = close + 1;
        const t$1 = {
          kind: "grace",
          text: line.slice(start, i),
          notes: inner.tokens.filter((x) => x.kind === "note")
        };
        if (acciaccatura) t$1.acciaccatura = true;
        if (after) t$1.graceAfter = true;
        push2(t$1, start, i - start);
        continue;
      }
      if (this.rhythmLetters.includes(ch)) {
        i++;
        const t2 = { kind: "rhythm", text: ch };
        const mod = this.scanDuration(line, i);
        if (mod) {
          i = mod.next;
          t2.beams = mod.beams;
          t2.dots = mod.dots;
          if (mod.num !== void 0) t2.num = mod.num;
          if (mod.den !== void 0) t2.den = mod.den;
        }
        push2(t2, start, i - start);
        continue;
      }
      if (ch === "y" || ch === this.invisibleRest) {
        i++;
        const t2 = { kind: "spacer", text: ch, value: ch === "y" ? "y" : "x" };
        const mod = ch !== "y" ? this.scanDuration(line, i) : null;
        if (mod) {
          i = mod.next;
          t2.beams = mod.beams;
          t2.dots = mod.dots;
          if (mod.num !== void 0) t2.num = mod.num;
          if (mod.den !== void 0) t2.den = mod.den;
        }
        push2(t2, start, i - start);
        continue;
      }
      const cg = this.scanChordGroup(line, i);
      if (cg) {
        const inner = this.lexLine(
          cg.text.slice(1, -1),
          lineNo,
          lineOffset,
          columnBase + i + 1
        );
        i = cg.dur ? cg.dur.next : i + cg.text.length;
        const t2 = {
          kind: "chordGroup",
          text: line.slice(start, i),
          notes: inner.tokens.filter((x) => x.kind === "note")
        };
        if (cg.dur) {
          t2.num = cg.dur.num;
          t2.den = cg.dur.den;
        }
        push2(t2, start, i - start);
        continue;
      }
      const brk = this.scanBroken(line, i);
      if (brk) {
        i += brk.len;
        push2({ kind: "broken", text: line.slice(start, i), broken: brk.dir }, start, brk.len);
        continue;
      }
      const rest = this.scanRest(line, i);
      if (rest) {
        i = rest.next;
        const t2 = { kind: "rest", text: line.slice(start, i) };
        t2.beams = rest.beams;
        t2.dots = rest.dots;
        if (rest.num !== void 0) t2.num = rest.num;
        if (rest.den !== void 0) t2.den = rest.den;
        push2(t2, start, i - start);
        continue;
      }
      const note = this.scanNote(line, i);
      if (note) {
        i = note.next;
        const t2 = {
          kind: "note",
          text: line.slice(start, i),
          octave: note.octave,
          beams: note.beams,
          dots: note.dots
        };
        if (note.degree !== void 0) t2.degree = note.degree;
        if (note.step !== void 0) t2.step = note.step;
        if (note.alter !== void 0) t2.alter = note.alter;
        if (note.accidental) t2.accidental = note.accidental;
        if (note.num !== void 0) t2.num = note.num;
        if (note.den !== void 0) t2.den = note.den;
        push2(t2, start, i - start);
        continue;
      }
      const deco = this.shorthandDecoration(line, i);
      if (deco) {
        i += deco.len;
        push2({ kind: "deco", text: line.slice(start, i), value: deco.name }, start, deco.len);
        continue;
      }
      i++;
      errors.push({ message: t("diag.abc.badChar", { ch }), source: span2(start, 1) });
      push2({ kind: "unknown", text: ch }, start, 1);
    }
    return { tokens, errors };
  }
  /** 多连音起头。123 是 `(n:` / `(n:p:`（以冒号收尾，组由 `)` 收）；ABC 允许 `(3` / `(3:2:3` / `(3:2` / `(3::2`。 */
  matchTuplet(line, i) {
    if (line[i] !== "(") return null;
    const rest = line.slice(i);
    if (this.tupletNeedsColon) {
      const m2 = /^\((\d+)(?::(\d+))?:/.exec(rest);
      if (!m2) return null;
      const out2 = {
        text: m2[0],
        n: Number(m2[1])
      };
      if (m2[2]) out2.p = Number(m2[2]);
      return out2;
    }
    const m = /^\((\d+)(?::(\d*)(?::(\d*))?)?/.exec(rest);
    if (!m) return null;
    const out = {
      text: m[0],
      n: Number(m[1])
    };
    if (m[2]) out.p = Number(m[2]);
    if (m[3]) out.q = Number(m[3]);
    return out;
  }
}
const ACCIDENTALS$1 = {
  "#": "sharp",
  b: "flat",
  n: "natural",
  "##": "double-sharp",
  bb: "double-flat"
};
const BARE_CHORD_RE = /^[A-G][#b]?[A-Za-z0-9#+\-°ø()]*(?:\/[A-G][#b]?)?$/;
class Lexer123 extends AbcFamilyLexer {
  id = "123";
  /** `-` 是增时线，加一拍。 */
  hyphen = "sustain";
  /** 音符是数字，裸 `(3` 与「圆滑线 + 音符 3」冲突，所以冒号必需。 */
  tupletNeedsColon = true;
  /** 后置 `~` = 弧连到下一个音（规范 §4.1：括号只许嵌套，从多连音里连到组外相邻音靠它）。 */
  arcNextTilde = true;
  /** 大写 `X` 是节奏音符（ABC 里 X 不是音名、123 也没占用）。 */
  rhythmLetters = "X";
  /** 不带引号的和弦：**大写 A–G 开头、读到空白为止、后面必须跟空格**。
   *  123 音乐体里 A–G 没有别的用处（音符是数字、节奏音符是 `X`、行内字段以 `[` 起头），不会撞。
   *  到空白为止是为了切得开：`G71`、`Bb3` 这种粘连读不出是 `G7`+`1` 还是 `B`+`b3`。 */
  scanBareChord(line, i) {
    if (!/[A-G]/.test(line[i] ?? "")) return null;
    let j = i + 1;
    while (j < line.length && line[j] !== " " && line[j] !== "	") j++;
    const body = line.slice(i, j);
    const res = { len: j - i };
    if (j >= line.length) res.error = t("diag.abc.chordSpace", { body });
    else if (!BARE_CHORD_RE.test(body)) res.error = t("diag.abc.badChord", { body });
    return res;
  }
  /** 123 的休止是 `0`，当成 degree 0 的音符走 `scanNote`，这里不单独认。 */
  scanRest() {
    return null;
  }
  /** 时值修饰：`_` 减时线（可多条）与 `.` 附点（可多个），两者可交替出现。 */
  scanDuration(line, i) {
    let beams = 0;
    let dots = 0;
    let j = i;
    while (j < line.length) {
      if (line[j] === "_") {
        beams++;
        j++;
      } else if (line[j] === ".") {
        dots++;
        j++;
      } else break;
    }
    if (j === i) return null;
    return { beams, dots, next: j };
  }
  /** 音符：`[#b n]数字['`,]*[_.]*`。变音记号**前置**（简谱惯例，与 ABC 的 `^_=` 不同）。 */
  scanNote(line, i) {
    let j = i;
    let accidental;
    const two = line.slice(j, j + 2);
    if (ACCIDENTALS$1[two] && /[0-7]/.test(line[j + 2] ?? "")) {
      accidental = ACCIDENTALS$1[two];
      j += 2;
    } else {
      const one = line[j];
      if (ACCIDENTALS$1[one] && /[0-7]/.test(line[j + 1] ?? "")) {
        accidental = ACCIDENTALS$1[one];
        j += 1;
      }
    }
    const d = line[j];
    if (d === void 0 || !/[0-7]/.test(d)) return null;
    const degree = Number(d);
    j++;
    let octave = 0;
    while (j < line.length) {
      if (line[j] === "'") {
        octave++;
        j++;
      } else if (line[j] === ",") {
        octave--;
        j++;
      } else break;
    }
    const dur = this.scanDuration(line, j);
    const res = {
      degree,
      octave,
      beams: dur?.beams ?? 0,
      dots: dur?.dots ?? 0,
      next: dur?.next ?? j
    };
    if (accidental) res.accidental = accidental;
    return res;
  }
}
const LEXER_123 = new Lexer123();
function lineStarts(text) {
  const out = [0];
  for (const m of text.matchAll(/\r?\n/g)) out.push(m.index + m[0].length);
  return out;
}
const BARLINE_ORNAMENT_NAME = {
  hs: "segno",
  ty: "coda",
  ds: "D.S.",
  dc: "D.C.",
  fine: "fine"
};
const BY_123 = {
  segno: "hs",
  coda: "ty",
  ds: "ds",
  dc: "dc",
  dalsegno: "ds",
  dacapo: "dc",
  dacoda: "ty",
  tocoda: "ty",
  fine: "fine"
};
function jumpOrnamentName(deco) {
  return BY_123[deco.trim().toLowerCase().replace(/[.\s]/g, "")];
}
class IdGen {
  _next = 1;
  next() {
    return this._next++;
  }
  /** 已分配到哪（序列化/合并文档时要接着往下发） */
  get watermark() {
    return this._next;
  }
  /** 合并两份文档时把分配器推到安全位置 */
  bump(to) {
    if (to >= this._next) this._next = to + 1;
  }
}
function* eachPart(song) {
  for (const p of song.parts) yield p;
}
function* eachMeasure$1(song) {
  for (const part of song.parts) {
    for (let i = 0; i < part.measures.length; i++) {
      yield { part, measure: part.measures[i], index: i };
    }
  }
}
function* eachElement(song) {
  for (const { part, measure } of eachMeasure$1(song)) {
    for (const element of measure.elements) yield { part, measure, element };
  }
}
function* eachChord(song) {
  for (const { part, measure, element } of eachElement(song)) {
    if (element.kind === "chord") yield { part, measure, chord: element };
  }
}
function* eachNote(song) {
  for (const { part, measure, chord } of eachChord(song)) {
    for (const note of chord.notes) yield { part, measure, chord, note };
  }
}
function findElement(song, id) {
  for (const { element } of eachElement(song)) {
    if (element.id === id) return element;
  }
  return null;
}
function elementIndex(song) {
  const m = /* @__PURE__ */ new Map();
  for (const hit of eachElement(song)) m.set(hit.element.id, hit);
  for (const { part, measure, chord } of eachChord(song)) {
    for (const s of chord.sustains ?? []) {
      m.set(s.id, { part, measure, element: chord });
    }
  }
  return m;
}
function verseCount$1(song) {
  let max = 0;
  for (const { chord } of eachChord(song)) {
    for (const l of chord.lyrics ?? []) {
      max = Math.max(max, l.numberTo ?? l.number);
    }
  }
  return max;
}
function lyricOfVerse(lyrics, verse) {
  for (const l of lyrics ?? []) {
    if (l.refrain) return l;
    const from = l.number;
    const to = l.numberTo ?? l.number;
    if (verse >= from && verse <= to) return l;
  }
  return null;
}
function measureDuration(measure) {
  const perVoice = /* @__PURE__ */ new Map();
  for (const el of measure.elements) {
    const d = el.kind === "chord" ? el.duration.divisions : el.duration?.divisions ?? 0;
    perVoice.set(el.voice, (perVoice.get(el.voice) ?? 0) + d);
  }
  let max = 0;
  for (const v of perVoice.values()) max = Math.max(max, v);
  return max;
}
function breaksAfterToStart(part, after) {
  const ms = part.measures;
  for (let i = 0; i < ms.length; i++) {
    const kind = after.get(ms[i]);
    if (!kind) continue;
    const next = ms[i + 1];
    if (!next) {
      if (part.endBreak !== "page") part.endBreak = kind;
      continue;
    }
    const p = { ...next.print ?? {} };
    if (kind === "page") {
      p.newPage = true;
      delete p.newSystem;
    } else if (!p.newPage) {
      p.newSystem = true;
    }
    next.print = p;
  }
}
function breakAfter(part, i) {
  const next = part.measures[i + 1];
  if (!next) return part.endBreak ?? null;
  if (next.print?.newPage) return "page";
  if (next.print?.newSystem) return "system";
  return null;
}
const ZERO_SPAN$1 = { line: 0, column: 0, offset: 0, length: 0 };
function emptySong() {
  return { work: { subtitles: [] }, parts: [], marks: [] };
}
function emptyDoc(sourceFormat) {
  return { sourceFormat, songs: [], diagnostics: [] };
}
function primarySong(doc) {
  return doc.songs[0] ?? null;
}
const SOURCE_ID_PREFIX = "jp";
const STEPS$2 = ["C", "D", "E", "F", "G", "A", "B"];
function tonicStep(fifths) {
  return ((4 * fifths + 28) % 7 + 7) % 7;
}
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
function keyAlter(stepIdx, fifths) {
  if (fifths > 0) return SHARP_ORDER.slice(0, fifths).includes(stepIdx) ? 1 : 0;
  if (fifths < 0) return FLAT_ORDER.slice(0, -fifths).includes(stepIdx) ? -1 : 0;
  return 0;
}
function jpTonicOctaveShift(fifths) {
  return tonicStep(fifths) === 6 ? 1 : 0;
}
function jpPitch(digit, jpOctave, fifths) {
  const tonic = tonicStep(fifths);
  const degree = Math.max(1, Math.min(7, digit)) - 1;
  const stepIdx = (tonic + degree) % 7;
  const wrap = Math.floor((tonic + degree) / 7);
  const octave = 4 + jpOctave + wrap - jpTonicOctaveShift(fifths);
  return { step: STEPS$2[stepIdx], alter: keyAlter(stepIdx, fifths), octave };
}
function applyJpPitch(stat, nt) {
  if (nt.number === "0") {
    nt.pitch = 0;
    nt.rest = true;
    nt.chord.rest = true;
    return;
  }
  let res = stat.basePitch + nt.jpOctave * 12 + MusicCommon.stepToPitch(nt.number);
  nt.step = MusicCommon.jpToStep(nt.number, stat.fifths);
  switch (nt.jpAlter) {
    case "b":
      stat.alter[nt.number] = -1;
      break;
    case "n":
      delete stat.alter[nt.number];
      break;
    case "#":
      stat.alter[nt.number] = 1;
      break;
  }
  res += stat.alter[nt.number] ?? 0;
  nt.pitch = res;
}
class MusicCommon {
  static fifthCircle = [4, 1, 5, 2, 6, 3, 7];
  static steps = "CDEFGAB";
  static keys = [
    "bC",
    "bG",
    "bD",
    "bA",
    "bE",
    "bB",
    "F",
    "C",
    "G",
    "D",
    "A",
    "E",
    "B",
    "#F",
    "#C"
  ];
  static _stepToPitch = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
    "1": 0,
    "2": 2,
    "3": 4,
    "4": 5,
    "5": 7,
    "6": 9,
    "7": 11
  };
  static stepToPitch(st) {
    if (!(st in MusicCommon._stepToPitch)) throw new Error("");
    return MusicCommon._stepToPitch[st];
  }
  /**
   * 简谱数字 → 音名字母。字母取自调号的**拼写**（fifths → keys[]），不是 basePitch：
   * 同音高的升/降两种拼写字母不同（#C 的 1 是 C、bD 的 1 是 D；#F 对 bG 同理），
   * 只看 basePitch 分不开。原 Kotlin 按 basePitch 查表，bD/#C/bG/#F 四个调根本没有
   * 表项、直接抛错——`1=#C` 的谱因此整首排不出来（代码区有文本、排版是空的）。
   */
  static jpToStep(num, fifths) {
    const tonic = MusicCommon.keys[fifths + 7];
    if (!tonic) throw new Error("");
    const letter = tonic[tonic.length - 1];
    const idx = MusicCommon.steps.indexOf(letter) + (num.charCodeAt(0) - "1".charCodeAt(0));
    return MusicCommon.steps[idx % 7];
  }
  /** 音名字母在该调号下的固定升降。实现只在 jppitch.ts::keyAlter 一处
   *  （原来这里另有一份用 fifthCircle 的等价实现，两份漂移就会出错音）。 */
  static getAlter(st, fifths) {
    return keyAlter(MusicCommon.steps.indexOf(st), fifths);
  }
  static getBasePitchOfKey(key) {
    return MusicCommon.getBasePitch(MusicCommon.keys[key.fifths + 7]);
  }
  static keyNameToFifth(n) {
    let nn = n;
    if (nn.length === 2) {
      if (n[1] === "b" || n[1] === "#") nn = `${n[1]}${n[0]}`;
    }
    return MusicCommon.keys.indexOf(nn) - 7;
  }
  static getBasePitch(key) {
    let res = 0;
    let step = key;
    if (step.includes("b")) {
      res = -1;
      step = step.replace(/b/g, "");
    }
    if (step.includes("#")) {
      res = 1;
      step = step.replace(/#/g, "");
    }
    res += MusicCommon.stepToPitch(step[0]);
    res += step[0] === "B" ? 48 : 60;
    return res;
  }
}
class Key {
  fifths = 0;
  get name() {
    const wr = "CDEFGAB";
    const b = (4 * this.fifths + 28) % 7;
    let res = "";
    if (this.fifths < -1) res += "b";
    else if (this.fifths === 7) res += "#";
    res += wr[b];
    return res;
  }
}
const KIND_SUFFIX = {
  major: "",
  minor: "m",
  dominant: "7",
  "major-seventh": "maj7",
  "minor-seventh": "m7",
  diminished: "dim",
  "diminished-seventh": "dim7",
  augmented: "aug",
  "suspended-fourth": "sus4",
  "suspended-second": "sus2",
  "major-sixth": "6",
  "minor-sixth": "m6",
  "dominant-ninth": "9",
  "major-ninth": "maj9",
  "minor-ninth": "m9",
  "half-diminished": "m7-5",
  power: "5",
  none: "",
  other: ""
};
const alterSign = (v) => v > 0 ? "♯".repeat(v) : v < 0 ? "♭".repeat(-v) : "";
function harmonyToText(h, signs = "ascii") {
  if (h.text !== void 0) return h.text;
  const sign = signs === "unicode" ? alterSign : (v) => v > 0 ? "#".repeat(v) : v < 0 ? "b".repeat(-v) : "";
  let out = h.root.step + sign(h.root.alter);
  out += h.kindText?.trim() || KIND_SUFFIX[h.kind] || "";
  for (const d of h.degrees ?? []) {
    out += d.type === "subtract" ? `omit${d.value}` : d.type === "alter" ? `${sign(d.alter)}${d.value}` : `add${sign(d.alter)}${d.value}`;
  }
  if (h.bass) out += `/${h.bass.step}${sign(h.bass.alter)}`;
  return out;
}
const STEPS$1 = "CDEFGAB";
function degreeFromPitch(pitch, key, accidental) {
  const idx = STEPS$1.indexOf(pitch.step);
  const wr = idx + pitch.octave * 7;
  const b = tonicStep(key.fifths);
  const number = ((wr - b) % 7 + 7) % 7 + 1;
  const octaveShift = Math.floor((wr - b) / 7) - 4 + jpTonicOctaveShift(key.fifths);
  const d = { number, octaveShift };
  if (accidental) d.accidental = accidental;
  return d;
}
const ACC_BY_OFFSET = {
  [-2]: "double-flat",
  [-1]: "flat",
  0: "natural",
  1: "sharp",
  2: "double-sharp"
};
const OFFSET_BY_ACC = {
  "double-flat": -2,
  flat: -1,
  natural: 0,
  sharp: 1,
  "double-sharp": 2
};
class AccidentalCarry {
  /** 唱名 → 相对调号的半音偏移 */
  offsets = /* @__PURE__ */ new Map();
  /** 这个音要不要印记号：相对调号的偏移与本小节已延续的不同才印，按偏移命名。 */
  mark(pitch, key) {
    const { number } = degreeFromPitch(pitch, key);
    const offset = pitch.alter - keyAlter(STEPS$1.indexOf(pitch.step), key.fifths);
    const expected = this.offsets.get(number) ?? 0;
    this.offsets.set(number, offset);
    return offset !== expected ? ACC_BY_OFFSET[offset] : void 0;
  }
  /** 度数（带面上的记号）→ 音高，并更新延续状态。拼写字母取自调号（`jppitch.ts::jpPitch`）。 */
  pitch(degree, key) {
    if (degree.accidental) {
      const off = OFFSET_BY_ACC[degree.accidental];
      if (off === 0) this.offsets.delete(degree.number);
      else this.offsets.set(degree.number, off);
    }
    const p = jpPitch(degree.number, degree.octaveShift, key.fifths);
    return { step: p.step, alter: p.alter + (this.offsets.get(degree.number) ?? 0), octave: p.octave };
  }
}
function keySpelling(key, tonic = "major") {
  if (key.spelling) return key.spelling;
  const minor = tonic === "mode" && (key.mode === "minor" || key.mode === "aeolian");
  const idx = (tonicStep(key.fifths) + (minor ? 5 : 0)) % 7;
  const alter = keyAlter(idx, key.fifths);
  return (alter > 0 ? "#" : alter < 0 ? "b" : "") + STEPS$1[idx];
}
function applyAttrs(r, m, staff) {
  const a = m.attrs;
  if (!a) return;
  if (a.divisions !== void 0) r.divisions = a.divisions;
  if (a.key) r.key = a.key;
  if (a.time) r.time = a.time;
  if (a.transpose) r.transpose = a.transpose;
  const clef = a.clefs?.find((c) => (c.staff ?? 1) === staff);
  if (clef) r.clef = clef;
}
const CLEF_NAMES = [["treble", "G", 2], ["bass", "F", 4], ["alto", "C", 3], ["tenor", "C", 4]];
function clefFromName(name) {
  const m = /^([a-z]+)([+-]8)?$/i.exec(name.trim());
  const hit = m ? CLEF_NAMES.find(([n]) => n === m[1].toLowerCase()) : void 0;
  if (!m || !hit) return null;
  const c = { sign: hit[1], line: hit[2] };
  if (m[2]) c.octaveChange = m[2] === "-8" ? -1 : 1;
  return c;
}
function clefName(c) {
  const hit = CLEF_NAMES.find(([, sign, line]) => sign === c.sign && line === (c.line ?? line));
  if (!hit) return null;
  return hit[0] + (c.octaveChange ? c.octaveChange < 0 ? "-8" : "+8" : "");
}
function onsets$1(m, divisions) {
  const pos = /* @__PURE__ */ new Map();
  const out = /* @__PURE__ */ new Map();
  for (const el of m.elements) {
    const at = pos.get(el.voice) ?? 0;
    out.set(el, at);
    const d = el.kind === "chord" ? el.grace ? 0 : el.duration.divisions : el.duration?.divisions ?? 0;
    pos.set(el.voice, at + d / divisions);
  }
  return out;
}
function continuesMeasure(prev, m) {
  return !!m.implicit && !!prev?.barlines?.some((b) => b.location === "right" && b.style === "none");
}
function assignDegrees(part, initialKey) {
  const r = { divisions: 1, key: initialKey };
  let lanes = /* @__PURE__ */ new Map();
  part.measures.forEach((m, mi) => {
    applyAttrs(r, m, 1);
    const at = onsets$1(m, r.divisions);
    const order = m.elements.map((el, i) => ({ el, i })).sort((a, b) => at.get(a.el) - at.get(b.el) || a.i - b.i);
    const melodyVoice = /* @__PURE__ */ new Map();
    for (const el of m.elements) {
      if (el.kind === "chord" && el.voice < (melodyVoice.get(el.staff) ?? Infinity)) melodyVoice.set(el.staff, el.voice);
    }
    if (!continuesMeasure(part.measures[mi - 1], m)) lanes = /* @__PURE__ */ new Map();
    for (const { el } of order) {
      if (el.kind !== "chord") continue;
      let lane = lanes.get(el.staff);
      if (!lane) lanes.set(el.staff, lane = { melody: new AccidentalCarry(), all: new AccidentalCarry() });
      const top = el.voice === melodyVoice.get(el.staff) ? topNote(el) : void 0;
      for (const n of el.notes) {
        if (!n.pitch) continue;
        const d = degreeFromPitch(n.pitch, r.key);
        d.octaveShift -= r.clef?.octaveChange ?? 0;
        const byAll = lane.all.mark(n.pitch, r.key);
        const acc = n === top ? lane.melody.mark(n.pitch, r.key) : byAll;
        if (acc) d.accidental = acc;
        n.degree = d;
      }
    }
  });
}
function fillDegreesFromPitch(song) {
  const key = song.key ?? { fifths: 0 };
  for (const part of song.parts) {
    let cur = key;
    for (const m of part.measures) {
      if (m.attrs?.key) cur = m.attrs.key;
      for (const el of m.elements) {
        if (el.kind !== "chord") continue;
        for (const n of el.notes) {
          if (n.degree || !n.pitch) continue;
          n.degree = degreeFromPitch(n.pitch, cur, n.accidental);
        }
      }
    }
  }
}
const TYPE_QUARTERS = {
  maxima: 32,
  long: 16,
  breve: 8,
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 1 / 2,
  "16th": 1 / 4,
  "32nd": 1 / 8,
  "64th": 1 / 16,
  "128th": 1 / 32,
  "256th": 1 / 64
};
function nominalQuarters(el, divisions) {
  const d = el.duration;
  if (!d) return 0;
  const base = d.type ? TYPE_QUARTERS[d.type] : void 0;
  if (base !== void 0) {
    let q2 = base;
    let add = base;
    for (let k = 0; k < d.dots; k++) {
      add /= 2;
      q2 += add;
    }
    return q2;
  }
  let q = d.divisions / divisions;
  if (d.timeMod) q = q * d.timeMod.actual / d.timeMod.normal;
  return q;
}
function jianpuShape(q) {
  if (q >= 1) {
    const sustains = Math.max(0, Math.floor(q + 1e-9) - 1);
    const body = q - sustains;
    const dots = body >= 1.75 - 1e-9 ? 2 : body >= 1.5 - 1e-9 ? 1 : 0;
    return { beams: 0, dots, sustains };
  }
  for (const dots of [0, 1, 2]) {
    const factor = dots === 0 ? 1 : dots === 1 ? 1.5 : 1.75;
    const base = q / factor;
    const beams = Math.log2(1 / base);
    if (Math.abs(beams - Math.round(beams)) < 1e-6) return { beams: Math.round(beams), dots, sustains: 0 };
  }
  return { beams: Math.max(1, Math.round(Math.log2(1 / q))), dots: 0, sustains: 0 };
}
function harmonyText(h) {
  return harmonyToText(h);
}
function melodyLane(m) {
  let lane;
  for (const el of m.elements) {
    if (el.kind !== "chord") continue;
    if (!lane || el.staff < lane.staff || el.staff === lane.staff && el.voice < lane.voice) {
      lane = { staff: el.staff, voice: el.voice };
    }
  }
  return lane;
}
const midiOf = (p) => p.octave * 12 + [0, 2, 4, 5, 7, 9, 11][STEPS$1.indexOf(p.step)] + p.alter;
const midiPitch = (p) => midiOf(p) + 12;
function topNote(ch) {
  let best;
  let bestV = -Infinity;
  const normal = ch.notes.some((n) => n.typeSize !== "cue");
  for (const n of ch.notes) {
    if (normal && n.typeSize === "cue") continue;
    const v = n.pitch ? midiOf(n.pitch) : n.degree ? n.degree.octaveShift * 7 + n.degree.number : -Infinity;
    if (v > bestV) {
      best = n;
      bestV = v;
    }
  }
  return best ?? ch.notes[0];
}
function quarterTempos(song) {
  const b = song.tempoBeat;
  if (!b || b.num * 4 === b.den) return [...song.tempos ?? []];
  return (song.tempos ?? []).map((t2) => typeof t2 === "number" ? Math.round(t2 * 4 * b.num / b.den) : t2);
}
const STEPS = "CDEFGAB";
const ALTER_OF = {
  "double-flat": -2,
  flat: -1,
  natural: 0,
  sharp: 1,
  "double-sharp": 2
};
const ACC_OF = {
  [-2]: "double-flat",
  [-1]: "flat",
  0: "natural",
  1: "sharp",
  2: "double-sharp"
};
function fifthsOf$1(key) {
  if (key.fifths === 0 && key.spelling && key.spelling !== "none") {
    const f = MusicCommon.keyNameToFifth(key.spelling);
    if (f >= -7 && f <= 7) return f;
  }
  return key.fifths;
}
class AbcCarry {
  constructor(fifths) {
    this.fifths = fifths;
  }
  alters = /* @__PURE__ */ new Map();
  expected(p) {
    return this.alters.get(p.step + p.octave) ?? keyAlter(STEPS.indexOf(p.step), this.fifths);
  }
  /** 读：面上的记号（没有就沿用本小节前面的，再没有就是调号）→ 实际升降。 */
  sounding(p, written) {
    if (!written) return this.expected(p);
    const alter = ALTER_OF[written];
    this.alters.set(p.step + p.octave, alter);
    return alter;
  }
  /** 写：实际音高 → 面上要印的记号（与调号、本小节前面的都相同就不印）。 */
  written(p) {
    if (p.alter === this.expected(p)) return void 0;
    this.alters.set(p.step + p.octave, p.alter);
    return ACC_OF[p.alter];
  }
}
function eachMeasure(song, fn) {
  for (const part of song.parts) {
    let key = song.key ?? { fifths: 0 };
    part.measures.forEach((m, mi) => {
      if (m.attrs?.key) key = m.attrs.key;
      fn(m, key, !continuesMeasure(part.measures[mi - 1], m));
    });
  }
}
function resolveAbcPitches(song) {
  let carry = new AbcCarry(0);
  eachMeasure(song, (m, key, fresh) => {
    if (fresh) carry = new AbcCarry(fifthsOf$1(key));
    for (const el of m.elements) {
      if (el.kind !== "chord") continue;
      for (const n of el.notes) if (n.pitch) n.pitch = { ...n.pitch, alter: carry.sounding(n.pitch, n.accidental) };
    }
  });
  for (const part of song.parts) assignDegrees(part, song.key ?? { fifths: 0 });
}
function hasDegreeOnly(song) {
  return song.parts.some((p) => p.measures.some((m) => m.elements.some((el) => el.kind === "chord" && el.notes.some((n) => !n.pitch && n.degree && n.degree.number > 0))));
}
function withAbcPitches(src) {
  if (!hasDegreeOnly(src)) return src;
  const song = structuredClone(src);
  let jp = new AccidentalCarry();
  let abc = new AbcCarry(0);
  eachMeasure(song, (m, key, fresh) => {
    const k = { ...key, fifths: fifthsOf$1(key) };
    if (fresh) {
      jp = new AccidentalCarry();
      abc = new AbcCarry(k.fifths);
    }
    for (const el of m.elements) {
      if (el.kind !== "chord") continue;
      for (const n of el.notes) {
        const fromDegree = n.degree && n.degree.number > 0 ? jp.pitch(n.degree, k) : void 0;
        n.pitch ??= fromDegree;
        if (!n.pitch) continue;
        const acc = abc.written(n.pitch);
        if (acc) n.accidental = acc;
        else delete n.accidental;
      }
    }
  });
  return song;
}
const CJK_FIELD_ALIAS = {
  曲号: "X",
  标题: "T",
  副标题: "T",
  词曲: "C",
  作者: "C",
  调: "K",
  拍: "M",
  速度: "Q",
  声部: "V",
  歌词: "w",
  段: "w",
  顺序: "P",
  注: "N",
  文字: "W"
};
const CJK_INSTRUCTION_ALIAS = {
  样式: "style",
  演唱: "playorder",
  断行: "linebreak",
  每页行数: "linesperpage"
};
const ASCII_PREFIX = /^([A-Za-z])(\d+)?(?:-(\d+))?\s*[:：]/;
const CJK_PREFIX = /^([一-鿿]{1,4})(\d+)?(?:-(\d+))?\s*[:：]/;
const CONT_PREFIX = /^\+\s*[:：]/;
function parseFieldLine(line, lineNo, offset) {
  const c = CONT_PREFIX.exec(line);
  if (c) {
    return {
      // `name` 是占位：调用方按上一条字段名改写（认不出上一条就报诊断、丢掉这一行）
      name: "w",
      cont: true,
      value: line.slice(c[0].length).trim(),
      source: { line: lineNo, column: 0, offset, length: line.length },
      valueOffset: offset + c[0].length + (/^\s*/.exec(line.slice(c[0].length))?.[0].length ?? 0)
    };
  }
  let m = ASCII_PREFIX.exec(line);
  let name;
  if (m) {
    const raw = m[1];
    name = raw === "w" || raw === "W" ? raw : raw.toUpperCase();
  } else {
    m = CJK_PREFIX.exec(line);
    if (!m) return null;
    name = CJK_FIELD_ALIAS[m[1]];
    if (name === void 0) return null;
  }
  const f = {
    name,
    value: line.slice(m[0].length).trim(),
    source: { line: lineNo, column: 0, offset, length: line.length },
    valueOffset: offset + m[0].length + (/^\s*/.exec(line.slice(m[0].length))?.[0].length ?? 0)
  };
  if (m[2]) {
    if (name === "V") f.voice = Number(m[2]);
    else f.legacyVerse = m[3] ? `${m[2]}-${m[3]}` : m[2];
  }
  if (name === "V" && f.voice === void 0) {
    const v = /^(\d+)/.exec(f.value);
    if (v) f.voice = Number(v[1]);
  }
  return f;
}
function parseVoiceClef(value) {
  const m = /(?:^|\s)clef=([A-Za-z]+[+-]?8?)(?=\s|$)/.exec(value);
  return m ? clefFromName(m[1]) : null;
}
const FIFTHS = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  "#F": 6,
  "#C": 7,
  F: -1,
  bB: -2,
  bE: -3,
  bA: -4,
  bD: -5,
  bG: -6,
  bC: -7
};
const MODE_OFFSET = {
  major: 0,
  ionian: 0,
  minor: -3,
  aeolian: -3,
  m: -3,
  mixolydian: -1,
  dorian: -2,
  phrygian: -4,
  lydian: 1,
  locrian: -5
};
const MODE_TONIC_DEGREE = {
  minor: "6",
  aeolian: "6",
  m: "6",
  dorian: "2",
  phrygian: "3",
  lydian: "4",
  mixolydian: "5",
  locrian: "7"
};
function normalizeSpelling(s) {
  const t2 = s.trim().replace(/♯/g, "#").replace(/♭/g, "b");
  const m = /^([#b]?)([A-Ga-g])([#b]?)$/.exec(t2);
  if (!m) return t2;
  const acc = m[1] || m[3] || "";
  return acc + m[2].toUpperCase();
}
function parseKey(value) {
  const v = value.trim();
  if (v === "" || /^none$/i.test(v)) return { key: { fifths: 0, spelling: "none" } };
  const jp = /^([1-7])\s*=\s*([#b♯♭]?[A-Ga-g][#b♯♭]?)\s*(.*)$/.exec(v);
  let tonicDegree;
  let body;
  if (jp) {
    tonicDegree = jp[1];
    body = jp[2] + (jp[3] ? " " + jp[3] : "");
  } else {
    body = v;
  }
  const m = /^([#b♯♭]?)([A-Ga-g])([#b♯♭]?)\s*([A-Za-z]*)$/.exec(body.trim());
  if (!m) return { key: { fifths: 0 }, error: t("diag.badKey", { v: value }) };
  const letter = m[2].toUpperCase();
  const acc = (m[1] || m[3] || "").replace("♯", "#").replace("♭", "b");
  const spelling = normalizeSpelling(acc + letter);
  const base = FIFTHS[spelling];
  if (base === void 0) {
    const key2 = { fifths: 0, spelling };
    if (tonicDegree !== void 0 && tonicDegree !== "1") key2.tonicDegree = tonicDegree;
    return { key: key2, error: t("diag.noSuchKey", { v: spelling }) };
  }
  const modeRaw = (m[4] ?? "").toLowerCase();
  let modeKey = "";
  if (modeRaw === "m") modeKey = "m";
  else if (modeRaw) {
    modeKey = Object.keys(MODE_OFFSET).find((k) => k.length > 1 && k.startsWith(modeRaw.slice(0, 3))) ?? "";
  }
  const offset = modeKey ? MODE_OFFSET[modeKey] ?? 0 : 0;
  const key = { fifths: base + offset, spelling };
  if (modeKey) key.mode = modeKey === "m" ? "minor" : modeKey;
  const degree = tonicDegree ?? (modeKey ? MODE_TONIC_DEGREE[modeKey] : void 0);
  if (degree !== void 0 && degree !== "1") key.tonicDegree = degree;
  return { key };
}
function parseTime(value) {
  const v = value.trim();
  if (/^C\|$/i.test(v)) return { time: { beats: 2, beatType: 2, symbol: "cut" } };
  if (/^C$/i.test(v)) return { time: { beats: 4, beatType: 4, symbol: "common" } };
  if (/^none$/i.test(v)) return {};
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(v);
  if (!m) return { error: t("diag.badTime", { v: value }) };
  return { time: { beats: Number(m[1]), beatType: Number(m[2]) } };
}
function parseTimes(value) {
  const v = value.trim();
  const times = [];
  let inParen = false;
  let rest = v;
  for (; ; ) {
    const m = /^\s*(\()?\s*(\d+)\s*\/\s*(\d+)\s*(\))?/.exec(rest);
    if (!m) break;
    if (m[1]) inParen = true;
    times.push({ beats: Number(m[2]), beatType: Number(m[3]), ...inParen ? { parenthesized: true } : {} });
    if (m[4]) inParen = false;
    rest = rest.slice(m[0].length);
  }
  const note = rest.trim();
  const noteOk = !note || /^[(（〔【]?[一-鿿]/.test(note);
  if (!times.length || !noteOk || times.length === 1 && !note) {
    const one = parseTime(v);
    return { times: one.time ? [one.time] : [], error: one.error };
  }
  return { times, note: note || void 0 };
}
function parseTempo(value) {
  const out = [];
  const v = value.trim();
  for (const m of v.matchAll(/"([^"]*)"/g)) out.push(m[1]);
  const bare = v.replace(/"[^"]*"/g, "");
  const bpm = /(?:\d+\s*\/\s*\d+\s*=\s*)?(\d+)/.exec(bare);
  if (bpm) out.unshift(Number(bpm[1]));
  return out;
}
function parseTempoBeat(value) {
  const m = /(\d+)\s*\/\s*(\d+)\s*=\s*\d+/.exec(value.replace(/"[^"]*"/g, ""));
  if (!m) return void 0;
  const num = Number(m[1]), den = Number(m[2]);
  return num > 0 && den > 0 && num * 4 !== den ? { num, den } : void 0;
}
function parseInstruction(value) {
  const m = /^(\S+)\s*(.*)$/.exec(value.trim());
  if (!m) return { name: "", value: "" };
  return { name: m[1].toLowerCase(), value: m[2] ?? "" };
}
function parseLinebreak(value) {
  const v = value.trim().toLowerCase();
  if (v === "<none>" || v === "!") return "auto";
  return "explicit";
}
function parsePlayOrder(value, source, diagnostics) {
  const out = [];
  for (const seg of value.split("|")) {
    const s = seg.trim();
    if (!s) continue;
    const m = /^(\d+)(?:\.(\d+))?\s*-\s*(\d+)(?:\.(\d+))?(.*)$/.exec(s);
    if (!m) {
      diagnostics.push({
        severity: "warning",
        code: "bad-playorder",
        message: t("diag.badPlayOrder", { v: s }),
        source
      });
      continue;
    }
    const pass = { fromMeasure: Number(m[1]), toMeasure: Number(m[3]) };
    if (m[2]) pass.fromNoteIndex = Number(m[2]);
    if (m[4]) pass.toNoteIndex = Number(m[4]);
    const rest = (m[5] ?? "").trim();
    const verse = /\bv(\d+)\b/i.exec(rest);
    if (verse) pass.verse = Number(verse[1]);
    if (/\bpage\b/i.test(rest)) pass.pageBreakAfter = true;
    out.push(pass);
  }
  return out;
}
function isLyricSlot(el, rule = "123", mainVoice = 1) {
  if (el.voice > mainVoice) return false;
  if (el.kind !== "chord") return false;
  if (el.grace || el.continued) return false;
  if (el.rest) return rule === "123" && el.printObject === false;
  return true;
}
function lyricSlots(part, from = 0, to = part.measures.length - 1, fromEl = 0, toEl = Infinity, rule = "123") {
  const slots = [];
  const measureOf2 = [];
  let mainVoice = Infinity;
  for (const m of part.measures) for (const el of m.elements) if (el.kind === "chord" && el.voice < mainVoice) mainVoice = el.voice;
  if (!Number.isFinite(mainVoice)) mainVoice = 1;
  for (let mi = from; mi <= to && mi < part.measures.length; mi++) {
    const els = part.measures[mi].elements;
    for (let j = mi === from ? fromEl : 0; j < (mi === to ? Math.min(toEl, els.length) : els.length); j++) {
      const el = els[j];
      if (!isLyricSlot(el, rule, mainVoice)) continue;
      slots.push(el);
      measureOf2.push(mi);
    }
  }
  return { slots, measureOf: measureOf2 };
}
const ACCIDENTALS = [
  ["^^", "double-sharp", 2],
  ["__", "double-flat", -2],
  ["^", "sharp", 1],
  ["_", "flat", -1],
  ["=", "natural", 0]
];
const SHORTHAND = {
  ".": "staccato",
  "~": "roll",
  u: "upbow",
  v: "downbow",
  H: "fermata",
  I: "I",
  J: "slide",
  K: "K",
  L: "accent",
  M: "lowermordent",
  N: "N",
  O: "coda",
  P: "uppermordent",
  Q: "Q",
  R: "roll",
  S: "segno",
  T: "trill",
  U: "U",
  V: "V",
  W: "W"
};
class LexerAbc extends AbcFamilyLexer {
  /** Muse `.jcx` 的词法是它的子类（`dialectjcx.ts`），所以这里不收窄成字面量 */
  id = "abc";
  /** `-` 是 tie。 */
  hyphen = "tie";
  /** ABC 的音符是字母，`(3` 无歧义，冒号可省。 */
  tupletNeedsColon = false;
  /** `&` 是临时多声部分隔（§7.4）。 */
  voiceOverlay = true;
  strayBracketIsFinal = true;
  /** `z` 带时值、`Z` 按小节数（ABC §4.5/§4.6）。 */
  scanRest(line, i) {
    const ch = line[i];
    if (ch !== "z" && ch !== "Z") return null;
    const dur = this.scanDuration(line, i + 1);
    return {
      beams: 0,
      dots: 0,
      num: dur?.num ?? 1,
      den: dur?.den ?? 1,
      next: dur?.next ?? i + 1
    };
  }
  /** 时值：`2`（×2）、`/`（÷2）、`/4`（÷4）、`3/2`（×1.5）。相对 `L:` 的默认音长。 */
  scanDuration(line, i) {
    const m = /^(\d*)(\/+)?(\d*)/.exec(line.slice(i));
    if (!m || m[0].length === 0) return null;
    const num = m[1] ? Number(m[1]) : 1;
    let den = 1;
    if (m[2]) {
      den = m[3] ? Number(m[3]) : 1 << m[2].length;
    }
    if (den === 0) den = 1;
    return { beams: 0, dots: 0, num, den, next: i + m[0].length };
  }
  /** 音符：`[^_=]*字母['`,]*[时值]`。大写 = 低八度（C4 起），小写 = 高八度（c5 起）。 */
  scanNote(line, i) {
    let j = i;
    let accidental;
    let alter;
    for (const [text, acc, semi] of ACCIDENTALS) {
      if (line.startsWith(text, j)) {
        accidental = acc;
        alter = semi;
        j += text.length;
        break;
      }
    }
    const ch = line[j];
    if (ch === void 0 || !/[A-Ga-g]/.test(ch)) return null;
    let octave = /[a-g]/.test(ch) ? 1 : 0;
    const step = ch.toUpperCase();
    j++;
    while (j < line.length) {
      if (line[j] === "'") {
        octave++;
        j++;
      } else if (line[j] === ",") {
        octave--;
        j++;
      } else break;
    }
    const dur = this.scanDuration(line, j);
    const res = {
      step,
      octave,
      beams: 0,
      dots: 0,
      num: dur?.num ?? 1,
      den: dur?.den ?? 1,
      next: dur?.next ?? j
    };
    if (accidental) res.accidental = accidental;
    if (alter !== void 0) res.alter = alter;
    return res;
  }
  shorthandDecoration(line, i) {
    const ch = line[i];
    const name = SHORTHAND[ch];
    return name ? { len: 1, name } : null;
  }
  /** `[CEG]` 同时发声的和弦（ABC §4.17）。基类已先判掉 `[K:…]`、`[1`、`[|`，剩下的才轮到这里。 */
  scanChordGroup(line, i) {
    if (line[i] !== "[") return null;
    const close = line.indexOf("]", i);
    if (close < 0) return null;
    const body = line.slice(i + 1, close);
    if (body.length === 0) return null;
    const notes = [];
    let k = 0;
    while (k < body.length) {
      const n = this.scanNote(body, k);
      if (!n) return null;
      notes.push(n);
      k = n.next;
    }
    if (notes.length === 0) return null;
    return { text: line.slice(i, close + 1), notes, dur: this.scanDuration(line, close + 1) };
  }
  /** 破碎节奏 `>` / `<`（ABC §4.4）：`a>b` = 前音附点、后音减半。 */
  scanBroken(line, i) {
    const m = /^(>+|<+)/.exec(line.slice(i));
    if (!m) return null;
    return { len: m[0].length, dir: m[0][0] === ">" ? m[0].length : -m[0].length };
  }
}
const LEXER_ABC = new LexerAbc();
const DEGREE_OF_LETTER = {
  C: 1,
  D: 2,
  E: 3,
  F: 4,
  G: 5,
  A: 6,
  B: 7
};
const LETTER_OF_DEGREE = "CDEFGAB";
class LexerJcx extends LexerAbc {
  id = "jcx";
  voiceOverlay = false;
  rhythmLetters = "xX";
  invisibleRest = "@";
  wedgeParens = true;
  postGraceMark = "@";
}
const LEXER_JCX = new LexerJcx();
function parseKeyJcx(value) {
  const v = value.trim();
  if (v === "" || /^none$/i.test(v)) return { key: { fifths: 0, spelling: "none" } };
  const m = /^([#b♯♭]?[A-Ga-g][#b♯♭]?)(?:\s*(maj|min|ion|aeo|mix|dor|phr|lyd|loc|m)[A-Za-z]*)?(?![A-Za-z])/i.exec(v);
  if (!m) return parseKey(v);
  return parseKey(m[1] + (m[2] ?? ""));
}
const TYPE_BY_BEAMS = ["quarter", "eighth", "16th", "32nd", "64th", "128th", "256th"];
function tupletNormal123(n) {
  if (n === 2 || n === 4) return 3;
  let p = 1;
  while (p * 2 < n) p *= 2;
  return Math.max(p, 1);
}
function tupletNormalAbc(n, time) {
  const fixed = { 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 };
  if (fixed[n] !== void 0) return fixed[n];
  const compound = !!time && time.beats % 3 === 0 && time.beats > 3;
  return compound ? 3 : 2;
}
function duration123(beams, dots, sustains) {
  const base = SIMPLE_DIVISIONS >> Math.min(beams, 6);
  let total = base;
  let add = base;
  for (let k = 0; k < dots; k++) {
    add = Math.floor(add / 2);
    total += add;
  }
  total += sustains * SIMPLE_DIVISIONS;
  const type = TYPE_BY_BEAMS[Math.min(beams, TYPE_BY_BEAMS.length - 1)];
  return { divisions: total, type, dots };
}
const DIALECT_123 = {
  id: "123",
  lex: (line, lineNo, lineOffset, columnBase = 0) => LEXER_123.lexLine(line, lineNo, lineOffset, columnBase),
  duration: (t2, _len, sustains = 0) => duration123(t2.beams ?? 0, t2.dots ?? 0, sustains),
  reduration: (host) => duration123(host.beams?.length ?? 0, host.duration.dots, host.sustains?.length ?? 0),
  note: (t2) => {
    const n = { degree: { number: t2.degree, octaveShift: t2.octave ?? 0 } };
    if (t2.accidental) {
      n.degree.accidental = t2.accidental;
      n.accidental = t2.accidental;
    }
    return n;
  },
  isRest: (t2) => t2.degree === 0,
  parseKey,
  hyphen: "sustain",
  defaultLen: () => ({ num: 1, den: 4 }),
  lineEndIsBreak: false,
  spaceBeams: false,
  lyricSkip: "/",
  lyricSlotRule: "123",
  breakEndsLyricBlock: true,
  tupletClose: "paren",
  tupletNormal: (n) => tupletNormal123(n)
};
const TYPES_BY_POWER = [
  "whole",
  "half",
  "quarter",
  "eighth",
  "16th",
  "32nd",
  "64th",
  "128th",
  "256th"
];
function typeAndDots(divisions) {
  let unit = SIMPLE_DIVISIONS * 4;
  let power = 0;
  while (unit > divisions && power < 8) {
    unit = unit / 2;
    power += 1;
  }
  const type = TYPES_BY_POWER[Math.min(power, TYPES_BY_POWER.length - 1)];
  let dots = 0;
  let acc = unit;
  let add = unit;
  while (dots < 2 && acc < divisions) {
    add = add / 2;
    if (Math.abs(acc + add - divisions) <= Math.abs(acc - divisions)) {
      acc += add;
      dots += 1;
    } else break;
  }
  return { type, dots };
}
function durationAbc(num, den, len) {
  const beats = num * len.num * 4 / (den * len.den);
  const divisions = Math.max(1, Math.round(beats * SIMPLE_DIVISIONS));
  return { divisions, ...typeAndDots(divisions) };
}
const FIFTHS_MAJOR = {
  Cb: -7,
  Gb: -6,
  Db: -5,
  Ab: -4,
  Eb: -3,
  Bb: -2,
  F: -1,
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  "F#": 6,
  "C#": 7
};
const MODE_SHIFT = {
  maj: 0,
  ion: 0,
  min: -3,
  aeo: -3,
  m: -3,
  mix: -1,
  dor: -2,
  phr: -4,
  lyd: 1,
  loc: -5
};
function parseKeyAbc(value) {
  const raw = value.trim();
  if (raw === "" || /^none$/i.test(raw)) return { key: { fifths: 0 } };
  const m = /^([A-G])([#b]?)\s*([A-Za-z]*)/.exec(raw);
  if (!m) return { key: { fifths: 0 }, error: t("diag.badKey", { v: raw }) };
  const tonic = m[1] + (m[2] ?? "");
  const modeWord = (m[3] ?? "").toLowerCase().slice(0, 3);
  const base = FIFTHS_MAJOR[tonic];
  if (base === void 0) return { key: { fifths: 0 }, error: t("diag.badKey", { v: raw }) };
  const shift = modeWord === "" ? 0 : MODE_SHIFT[modeWord];
  if (shift === void 0) {
    return { key: { fifths: base, spelling: tonic } };
  }
  const key = { fifths: base + shift, spelling: tonic };
  if (modeWord !== "") key.mode = modeWord === "m" ? "minor" : modeWord;
  return { key };
}
const DIALECT_ABC = {
  id: "abc",
  lex: (line, lineNo, lineOffset, columnBase = 0) => LEXER_ABC.lexLine(line, lineNo, lineOffset, columnBase),
  duration: (t2, len) => durationAbc(t2.num ?? 1, t2.den ?? 1, len),
  reduration: (host) => host.duration,
  note: (t2) => {
    const n = {
      pitch: {
        step: t2.step ?? "C",
        alter: t2.alter ?? 0,
        // ABC 的大写字母在第 4 八度、小写在第 5（`octave` 已按此归一）
        octave: 4 + (t2.octave ?? 0)
      }
    };
    if (t2.accidental) n.accidental = t2.accidental;
    return n;
  },
  isRest: (t2) => t2.kind === "rest",
  parseKey: parseKeyAbc,
  hyphen: "tie",
  // ABC §3.1.7：`M:` 的值 ≥ 0.75 用 1/8，否则 1/16
  defaultLen: (num, den) => den > 0 && num / den >= 0.75 ? { num: 1, den: 8 } : { num: 1, den: 16 },
  lineEndIsBreak: true,
  spaceBeams: true,
  lyricSkip: "*",
  lyricSlotRule: "abc",
  breakEndsLyricBlock: false,
  tupletClose: "count",
  tupletNormal: tupletNormalAbc
};
const DIALECT_JCX = {
  id: "jcx",
  lex: (line, lineNo, lineOffset, columnBase = 0) => LEXER_JCX.lexLine(line, lineNo, lineOffset, columnBase),
  duration: (t2, len) => durationAbc(t2.num ?? 1, t2.den ?? 1, len),
  reduration: (host) => host.duration,
  note: (t2) => {
    const n = { degree: { number: DEGREE_OF_LETTER[t2.step ?? "C"] ?? 1, octaveShift: t2.octave ?? 0 } };
    if (t2.accidental) {
      n.degree.accidental = t2.accidental;
      n.accidental = t2.accidental;
    }
    return n;
  },
  isRest: (t2) => t2.kind === "rest",
  parseKey: parseKeyJcx,
  hyphen: "tie",
  // 说明书 §3.2.3.6：没写 `L:` 时按拍号推，与 ABC 同一条
  defaultLen: DIALECT_ABC.defaultLen,
  lineEndIsBreak: true,
  spaceBeams: true,
  lyricSkip: "*",
  lyricSlotRule: "abc",
  brokenFromLong: true,
  breakEndsLyricBlock: false,
  tupletClose: "count",
  tupletNormal: tupletNormalAbc
};
function noteInlineBreak(pb, kind) {
  const last = pb.measure.elements[pb.measure.elements.length - 1];
  pb.inlineBreak = last?.kind === "chord" ? { host: last, sustains: last.sustains?.length ?? 0, kind } : null;
}
function lastElementId(pb) {
  const els = pb.measure.elements;
  if (els.length) return els[els.length - 1].id;
  for (let i = pb.part.measures.length - 1; i >= 0; i--) {
    const m = pb.part.measures[i].elements;
    if (m.length) return m[m.length - 1].id;
  }
  return null;
}
function slotCount(pb, rule) {
  let n = 0;
  for (const m of pb.part.measures) for (const el of m.elements) if (isLyricSlot(el, rule)) n++;
  for (const el of pb.measure.elements) if (isLyricSlot(el, rule)) n++;
  return n;
}
function report$1(ctx, code, message, source) {
  ctx.diagnostics.push({ severity: "warning", code, message, source });
}
function barlineFrom(value, times, source) {
  const b = { location: "right", source };
  switch (value) {
    case "normal":
      b.style = "regular";
      break;
    case "double":
      b.style = "light-light";
      break;
    case "final":
      b.style = "light-heavy";
      break;
    case "reverse-final":
      b.style = "heavy-light";
      break;
    case "dotted":
      b.style = "dotted";
      break;
    case "none":
      b.style = "none";
      break;
    case "repeat-start":
      b.style = "heavy-light";
      b.repeat = "forward";
      break;
    case "repeat-end":
      b.style = "light-heavy";
      b.repeat = "backward";
      break;
    case "repeat-both":
      b.style = "light-heavy";
      b.repeat = "backward";
      break;
    case "heavy-light":
      b.style = "heavy-light";
      b.repeat = "forward";
      break;
    case "light-heavy":
      b.style = "light-heavy";
      b.repeat = "backward";
      break;
    default:
      b.style = "regular";
      break;
  }
  if (times) b.repeatTimes = times;
  return b;
}
function parseLyricLine(body, verse, source, valueOffset, skip = "/", warn, joinTilde = false) {
  const out = [];
  const starts = [];
  let i = 0;
  let tokStart = 0;
  let label;
  const lm = /^\s*<([^>]*)>/.exec(body);
  if (lm) {
    label = lm[1];
    i = lm[0].length;
  }
  let prefix = "";
  const trail = (c) => isLyricTrailingPunct(c) && !(joinTilde && c === "~");
  let joinNext = false;
  const push2 = (l) => {
    const prev = out[out.length - 1];
    if (joinNext && prev && l.text !== "") {
      joinNext = false;
      const latin = /[A-Za-z0-9]$/.test(prev.text) && !prev.trailingPunctuation && /^[A-Za-z0-9]/.test(l.leadingPunctuation ?? l.text);
      prev.text += (prev.trailingPunctuation ?? "") + (latin ? " " : "") + (l.leadingPunctuation ?? "") + l.text;
      if (l.trailingPunctuation) prev.trailingPunctuation = l.trailingPunctuation;
      else delete prev.trailingPunctuation;
      if (l.syllabic) prev.syllabic = l.syllabic;
      if (prev.source && l.source) prev.source = { ...prev.source, length: l.source.offset + l.source.length - prev.source.offset };
      return;
    }
    joinNext = false;
    out.push(l);
    starts.push(tokStart);
  };
  const mk = (text) => {
    const l = { number: verse, text };
    if (prefix && text !== "") {
      l.leadingPunctuation = prefix;
      prefix = "";
    }
    if (valueOffset !== void 0 && text !== "") {
      l.source = { line: source.line, column: valueOffset - source.offset + tokStart, offset: valueOffset + tokStart, length: text.length };
    }
    return l;
  };
  while (i < body.length) {
    const ch = body[i];
    if (ch === " " || ch === "	") {
      i++;
      continue;
    }
    tokStart = i;
    if (joinTilde && ch === "~") {
      joinNext = out.length > 0;
      i++;
      continue;
    }
    if (ch === skip) {
      push2(mk(""));
      i++;
      continue;
    }
    if (ch === "*") {
      warn?.("lyric-old-skip", t("diag.j123.oldSkip"));
      push2(mk(""));
      i++;
      continue;
    }
    if (ch === "_") {
      const prev = out[out.length - 1];
      if (prev) prev.extend = true;
      push2(mk(""));
      i++;
      continue;
    }
    if (ch === "|") {
      i++;
      continue;
    }
    if (ch === "{") {
      const close = body.indexOf("}", i);
      if (close < 0) {
        i++;
        continue;
      }
      const l = mk(body.slice(i + 1, close));
      i = close + 1;
      if (body[i] === "-") {
        l.syllabic = "begin";
        i++;
      }
      push2(l);
      continue;
    }
    if (ch === "\\" && (body[i + 1] === "-" || body[i + 1] === "/")) {
      const prev = out[out.length - 1];
      if (prev) prev.text += body[i + 1];
      i += 2;
      continue;
    }
    if (isLyricCjk(ch)) {
      let text = ch;
      i++;
      while (body[i] === "~" && body[i + 1] !== void 0) {
        if (trail(body[i + 1])) {
          i++;
          break;
        }
        i++;
        text += body[i];
        i++;
      }
      let trailing = "";
      while (i < body.length && trail(body[i])) {
        trailing += body[i];
        i++;
      }
      const l = mk(text);
      if (trailing) l.trailingPunctuation = trailing;
      push2(l);
      continue;
    }
    if (PU_LYRIC_QUOTES.includes(ch) && isLyricOpenQuote(ch)) {
      const next = body[i + 1];
      if (next !== void 0 && isLyricCjk(next)) {
        let text = ch + next;
        i += 2;
        let trailing = "";
        while (i < body.length && trail(body[i])) {
          trailing += body[i];
          i++;
        }
        const l = mk(text);
        if (trailing) l.trailingPunctuation = trailing;
        push2(l);
        continue;
      }
      i++;
      continue;
    }
    if (trail(ch)) {
      const prev = out[out.length - 1];
      if (prev) prev.trailingPunctuation = (prev.trailingPunctuation ?? "") + ch;
      else prefix += ch;
      i++;
      continue;
    }
    {
      let j = i;
      let text = "";
      while (j < body.length) {
        const c = body[j];
        if (c === "\\" && (body[j + 1] === "-" || body[j + 1] === "/")) {
          text += body[j + 1];
          j += 2;
          continue;
        }
        if (/[\s\-_*|{}\\]/.test(c) || c === skip || isLyricCjk(c) || trail(c) || joinTilde && c === "~") break;
        text += c;
        j++;
      }
      if (j === i) {
        i++;
        continue;
      }
      i = j;
      let syllabic;
      if (body[i] === "-") {
        syllabic = "begin";
        i++;
      }
      let trailing = "";
      while (i < body.length && trail(body[i])) {
        trailing += body[i];
        i++;
      }
      const l = mk(text);
      if (syllabic) l.syllabic = syllabic;
      if (trailing) l.trailingPunctuation = trailing;
      push2(l);
    }
  }
  const res = { syllables: out, starts };
  if (label !== void 0) res.label = label;
  return res;
}
function openOffset(o) {
  return o.openSource?.offset ?? -1;
}
function buildMusicLine(ctx, pb, tokens, marks) {
  const { openSlurs, openTuplets, pending, openEnding } = pb;
  const cur = { last: null, sustainHost: null, justClosedTuplet: false, arcEnds: [] };
  let pendingTie = false;
  let pendingBroken = 0;
  const applyTieAndBroken = (ch) => {
    if (pendingTie) {
      for (const n of ch.notes) n.tie = { ...n.tie ?? {}, stop: true };
      pendingTie = false;
    }
    if (pendingBroken !== 0 && cur.sustainHost) {
      const k = Math.abs(pendingBroken);
      const f = 1 / (1 << k);
      const prev = cur.sustainHost;
      const long = pendingBroken > 0 ? prev : ch;
      const short = pendingBroken > 0 ? ch : prev;
      const lo = Math.round(long.duration.divisions * (2 - f));
      const sh = Math.round((ctx.d.brokenFromLong ? long : short).duration.divisions * f);
      long.duration = { ...long.duration, divisions: lo, ...typeAndDots(lo) };
      short.duration = { ...short.duration, divisions: sh, ...typeAndDots(sh) };
      pendingBroken = 0;
    }
  };
  let beamGroup = 0;
  let sawSpaceSinceLastNote = true;
  const attach = (el) => {
    if (pending.chord !== void 0) {
      el.harmony = { root: { step: "C", alter: 0 }, kind: "", text: pending.chord };
      pending.chord = void 0;
    }
    if (pending.annotations.length) {
      const text = pending.annotations.join(" ");
      if (el.kind === "chord") el.sectionWord = text;
      pending.annotations = [];
    }
    if (pending.decos.length) {
      const fermata = pending.decos.some((d) => /^fermata$/i.test(d));
      const arts = pending.decos.filter((d) => !/^fermata$/i.test(d));
      el.notations = {
        ...fermata ? { fermata: true } : {},
        ...arts.length ? { articulations: arts } : {}
      };
      pending.decos = [];
    }
    if (pending.srcs.length) {
      const srcs = el.kind === "chord" ? pending.srcs : pending.srcs.filter((a) => a.kind !== "annotation");
      if (srcs.length) el.attachedSources = srcs;
      pending.srcs = [];
    }
    if (pb.inlineBreak) {
      const { host, sustains, kind } = pb.inlineBreak;
      const su = host.sustains ?? [];
      const at = su.length > sustains && sustains > 0 ? su[sustains - 1] : host;
      at.lineBreakAfter = kind;
      pb.inlineBreak = null;
    }
    if (ctx.d.breakEndsLyricBlock && pb.block?.broken) {
      const at = slotCount(pb, ctx.d.lyricSlotRule);
      pb.block.end = at;
      pb.block = { start: at, cursor: /* @__PURE__ */ new Map(), verses: 0, broken: false };
      pb.afterLyrics = false;
    }
    pb.measure.elements.push(el);
    cur.last = el;
    if (pb.arcNext && el.kind === "chord" && !el.grace) {
      marks.push({ type: "slur", start: pb.arcNext.from, end: el.id, level: openSlurs.length, openSource: pb.arcNext.source });
      pb.arcNext = null;
    }
    for (const o of openSlurs) if (!o.start) o.start = el.id;
    for (const o of openTuplets) if (!o.start) o.start = el.id;
    for (const o of pb.openWedges) if (!o.start) o.start = el.id;
    if (ctx.d.tupletClose === "paren" && el.kind === "chord" && !el.grace && openTuplets.length) {
      let actual = 1;
      let normal = 1;
      for (const tp of openTuplets) {
        actual *= tp.tupletActual;
        normal *= tp.tupletNormal;
      }
      el.duration.timeMod = { actual, normal };
    }
  };
  for (const t$1 of tokens) {
    switch (t$1.kind) {
      case "space":
        sawSpaceSinceLastNote = true;
        break;
      case "note": {
        cur.justClosedTuplet = false;
        if (sawSpaceSinceLastNote) beamGroup++;
        sawSpaceSinceLastNote = false;
        const rest = ctx.d.isRest(t$1);
        const ch = {
          kind: "chord",
          id: ctx.ids.next(),
          notes: [],
          duration: ctx.d.duration(t$1, ctx.len),
          voice: pb.voice,
          staff: 1,
          source: t$1.source
        };
        if (rest) {
          ch.rest = {};
        } else {
          ch.notes.push(ctx.d.note(t$1));
        }
        if ((t$1.beams ?? 0) > 0) {
          ch.beams = Array.from({ length: t$1.beams }, () => "continue");
          if (ctx.d.spaceBeams) ch.beamGroup = beamGroup;
        }
        applyTieAndBroken(ch);
        attach(ch);
        cur.sustainHost = ch;
        if (pb.voice === 1) pb.noteCount++;
        if (ctx.d.tupletClose === "count") for (let k = openTuplets.length - 1; k >= 0; k--) {
          const tp = openTuplets[k];
          tp.remaining = (tp.remaining ?? 0) - 1;
          ch.duration.timeMod = { actual: tp.tupletActual ?? 3, normal: tp.tupletNormal ?? 2 };
          if (tp.remaining <= 0) {
            if (tp.start) {
              marks.push({
                type: "tuplet",
                start: tp.start,
                end: ch.id,
                level: 0,
                tupletActual: tp.tupletActual ?? 3,
                tupletNormal: tp.tupletNormal ?? 2
              });
            }
            openTuplets.splice(k, 1);
            cur.justClosedTuplet = true;
          }
        }
        break;
      }
      case "sustain": {
        const host = cur.sustainHost;
        if (!host) {
          report$1(ctx, "orphan-sustain", t("diag.j123.orphanSustain"), t$1.source);
          break;
        }
        const s = { id: ctx.ids.next(), source: t$1.source };
        if (pending.chord !== void 0) {
          s.harmony = { root: { step: "C", alter: 0 }, kind: "", text: pending.chord };
          pending.chord = void 0;
          const hs = pending.srcs.filter((a) => a.kind === "harmony");
          if (hs.length) s.attachedSources = hs;
          pending.srcs = pending.srcs.filter((a) => a.kind !== "harmony");
        }
        for (const a of cur.arcEnds) if (a.host === host) a.mk.end = a.su.id;
        cur.arcEnds = [];
        (host.sustains ??= []).push(s);
        host.duration = ctx.d.reduration(host, ctx.len);
        sawSpaceSinceLastNote = false;
        break;
      }
      // ── 下面四种只有标准 ABC 会产生（123 的休止走 note(degree=0)、`-` 是增时线）──
      case "rest": {
        const ch = {
          kind: "chord",
          id: ctx.ids.next(),
          notes: [],
          rest: {},
          duration: ctx.d.duration(t$1, ctx.len),
          voice: pb.voice,
          staff: 1,
          source: t$1.source
        };
        applyTieAndBroken(ch);
        attach(ch);
        cur.sustainHost = ch;
        if (pb.voice === 1) pb.noteCount++;
        break;
      }
      case "chordGroup": {
        const ch = {
          kind: "chord",
          id: ctx.ids.next(),
          notes: (t$1.notes ?? []).map((g) => ctx.d.note(g)),
          duration: ctx.d.duration(
            { ...t$1, num: t$1.num ?? (t$1.notes?.[0]?.num ?? 1), den: t$1.den ?? (t$1.notes?.[0]?.den ?? 1) },
            ctx.len
          ),
          voice: pb.voice,
          staff: 1,
          source: t$1.source
        };
        applyTieAndBroken(ch);
        attach(ch);
        cur.sustainHost = ch;
        if (pb.voice === 1) pb.noteCount++;
        break;
      }
      case "arcNext":
        if (pb.arcNext) report$1(ctx, "orphan-arc-next", "`~` 后面没有音符", pb.arcNext.source);
        if (cur.sustainHost && !cur.sustainHost.grace) pb.arcNext = { from: cur.sustainHost.id, source: t$1.source };
        else {
          pb.arcNext = null;
          report$1(ctx, "orphan-arc-next", "`~` 前面没有音符", t$1.source);
        }
        break;
      case "tie":
        if (cur.sustainHost) {
          for (const n of cur.sustainHost.notes) n.tie = { ...n.tie ?? {}, start: true };
          pendingTie = true;
        } else {
          report$1(ctx, "orphan-tie", t("diag.j123.orphanTie"), t$1.source);
        }
        break;
      case "broken":
        pendingBroken = t$1.broken ?? 1;
        break;
      case "rhythm": {
        const ch = {
          kind: "chord",
          id: ctx.ids.next(),
          notes: [],
          rhythm: true,
          duration: ctx.d.duration(t$1, ctx.len),
          voice: pb.voice,
          staff: 1,
          source: t$1.source
        };
        if ((t$1.beams ?? 0) > 0) ch.beams = Array.from({ length: t$1.beams }, () => "continue");
        attach(ch);
        cur.sustainHost = ch;
        if (pb.voice === 1) pb.noteCount++;
        break;
      }
      case "spacer": {
        if (t$1.value === "x") {
          const ch = {
            kind: "chord",
            id: ctx.ids.next(),
            notes: [],
            rest: {},
            printObject: false,
            duration: ctx.d.duration(t$1, ctx.len),
            voice: pb.voice,
            staff: 1,
            source: t$1.source
          };
          if ((t$1.beams ?? 0) > 0) ch.beams = Array.from({ length: t$1.beams }, () => "continue");
          attach(ch);
          cur.sustainHost = ch;
          if (pb.voice === 1) pb.noteCount++;
          break;
        }
        const sp = {
          kind: "space",
          id: ctx.ids.next(),
          spacer: "y",
          voice: pb.voice,
          staff: 1,
          source: t$1.source
        };
        attach(sp);
        cur.sustainHost = null;
        break;
      }
      case "chord":
        if (ctx.d.id === "jcx" && pending.chord !== void 0) {
          pending.annotations.push(pending.chord);
          for (const a of pending.srcs) if (a.kind === "harmony") a.kind = "annotation";
        }
        pending.chord = t$1.value ?? "";
        pending.srcs = pending.srcs.filter((a) => a.kind !== "harmony");
        pending.srcs.push({ kind: "harmony", name: pending.chord, source: t$1.source });
        break;
      case "annotation":
        pending.annotations.push((t$1.value ?? "").replace(/^[\^_<>@]/, ""));
        pending.srcs.push({ kind: "annotation", name: pending.annotations[pending.annotations.length - 1], source: t$1.source });
        break;
      case "deco": {
        const deco = t$1.value ?? "";
        const jump = jumpOrnamentName(deco);
        if (jump && pb.measure.elements.length === 0) {
          const bls = pb.measure.barlines ??= [];
          const left = bls.find((b) => b.location === "left");
          if (left) (left.ornaments ??= []).push({ name: jump, level: 0 });
          else bls.push({ location: "left", ornaments: [{ name: jump, level: 0 }], source: t$1.source });
          break;
        }
        pending.decos.push(deco);
        pending.srcs.push({ kind: "deco", name: deco, source: t$1.source });
        break;
      }
      case "grace": {
        const ch = {
          kind: "chord",
          id: ctx.ids.next(),
          notes: (t$1.notes ?? []).map((g) => ctx.d.note(g)),
          duration: { divisions: 0, dots: 0, type: graceType(t$1.notes?.[0]) },
          grace: { ...t$1.acciaccatura ? { slash: true } : {}, ...t$1.graceAfter ? { after: true } : {} },
          voice: pb.voice,
          staff: 1,
          source: t$1.source
        };
        pb.measure.elements.push(ch);
        break;
      }
      case "slurStart":
        openSlurs.push({ type: "slur", start: 0, level: openSlurs.length, openSource: t$1.source });
        break;
      case "slurEnd": {
        if (ctx.d.tupletClose === "paren") {
          const tp = openTuplets[openTuplets.length - 1];
          const sl = openSlurs[openSlurs.length - 1];
          if (tp && (!sl || openOffset(tp) > openOffset(sl))) {
            openTuplets.pop();
            if (tp.start && cur.last) {
              marks.push({
                type: "tuplet",
                start: tp.start,
                end: cur.last.id,
                level: 0,
                tupletActual: tp.tupletActual,
                tupletNormal: tp.tupletNormal
              });
            } else {
              report$1(ctx, "empty-tuplet", t("diag.j123.emptyTuplet"), t$1.source);
            }
            break;
          }
        }
        if (openSlurs.length === 0 && ctx.d.tupletClose === "count") {
          if (cur.justClosedTuplet) {
            cur.justClosedTuplet = false;
            break;
          }
          const tp = openTuplets.pop();
          if (tp) {
            if (tp.start && cur.last) {
              marks.push({
                type: "tuplet",
                start: tp.start,
                end: cur.last.id,
                level: 0,
                tupletActual: tp.tupletActual ?? 3,
                tupletNormal: tp.tupletNormal ?? 2
              });
            }
          } else {
            report$1(ctx, "unmatched-slur", t("diag.j123.extraParen"), t$1.source);
          }
          break;
        }
        if (openSlurs.length === 0) {
          report$1(ctx, "unmatched-slur", t("diag.j123.extraParen"), t$1.source);
          break;
        }
        const top = openSlurs[openSlurs.length - 1];
        const below = openSlurs[openSlurs.length - 2];
        const innerTuplet = openTuplets[openTuplets.length - 1];
        const chain = top && top.start && top.start === cur.last?.id && below && !(ctx.d.tupletClose === "paren" && innerTuplet && openOffset(innerTuplet) > openOffset(below));
        const open = chain ? openSlurs.splice(openSlurs.length - 2, 1)[0] : openSlurs.pop();
        if (!open) {
          report$1(ctx, "unmatched-slur", t("diag.j123.extraParen"), t$1.source);
          break;
        }
        if (open.start && cur.last) {
          const mk = { type: "slur", start: open.start, end: cur.last.id, level: open.level, closeSource: t$1.source };
          if (open.openSource) mk.openSource = open.openSource;
          marks.push(mk);
          const host = cur.sustainHost;
          const su = host && host === cur.last ? host.sustains?.[host.sustains.length - 1] : void 0;
          if (host && su) cur.arcEnds.push({ mk, host, su });
        } else {
          report$1(ctx, "empty-slur", t("diag.j123.emptySlur"), t$1.source);
        }
        break;
      }
      case "wedge": {
        const [type, edge] = (t$1.value ?? "").split(" ");
        if (edge === "start") {
          pb.openWedges.push({ type: "wedge", start: 0, level: 0, wedgeType: type, openSource: t$1.source });
          break;
        }
        const k = pb.openWedges.map((o) => o.wedgeType).lastIndexOf(type);
        const open = k >= 0 ? pb.openWedges.splice(k, 1)[0] : void 0;
        if (open?.start && cur.last) {
          marks.push({ type: "wedge", start: open.start, end: cur.last.id, wedgeType: type, ...open.openSource ? { openSource: open.openSource } : {}, closeSource: t$1.source });
        } else {
          report$1(ctx, "unmatched-wedge", t("diag.jcx.wedge"), t$1.source);
        }
        break;
      }
      case "tuplet": {
        const actual = Number(t$1.value ?? 3);
        openTuplets.push({
          type: "tuplet",
          start: 0,
          level: 0,
          tupletActual: actual,
          // p 是「占几个的时间」，没写（0）取方言的默认表（`ParseDialect.tupletNormal`）
          tupletNormal: t$1.numbers?.[1] || ctx.d.tupletNormal(actual, ctx.time),
          // ABC `(n:p:q` 的 q 是「作用于几个音符」，缺省就是 n（123 由 `)` 收，不用它）
          remaining: t$1.numbers?.[2] || actual,
          openSource: t$1.source
        });
        break;
      }
      case "ending": {
        let nums = t$1.numbers ?? [];
        let text = nums.join(",");
        if (ctx.d.id === "jcx" && nums.length === 1 && nums[0] === 0 && pending.chord !== void 0) {
          text = pending.chord;
          nums = (text.match(/\d+/g) ?? ["1"]).map(Number);
          pending.chord = void 0;
          pending.srcs = pending.srcs.filter((a) => a.kind !== "harmony");
        }
        const ending = { numbers: nums, type: "start", text };
        const existingLeft = (pb.measure.barlines ?? []).find((b) => b.location === "left");
        if (existingLeft) existingLeft.ending = ending;
        else (pb.measure.barlines ??= []).push({ location: "left", ending, source: t$1.source });
        openEnding.push(nums);
        break;
      }
      case "barline": {
        const bl = barlineFrom(t$1.value ?? "normal", t$1.repeatTimes, t$1.source);
        const onLine = (d) => !!jumpOrnamentName(d) || pb.measure.elements.length > 0;
        const taken = pending.decos.filter(onLine);
        if (taken.length) {
          pending.decos = pending.decos.filter((d) => !onLine(d));
          pending.srcs = pending.srcs.filter((a) => a.kind !== "deco" || !onLine(a.name));
          bl.ornaments = taken.map((d) => ({ name: jumpOrnamentName(d) ?? d, level: 0 }));
        }
        const closesEmpty = pb.part.measures.length > 0 && !pb.measure.barlines?.length && bl.repeat !== "forward" && (bl.style === "light-heavy" || bl.style === "light-light");
        if (pb.measure.elements.length === 0 && !closesEmpty) {
          bl.location = "left";
          (pb.measure.barlines ??= []).push(bl);
          break;
        }
        const isEndingStop = ["light-light", "light-heavy", "heavy-light"].includes(bl.style ?? "");
        if (isEndingStop && openEnding.length) {
          const nums = openEnding.pop();
          bl.ending = { numbers: nums, type: "stop", text: nums.join(",") };
        }
        (pb.measure.barlines ??= []).push(bl);
        pb.inlineBreak = null;
        closeMeasure(ctx, pb);
        beamGroup = 0;
        sawSpaceSinceLastNote = true;
        cur.sustainHost = null;
        if (ctx.d.tupletClose === "paren") {
          for (const tp of openTuplets) report$1(ctx, "unclosed-tuplet", t("diag.j123.tupletOpen"), tp.openSource ?? t$1.source);
        }
        openTuplets.length = 0;
        break;
      }
      case "overlay": {
        if (openSlurs.length) {
          report$1(ctx, "overlay-open-slur", t("diag.j123.slurOverlay"), t$1.source);
          openSlurs.length = 0;
        }
        if (openTuplets.length) {
          report$1(ctx, "overlay-open-tuplet", t("diag.j123.tupletOverlay"), t$1.source);
          openTuplets.length = 0;
        }
        if (pb.arcNext) {
          report$1(ctx, "orphan-arc-next", "`~` 后面没有音符", pb.arcNext.source);
          pb.arcNext = null;
        }
        if (!pb.measure.elements.some((el) => el.voice === pb.voice)) {
          report$1(ctx, "empty-overlay", t("diag.j123.overlayBefore"), t$1.source);
        }
        pb.voice++;
        pb.overlaySource = t$1.source;
        pendingTie = false;
        pendingBroken = 0;
        cur.sustainHost = null;
        cur.last = null;
        cur.justClosedTuplet = false;
        beamGroup++;
        sawSpaceSinceLastNote = true;
        break;
      }
      case "break": {
        const target = pb.measure.elements.length > 0 ? pb.measure : pb.part.measures[pb.part.measures.length - 1] ?? pb.measure;
        ctx.breakAfter.set(target, t$1.value === "page" ? "page" : "system");
        (pb.part.breakSources ??= []).push({ page: t$1.value === "page", after: lastElementId(pb), source: t$1.source });
        noteInlineBreak(pb, t$1.value === "page" ? "page" : "system");
        if (pb.block) pb.block.broken = true;
        break;
      }
      case "inlineField": {
        const m = /^([A-Za-z])\s*[:：]\s*(.*)$/.exec(t$1.value ?? "");
        if (!m) break;
        const name = m[1].toUpperCase();
        const val = m[2] ?? "";
        pb.measure.attrs ??= {};
        if (name === "K") {
          const r = ctx.d.parseKey(val);
          if (r.error) report$1(ctx, "bad-key", r.error, t$1.source);
          pb.measure.attrs.key = r.key;
        } else if (name === "M") {
          const r = parseTime(ctx.d.id === "jcx" ? /^\s*(\d+\s*\/\s*\d+|C\|?)/i.exec(val)?.[1] ?? val : val);
          if (r.error) report$1(ctx, "bad-time", r.error, t$1.source);
          else if (r.time) {
            pb.measure.attrs.time = r.time;
            ctx.time = r.time;
          }
        } else if (name === "L") {
          const lm = /^(\d+)\s*\/\s*(\d+)$/.exec(val.trim());
          if (lm && Number(lm[2]) > 0) ctx.len = pb.len = { num: Number(lm[1]), den: Number(lm[2]) };
          else report$1(ctx, "bad-length", t("diag.j123.badLength", { v: val }), t$1.source);
        }
        break;
      }
    }
  }
}
function markLastEndings(part) {
  const ms = part.measures;
  ms.forEach((m, i) => {
    for (const b of m.barlines ?? []) {
      if (b.location !== "right" || b.ending?.type !== "stop") continue;
      const next = ms[i + 1];
      if (!next?.barlines?.some((x) => x.location === "left" && x.ending?.type === "start")) b.ending.type = "discontinue";
    }
  });
}
function closeMeasure(ctx, pb) {
  if (pb.measure.elements.length === 0 && !pb.measure.barlines?.length) return;
  if (pb.voice > 1 && pb.overlaySource && !pb.measure.elements.some((el) => el.voice === pb.voice)) {
    report$1(ctx, "empty-overlay", t("diag.j123.overlayAfter"), pb.overlaySource);
  }
  pb.overlaySource = void 0;
  pb.part.measures.push(pb.measure);
  pb.measureNo++;
  pb.measure = { number: String(pb.measureNo), elements: [] };
  pb.noteCount = 0;
  pb.voice = 1;
}
function resolvePlayOrder(song, raw) {
  const out = [];
  const part = song.parts[0];
  for (const r of raw) {
    const p = { fromMeasure: r.fromMeasure, toMeasure: r.toMeasure };
    if (r.verse !== void 0) p.verse = r.verse;
    if (r.pageBreakAfter) p.pageBreakAfter = true;
    if (part) {
      if (r.fromNoteIndex !== void 0) {
        const id = nthNoteId$1(part, r.fromMeasure, r.fromNoteIndex);
        if (id !== void 0) p.fromElement = id;
      }
      if (r.toNoteIndex !== void 0) {
        const id = nthNoteId$1(part, r.toMeasure, r.toNoteIndex);
        if (id !== void 0) p.toElement = id;
      }
    }
    out.push(p);
  }
  return out;
}
function nthNoteId$1(part, measureNo, n) {
  const m = part.measures[measureNo - 1];
  if (!m) return void 0;
  let k = 0;
  for (const el of m.elements) {
    if (el.kind === "chord" && !el.grace) {
      k++;
      if (k === n) return el.id;
    }
  }
  return void 0;
}
function attachLyrics$2(slots, syllables, start, end) {
  let over = 0;
  for (let si = 0; si < syllables.length; si++) {
    const syl = syllables[si];
    const k = start + si;
    if (k >= end || k >= slots.length) {
      if (syl.text !== "") over++;
      continue;
    }
    if (syl.text === "" && !syl.extend) continue;
    (slots[k].lyrics ??= []).push(syl);
  }
  return over;
}
function graceType(g) {
  const ratio = (g?.num ?? 1) / (g?.den ?? 1) / 2 ** (g?.beams ?? 0);
  const k = Math.round(Math.log2(ratio));
  return ["64th", "32nd", "16th", "eighth", "quarter", "half"][Math.max(0, Math.min(5, k + 3))];
}
function parse123(text, options = {}) {
  return parseAbcFamily(text, DIALECT_123, options);
}
function parseAbc(text, options = {}) {
  return parseAbcFamily(text, DIALECT_ABC, options);
}
function parseJcx(text, options = {}) {
  return parseAbcFamily(text, DIALECT_JCX, options);
}
function museParam(value, names) {
  for (const n of names) {
    const m = new RegExp(`(?:^|\\s)${n}\\s*=\\s*(?:"([^"]*)"|“([^”]*)”|(\\S+))`).exec(value);
    if (m) return m[1] ?? m[2] ?? m[3];
  }
  return void 0;
}
function museVoiceAttrs(ctx, b, f) {
  if (b.museStyle !== void 0) return;
  const rest = f.value.trim().replace(/^\S+\s*/, "");
  const style = (/(?:^|\s)style\s*=\s*(\S+)/.exec(rest)?.[1] ?? "jianpu").toLowerCase();
  if (style === "staff") b.museStyle = "staff";
  else if (style === "jianpu") b.museStyle = "jianpu";
  else {
    b.museStyle = "skip";
    report$1(ctx, "jcx-track-skipped", t("diag.jcx.trackSkipped", { style }), f.source);
  }
  const name = museParam(rest, ["name", "nm"]);
  if (name !== void 0 && b.part.name === void 0) b.part.name = name;
  const abbrev = museParam(rest, ["sname", "snm"]);
  if (abbrev !== void 0 && b.part.abbrev === void 0) b.part.abbrev = abbrev;
  const extra = rest.replace(/(?:^|\s)(?:style|name|nm|sname|snm)\s*=\s*(?:"[^"]*"|“[^”]*”|\S+)/g, "").trim();
  if (extra) b.part.museAttrs = extra;
}
function museStaffPitches(part) {
  const alterOf2 = { "double-flat": -2, flat: -1, natural: 0, sharp: 1, "double-sharp": 2 };
  for (const m of part.measures) {
    for (const el of m.elements) {
      if (el.kind !== "chord") continue;
      for (const n of el.notes) {
        const d = n.degree;
        if (!d || d.number < 1) continue;
        n.pitch = {
          step: LETTER_OF_DEGREE[d.number - 1],
          alter: n.accidental ? alterOf2[n.accidental] ?? 0 : 0,
          octave: 4 + d.octaveShift
        };
        delete n.degree;
      }
    }
  }
}
function parseAbcFamily(text, dialect, options = {}) {
  const doc = emptyDoc(dialect.id);
  doc.source = text;
  const ids = new IdGen();
  const ctx = {
    ids,
    diagnostics: doc.diagnostics,
    lineNo: 0,
    lineOffset: 0,
    d: dialect,
    len: dialect.defaultLen(4, 4),
    sawL: false,
    time: null,
    breakAfter: /* @__PURE__ */ new Map()
  };
  const lines = text.split(/\r?\n/);
  const starts = lineStarts(text);
  let song = null;
  let pb = null;
  let builds = /* @__PURE__ */ new Map();
  let rawPlay = [];
  let marks = [];
  let pendingLyrics = [];
  const finishSong = () => {
    if (!song) return;
    for (const b of builds.values()) {
      if (ctx.d.tupletClose === "paren") {
        for (const tp of b.openTuplets) report$1(ctx, "unclosed-tuplet", t("diag.j123.tupletOpen"), tp.openSource);
        b.openTuplets.length = 0;
      }
      if (b.arcNext) {
        report$1(ctx, "orphan-arc-next", "`~` 后面没有音符", b.arcNext.source);
        b.arcNext = null;
      }
      for (const w of b.openWedges) report$1(ctx, "unmatched-wedge", t("diag.jcx.wedge"), w.openSource);
      b.openWedges.length = 0;
      closeMeasure(ctx, b);
      markLastEndings(b.part);
      if (b.block && b.block.end === void 0) b.block.end = slotCount(b, ctx.d.lyricSlotRule);
      const first = b.part.measures[0];
      if (b.clef && first) (first.attrs ??= {}).clefs = [b.clef];
      if (b.museStyle === "staff") museStaffPitches(b.part);
      if (b.part.measures.length && b.museStyle !== "skip") song.parts.push(b.part);
    }
    const slotsOf = /* @__PURE__ */ new Map();
    for (const { f, verse, syl, part, block, start } of pendingLyrics) {
      let slots = slotsOf.get(part);
      if (!slots) slotsOf.set(part, slots = lyricSlots(part, void 0, void 0, void 0, void 0, ctx.d.lyricSlotRule).slots);
      const left = attachLyrics$2(slots, syl, start, block.end ?? slots.length);
      if (left > 0) {
        report$1(
          ctx,
          "lyric-overflow",
          t("diag.j123.lyricOverflow", { verse, left }),
          f.source
        );
      }
    }
    pendingLyrics = [];
    if (ctx.d.id === "abc" || [...builds.values()].some((b) => b.museStyle === "staff")) resolveAbcPitches(song);
    for (const part of song.parts) breaksAfterToStart(part, ctx.breakAfter);
    ctx.breakAfter.clear();
    song.marks = marks;
    if (rawPlay.length) song.playOrder = resolvePlayOrder(song, rawPlay);
    doc.songs.push(song);
    song = null;
    pb = null;
    builds = /* @__PURE__ */ new Map();
    voiceIds = /* @__PURE__ */ new Map();
    marks = [];
    rawPlay = [];
  };
  const ensureSong = () => {
    if (!song) song = emptySong();
    return song;
  };
  const newPart = (voice) => ({
    part: { id: `P${voice}`, measures: [] },
    measure: { number: "1", elements: [] },
    noteCount: 0,
    measureNo: 1,
    voice: 1,
    openSlurs: [],
    openTuplets: [],
    pending: { annotations: [], decos: [], srcs: [] },
    openEnding: [],
    afterLyrics: false,
    inlineBreak: null,
    arcNext: null,
    openWedges: []
  });
  const startPart = (voice) => {
    ensureSong();
    let b = builds.get(voice);
    if (!b) builds.set(voice, b = newPart(voice));
    pb = b;
    return b;
  };
  const ensurePart = () => pb ?? startPart(1);
  let voiceIds = /* @__PURE__ */ new Map();
  const museVoice = (label) => {
    let n = voiceIds.get(label);
    if (n === void 0) voiceIds.set(label, n = voiceIds.size + 1);
    return n;
  };
  const inlineVoice = (raw) => {
    const m = /^\s*\[V\s*[:：]\s*([^\]]*)\]/.exec(raw);
    if (!m) return 0;
    const label = m[1].trim().split(/\s+/)[0] ?? "";
    if (ctx.d.id === "jcx") startPart(museVoice(label));
    else if (/^\d+$/.test(label)) startPart(Number(label));
    else return 0;
    return m[0].length;
  };
  let textBlock = null;
  let lastField;
  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln];
    const lineOffset = starts[ln];
    ctx.lineNo = ln;
    ctx.lineOffset = lineOffset;
    const line = raw.trim();
    if (textBlock) {
      if (/^%%\s*endtext\b/i.test(line)) {
        (ensureSong().remarks ??= []).push(textBlock.lines.join("\n"));
        textBlock = null;
      } else {
        textBlock.lines.push(line);
      }
      continue;
    }
    if (line === "") continue;
    if (line.startsWith("%")) {
      if (ctx.d.id === "jcx" && line.startsWith("%%")) {
        if (/^%%\s*begintext\b/i.test(line)) textBlock = { lines: [], source: { line: ln, column: 0, offset: lineOffset, length: raw.length } };
        else if (!/^%%\s*endtext\b/i.test(line)) (ensureSong().museDirectives ??= []).push(line.slice(2).trim());
        continue;
      }
      if (line.startsWith("%%")) {
        applyInstruction(ctx, ensureSong(), parseInstruction(line.slice(2)), { line: ln, column: 0, offset: lineOffset, length: raw.length }, (r) => {
          rawPlay = rawPlay.concat(r);
        });
      }
      continue;
    }
    const musicFrom = ctx.d.id === "123" ? 0 : inlineVoice(raw);
    if (musicFrom > 0 && raw.slice(musicFrom).trim() === "") continue;
    const f = musicFrom > 0 ? null : parseFieldLine(raw, ln, lineOffset);
    if (f && ctx.d.id === "jcx") {
      if (f.name === "W") f.name = "w";
      if (f.name === "V") f.voice = museVoice(f.value.split(/\s+/)[0] ?? "");
    }
    if (f) {
      if (f.cont) {
        if (lastField === "w") addLyricLine(ctx, ensurePart(), f, pendingLyrics);
        else {
          report$1(ctx, "cont-unsupported", t("diag.j123.contUnsupported"), f.source);
        }
        continue;
      }
      lastField = f.name;
      if (f.name === "X") {
        finishSong();
        const s2 = ensureSong();
        s2.work.number = f.value;
        continue;
      }
      if (f.name === "w") {
        const lp = ensurePart();
        if (lp.museStyle !== "skip") addLyricLine(ctx, lp, f, pendingLyrics);
        continue;
      }
      applyField(ctx, ensureSong(), f, startPart, (r) => {
        rawPlay = rawPlay.concat(r);
      });
      continue;
    }
    lastField = void 0;
    ensureSong();
    const p = ensurePart();
    if (p.museStyle === "skip") continue;
    if (!p.block || p.afterLyrics || p.block.broken) {
      const at = slotCount(p, ctx.d.lyricSlotRule);
      if (p.block) p.block.end = at;
      p.block = { start: at, cursor: /* @__PURE__ */ new Map(), verses: 0, broken: false };
      p.afterLyrics = false;
    }
    const lex = ctx.d.lex(raw.slice(musicFrom), ln, lineOffset, musicFrom);
    for (const e of lex.errors) report$1(ctx, "lex", e.message, e.source);
    const headerLen = ctx.len;
    if (p.len) ctx.len = p.len;
    buildMusicLine(ctx, p, lex.tokens, marks);
    ctx.len = headerLen;
    if (ctx.d.lineEndIsBreak) {
      const target = p.measure.elements.length > 0 ? p.measure : p.part.measures[p.part.measures.length - 1];
      if (target && !ctx.breakAfter.has(target)) {
        ctx.breakAfter.set(target, "system");
        noteInlineBreak(p, "system");
      } else if (target === p.measure && p.inlineBreak?.host !== p.measure.elements[p.measure.elements.length - 1]) {
        noteInlineBreak(p, "system");
      }
      if (p.block) p.block.broken = true;
    }
  }
  if (textBlock) {
    report$1(ctx, "jcx-text-open", t("diag.jcx.textOpen"), textBlock.source);
    (ensureSong().remarks ??= []).push(textBlock.lines.join("\n"));
  }
  finishSong();
  return doc;
}
function addLyricLine(ctx, pb, f, pendingLyrics) {
  if (f.legacyVerse !== void 0) {
    report$1(
      ctx,
      "lyric-verse-number",
      t("diag.j123.verseNumber", { n: f.legacyVerse }),
      f.source
    );
    return;
  }
  const block = pb.block ??= { start: slotCount(pb, ctx.d.lyricSlotRule), cursor: /* @__PURE__ */ new Map(), verses: 0, broken: false };
  pb.afterLyrics = true;
  const from = f.cont ? block.lastVerse ?? ++block.verses : ++block.verses;
  block.lastVerse = from;
  const { syllables, label } = parseLyricLine(
    f.value,
    from,
    f.source,
    f.valueOffset,
    ctx.d.lyricSkip,
    (code, message) => report$1(ctx, code, message, f.source),
    ctx.d.id === "jcx"
  );
  if (label !== void 0) {
    const first = syllables.find((x) => x.text !== "");
    if (first) first.verseLabel = label;
  }
  const start = block.cursor.get(from) ?? block.start;
  block.cursor.set(from, start + syllables.length);
  pendingLyrics.push({ f, verse: from, syl: syllables, part: pb.part, block, start });
}
function applyField(ctx, song, f, startPart, addPlay) {
  switch (f.name) {
    case "T":
      if (song.work.title === void 0) song.work.title = f.value;
      else song.work.subtitles.push(f.value);
      break;
    case "C":
      (song.identification ??= { creators: [] }).creators.push(creatorOf(f.value));
      break;
    case "K": {
      const r = ctx.d.parseKey(f.value);
      if (r.error) report$1(ctx, "bad-key", r.error, f.source);
      song.key = r.key;
      break;
    }
    case "M": {
      const r = parseTimes(f.value);
      if (r.error) report$1(ctx, "bad-time", r.error, f.source);
      const [first, ...rest] = r.times;
      if (first) {
        song.time = first;
        ctx.time = first;
        if (rest.length) song.extraTimes = rest;
        if (r.note) song.timeNote = r.note;
        if (!ctx.sawL) ctx.len = ctx.d.defaultLen(first.beats, first.beatType);
      }
      break;
    }
    case "L": {
      const m = /^(\d+)\s*\/\s*(\d+)$/.exec(f.value.trim());
      if (m) {
        ctx.len = { num: Number(m[1]), den: Number(m[2]) };
        ctx.sawL = true;
      } else {
        report$1(ctx, "bad-length", t("diag.j123.badLength", { v: f.value }), f.source);
      }
      break;
    }
    case "Q": {
      song.tempos = [...song.tempos ?? [], ...parseTempo(f.value)];
      const tb = parseTempoBeat(f.value);
      if (tb) song.tempoBeat = tb;
      break;
    }
    case "V": {
      const b = startPart(f.voice ?? 1);
      const clef = ctx.d.id === "123" ? parseVoiceClef(f.value) : null;
      if (clef) b.clef = clef;
      if (ctx.d.id === "jcx") {
        museVoiceAttrs(ctx, b, f);
        break;
      }
      const nm = /(?:^|\s)name="([^"]*)"/.exec(f.value);
      if (nm && b.part.name === void 0) b.part.name = nm[1];
      const sn = /(?:^|\s)subname="([^"]*)"/.exec(f.value);
      if (sn && b.part.abbrev === void 0) b.part.abbrev = sn[1];
      break;
    }
    case "W":
      (song.remarks ??= []).push(f.value);
      break;
    case "N":
      (song.remarks ??= []).push(f.value);
      break;
    case "I":
      if (ctx.d.id === "jcx") (song.pageText ??= emptyPageText()).topLeft.push(f.value);
      else applyInstruction(ctx, song, parseInstruction(f.value), f.source, addPlay);
      break;
    case "S":
      if (ctx.d.id === "jcx" && f.value) addMeta(song, "source", f.value);
      break;
    case "P":
      (song.remarks ??= []).push(`P:${f.value}`);
      break;
  }
}
function emptyPageText() {
  return { topLeft: [], topRight: [], bottomLeft: [], bottomCenter: [], bottomRight: [] };
}
function applyInstruction(ctx, song, ins, source, addPlay) {
  const name = CJK_INSTRUCTION_ALIAS[ins.name] ?? ins.name;
  switch (name) {
    case "playorder":
      addPlay(parsePlayOrder(ins.value, source, ctx.diagnostics));
      break;
    case "style":
      (song.style ??= {}).sheetRef = ins.value.trim();
      break;
    // 扩展 meta：`I:meta 键 值`（键见 model/metakeys.ts；多值写多行）
    case "meta": {
      const m = /^\s*(\S+)(?:\s+(.*))?$/.exec(ins.value);
      if (m && isMetaKey(m[1])) addMeta(song, m[1], (m[2] ?? "").trim());
      else (song.style ??= {}).raw = [...song.style.raw ?? [], { key: name, value: ins.value }];
      break;
    }
    // 页眉页脚：与 emit 对称（见 `j123/emit.ts` 的同名指令）
    case "indexleft":
      (song.pageText ??= emptyPageText()).indexLeft = ins.value;
      break;
    case "indexright":
      (song.pageText ??= emptyPageText()).indexRight = ins.value;
      break;
    case "topleft":
      (song.pageText ??= emptyPageText()).topLeft.push(ins.value);
      break;
    case "topright":
      (song.pageText ??= emptyPageText()).topRight.push(ins.value);
      break;
    case "bottomleft":
      (song.pageText ??= emptyPageText()).bottomLeft.push(ins.value);
      break;
    case "bottomcenter":
      (song.pageText ??= emptyPageText()).bottomCenter.push(ins.value);
      break;
    case "bottomright":
      (song.pageText ??= emptyPageText()).bottomRight.push(ins.value);
      break;
    case "linesperpage": {
      const n = Number(ins.value.trim());
      if (Number.isFinite(n) && n > 0) song.linesPerPage = n;
      break;
    }
    case "linebreak":
      (song.style ??= {}).raw = [...song.style.raw ?? [], { key: "linebreak", value: parseLinebreak(ins.value) }];
      break;
    default:
      (song.style ??= {}).raw = [...song.style.raw ?? [], { key: name, value: ins.value }];
      break;
  }
}
function inlineBreakOf$1(el) {
  if (el.kind !== "chord") return null;
  if (el.lineBreakAfter) return el.lineBreakAfter;
  for (const su of el.sustains ?? []) if (su.lineBreakAfter) return su.lineBreakAfter;
  return null;
}
function systemRanges(part) {
  const out = [];
  if (!part) return out;
  let from = 0;
  let fromEl = 0;
  for (let i = 0; i < part.measures.length; i++) {
    const els = part.measures[i].elements;
    let inlineHere = false;
    for (let j = 0; j < els.length - 1; j++) {
      const kind = inlineBreakOf$1(els[j]);
      if (!kind) continue;
      out.push({ from, to: i, fromEl, toEl: j + 1, inline: kind });
      from = i;
      fromEl = j + 1;
      inlineHere = true;
    }
    if (i < part.measures.length - 1 && !inlineHere && breakAfter(part, i)) {
      out.push({ from, to: i, fromEl, toEl: Infinity });
      from = i + 1;
      fromEl = 0;
    }
  }
  out.push({ from, to: Number.MAX_SAFE_INTEGER, fromEl, toEl: Infinity });
  return out;
}
function partRanges(ranges, lead, part) {
  if (part === lead) return [...ranges];
  const onsetAt = (p, mi, el) => {
    let t2 = 0;
    const els = p.measures[mi]?.elements ?? [];
    for (let j = 0; j < Math.min(el, els.length); j++) {
      const e = els[j];
      if (e.kind === "chord" && !e.grace) t2 += e.duration.divisions;
    }
    return t2;
  };
  const indexAt = (mi, t2) => {
    const els = part.measures[mi]?.elements ?? [];
    for (let j = 0; j <= els.length; j++) if (onsetAt(part, mi, j) >= t2) return j;
    return els.length;
  };
  const map = (mi, el) => el === 0 || !Number.isFinite(el) ? el : indexAt(mi, onsetAt(lead, mi, el));
  return ranges.map((r) => ({ ...r, fromEl: map(r.from, r.fromEl), toEl: map(r.to, r.toEl) }));
}
function ownIds(part, emits) {
  const own = /* @__PURE__ */ new Set();
  part.measures.forEach((mea, mi) => {
    for (const el of mea.elements) {
      if (!emits(el, mi)) continue;
      own.add(el.id);
      if (el.kind === "chord") for (const su of el.sustains ?? []) own.add(su.id);
    }
  });
  return own;
}
function ownMarks(song, own) {
  return song.marks.filter((m) => own.has(m.start) && own.has(m.end));
}
function nestArcsInTuplets(part, marks, isArc) {
  const pos = /* @__PURE__ */ new Map();
  const tail = /* @__PURE__ */ new Map();
  let n = 0;
  for (const mea of part.measures) {
    for (const el of mea.elements) {
      pos.set(el.id, n++);
      if (el.kind === "chord") for (const su of el.sustains ?? []) pos.set(su.id, n++);
      tail.set(el.id, n - 1);
    }
  }
  const endPos = (id) => tail.get(id) ?? pos.get(id);
  const tuplets = [];
  for (const m of marks) {
    if (m.type !== "tuplet") continue;
    const s = pos.get(m.start);
    const e = endPos(m.end);
    if (s !== void 0 && e !== void 0) tuplets.push({ m, s, e });
  }
  const outermostFrom = /* @__PURE__ */ new Map();
  const outermostTo = /* @__PURE__ */ new Map();
  for (const t2 of tuplets) {
    const f = outermostFrom.get(t2.m.start);
    if (!f || t2.e > f.e) outermostFrom.set(t2.m.start, t2);
    const l = outermostTo.get(t2.m.end);
    if (!l || t2.s < l.s) outermostTo.set(t2.m.end, t2);
  }
  const out = [];
  const outerOpen = /* @__PURE__ */ new Map();
  const outerClose = /* @__PURE__ */ new Map();
  let crossed = 0;
  const crossedMarks = /* @__PURE__ */ new Set();
  for (const m of marks) {
    let s = isArc(m) ? pos.get(m.start) : void 0;
    let e = isArc(m) ? endPos(m.end) : void 0;
    if (s === void 0 || e === void 0 || !tuplets.length) {
      out.push(m);
      continue;
    }
    let mm = m;
    for (const t2 of tuplets) {
      if (s < t2.s && e >= t2.s && e < t2.e) {
        mm = { ...mm, start: t2.m.start };
        s = t2.s;
        crossed++;
      } else if (s > t2.s && s <= t2.e && e > t2.e) {
        mm = { ...mm, end: t2.m.end };
        e = t2.e;
        crossed++;
      }
    }
    if (mm !== m) crossedMarks.add(m);
    if (mm !== m && mm.start === mm.end) continue;
    out.push(mm);
    const first = outermostFrom.get(mm.start);
    if (first && e > first.e) outerOpen.set(mm.start, (outerOpen.get(mm.start) ?? 0) + 1);
    const last = outermostTo.get(mm.end);
    if (last && s < last.s) outerClose.set(mm.end, (outerClose.get(mm.end) ?? 0) + 1);
  }
  return { marks: out, crossed, crossedMarks, outerOpen, outerClose };
}
function arcsToNextNote(part, marks, isArc, own) {
  const out = /* @__PURE__ */ new Set();
  const { crossedMarks } = nestArcsInTuplets(part, marks, isArc);
  if (!crossedMarks.size) return out;
  const next = /* @__PURE__ */ new Map();
  let prev = null;
  for (const mea of part.measures) {
    for (const el of mea.elements) {
      if (el.kind !== "chord" || el.grace || own && !own.has(el.id)) continue;
      if (prev !== null) next.set(prev, el.id);
      prev = el.id;
    }
  }
  for (const m of crossedMarks) if (next.get(m.start) === m.end) out.add(m);
  return out;
}
const LATIN_CH = /[\p{L}\p{N}']/u;
function isLatinStart(text) {
  const c = [...text][0] ?? "";
  return LATIN_CH.test(c) && !isLyricCjk(c);
}
function isLatinEnd(text) {
  const cs = [...text];
  const c = cs[cs.length - 1] ?? "";
  return LATIN_CH.test(c) && !isLyricCjk(c);
}
function isOneCjkWithPunct(text) {
  const cs = [...text];
  let k = 0;
  if (cs.length > 1 && isLyricOpenQuote(cs[0])) k = 1;
  if (!isLyricCjk(cs[k] ?? "")) return false;
  return cs.slice(k + 1).every(isLyricTrailingPunct);
}
const C = (n) => String.fromCharCode(n);
const DYN = {
  p: C(58656),
  m: C(58657),
  f: C(58658),
  s: C(58660),
  z: C(58661)
};
const DYNAMICS = {
  ppp: DYN.p + DYN.p + DYN.p,
  pp: DYN.p + DYN.p,
  p: DYN.p,
  mp: DYN.m + DYN.p,
  mf: DYN.m + DYN.f,
  f: DYN.f,
  ff: DYN.f + DYN.f,
  fff: DYN.f + DYN.f + DYN.f,
  sf: DYN.s + DYN.f,
  fp: DYN.f + DYN.p,
  sfp: DYN.s + DYN.f + DYN.p,
  sfz: DYN.s + DYN.f + DYN.z
};
const TERMS = {
  cresc: "cresc.",
  dim: "dim.",
  rit: "rit.",
  tempo: "a tempo",
  atempo: "a tempo"
};
const BARLINE_MARKS = {
  fine: { text: "Fine", label: "曲终" },
  dc: { text: "D.C.", label: "从头反复" },
  ds: { text: "D.S.", label: "大反复" },
  ty: { glyph: C(57416), label: "跳跃记号" },
  hs: { glyph: C(57415), label: "花 S 记号" },
  sbf: { label: "声部括弧起点" }
};
const JUMP_NAMES$1 = /* @__PURE__ */ new Set(["dc", "ds", "fine", "ty", "hs"]);
function alignPartsBySystem(song, idFloor = maxId$1(song)) {
  if (song.parts.length < 2) return false;
  const segs = song.parts.map(segmentsOf);
  if (segs.some((s) => s === null)) return false;
  const bySystem = segs;
  const systems = [...new Set(bySystem.flatMap((s) => [...s.keys()]))].sort((a, b) => a - b);
  let nextId = idFloor + 1;
  const tuplets = song.marks.filter((mk) => mk.type === "tuplet");
  const newMarks = [];
  const homes = song.parts.map((p) => {
    for (const m of p.measures) for (const el of m.elements) if (el.kind === "chord") return { voice: el.voice, staff: el.staff };
    return void 0;
  });
  const silentCopy = (src, system, home) => {
    const idMap = /* @__PURE__ */ new Map();
    const fresh = (old) => {
      const id = nextId++;
      idMap.set(old, id);
      return id;
    };
    const out = src.map((m, i) => {
      const mea = { number: "", elements: m.elements.flatMap((el) => silentElement(el, fresh, home)) };
      if (m.attrs) mea.attrs = structuredClone(m.attrs);
      const bars = (m.barlines ?? []).map(silentBarline);
      if (bars.length) mea.barlines = bars;
      if (i === 0 && system !== null) mea.print = { newSystem: true, system };
      return mea;
    });
    for (const mk of tuplets) {
      const start = idMap.get(mk.start);
      const end = idMap.get(mk.end);
      if (start !== void 0 && end !== void 0) newMarks.push({ type: "tuplet", start, end });
    }
    return out;
  };
  let changed = false;
  const rebuilt = song.parts.map(() => []);
  for (const sys of systems) {
    let ref = [];
    for (const s of bySystem) {
      const ms = s.get(sys);
      if (ms && ms.length > ref.length) ref = ms;
    }
    bySystem.forEach((s, pi) => {
      const own = s.get(sys);
      const out = rebuilt[pi];
      if (!own) {
        out.push(...silentCopy(ref, sys, homes[pi]));
        changed = true;
        return;
      }
      out.push(...own);
      if (own.length < ref.length) {
        out.push(...silentCopy(ref.slice(own.length), null, homes[pi]));
        changed = true;
      }
    });
  }
  if (!changed) return false;
  song.parts.forEach((part, pi) => {
    part.measures = rebuilt[pi];
    part.measures.forEach((m, i) => m.number = String(i + 1));
  });
  song.marks.push(...newMarks);
  return true;
}
function segmentsOf(part) {
  const out = /* @__PURE__ */ new Map();
  let cur = null;
  for (const m of part.measures) {
    const sys = m.print?.system;
    if (sys !== void 0) {
      cur = out.get(sys) ?? [];
      out.set(sys, cur);
    }
    if (!cur) return null;
    cur.push(m);
  }
  return out.size ? out : null;
}
function silentElement(el, fresh, home) {
  if (el.kind === "space") {
    const sp = { ...structuredClone(el), id: fresh(el.id) };
    return [sp];
  }
  if (el.grace) return [];
  const ch = {
    kind: "chord",
    id: fresh(el.id),
    notes: [],
    rest: {},
    duration: { ...el.duration },
    voice: home ? home.voice : el.voice,
    staff: home ? home.staff : el.staff
  };
  if (el.beams) ch.beams = [...el.beams];
  if (el.sustains?.length) ch.sustains = el.sustains.map((su) => ({ id: fresh(su.id) }));
  const jumps = jumpsOf(el.ornaments);
  if (jumps) ch.ornaments = jumps;
  return [ch];
}
function silentBarline(b) {
  const out = { location: b.location };
  if (b.style !== void 0) out.style = b.style;
  if (b.repeat !== void 0) out.repeat = b.repeat;
  if (b.repeatTimes !== void 0) out.repeatTimes = b.repeatTimes;
  if (b.ending) out.ending = structuredClone(b.ending);
  if (b.jump !== void 0) out.jump = b.jump;
  if (b.alsoForward) out.alsoForward = true;
  if (b.noWidth) out.noWidth = true;
  if (b.time) out.time = structuredClone(b.time);
  const jumps = jumpsOf(b.ornaments);
  if (jumps) out.ornaments = jumps;
  return out;
}
function jumpsOf(os) {
  const kept = (os ?? []).filter((o) => JUMP_NAMES$1.has(o.name)).map((o) => ({ ...o }));
  return kept.length ? kept : void 0;
}
function maxId$1(song) {
  let max = 0;
  for (const p of song.parts) {
    for (const m of p.measures) {
      for (const el of m.elements) {
        max = Math.max(max, el.id);
        if (el.kind === "chord") for (const su of el.sustains ?? []) max = Math.max(max, su.id);
      }
    }
  }
  return max;
}
const ALIASES = {
  yc: ["fermata", "invertedfermata", "延长", "延长记号", "hold"],
  ycy: [],
  bc: ["tenuto", "保持音"],
  zy: ["accent", ">", "emphasis", "strong-accent", "重音", "att", "hat"],
  dy: ["staccato", "staccatissimo", "顿音", "stacc"],
  hx: ["breath", "breath-mark", "呼吸", "呼吸记号", "huanqi"],
  shy: ["scoop", "上滑音"],
  xhy: ["falloff", "下滑音"],
  sby: ["uppermordent", "pralltriller", "inverted-mordent", "上波音", "danboyin"],
  xby: ["lowermordent", "mordent", "下波音"],
  cy: [],
  tr: ["trill", "trill-mark", "颤音"],
  // 小节线上的跳转记号（123 的写法与归属见 `abcfamily/jumpmarks.ts`）
  hs: ["segno"],
  ty: ["coda"],
  fine: [],
  dc: ["d.c."],
  ds: ["d.s."]
};
const KEY = new Map(
  Object.entries(ALIASES).flatMap(([key, names]) => [[key, key], ...names.map((n) => [n.toLowerCase(), key])])
);
function decoKey(name) {
  return KEY.get(name) ?? KEY.get(name.toLowerCase());
}
function spotsOf(song) {
  const out = /* @__PURE__ */ new Map();
  song.parts.forEach((part, pi) => {
    part.measures.forEach((mea, mi) => {
      mea.elements.forEach((el, ei) => {
        out.set(el.id, { part: pi, measure: mi, index: ei, sustain: null });
        if (el.kind !== "chord") return;
        (el.sustains ?? []).forEach((su, si) => {
          out.set(su.id, { part: pi, measure: mi, index: ei, sustain: si });
        });
      });
    });
  });
  return out;
}
const isGrace = (el) => el?.kind === "chord" && !!el.grace;
function graceHead(mea, ei) {
  let j = ei;
  while (j > 0 && isGrace(mea.elements[j - 1])) j--;
  return j;
}
function atMeasureStart(mea, ei) {
  for (let i = 0; i < ei; i++) {
    const el = mea.elements[i];
    if (el.kind === "chord" && !el.grace) return false;
  }
  return true;
}
function hostBefore(mea, spot) {
  if (spot.sustain !== null) {
    const chord = mea.elements[spot.index];
    if (chord?.kind !== "chord") return null;
    const host = spot.sustain > 0 ? chord.sustains?.[spot.sustain - 1] ?? chord : chord;
    return { host, was: host.lineBreakAfter ?? null };
  }
  const prev = mea.elements[graceHead(mea, spot.index) - 1];
  if (prev?.kind !== "chord") return null;
  const sustains = prev.sustains ?? [];
  return { host: sustains[sustains.length - 1] ?? prev, was: inlineBreakOf$1(prev) };
}
function clearBreaks(song, pages) {
  for (const part of song.parts) {
    for (const mea of part.measures) {
      if (mea.print) {
        delete mea.print.newSystem;
        delete mea.print.system;
        if (pages === "write") delete mea.print.newPage;
        if (Object.keys(mea.print).length === 0) delete mea.print;
      }
      for (const el of mea.elements) {
        if (el.kind !== "chord") continue;
        delete el.lineBreakAfter;
        for (const su of el.sustains ?? []) delete su.lineBreakAfter;
      }
      for (const b of mea.barlines ?? []) delete b.lineBreakAfter;
    }
  }
}
function applyBreaks(song, starts, opt) {
  if (song.parts.length > 1 && song.parts.some((p) => p.measures.some((m) => m.print?.system !== void 0))) return false;
  const where = spotsOf(song);
  const byPart = /* @__PURE__ */ new Map();
  for (const s of starts) {
    const spot = where.get(s.id);
    if (!spot) continue;
    const list = byPart.get(spot.part) ?? [];
    list.push({ spot, page: !!s.page });
    byPart.set(spot.part, list);
  }
  const pi = Math.min(...byPart.keys());
  const hits = byPart.get(pi);
  if (!hits) return false;
  hits.sort((a, b) => a.spot.measure - b.spot.measure || a.spot.index - b.spot.index || (a.spot.sustain ?? -1) - (b.spot.sustain ?? -1));
  const measureStarts = /* @__PURE__ */ new Map();
  const inline = [];
  const single = song.parts.length === 1;
  for (const { spot, page } of hits) {
    const mea = song.parts[pi].measures[spot.measure];
    let mi = spot.measure;
    if (spot.sustain !== null || !atMeasureStart(mea, spot.index)) {
      const h = opt.mid === "snap" || !single ? null : hostBefore(mea, spot);
      const kind = !h ? null : opt.mid === "source" ? h.was : opt.pages === "write" ? page ? "page" : "system" : h.was ?? "system";
      if (h && kind) {
        inline.push({ host: h.host, kind, mi: spot.measure });
        continue;
      }
      mi = spot.measure + 1;
    }
    if (mi <= 0 || mi >= song.parts[pi].measures.length) continue;
    measureStarts.set(mi, (measureStarts.get(mi) ?? false) || page);
  }
  if (measureStarts.size === 0 && inline.length === 0) return false;
  for (const { mi } of inline) measureStarts.delete(mi + 1);
  clearBreaks(song, opt.pages);
  for (const part of song.parts) {
    for (const [mi, page] of measureStarts) {
      const target = part.measures[mi];
      if (!target) continue;
      target.print = { ...target.print, newSystem: true };
      if (page && opt.pages === "write") target.print.newPage = true;
    }
  }
  if (opt.pages === "write") {
    for (const { host, kind } of inline) host.lineBreakAfter = kind;
  } else {
    const paged = /* @__PURE__ */ new Set();
    for (let k = inline.length - 1; k >= 0; k--) {
      const { host, mi } = inline[k];
      let kind = inline[k].kind;
      const nextPage = song.parts[0]?.measures[mi + 1]?.print?.newPage === true;
      if (!paged.has(mi) && (kind === "page" || nextPage)) kind = "page";
      else if (kind === "page") kind = "system";
      host.lineBreakAfter = kind;
      if (kind !== "page") continue;
      paged.add(mi);
      for (const part of song.parts) {
        const pr = part.measures[mi + 1]?.print;
        if (!pr) continue;
        delete pr.newPage;
        if (Object.keys(pr).length === 0) delete part.measures[mi + 1].print;
      }
    }
  }
  const last = /* @__PURE__ */ new Map();
  for (const { mi, host } of inline) last.set(mi, host.lineBreakAfter);
  for (const part of song.parts) {
    for (const [mi, kind] of last) {
      const next = part.measures[mi + 1];
      if (!next) continue;
      next.print = { ...next.print, newSystem: true };
      if (kind === "page") next.print.newPage = true;
    }
  }
  return true;
}
function mainChordFrom(mea, ei) {
  for (let i = ei; i < mea.elements.length; i++) {
    const el = mea.elements[i];
    if (el.kind === "chord" && !el.grace) return el.id;
  }
  return null;
}
function breaksOf(song) {
  const out = [];
  const part = song.parts[0];
  if (!part) return out;
  const seen = /* @__PURE__ */ new Set();
  const add = (id, page) => {
    if (id === null || seen.has(id)) return;
    seen.add(id);
    out.push(page ? { id, page } : { id });
  };
  let inlineBefore = false;
  part.measures.forEach((mea, mi) => {
    if (mi > 0 && !inlineBefore && (mea.print?.newSystem || mea.print?.newPage)) add(firstChordFrom(mi), !!mea.print.newPage);
    inlineBefore = mea.elements.some((el) => inlineBreakOf$1(el) !== null);
    mea.elements.forEach((el, ei) => {
      if (el.kind !== "chord") return;
      const sus = el.sustains ?? [];
      if (el.lineBreakAfter) add(nextAfter(ei, sus.length), el.lineBreakAfter === "page");
      sus.forEach((su, si) => {
        if (su.lineBreakAfter) add(nextAfter(ei, si + 1), su.lineBreakAfter === "page");
      });
    });
    function firstChordFrom(from) {
      for (let i = from; i < part.measures.length; i++) {
        const id = mainChordFrom(part.measures[i], 0);
        if (id !== null) return id;
      }
      return null;
    }
    function nextAfter(ei, si) {
      const el = mea.elements[ei];
      const sus = el?.kind === "chord" ? el.sustains ?? [] : [];
      if (si < sus.length) return sus[si].id;
      return mainChordFrom(mea, ei + 1) ?? firstChordFrom(mi + 1);
    }
  });
  return out;
}
const ARTICULATION$1 = {
  bc: "tenuto",
  zy: "accent",
  dy: "staccato",
  hx: "breath-mark",
  // 上下滑音在 MusicXML 里属于 articulations 的 scoop / falloff
  shy: "scoop",
  xhy: "falloff"
};
const FERMATA = /^(yc|ycy|fermata)$/i;
const ORNAMENT_TAG = {
  sby: "inverted-mordent",
  xby: "mordent",
  cy: "trill-mark",
  tr: "trill-mark"
};
const XML_ARTICULATIONS = /* @__PURE__ */ new Set([
  "accent",
  "strong-accent",
  "staccato",
  "tenuto",
  "detached-legato",
  "staccatissimo",
  "spiccato",
  "scoop",
  "plop",
  "doit",
  "falloff",
  "breath-mark",
  "caesura",
  "stress",
  "unstress",
  "soft-accent"
]);
const XML_ORNAMENTS = /* @__PURE__ */ new Set(["trill-mark", "turn", "delayed-turn", "inverted-turn", "shake", "mordent", "inverted-mordent"]);
function isXmlShaped(song) {
  return song.parts.some((p) => p.measures[0]?.attrs?.divisions !== void 0);
}
function hasVoiceOverlay(song) {
  return song.parts.some((p) => p.measures.some((m) => {
    const first = m.elements[0]?.voice;
    return first !== void 0 && m.elements.some((el) => el.voice !== first);
  }));
}
function projectForMusicXml(src, options = {}) {
  if (isXmlShaped(src)) return src;
  const song = structuredClone(src);
  applyPageMetaToDefaults(song);
  alignPartsBySystem(song);
  if (options.lineStarts?.size) applyLineStarts(song, options.lineStarts, options.midLineStarts ?? false);
  const fifths = fifthsOf(song);
  const hosts = sustainHosts(song);
  const tuplets = tupletRatios$1(song);
  const factor = divisionFactor(song, tuplets);
  const divisions = SIMPLE_DIVISIONS * factor;
  tiesToMarks(song);
  normalizeMarks(song, hosts);
  const tupletInner = tupletInnerChords(song, tuplets, hosts);
  let xno;
  for (const [pi, part] of song.parts.entries()) {
    xno = { n: 0 };
    if (pi === 0) applyVoltas(part, voltasOfPlayOrder(song));
    splitInlineBreaks(part, tupletInner, xno);
    joinOpenMeasures(part, xno);
    mergeEmptyMeasures(part);
    moveForwardRepeats(part);
    const first = part.measures[0];
    if (!first) continue;
    first.attrs = {
      ...first.attrs ?? {},
      divisions,
      key: { ...song.key ?? {}, ...first.attrs?.key ?? {}, fifths: first.attrs?.key?.fifths ?? fifths },
      time: first.attrs?.time ?? (song.time ? { beats: song.time.beats, beatType: song.time.beatType } : { beats: 4, beatType: 4 })
    };
    for (const [i, m] of part.measures.entries()) {
      if (!m.print) continue;
      if (i === 0) {
        delete m.print.newSystem;
        delete m.print.newPage;
      }
      if (!m.print.newSystem && !m.print.newPage) delete m.print;
    }
    projectPart(part, fifths, factor, tuplets);
    wedgeDirections(song, part);
    if (pi === 0) tempoDirection(song, first);
  }
  song.marks = song.marks.filter((m) => m.type !== "wedge");
  if (!song.credits?.length) song.credits = creditsOf(song);
  return song;
}
function applyLineStarts(song, starts, mid) {
  return applyBreaks(song, [...starts].map((id) => ({ id })), { mid: mid ? "inline" : "source", pages: "keep" });
}
function fifthsOf(song) {
  const k = song.key;
  if (!k) return 0;
  if (k.fifths !== 0 || !k.spelling) return k.fifths;
  const f = MusicCommon.keyNameToFifth(k.spelling);
  return f >= -7 && f <= 7 ? f : 0;
}
function creditsOf(song) {
  const out = [];
  for (const t2 of song.work.subtitles) if (t2) out.push({ type: "subtitle", text: t2, page: 1 });
  for (const c of song.identification?.creators ?? []) if (c.text) out.push({ type: c.type, text: c.text, page: 1 });
  for (const t2 of song.pageText?.topRight ?? []) if (t2) out.push({ type: "composer", text: t2, page: 1 });
  for (const t2 of song.pageText?.topLeft ?? []) if (t2) out.push({ type: "lyricist", text: t2, page: 1 });
  return out;
}
const UNIT_OF_DEN = { 1: "whole", 2: "half", 4: "quarter", 8: "eighth", 16: "16th" };
function tempoDirection(song, first) {
  const i = song.tempos?.findIndex((t2) => typeof t2 === "number" && t2 >= 20 && t2 <= 400) ?? -1;
  if (i < 0) return;
  if (first.directions?.some((d) => d.type === "metronome")) return;
  const bpm = song.tempos[i], qpm = quarterTempos(song)[i];
  const b = song.tempoBeat;
  const dotted = !!b && b.num === 3;
  const unit = b ? UNIT_OF_DEN[dotted ? b.den / 2 : b.den / b.num] : void 0;
  (first.directions ??= []).unshift({
    type: "metronome",
    placement: "above",
    tempo: { beatUnit: unit ?? "quarter", ...dotted && unit ? { beatUnitDot: true } : {}, perMinute: unit ? bpm : qpm },
    sound: { tempo: qpm }
  });
}
const setKey = (s) => [...s].sort((a, b) => a - b).join(",");
function voltasOfPlayOrder(song) {
  const out = /* @__PURE__ */ new Map();
  const part = song.parts[0];
  const items = song.playOrder ?? [];
  if (!part || items.length === 0) return out;
  if (part.measures.some((m) => m.barlines?.some((b) => b.ending))) return out;
  const passesOf = /* @__PURE__ */ new Map();
  const allPasses = /* @__PURE__ */ new Set();
  for (const it of items) {
    const pass = it.verse ?? 0;
    allPasses.add(pass);
    for (let mid = it.fromMeasure - 1; mid < it.toMeasure; mid++) {
      const s = passesOf.get(mid) ?? /* @__PURE__ */ new Set();
      s.add(pass);
      passesOf.set(mid, s);
    }
  }
  if (allPasses.size < 2) return out;
  const segs = [];
  for (const mid of [...passesOf.keys()].sort((a, b) => a - b)) {
    const p = passesOf.get(mid);
    const last = segs[segs.length - 1];
    if (last && last.to + 1 === mid && setKey(last.passes) === setKey(p)) last.to = mid;
    else segs.push({ from: mid, to: mid, passes: p });
  }
  const isSubset = (a, b) => a.size < b.size && [...a].every((v) => b.has(v));
  for (let i = 0; i < segs.length - 1; i++) {
    if (!isSubset(segs[i + 1].passes, segs[i].passes)) continue;
    const target = segs[i].passes;
    const group = [];
    const acc = /* @__PURE__ */ new Set();
    for (let j = i + 1; j < segs.length; j++) {
      if ([...segs[j].passes].some((v) => acc.has(v))) break;
      for (const v of segs[j].passes) acc.add(v);
      group.push(segs[j]);
      if (setKey(acc) === setKey(target)) break;
    }
    if (group.length < 2 || setKey(acc) !== setKey(target)) continue;
    group.forEach((g, k) => {
      const head = out.get(g.from) ?? {};
      head.start = setKey(g.passes);
      out.set(g.from, head);
      const tail = out.get(g.to) ?? {};
      tail.stop = true;
      if (k < group.length - 1) tail.repeatBack = true;
      out.set(g.to, tail);
    });
    i = segs.indexOf(group[group.length - 1]);
  }
  return out;
}
function applyVoltas(part, voltas) {
  for (const [mid, v] of voltas) {
    const m = part.measures[mid];
    if (!m) continue;
    if (v.start !== void 0) {
      const ending = { numbers: v.start.split(",").map(Number), type: "start", text: v.start };
      const left = (m.barlines ?? []).find((b) => b.location === "left");
      if (left) left.ending = ending;
      else (m.barlines ??= []).unshift({ location: "left", ending });
    }
    if (v.stop) {
      let right = (m.barlines ?? []).find((b) => b.location === "right");
      if (!right) (m.barlines ??= []).push(right = { location: "right" });
      const nums = v.start ?? "";
      right.ending = { numbers: nums ? nums.split(",").map(Number) : [], type: "stop", text: nums };
      if (v.repeatBack) {
        right.repeat = "backward";
        right.style ??= "light-heavy";
      }
    }
  }
}
const continuationOf = /* @__PURE__ */ new WeakMap();
const splitPieces = /* @__PURE__ */ new WeakSet();
function tupletInnerChords(song, tuplets, hosts) {
  const ends = /* @__PURE__ */ new Set();
  for (const mk of song.marks) if (mk.type === "tuplet") ends.add(hosts.get(mk.end) ?? mk.end);
  return new Set([...tuplets.keys()].filter((id) => !ends.has(id)));
}
function inlineBreakOf(el) {
  if (el.kind !== "chord") return void 0;
  return el.lineBreakAfter ?? el.sustains?.find((su) => su.lineBreakAfter)?.lineBreakAfter;
}
function splitInlineBreaks(part, tupletInner, xno) {
  const out = [];
  let dropPrint = false;
  for (const m of part.measures) {
    if (dropPrint && m.print) {
      delete m.print.newSystem;
      delete m.print.newPage;
      if (Object.keys(m.print).length === 0) delete m.print;
    }
    dropPrint = false;
    const cuts = [];
    m.elements.forEach((el, k) => {
      const kind = inlineBreakOf(el);
      if (!kind || el.kind !== "chord") return;
      delete el.lineBreakAfter;
      for (const su of el.sustains ?? []) delete su.lineBreakAfter;
      const rest = m.elements.slice(k + 1);
      if (rest.length === 0 || rest.every((e) => !timed(e) && e.kind === "space")) return;
      if (tupletInner.has(el.id)) return;
      cuts.push({ at: k + 1, kind });
    });
    if (cuts.length === 0) {
      out.push(m);
      continue;
    }
    dropPrint = true;
    const pieces = splitMeasure(m, cuts, xno);
    out.push(...pieces);
  }
  part.measures = out;
}
function splitMeasure(m, cuts, xno) {
  const bounds = [0, ...cuts.map((c) => c.at), m.elements.length];
  const startTime = [];
  let t2 = 0;
  m.elements.forEach((el, k) => {
    const b = bounds.indexOf(k);
    if (b >= 0 && b < bounds.length - 1) startTime[b] = t2;
    if (timed(el)) t2 += Math.round(el.duration?.divisions ?? 0);
  });
  const pieceOf = (after) => {
    const a = after ?? 0;
    let p = 0;
    while (p + 1 < bounds.length - 1 && a >= bounds[p + 1]) p++;
    return p;
  };
  const pieces = [];
  for (let p = 0; p < bounds.length - 1; p++) {
    const first = p === 0;
    const last = p === bounds.length - 2;
    const from = bounds[p];
    const piece = first ? { ...m, elements: m.elements.slice(from, bounds[p + 1]) } : { number: `X${++xno.n}`, implicit: true, elements: m.elements.slice(from, bounds[p + 1]) };
    if (first) {
      delete piece.barlines;
      delete piece.directions;
      delete piece.laterAttrs;
      delete piece.trailing;
    } else {
      piece.print = cuts[p - 1].kind === "page" ? { newPage: true } : { newSystem: true };
      continuationOf.set(piece, pieces[p - 1]);
    }
    const bars = [];
    for (const b of m.barlines ?? []) {
      if (b.location === "left" ? first : b.location === "right" ? last : pieceOf(b.afterElements) === p) {
        bars.push(b.location === "middle" ? { ...b, afterElements: (b.afterElements ?? 0) - from } : b);
      }
    }
    if (!last) bars.push({ location: "right", style: "none" });
    if (bars.length) piece.barlines = bars;
    const dirs = (m.directions ?? []).filter((d) => pieceOf(d.afterElements) === p).map((d) => rebase(d, from, startTime[p]));
    if (dirs.length) piece.directions = dirs;
    const later = (m.laterAttrs ?? []).filter((a) => pieceOf(a.afterElements) === p).map((a) => rebase(a, from, startTime[p]));
    if (later.length) piece.laterAttrs = later;
    if (last && m.trailing) piece.trailing = m.trailing;
    splitPieces.add(piece);
    pieces.push(piece);
  }
  return pieces;
}
function rebase(x, from, time) {
  if (from === 0) return x;
  const y = { ...x };
  if (y.afterElements !== void 0) y.afterElements -= from;
  if (y.offset !== void 0) y.offset = Math.max(0, y.offset - time);
  if (y.onset !== void 0) y.onset = Math.max(0, y.onset - time);
  return y;
}
function joinOpenMeasures(part, xno) {
  const out = [];
  for (const m of part.measures) {
    const prev = out[out.length - 1];
    const prevOpen = prev && prev.elements.length > 0 && !prev.barlines?.some((b) => b.location === "right");
    if (prevOpen && m.elements.length > 0 && !m.attrs && !m.barlines?.some((b) => b.location === "left")) {
      if (m.print?.newSystem || m.print?.newPage) {
        (prev.barlines ??= []).push({ location: "right", style: "none" });
        m.number = `X${++xno.n}`;
        m.implicit = true;
        continuationOf.set(m, prev);
        splitPieces.add(prev);
        splitPieces.add(m);
        out.push(m);
        continue;
      }
      prev.elements.push(...m.elements);
      if (m.barlines) prev.barlines = [...prev.barlines ?? [], ...m.barlines];
      if (m.trailing) prev.trailing = [...prev.trailing ?? [], ...m.trailing];
      continue;
    }
    out.push(m);
  }
  part.measures = out;
}
function mergeEmptyMeasures(part) {
  const out = [];
  let carry = null;
  for (const m of part.measures) {
    if (m.elements.length === 0) {
      carry = carry ? mergeInto(carry, m) : m;
      continue;
    }
    if (carry) {
      const lefts = [];
      for (const b of carry.barlines ?? []) {
        if (b.ending?.type === "start") lefts.push({ location: "left", ending: b.ending });
        if (b.repeat === "forward" || b.alsoForward) lefts.push({ location: "left", repeat: "forward", style: "heavy-light" });
        if (b.ornaments?.length) lefts.push({ location: "left", ornaments: b.ornaments });
        if (b.time) (m.attrs ??= {}).time ??= b.time;
      }
      if (lefts.length) m.barlines = [...lefts, ...m.barlines ?? []];
      if (carry.print) m.print = { ...carry.print, ...m.print ?? {} };
      if (carry.attrs) m.attrs = { ...carry.attrs, ...m.attrs ?? {} };
      carry = null;
    }
    out.push(m);
  }
  if (carry && out.length) {
    const last = out[out.length - 1];
    for (const b of carry.barlines ?? []) {
      if (b.location !== "right" || b.ending?.type === "start") continue;
      const right = (last.barlines ?? []).find((x) => x.location === "right");
      if (!right) (last.barlines ??= []).push(b);
      else {
        right.ending ??= b.ending;
        right.repeat ??= b.repeat;
      }
    }
  }
  part.measures = out;
}
function mergeInto(a, b) {
  return {
    ...a,
    barlines: [...a.barlines ?? [], ...b.barlines ?? []],
    ...a.print || b.print ? { print: { ...a.print ?? {}, ...b.print ?? {} } } : {}
  };
}
function moveForwardRepeats(part) {
  part.measures.forEach((m, i) => {
    const next = part.measures[i + 1];
    const lefts = [];
    m.barlines = (m.barlines ?? []).filter((b) => {
      if (b.location !== "right") return true;
      if (b.repeat === "forward" || b.alsoForward) {
        if (b.repeat === "forward") {
          delete b.repeat;
          if (b.style === "heavy-light") delete b.style;
        }
        delete b.alsoForward;
        lefts.push({ location: "left", repeat: "forward", style: "heavy-light" });
      }
      if (b.ending?.type === "start") {
        lefts.push({ location: "left", ending: b.ending });
        delete b.ending;
      }
      if (b.time && next) (next.attrs ??= {}).time ??= b.time;
      if (b.style === "regular") delete b.style;
      return !!(b.style || b.repeat || b.ending || b.ornaments?.length);
    });
    if (lefts.length && next) {
      const existing = new Set((next.barlines ?? []).filter((b) => b.location === "left").map((b) => (b.repeat ? "r" : "") + (b.ending ? "e" : "")));
      const add = lefts.filter((b) => !existing.has((b.repeat ? "r" : "") + (b.ending ? "e" : "")));
      next.barlines = [...add, ...next.barlines ?? []];
    }
    for (const b of m.barlines) if (b.location === "left" && b.style === "regular") delete b.style;
    if (!m.barlines.length) delete m.barlines;
  });
}
function sustainHosts(song) {
  const out = /* @__PURE__ */ new Map();
  for (const p of song.parts) {
    for (const m of p.measures) {
      for (const el of m.elements) {
        if (el.kind === "chord") for (const su of el.sustains ?? []) out.set(su.id, el.id);
      }
    }
  }
  return out;
}
function tupletRatios$1(song) {
  const out = /* @__PURE__ */ new Map();
  for (const p of song.parts) {
    const tokens = [];
    const chordOfToken = [];
    for (const m of p.measures) {
      for (const el of m.elements) {
        if (el.kind !== "chord" || el.grace) continue;
        tokens.push(el.id);
        chordOfToken.push(el.id);
        for (const su of el.sustains ?? []) {
          tokens.push(su.id);
          chordOfToken.push(el.id);
        }
      }
    }
    const at = new Map(tokens.map((id, i) => [id, i]));
    for (const mk of song.marks) {
      if (mk.type !== "tuplet") continue;
      const a = at.get(mk.start);
      const b = at.get(mk.end);
      if (a === void 0 || b === void 0 || b <= a) continue;
      const n = b - a + 1;
      for (let i = a; i <= b; i++) out.set(chordOfToken[i], { actual: n, normal: n - 1 });
    }
  }
  return out;
}
function divisionFactor(song, tuplets) {
  let f = 1;
  for (const p of song.parts) {
    for (const m of p.measures) {
      for (const el of m.elements) {
        if (el.kind !== "chord") continue;
        const r = el.duration.timeMod ?? tuplets.get(el.id);
        if (!r) continue;
        const q = new Fraction(Math.round(el.duration.divisions) * r.normal, r.actual);
        f = lcm(f, q.denominator);
      }
    }
  }
  return f;
}
function tiesToMarks(song) {
  if (song.marks.some((m) => m.type === "tied")) return;
  for (const p of song.parts) {
    let open = [];
    for (const m of p.measures) {
      for (const el of m.elements) {
        if (el.kind !== "chord" || el.grace) continue;
        const next = [];
        for (const note of el.notes) {
          if (note.tie?.stop) {
            const k = open.findIndex((o) => sameDegree(o.note, note));
            if (k >= 0) {
              song.marks.push({ type: "tied", start: open[k].chord.id, end: el.id });
              open.splice(k, 1);
            } else {
              delete note.tie.stop;
            }
          }
          if (note.tie?.start) next.push({ chord: el, note });
        }
        for (const o of open) delete o.note.tie.start;
        open = next;
      }
    }
    for (const o of open) delete o.note.tie.start;
  }
}
const sameDegree = (a, b) => !!a.degree && !!b.degree && a.degree.number === b.degree.number && a.degree.octaveShift === b.degree.octaveShift;
function tieSlur(a, b) {
  const x = a.notes[0];
  const y = b.notes[0];
  if (a.rest || b.rest || a.grace || b.grace || !x || !y || !sameDegree(x, y)) return false;
  if (y.degree.accidental && y.degree.accidental !== x.degree.accidental) return false;
  (x.tie ??= {}).start = true;
  (y.tie ??= {}).stop = true;
  return true;
}
function normalizeMarks(song, hosts) {
  const written = /* @__PURE__ */ new Set();
  const order = /* @__PURE__ */ new Map();
  for (const p of song.parts) {
    for (const m of p.measures) {
      for (const el of m.elements) {
        if (el.kind !== "chord") continue;
        written.add(el.id);
        order.set(el.id, order.size);
      }
    }
  }
  const chordAt = /* @__PURE__ */ new Map();
  for (const [pi, p] of song.parts.entries()) {
    for (const m of p.measures) for (const el of m.elements) if (el.kind === "chord") chordAt.set(el.id, { el, part: pi });
  }
  const marks = [];
  for (const mk of song.marks) {
    if (mk.type === "wedge") {
      marks.push(mk);
      continue;
    }
    if (mk.collapsed || mk.start < 0) continue;
    const start = hosts.get(mk.start) ?? mk.start;
    const end = hosts.get(mk.end) ?? mk.end;
    if (!written.has(start) || !written.has(end)) continue;
    if ((mk.type === "slur" || mk.type === "tuplet") && order.get(start) >= order.get(end)) continue;
    const [a, b] = [chordAt.get(start), chordAt.get(end)];
    if (mk.type === "slur" && a.part === b.part && order.get(end) === order.get(start) + 1 && tieSlur(a.el, b.el)) {
      marks.push({ type: "tied", start, end });
      continue;
    }
    marks.push({ ...mk, start, end });
  }
  let tupletEnd = -1;
  for (const mk of marks.filter((m) => m.type === "tuplet").sort((a, b) => order.get(a.start) - order.get(b.start))) {
    if (order.get(mk.start) <= tupletEnd) {
      marks.splice(marks.indexOf(mk), 1);
      continue;
    }
    tupletEnd = order.get(mk.end);
  }
  const active = [];
  const slurs = marks.filter((m) => m.type === "slur" && m.number === void 0).sort((a, b) => order.get(a.start) - order.get(b.start));
  for (const mk of slurs) {
    const s = order.get(mk.start);
    let slot = active.findIndex((e) => e === null || e < s);
    if (slot < 0) slot = active.length;
    active[slot] = order.get(mk.end);
    mk.number = slot + 1;
  }
  song.marks = marks;
}
function wedgeDirections(song, part) {
  const hosts = sustainHosts(song);
  const where = /* @__PURE__ */ new Map();
  for (const m of part.measures) {
    let pos = 0;
    for (const el of m.elements) {
      const d = timed(el) ? Math.round(el.duration?.divisions ?? 0) : 0;
      where.set(el.id, { m, offset: pos, end: pos + d });
      pos += d;
    }
  }
  for (const mk of song.marks) {
    if (mk.type !== "wedge" || mk.collapsed || mk.start < 0) continue;
    const s = where.get(hosts.get(mk.start) ?? mk.start);
    const e = where.get(hosts.get(mk.end) ?? mk.end);
    if (!s || !e) continue;
    const at = (x, d) => {
      if (x.offset > 0) d.offset = x.offset;
      (x.m.directions ??= []).push(d);
    };
    at(s, { type: "wedge", placement: "below", spanType: "start", wedgeType: mk.wedgeType ?? "crescendo" });
    at({ m: e.m, offset: e.end }, { type: "wedge", placement: "below", spanType: "stop" });
  }
}
const timed = (el) => el.kind === "chord" ? !el.grace : el.spacer === "x";
function projectPart(part, songFifths, factor, tuplets) {
  let fifths = part.measures[0]?.attrs?.key?.fifths ?? songFifths;
  let octave = 0;
  const realBeams = part.measures.some((m) => m.elements.some((el) => el.kind === "chord" && el.beams?.includes("begin")));
  const quarter = SIMPLE_DIVISIONS * factor;
  let time = part.measures[0]?.attrs?.time ?? { beats: 4, beatType: 4 };
  const ends = /* @__PURE__ */ new Map();
  const carries = /* @__PURE__ */ new Map();
  for (const [mi, m] of part.measures.entries()) {
    const cont = continuationOf.get(m);
    const onset = cont ? ends.get(cont) ?? 0 : 0;
    if (m.attrs?.time) time = m.attrs.time;
    const levels = /* @__PURE__ */ new Map();
    for (const el of m.elements) levels.set(el, el.beams?.length ?? 0);
    if (m.attrs?.key) {
      if (m.attrs.key.fifths === 0 && m.attrs.key.spelling) {
        const f = MusicCommon.keyNameToFifth(m.attrs.key.spelling);
        if (f >= -7 && f <= 7) m.attrs.key.fifths = f;
      }
      fifths = m.attrs.key.fifths;
    }
    const clef = m.attrs?.clefs?.find((c) => (c.staff ?? 1) === 1);
    if (clef) octave = clef.octaveChange ?? 0;
    const carry = cont && carries.get(cont) || new AccidentalCarry();
    carries.set(m, carry);
    const dirs = [];
    const cursors = /* @__PURE__ */ new Map();
    const overlay = new Set(m.elements.map((el) => el.voice || 1)).size > 1;
    let pos = 0;
    for (const el of m.elements) {
      const voice = el.voice > 1 ? el.voice : 1;
      el.voice = voice;
      pos = cursors.get(voice) ?? 0;
      if (overlay) el.onset = pos;
      if (el.kind === "space") {
        if (el.duration) {
          el.duration = { ...el.duration, divisions: Math.round(el.duration.divisions) * factor };
          pos += el.duration.divisions;
        }
        cursors.set(voice, pos);
        delete el.beams;
        continue;
      }
      const ch = el;
      for (const n of ch.notes) {
        if (!n.pitch && n.degree && n.degree.number > 0) {
          n.pitch = carry.pitch(n.degree, { fifths });
          n.pitch.octave += octave;
        }
      }
      if (ch.grace) {
        ch.duration = { ...ch.duration, divisions: 0 };
        delete ch.beams;
        if (overlay) delete ch.onset;
        continue;
      }
      const nominal2 = Math.round(ch.duration.divisions);
      const r = ch.duration.timeMod ?? tuplets.get(ch.id);
      const { type, dots } = typeOfDuration(new Fraction(nominal2, SIMPLE_DIVISIONS));
      const scaled = r ? nominal2 * factor * r.normal / r.actual : nominal2 * factor;
      ch.duration = {
        ...ch.duration,
        divisions: Math.round(scaled),
        type,
        dots,
        ...r ? { timeMod: { ...r } } : {}
      };
      if (!realBeams) delete ch.beams;
      const bodyQuarters = (nominal2 - (ch.sustains?.length ?? 0) * SIMPLE_DIVISIONS) / SIMPLE_DIVISIONS;
      (ch.sustains ?? []).forEach((su, k) => {
        if (!su.harmony) return;
        const off = (bodyQuarters + k) * SIMPLE_DIVISIONS * factor * (r ? r.normal / r.actual : 1);
        su.harmony = { ...su.harmony, offset: Math.round(off) };
      });
      projectOrnaments(ch, dirs, pos);
      if (ch.sectionWord) push(dirs, pos, { type: "words", placement: "above", text: ch.sectionWord });
      ch.lyrics = lyricsOf(ch.lyrics);
      if (!ch.lyrics.length) delete ch.lyrics;
      pos += ch.duration.divisions;
      cursors.set(voice, pos);
    }
    pos = Math.max(0, ...cursors.values());
    for (const b of m.barlines ?? []) {
      for (const o of b.ornaments ?? []) {
        const d = directionOf(o);
        if (d) push(dirs, b.location === "left" ? 0 : pos, d);
      }
    }
    if (m.barlines) {
      m.barlines = m.barlines.filter((b) => b.style || b.repeat || b.ending);
      if (!m.barlines.length) delete m.barlines;
    }
    if (dirs.length) m.directions = [...m.directions ?? [], ...dirs];
    ends.set(m, onset + pos);
    if (!realBeams) autoBeams(m, levels, quarter, time, mi === 0 && continuationOf.get(part.measures[1]) !== m, onset);
    else if (splitPieces.has(m)) closeBeams(m);
  }
}
function autoBeams(m, levels, quarter, time, first, onset) {
  const beat = time.beatType >= 8 && time.beats % 3 === 0 ? quarter * 4 / time.beatType * 3 : Math.max(quarter * 4 / time.beatType, quarter);
  const items = [];
  const cursors = /* @__PURE__ */ new Map();
  let pos = onset;
  for (const el of m.elements) {
    if (!timed(el)) continue;
    const voice = el.voice > 1 ? el.voice : 1;
    const start = cursors.get(voice) ?? onset;
    const dur = el.duration?.divisions ?? 0;
    const solid = el.kind === "chord" && !el.rest && el.printObject !== false;
    items.push({ el, start, dur, level: levels.get(el) ?? 0, solid, voice });
    cursors.set(voice, start + dur);
    pos = Math.max(pos, start + dur);
  }
  const full = time.beats * quarter * 4 / time.beatType;
  const shift = first && pos > 0 && pos < full ? full - pos : 0;
  const groups = [];
  let curBeat = -1;
  let curVoice = 0;
  for (const it of items) {
    const b = Math.floor((it.start + shift) / beat + 1e-9);
    if (it.level > 0 && it.dur <= beat) {
      if (b !== curBeat || it.voice !== curVoice) groups.push([]);
      groups[groups.length - 1].push(it);
      curBeat = b;
      curVoice = it.voice;
    } else {
      curBeat = -1;
      curVoice = 0;
    }
  }
  const out = /* @__PURE__ */ new Map();
  for (const g of groups) {
    const maxLevel = Math.max(...g.map((it) => it.level));
    for (let level = 1; level <= maxLevel; level++) {
      let i = 0;
      while (i < g.length) {
        if (g[i].level < level) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < g.length && g[j + 1].level >= level) j++;
        const solid = g.slice(i, j + 1).filter((it) => it.solid && (level === 1 || out.get(it.el)?.length === level - 1));
        const put = (it, v) => out.set(it.el, [...out.get(it.el) ?? [], v]);
        if (solid.length >= 2) {
          solid.forEach((it, k) => put(it, k === 0 ? "begin" : k === solid.length - 1 ? "end" : "continue"));
        } else if (solid.length === 1 && level > 1) {
          const it = solid[0];
          const upper = out.get(it.el)[level - 2];
          put(it, upper === "begin" || upper === "forward hook" ? "forward hook" : "backward hook");
        }
        i = j + 1;
      }
    }
  }
  for (const el of m.elements) {
    const b = out.get(el);
    if (b) el.beams = b;
    else delete el.beams;
  }
}
function closeBeams(m) {
  const beamed = m.elements.filter((el) => el.kind === "chord" && !!el.beams?.length);
  const head = beamed[0];
  const tail = beamed[beamed.length - 1];
  if (head?.beams && head.beams[0] !== "begin") {
    if (head.beams[0] === "end") delete head.beams;
    else head.beams = head.beams.map((b) => b === "continue" ? "begin" : b === "end" ? "forward hook" : b);
  }
  if (tail?.beams && tail.beams[0] !== "end") {
    if (tail.beams[0] === "begin") delete tail.beams;
    else tail.beams = tail.beams.map((b) => b === "continue" ? "end" : b === "begin" ? "backward hook" : b);
  }
}
function push(dirs, offset, d) {
  if (offset > 0) d.offset = offset;
  dirs.push(d);
}
function projectOrnaments(ch, dirs, pos) {
  const names = ch.ornaments?.length ? ch.ornaments : (ch.notations?.articulations ?? []).map((name) => ({ name, level: 0 }));
  const n = {};
  if (ch.notations?.fermata) n.fermata = true;
  const artic = [];
  const orn = [...ch.notations?.ornaments ?? []];
  for (const { name } of names) {
    const key = XML_ARTICULATIONS.has(name) || XML_ORNAMENTS.has(name) ? name : decoKey(name) ?? name;
    if (FERMATA.test(key)) {
      n.fermata = true;
      continue;
    }
    const a = ARTICULATION$1[key] ?? (XML_ARTICULATIONS.has(key) ? key : void 0);
    if (a) {
      if (!artic.includes(a)) artic.push(a);
      continue;
    }
    const o = ORNAMENT_TAG[key] ?? (XML_ORNAMENTS.has(key) ? key : void 0);
    if (o) {
      if (!orn.includes(o)) orn.push(o);
      continue;
    }
    const d = directionOf({ name });
    if (d) push(dirs, pos, d);
  }
  if (artic.length) n.articulations = artic;
  if (orn.length) n.ornaments = orn;
  if (ch.notations?.technical?.length) n.technical = ch.notations.technical;
  if (n.fermata || n.articulations || n.ornaments || n.technical) ch.notations = n;
  else delete ch.notations;
}
function directionOf(o) {
  const name = o.name;
  if (DYNAMICS[name]) return { type: "dynamics", placement: "below", text: name };
  if (TERMS[name]) return { type: "words", placement: "above", text: TERMS[name] };
  if (name === "zkh" || name === "ykh") return { type: "bracket", placement: "above", spanType: name === "zkh" ? "start" : "stop" };
  if (name === "fine") return { type: "words", placement: "above", text: "Fine", sound: { fine: true } };
  if (name === "dc") return { type: "words", placement: "above", text: "D.C.", sound: { dacapo: true } };
  if (name === "ds") return { type: "words", placement: "above", text: "D.S.", sound: { dalsegno: "1" } };
  if (name === "ty") return { type: "coda", placement: "above" };
  if (name === "hs") return { type: "segno", placement: "above" };
  return null;
}
function lyricsOf(lyrics) {
  const out = [];
  for (const l of lyrics ?? []) {
    if (!l.text) continue;
    if (l.refrain || l.numberTo === void 0) {
      out.push(l);
      continue;
    }
    for (let v = l.number; v <= l.numberTo; v++) {
      const one = { ...l, number: v };
      delete one.numberTo;
      out.push(one);
    }
  }
  return out;
}
const ORNAMENT_NAME = Object.fromEntries(
  Object.entries(ORNAMENT_TAG).reverse().map(([name, tag]) => [tag, name])
);
function barlineOrnaments(b) {
  return (b.ornaments ?? []).map((o) => `!${BARLINE_ORNAMENT_NAME[o.name] ?? o.name}!`);
}
function barlineText(b) {
  if (b.repeat === "forward") return b.repeatTimes === 3 ? "|::" : "|:";
  if (b.repeat === "backward") return b.repeatTimes === 3 ? "::|" : ":|";
  switch (b.style) {
    case "none":
      return "[|]";
    case "light-light":
      return "||";
    case "light-heavy":
      return "|]";
    case "heavy-light":
      return "[|";
    case "dotted":
      return ".|";
    case "regular":
      return "|";
    default:
      return "|";
  }
}
function lyricLines$1(part, sep, skip, sys, rule, style = {}) {
  const ext = style.extend ?? "_";
  const { slots } = lyricSlots(part, sys.from, sys.to, sys.fromEl, sys.toEl, rule);
  let maxVerse = 0;
  for (const el of slots) {
    for (const l of el.lyrics ?? []) maxVerse = Math.max(maxVerse, l.numberTo ?? l.number);
  }
  const bodies = [];
  for (let verse = 1; verse <= maxVerse; verse++) {
    let body = "";
    let label;
    let pendingSkips = "";
    let extendConsumes = false;
    let prevSyllabic;
    let prevLatin = false;
    for (const el of slots) {
      const hit = lyricOfVerse(el.lyrics, verse) ?? void 0;
      if (hit?.verseLabel !== void 0 && label === void 0) label = hit.verseLabel;
      if (hit === void 0 || hit.text === "") {
        if (extendConsumes) {
          extendConsumes = false;
          continue;
        }
        pendingSkips += (pendingSkips === "" ? "" : sep) + (hit?.extend ? ext : skip);
        continue;
      }
      const inWord = prevSyllabic === "begin" || prevSyllabic === "middle";
      const wordSep = sep === "" && prevLatin && pendingSkips === "" && isLatinStart(hit.leadingPunctuation ?? hit.text) ? " " : sep;
      body += (body === "" ? "" : inWord ? "-" : wordSep) + pendingSkips;
      pendingSkips = "";
      const inWordNext = hit.syllabic === "begin" || hit.syllabic === "middle";
      const needBrace = [...hit.text].length > 1 && /[\u3400-\u9fff]/u.test(hit.text) && (inWordNext || !isOneCjkWithPunct(hit.text));
      const bare = skip === "/" ? hit.text.replace(/[/-]/g, (c) => `\\${c}`) : hit.text;
      const joined = style.joinMulti ? style.joinMulti(hit.text) : needBrace ? `{${hit.text}}` : bare;
      body += (hit.leadingPunctuation ?? "") + joined + (hit.trailingPunctuation ?? "");
      prevSyllabic = hit.syllabic;
      prevLatin = !hit.trailingPunctuation && (isLatinEnd(hit.text) || !needBrace && /[/-]$/.test(bare) && bare !== hit.text);
      if (hit.extend) {
        body += sep + ext;
        extendConsumes = true;
        prevSyllabic = void 0;
        prevLatin = false;
      }
    }
    if (body !== "" && (prevSyllabic === "begin" || prevSyllabic === "middle")) body += "-";
    bodies.push(body === "" ? "" : `${label !== void 0 && style.labels !== false ? `<${label}>` : ""}${body}`);
  }
  while (bodies.length > 0 && bodies[bodies.length - 1] === "") bodies.pop();
  return bodies.map((b) => `w:${b}`);
}
const LINE_END = /\r\n?|\n/;
function pushLines(L, name, value) {
  for (const line of value.split(LINE_END)) {
    const t2 = line.trim();
    if (t2) L.push(`${name}:${t2}`);
  }
}
function playOrderText(song) {
  const noteIndex = /* @__PURE__ */ new Map();
  const part = song.parts[0];
  if (part) {
    for (let mi = 0; mi < part.measures.length; mi++) {
      let k = 0;
      for (const el of part.measures[mi].elements) {
        if (el.kind === "chord" && !el.grace) {
          k++;
          noteIndex.set(el.id, { measure: mi + 1, index: k });
        }
      }
    }
  }
  return (song.playOrder ?? []).map((p) => {
    const from = p.fromElement !== void 0 ? noteIndex.get(p.fromElement) : void 0;
    const to = p.toElement !== void 0 ? noteIndex.get(p.toElement) : void 0;
    let s = `${p.fromMeasure}${from && from.index > 1 ? `.${from.index}` : ""}`;
    s += `-${p.toMeasure}${to ? `.${to.index}` : ""}`;
    if (p.verse !== void 0) s += ` v${p.verse}`;
    if (p.pageBreakAfter) s += " page";
    return s;
  }).join(" | ");
}
class AbcFamilyEmitter {
  keyText(song) {
    return song.key ? this.keyValue(song.key) : null;
  }
  /** `M:` 的值。默认只写头一个拍号——并排的混合拍是 123 的扩展，标准 ABC 读不了（见 emit123）。 */
  timeValue(song) {
    return song.time ? `${song.time.beats}/${song.time.beatType}` : null;
  }
  /** `V:n` 首次出现时跟在声部号后面的属性：多声部时的声部名 `name="女高"` / `subname="S"`（ABC §3.1.20；
   *  单声部不写，免得转来的谱都多出一行 `V:1`）。方言另加谱号（123 的 `clef=…`）。 */
  voiceAttrs(part, multi) {
    if (!multi) return "";
    const q = (s) => s.replace(/"/g, "'");
    const a = [];
    if (part.name) a.push(`name="${q(part.name)}"`);
    if (part.abbrev) a.push(`subname="${q(part.abbrev)}"`);
    return a.join(" ");
  }
  /** 头部里方言特有的行（ABC 的 `L:`）。默认没有。 */
  headerExtra(song) {
    return [];
  }
  /** 增时线（123 专有；ABC 那一档没有，返回空串）。 */
  sustainsText(ch, mi) {
    return "";
  }
  /** 延音线记号（MusicXML 读进来的 `tied`）写成弧线括号。123 是：简谱里延音线与圆滑线同形，
   *  123 没有单独的 tie 写法；ABC 不是，它有 `-`（见 `tieText`）。 */
  tiesAsSlurs = false;
  /** 延音线（ABC 专有：tie 的 start 端写 `-`）。 */
  tieText(ch) {
    return "";
  }
  /** 节奏音符 `X`（123 扩展）。 */
  rhythmText() {
    return "X";
  }
  /** 这个元素写不写。默认全写；123 只写简谱印的那一路（见 `emit123.ts`）。 */
  emits(el, mea) {
    return true;
  }
  /** 一个和弦写哪几个音。默认全写；123 没有音符堆，只写简谱印的那个音。 */
  chordNotes(ch) {
    return ch.notes;
  }
  /** 同时发声的几个音怎么包。123 靠多声部表达、不包；ABC 是 `[CEG]`。 */
  chordGroupText(inner, noteCount) {
    return inner;
  }
  /** 多连音起头怎么写。123：`(n:`，比例不是默认值时 `(n:p:`（以冒号收尾，见 `lex.ts::matchTuplet`）；ABC 见 `emitabc.ts`。 */
  tupletText(actual, normal) {
    return normal === tupletNormal123(actual) ? `(${actual}:` : `(${actual}:${normal}:`;
  }
  /** 多连音要不要写收尾的 `)`。123 必需（与圆滑线同一套嵌套）；ABC 按个数收尾、不写。 */
  tupletCloses = true;
  /** 歌词音节之间的分隔。CJK 逐字成音节、连写即可；拉丁词必须空格分开，
   *  否则读回来会粘成一个音节、把后面所有字顶错一格。 */
  lyricSeparator = "";
  /** 歌词里的跳音符。123 是 `/`，ABC 是 `*`（与读入端 `ParseDialect.lyricSkip` 对称）。 */
  lyricSkip = "/";
  /** 休止占不占歌词对位格（`lyricslot.ts::LyricSlotRule`，与读入端 `ParseDialect.id` 同口径）。 */
  lyricSlotRule = "123";
  /** 符杠分组写不写成「连写」。ABC 写（§4.7 空白即分组）；123 不写——符杠按拍自动算，音符一律空格隔开。 */
  spaceBeams = true;
  /** 小节内临时多声部的分隔符（ABC 的 `&`，§7.4）。123 没有这个记号，恒为 null。 */
  overlayText = null;
  /** 临时声部起点晚于小节起点时，用来占住前面那段时间的不可见休止（ABC 的 `x`）。
   *  `divisions` 是写出端口径（四分 = `SIMPLE_DIVISIONS`）。 */
  overlayPad(divisions) {
    return "";
  }
  /** 换行/换页怎么写。123 用显式的 `$`/`$$`；ABC 默认是**代码换行即谱面换行**
   *  （§6.1 的 `I:linebreak <EOL>`），所以那一档写真换行。 */
  breakText(newPage) {
    return newPage ? "$$" : "$";
  }
  /** 和弦符号怎么写。ABC 只有引号形 `"Am7"`；123 能省就省（见 `emit123.ts`）。 */
  chordSymbolText(text) {
    return `"${text}"`;
  }
  /** 最后一小节后面还写不写换行标记。123 写（`$` 无害且要保幂等）；
   *  **ABC 不写**——那是个真换行，末尾多一个就成了空行，而 ABC 的空行会终止曲体，
   *  后面的 `w:` 歌词行就成了孤儿。 */
  trailingBreak = true;
  /** 渐强渐弱的起止怎么写（Muse 的 `(<` … `<)`）。缺省 null = 这种方言写不出（123、ABC 照旧不写）。 */
  wedgeText(type, edge) {
    return null;
  }
  /** 段落词/注记（`Chord.sectionWord`）怎么写：ABC §4.19 的注记，`^` = 标在上方。 */
  annotationText(word) {
    return `"^${word}"`;
  }
  /** 段落词写在和弦名之前（Muse：两者都是引号，读入端靠先后分，见 `j123/parse.ts` 的 `chord` 分支）。 */
  annotationBeforeChord = false;
  /** 歌词行的方言写法（`LyricStyle`）。 */
  lyricStyle = {};
  /** 倚音里的斜线（ABC 的 `{/g}` 短倚音）。 */
  graceSlashText(ch) {
    return "";
  }
  // ────────── 共用组装 ──────────
  /** 整份文档 → 文本。多曲之间空一行，且**每首都带 `X:`**（分隔靠它，同 ABC tunebook）。 */
  emitDoc(doc) {
    const multi = doc.songs.length > 1;
    const bodies = doc.songs.map((s, i) => this.emitSong(s, multi ? i + 1 : void 0));
    return [this.versionLine, ...bodies].join("\n\n") + "\n";
  }
  /** 一个和弦/占位符 → 音乐体文本（不含前置的和弦符号与装饰）。
   *  `mi` 用来给**增时线**也挂上 `(` `)`——增时线有自己的 id，弧可以在它上起止
   *  （`(6,_ 1_)` 这种写法里弧常以增时线收尾）。不查就会写出只有 `(` 没有 `)` 的非法文本。 */
  elementText(el, mi) {
    if (el.kind === "space") {
      let s2 = el.spacer;
      if (el.spacer === "x" && el.duration) s2 += this.durationText(el);
      return s2;
    }
    const ch = el;
    let s = "";
    if (ch.rhythm) {
      s = this.rhythmText();
    } else if (ch.rest) {
      s = this.restText(ch);
    } else {
      const notes = this.chordNotes(ch);
      s = this.chordGroupText(notes.map((n) => this.noteText(n)).join(""), notes.length);
    }
    s += this.durationText(ch);
    s += this.tieText(ch);
    s += this.sustainsText(ch, mi);
    return s;
  }
  /** 倚音 `{6,}` / `{ab}` */
  graceText(ch) {
    const dur = this.graceDurationText(ch);
    return `{${this.graceSlashText(ch)}${ch.notes.map((n) => this.noteText(n) + dur).join("")}}`;
  }
  /** 倚音里每个音后面的时值（123 的 `{2__}`）。ABC 的倚音一律按默认写，不带。 */
  graceDurationText(ch) {
    return "";
  }
  /** 一个声部的音乐体，按 `ranges` 切成几行。按小节拼，符杠分组内连写。
   *  `inlineCuts`：照 `ranges` 在小节中间切（只有切系统所依据的那个声部才这么做）。 */
  partSystems(part, song, ranges, inlineCuts) {
    let out = [];
    const texts = [];
    let ri = 0;
    const own = ownIds(part, (el, mi) => this.emits(el, part.measures[mi]));
    const slurStart = /* @__PURE__ */ new Map();
    const slurEnd = /* @__PURE__ */ new Map();
    const tupletStart = /* @__PURE__ */ new Map();
    const tupletEndOrder = /* @__PURE__ */ new Map();
    part.measures.forEach((mea) => mea.elements.forEach((el) => tupletEndOrder.set(el.id, tupletEndOrder.size)));
    const nested = [...ownMarks(song, own)].filter((m) => m.type === "tuplet").sort((a, b) => (tupletEndOrder.get(b.end) ?? 0) - (tupletEndOrder.get(a.end) ?? 0));
    const tupletEnd = /* @__PURE__ */ new Map();
    const isArc = (m) => m.type === "slur" || m.type === "tied" && this.tiesAsSlurs;
    let marks = ownMarks(song, own);
    const arcNext = /* @__PURE__ */ new Set();
    if (this.tupletCloses) {
      const toNext = arcsToNextNote(part, marks, isArc, own);
      for (const m of toNext) arcNext.add(m.start);
      if (toNext.size) marks = marks.filter((m) => !toNext.has(m));
    }
    const nest = this.tupletCloses ? nestArcsInTuplets(part, marks, isArc) : null;
    if (nest) marks = nest.marks;
    for (const m of marks) {
      if (isArc(m)) {
        slurStart.set(m.start, (slurStart.get(m.start) ?? 0) + 1);
        slurEnd.set(m.end, (slurEnd.get(m.end) ?? 0) + 1);
      } else if (m.type === "tuplet") {
        if (this.tupletCloses) {
          const te = tupletEnd.get(m.end);
          if (te) te.count++;
          else tupletEnd.set(m.end, { count: 1, outerArcs: nest?.outerClose.get(m.end) ?? 0 });
        }
      }
    }
    const wedgeStart = /* @__PURE__ */ new Map();
    const wedgeEnd = /* @__PURE__ */ new Map();
    if (this.wedgeText("crescendo", "start") !== null) {
      for (const m of marks) {
        if (m.type !== "wedge" || !m.wedgeType) continue;
        wedgeStart.set(m.start, [...wedgeStart.get(m.start) ?? [], m.wedgeType]);
        wedgeEnd.set(m.end, [...wedgeEnd.get(m.end) ?? [], m.wedgeType]);
      }
    }
    for (const m of nested) {
      const ts = tupletStart.get(m.start) ?? { ratios: [], outerArcs: nest?.outerOpen.get(m.start) ?? 0 };
      ts.ratios.push({ actual: m.tupletActual ?? 3, normal: m.tupletNormal ?? 2 });
      tupletStart.set(m.start, ts);
    }
    let key = song.key ? this.keyValue(song.key) : "";
    const timeOf = (t2) => t2 ? `${t2.beats}/${t2.beatType}` : "";
    let time = timeOf(song.time);
    const flush = () => {
      texts.push(out.filter((x) => x !== "").join(" ").replace(/ ?\n ?/g, "\n").replace(/\n+$/, "").replace(/^(?=[A-Za-z]\d*(?:-\d+)?\s*[:：])/gm, " "));
      out = [];
    };
    for (let i = 0; i < part.measures.length; i++) {
      while (ri < ranges.length - 1 && i > ranges[ri].to) {
        flush();
        ri++;
      }
      const mea = part.measures[i];
      const cuts = [];
      if (inlineCuts) {
        for (let r = ri; r < ranges.length - 1 && ranges[r].to === i; r++) {
          const inl = ranges[r].inline;
          if (inl) cuts.push({ at: ranges[r].toEl, kind: inl });
        }
      }
      const lefts = (mea.barlines ?? []).filter((b) => b.location === "left");
      const lastEnding = lefts.filter((b) => b.ending?.type === "start").pop();
      for (const left of lefts) {
        if (left.style !== void 0) out.push(barlineText(left));
        out.push(...barlineOrnaments(left));
        if (left === lastEnding) out.push(`[${left.ending.numbers.join(",")}`);
      }
      const k = mea.attrs?.key ? this.keyValue(mea.attrs.key) : key;
      if (k !== key) out.push(`[K:${k}]`);
      key = k;
      const t2 = mea.attrs?.time ? timeOf(mea.attrs.time) : time;
      if (t2 !== time) out.push(`[M:${t2}]`);
      time = t2;
      let el0 = 0;
      for (const cut of cuts) {
        out.push(this.measureBody(mea, { slurStart, slurEnd, tupletStart, tupletEnd, arcNext, wedgeStart, wedgeEnd }, el0, cut.at));
        out.push(this.breakText(cut.kind === "page"));
        flush();
        ri++;
        el0 = cut.at;
      }
      const body = this.measureBody(mea, { slurStart, slurEnd, tupletStart, tupletEnd, arcNext, wedgeStart, wedgeEnd }, el0);
      out.push(body);
      const right = (mea.barlines ?? []).find((b) => b.location === "right");
      const last = i === part.measures.length - 1;
      if (right) out.push(...barlineOrnaments(right));
      const bare = i > 0 && body === "" && !lefts.length && !mea.attrs && (!right || (right.style === "regular" || right.style === "none") && !right.repeat && !right.ending && !right.ornaments?.length);
      if (!bare) out.push(right ? barlineText(right) : "|");
      const brk = cuts.length ? null : breakAfter(part, i);
      if (brk && (!last || this.trailingBreak)) out.push(this.breakText(brk === "page"));
    }
    flush();
    while (texts.length < ranges.length) texts.push("");
    return texts;
  }
  /** `from` / `to`：只写这一段元素（小节中间换行时一小节分两段写，见 `partSystems`）。 */
  measureBody(mea, mi, from = 0, to = Infinity) {
    const pieces = [];
    let prevGroup;
    const mid = (mea.barlines ?? []).filter((b) => b.location === "middle");
    let midIdx = 0;
    const order = this.voiceOrder(mea, from, to);
    let prevVoice;
    for (const j of order) {
      const el = mea.elements[j];
      if (!this.emits(el, mea)) continue;
      const ch = el.kind === "chord" ? el : null;
      if (ch?.continued) continue;
      const voice = el.voice > 1 ? el.voice : 1;
      if (this.overlayText && prevVoice !== void 0 && voice !== prevVoice) {
        pieces.push(this.overlayText);
        prevGroup = void 0;
        const pad = el.onset ? this.overlayPad(el.onset) : "";
        if (pad) pieces.push(pad);
      }
      prevVoice = voice;
      if (ch?.grace) {
        pieces.push(this.graceText(ch));
        prevGroup = void 0;
        continue;
      }
      let s = "";
      const chordText = el.harmony ? harmonyText(el.harmony) : "";
      const word = ch?.sectionWord ?? ch?.sustains?.find((su) => su.sectionWord !== void 0)?.sectionWord;
      if (word && this.annotationBeforeChord) s += this.annotationText(word);
      if (chordText) s += this.chordSymbolText(chordText);
      if (word && !this.annotationBeforeChord) s += this.annotationText(word);
      if (el.notations?.fermata) s += "!fermata!";
      for (const a of el.notations?.articulations ?? []) s += `!${a}!`;
      for (const o of el.notations?.ornaments ?? []) s += `!${ORNAMENT_NAME[o] ?? o}!`;
      const tp = mi.tupletStart.get(el.id);
      const opens = mi.slurStart.get(el.id) ?? 0;
      for (const w of mi.wedgeStart?.get(el.id) ?? []) s += this.wedgeText(w, "start") ?? "";
      s += "(".repeat(tp?.outerArcs ?? 0);
      for (const r of this.tupletCloses ? tp?.ratios ?? [] : (tp?.ratios ?? []).slice(0, 1)) s += this.tupletText(r.actual, r.normal);
      s += "(".repeat(opens - (tp?.outerArcs ?? 0));
      s += this.elementText(el, mi);
      if (mi.arcNext.has(el.id)) s += "~";
      const te = mi.tupletEnd.get(el.id);
      const closes = mi.slurEnd.get(el.id) ?? 0;
      s += ")".repeat(closes - (te?.outerArcs ?? 0));
      if (te) s += ")".repeat(te.count + te.outerArcs);
      for (const w of mi.wedgeEnd?.get(el.id) ?? []) s += this.wedgeText(w, "stop") ?? "";
      while (midIdx < mid.length && mid[midIdx].afterElements !== void 0 && mid[midIdx].afterElements <= pieces.length) {
        pieces.push(barlineText(mid[midIdx]));
        midIdx++;
        prevGroup = void 0;
      }
      const group = ch?.beamGroup;
      const sameGroup = this.spaceBeams && group !== void 0 && group === prevGroup;
      if (pieces.length && sameGroup) pieces[pieces.length - 1] += s;
      else pieces.push(s);
      prevGroup = group;
    }
    if (to >= mea.elements.length) while (midIdx < mid.length) {
      pieces.push(barlineText(mid[midIdx]));
      midIdx++;
    }
    return pieces.join(" ");
  }
  /** 小节里元素的写出顺序（下标）。单声部就是原顺序；多声部按**声部首次出现的先后**归并，
   *  好让 `&` 落在段与段之间。`from`/`to` 切片（小节中间换行）不重排——那时下标要与切片口径一致。 */
  voiceOrder(mea, from, to) {
    const all = mea.elements.map((_, j) => j).filter((j) => j >= from && j < to);
    if (!this.overlayText || from > 0 || to < mea.elements.length) return all;
    const groups = /* @__PURE__ */ new Map();
    for (const j of all) {
      const v = mea.elements[j].voice > 1 ? mea.elements[j].voice : 1;
      const g = groups.get(v);
      if (g) g.push(j);
      else groups.set(v, [j]);
    }
    if (groups.size < 2) return all;
    return [...groups.values()].flat();
  }
  /** 一首歌 → 文本。
   *  @param fallbackNumber 没有曲号时用它补一个——**多曲文件必须给**，
   *    因为 123 的多曲就是靠 `X:` 分隔（规范 §1，同 ABC tunebook）。
   *    文本谱用 `-----` 分曲、大多没有曲号，不补的话几首会连成一片、读回只剩一首。 */
  emitSong(song, fallbackNumber) {
    const L = [];
    if (song.work.number) L.push(`X:${song.work.number}`);
    else if (fallbackNumber !== void 0) L.push(`X:${fallbackNumber}`);
    if (song.work.title !== void 0) pushLines(L, "T", song.work.title);
    for (const st of song.work.subtitles) pushLines(L, "T", st);
    for (const c of song.identification?.creators ?? []) pushLines(L, "C", c.text);
    const k = this.keyText(song);
    if (k) L.push(`K:${k}`);
    const mt = this.timeValue(song);
    if (mt) L.push(`M:${mt}`);
    L.push(...this.headerExtra(song));
    for (const t2 of song.tempos ?? []) {
      const beat = song.tempoBeat ? `${song.tempoBeat.num}/${song.tempoBeat.den}` : "1/4";
      L.push(typeof t2 === "number" ? `Q:${beat}=${t2}` : `Q:"${t2}"`);
    }
    const pt = song.pageText;
    if (pt) {
      if (pt.indexLeft !== void 0) L.push(`I:indexleft ${pt.indexLeft}`);
      if (pt.indexRight !== void 0) L.push(`I:indexright ${pt.indexRight}`);
      for (const [key, arr] of [
        ["topleft", pt.topLeft],
        ["topright", pt.topRight],
        ["bottomleft", pt.bottomLeft],
        ["bottomcenter", pt.bottomCenter],
        ["bottomright", pt.bottomRight]
      ]) {
        for (const t2 of arr) for (const line of t2.split(LINE_END)) if (line.trim()) L.push(`I:${key} ${line.trim()}`);
      }
    }
    for (const [key, vals] of Object.entries(song.meta ?? {})) {
      for (const v of vals) for (const line of v.split(LINE_END)) L.push(`I:meta ${key} ${line}`.trimEnd());
    }
    if (song.style?.sheetRef) L.push(`I:style ${song.style.sheetRef}`);
    if (song.linesPerPage) L.push(`I:linesperpage ${song.linesPerPage}`);
    for (const r of song.style?.raw ?? []) L.push(`I:${r.key.toLowerCase()} ${r.value.split(LINE_END).join(" ")}`);
    if (song.playOrder?.length) L.push(`I:playorder ${playOrderText(song)}`);
    for (const r of song.remarks ?? []) {
      if (r.startsWith("P:")) L.push(r);
      else pushLines(L, "N", r);
    }
    const texts = [];
    for (const part of song.parts) {
      for (const mea of part.measures) {
        for (const t2 of mea.print?.texts ?? []) texts.push({ system: mea.print?.system ?? 0, text: t2.trim() });
      }
    }
    for (const t2 of texts.sort((a, b) => a.system - b.system)) if (t2.text) pushLines(L, "N", t2.text);
    L.push(...this.bodyLines(song));
    return L.join("\n");
  }
  /** 声部切换行：声部 `i` 的一行音乐前面写什么（`first`：这个声部第一次出现）。null = 不写。
   *  缺省是 ABC 的 `V:n`：属性只在首次出现时写（带属性的 `V:` 是声明，之后的只切声部）；单声部有属性也得写 `V:1`。 */
  voiceLine(song, i, first) {
    const attrs = first ? this.voiceAttrs(song.parts[i], song.parts.length > 1) : "";
    return song.parts.length > 1 || attrs ? `V:${i + 1}${attrs ? " " + attrs : ""}` : null;
  }
  /** 曲体：**一行曲一行词**，按第一个声部的换行切系统，每个系统依次写各声部的音乐行与它的 `w` 行。
   *  读入端把「上一批 `w` 行之后的音乐行」当一个歌词块、`w` 从块首对位（规范 §5.1），与这里一一对应。
   *  别的声部的小节中间切点按拍位对到第一声部的切点上（`partRanges`） */
  bodyLines(song) {
    const L = [];
    const ranges = systemRanges(song.parts[0]);
    const pranges = song.parts.map((part) => partRanges(ranges, song.parts[0], part));
    const bodies = song.parts.map((part, pi) => this.partSystems(part, song, pranges[pi], true));
    const declared = /* @__PURE__ */ new Set();
    for (let r = 0; r < ranges.length; r++) {
      for (let i = 0; i < song.parts.length; i++) {
        const text = bodies[i][r];
        if (text === "") continue;
        const v = this.voiceLine(song, i, !declared.has(i));
        declared.add(i);
        if (v !== null) L.push(v);
        L.push(text);
        const sys = pranges[i][r];
        for (const line of lyricLines$1(song.parts[i], this.lyricSeparator, this.lyricSkip, sys, this.lyricSlotRule, this.lyricStyle)) L.push(line);
      }
    }
    return L;
  }
}
const Q = SIMPLE_DIVISIONS;
const cache = /* @__PURE__ */ new WeakMap();
function isDurationShaped(song) {
  let offShape = false;
  for (const p of song.parts) {
    for (const m of p.measures) {
      for (const el of m.elements) {
        if (el.kind !== "chord" || el.grace || el.continued) continue;
        if (el.beams?.length || el.sustains?.length) return false;
        if (!offShape) {
          const s = jianpuShape(nominalQuarters(el, Q));
          offShape = s.beams > 0 || s.sustains > 0 || s.dots !== el.duration.dots;
        }
      }
    }
  }
  return offShape;
}
function projectForJianpu(src) {
  const hit = cache.get(src);
  if (hit) return hit;
  const xml = isXmlShaped(src);
  const overlay = hasVoiceOverlay(src);
  if (!xml && !isDurationShaped(src) && !overlay) return src;
  const song = structuredClone(src);
  if (overlay) dropOverlayVoices(song);
  if (xml) creatorsFromCredits(song);
  else tiesToMarks(song);
  let nextId = maxId(song) + 1;
  const newId = () => nextId++;
  for (const part of song.parts) {
    let divisions = xml ? 1 : Q;
    let carry = [];
    for (const m of part.measures) {
      if (m.attrs?.divisions !== void 0) divisions = m.attrs.divisions;
      carry = projectMeasure(m, divisions, newId, carry);
      if (m.attrs) delete m.attrs.divisions;
      if (xml) {
        const right = (m.barlines ?? []).find((bl) => bl.location === "right");
        if (!right) (m.barlines ??= []).push({ location: "right", style: "regular" });
        else if (right.style === void 0) right.style = "regular";
      }
    }
    const last = part.measures.flatMap((m) => m.elements).reverse().find((e) => e.kind === "chord");
    if (carry.length && last) last.laterHarmonies = [...last.laterHarmonies ?? [], ...carry];
  }
  cache.set(src, song);
  return song;
}
function dropOverlayVoices(song) {
  const dropped = /* @__PURE__ */ new Set();
  for (const part of song.parts) {
    for (const m of part.measures) {
      m.elements = m.elements.filter((el) => {
        if (el.voice <= 1) return true;
        dropped.add(el.id);
        return false;
      });
    }
  }
  if (!dropped.size) return;
  song.marks = song.marks.filter((mk) => !dropped.has(mk.start) && !dropped.has(mk.end));
}
function creatorsFromCredits(song) {
  if (song.identification?.creators.length) return;
  const skip = /* @__PURE__ */ new Set(["title", "subtitle", "rights", "page-number"]);
  const title = song.work.title?.trim();
  const creators = (song.credits ?? []).filter((c) => !(c.type && skip.has(c.type)) && c.text.trim() && c.text.trim() !== title).map((c) => ({ type: c.type ?? "composer", text: c.text.replace(/\n/g, " ").trim() }));
  if (creators.length) song.identification = { ...song.identification ?? {}, creators };
}
function maxId(song) {
  let max = 0;
  for (const p of song.parts) {
    for (const m of p.measures) {
      for (const el of m.elements) {
        max = Math.max(max, el.id);
        if (el.kind === "chord") for (const su of el.sustains ?? []) max = Math.max(max, su.id);
      }
    }
  }
  return max;
}
const textOf = (h) => h.text !== void 0 ? h : { ...h, text: harmonyText(h) };
function projectMeasure(m, divisions, newId, carryIn) {
  const out = [];
  const startOf = /* @__PURE__ */ new Map();
  let pos = 0;
  const trailing = [];
  for (const el of m.elements) {
    if (el.kind === "space" && el.spacer === "y") {
      if (el.harmony) trailing.push(el.harmony);
      continue;
    }
    if (el.kind === "chord" && !el.grace) {
      startOf.set(el, pos);
      pos += el.duration.divisions / divisions;
    } else if (el.kind === "space" && el.duration) {
      pos += el.duration.divisions / divisions;
    }
  }
  const measureEnd2 = pos;
  const firstChord = m.elements.find((e) => e.kind === "chord" && !e.grace);
  if (firstChord && carryIn.length) {
    for (const h of carryIn) {
      if (!firstChord.harmony) firstChord.harmony = { ...h, offset: 0 };
      else (firstChord.laterHarmonies ??= []).push({ ...h, offset: 0 });
    }
  }
  for (const el of m.elements) {
    if (el.kind === "space" && el.spacer === "y") continue;
    if (el.harmony) el.harmony = textOf(el.harmony);
    if (el.kind === "space") {
      if (el.duration) {
        const s2 = jianpuShape(nominalQuarters(el, divisions));
        el.duration = { divisions: Math.round(nominalQuarters(el, divisions) * Q), dots: s2.dots };
        el.beams = s2.beams ? Array.from({ length: s2.beams }, () => "continue") : void 0;
        if (!el.beams) delete el.beams;
      }
      out.push(el);
      continue;
    }
    const ch = el;
    const q = nominalQuarters(ch, divisions);
    if (ch.grace && q <= 0) {
      out.push(ch);
      continue;
    }
    const s = jianpuShape(q);
    const shaped = { divisions: ch.grace ? 0 : Math.round(q * Q), dots: s.dots };
    if (ch.duration.type) shaped.type = ch.duration.type;
    ch.duration = shaped;
    if (s.beams) ch.beams = Array.from({ length: s.beams }, () => "continue");
    else delete ch.beams;
    if (ch.grace || s.sustains === 0) {
      placeLaterHarmonies(ch, [], divisions);
      out.push(ch);
      continue;
    }
    if (ch.rest) {
      const beats = Math.floor(q + 1e-9);
      ch.duration = { divisions: Q, dots: 0 };
      const later = [...ch.laterHarmonies ?? []];
      delete ch.laterHarmonies;
      out.push(ch);
      for (let k = 1; k < beats; k++) {
        const r = { kind: "chord", id: newId(), notes: [], rest: {}, duration: { divisions: Q, dots: 0 }, voice: ch.voice, staff: ch.staff };
        const h = later.findIndex((x) => Math.abs((x.offset ?? 0) / divisions - k) < 1e-6);
        if (h >= 0) {
          const [placed] = later.splice(h, 1);
          r.harmony = { ...textOf(placed) };
          delete r.harmony.offset;
        }
        out.push(r);
      }
      if (later.length) ch.laterHarmonies = later.map(textOf);
      const rest = q - beats;
      if (rest > 1e-9) {
        const r = jianpuShape(rest);
        const tail = { kind: "chord", id: newId(), notes: [], rest: {}, duration: { divisions: Math.round(rest * Q), dots: r.dots }, voice: ch.voice, staff: ch.staff };
        if (r.beams) tail.beams = Array.from({ length: r.beams }, () => "continue");
        out.push(tail);
      }
      continue;
    }
    ch.sustains = Array.from({ length: s.sustains }, () => ({ id: newId() }));
    placeLaterHarmonies(ch, ch.sustains, divisions);
    out.push(ch);
  }
  m.elements = out;
  const carryOut = [];
  for (const h of trailing) {
    const at = measureEnd2 + (h.offset ?? 0) / divisions;
    if (at >= measureEnd2 - 1e-9) {
      carryOut.push(textOf(h));
      continue;
    }
    let host;
    for (const [c, st] of startOf) if (st <= at + 1e-9) host = c;
    if (!host) {
      carryOut.push(textOf(h));
      continue;
    }
    const rel = at - startOf.get(host);
    if (Math.abs(rel) < 1e-9 && !host.harmony) {
      host.harmony = { ...textOf(h), offset: 0 };
      delete host.harmony.offset;
      continue;
    }
    const k = Math.round(rel - (host.duration.divisions - (host.sustains?.length ?? 0) * Q) / Q);
    const su = host.sustains?.[k];
    const onBeat = Math.abs(rel - (host.duration.divisions / Q - (host.sustains?.length ?? 0)) - k) < 1e-6;
    if (su && onBeat && !su.harmony) {
      su.harmony = { ...textOf(h) };
      delete su.harmony.offset;
    } else {
      const idx = out.indexOf(host);
      const beat = Math.round(rel);
      const r = out[idx + beat];
      if (host.rest && Math.abs(rel - beat) < 1e-9 && r?.kind === "chord" && r.rest && !r.harmony) {
        r.harmony = { ...textOf(h) };
        delete r.harmony.offset;
      } else {
        (host.laterHarmonies ??= []).push(textOf(h));
      }
    }
  }
  return carryOut;
}
function placeLaterHarmonies(ch, sustains, divisions) {
  const later = [...ch.laterHarmonies ?? []];
  if (ch.harmony?.offset && ch.harmony.offset > 0) {
    later.unshift(ch.harmony);
    delete ch.harmony;
  }
  const bodyQuarters = (ch.duration.divisions - sustains.length * Q) / Q;
  const left = [];
  for (const h of later) {
    const at = (h.offset ?? 0) / divisions;
    const k = Math.round(at - bodyQuarters);
    const su = sustains[k];
    if (Math.abs(at - bodyQuarters - k) < 1e-6 && su && !su.harmony) {
      const placed = textOf(h);
      delete placed.offset;
      su.harmony = placed;
    } else if (!ch.harmony && (h.offset ?? 0) <= 0) {
      ch.harmony = textOf(h);
    } else {
      left.push(textOf(h));
    }
  }
  if (!ch.harmony && left.length) {
    ch.harmony = left.shift();
    delete ch.harmony.offset;
  }
  if (left.length) ch.laterHarmonies = left;
  else delete ch.laterHarmonies;
}
const GRACE_TYPES = ["eighth", "16th", "32nd", "64th"];
const ACC_TEXT$2 = {
  sharp: "#",
  flat: "b",
  natural: "n",
  "double-sharp": "##",
  "double-flat": "bb"
};
class Emitter123 extends AbcFamilyEmitter {
  versionLine = "%123-1.0";
  tiesAsSlurs = true;
  spaceBeams = false;
  /** 123 没有音符堆（规范：和弦走符号 `"Am7"`，不做 `[1 3 5]`），一个声部也只有一路：
   *  只写简谱印的那一路（`melodyLane`）、那一路里每个和弦最高的音。其余的由 `planSave` 报「noteStack」丢失。
   *  以前挨着写成 `35`，读回来成了两个先后的音，时值翻倍（Praise as One/万古磐石 42 个音读回 84 个）。 */
  emits(el, mea) {
    if (el.kind !== "chord") return true;
    const lane = melodyLane(mea);
    return !lane || el.staff === lane.staff && el.voice === lane.voice;
  }
  chordNotes(ch) {
    const top = topNote(ch);
    return top ? [top] : [];
  }
  /** 和弦名合规就**不带引号**（`F 3-`），后面必须跟空格——读入端按「到空白为止」切，123 的空格又不管分组。
   *  `N.C.` 这类不合规的仍写引号形。 */
  chordSymbolText(text) {
    return BARE_CHORD_RE.test(text) ? `${text} ` : `"${text}"`;
  }
  /** 声部名（多声部时）之外再写谱号：八度谱号 `clef=treble-8`（简谱按高八度记的男声部，`writtenOctaveOf`）；
   *  多声部里低音、中音谱号也写（简谱上不印，五线谱档要它，声部面板改了谱号要能存回）。单声部的普通谱号不写。 */
  voiceAttrs(part, multi) {
    const c = part.measures[0]?.attrs?.clefs?.find((x) => (x.staff ?? 1) === 1);
    const treble = !c || c.sign === "G" && (c.line ?? 2) === 2;
    const name = c && (c.octaveChange || multi && !treble) ? clefName(c) : null;
    return [super.voiceAttrs(part, multi), name ? `clef=${name}` : ""].filter(Boolean).join(" ");
  }
  /** `$` 后换行：一行曲一行源码，方便与源图逐行对照。123 的代码换行不是谱面换行，读回不变。 */
  breakText(newPage) {
    return newPage ? "$$\n" : "$\n";
  }
  /** 混合拍：页眉并排印着的几个拍号都写进 `M:`（`M:3/4 4/4 混合拍`，见规范 §3）。
   *  辅助拍号写在括号里的（文本谱 `P: 4/4 ( 2/4 )`）照原样带括号写出。 */
  timeValue(song) {
    if (!song.time) return null;
    const parts = [];
    let inParen = false;
    for (const t2 of [song.time, ...song.extraTimes ?? []]) {
      const paren = t2.parenthesized === true;
      if (!paren && inParen) parts[parts.length - 1] += ")";
      parts.push((paren && !inParen ? "(" : "") + `${t2.beats}/${t2.beatType}`);
      inParen = paren;
    }
    if (inParen) parts[parts.length - 1] += ")";
    return parts.join(" ") + (song.timeNote ? ` ${song.timeNote}` : "");
  }
  /** MusicXML 读进来的歌先投成简谱形状：123 的 `-` 是增时线、`_` 是减时线，照 MusicXML 的 type/beam 直写会写错时值 */
  emitSong(song, fallbackNumber) {
    return super.emitSong(projectForJianpu(song), fallbackNumber);
  }
  /** 度数 + 八度点。变音记号**前置**（简谱惯例）。 */
  noteText(n) {
    const d = n.degree;
    if (!d) {
      return n.pitch ? "0" : "";
    }
    let s = "";
    if (d.accidental) s += ACC_TEXT$2[d.accidental] ?? "";
    s += String(d.number);
    s += d.octaveShift > 0 ? "'".repeat(d.octaveShift) : ",".repeat(-d.octaveShift);
    return s;
  }
  /** `printObject === false` 是**不可见休止**，123 有专门的 `x`，写成 `0` 会丢掉「不可见」。 */
  restText(ch) {
    return ch.printObject === false ? "x" : "0";
  }
  durationText(el) {
    const beams = el.kind === "chord" ? el.beams?.length ?? 0 : el.beams?.length ?? 0;
    const dots = el.kind === "chord" ? el.duration.dots : el.duration?.dots ?? 0;
    return "_".repeat(beams) + ".".repeat(dots);
  }
  /** 倚音时值相对八分：`{2}` 八分、`{2_}` 十六分（沿用 ABC §4.12 倚音自有单位的口径）。 */
  graceDurationText(ch) {
    return "_".repeat(Math.max(0, GRACE_TYPES.indexOf(ch.duration.type ?? "eighth")));
  }
  /** 增时线（各自可带弧的起止）。**这是 123 独有的**：ABC 的 `-` 是 tie。 */
  sustainsText(ch, mi) {
    let s = "";
    for (const su of ch.sustains ?? []) {
      s += "(".repeat(mi?.slurStart.get(su.id) ?? 0);
      s += su.harmony ? ` ${this.chordSymbolText(harmonyText(su.harmony))}-` : "-";
      s += ")".repeat(mi?.slurEnd.get(su.id) ?? 0);
    }
    return s;
  }
  /** 主音唱名非 1 时写简谱首调形（`6=E`），否则写 `1=X`。 */
  keyValue(k) {
    if (k.spelling === "none") return "none";
    const sp = keySpelling(k);
    const degree = k.tonicDegree ?? "1";
    return `${degree}=${sp}`;
  }
}
const EMITTER_123 = new Emitter123();
function emitSong(song, fallbackNumber) {
  return EMITTER_123.emitSong(song, fallbackNumber);
}
function emit123(doc) {
  return EMITTER_123.emitDoc(doc);
}
const ABC_FIXED_TUPLET$1 = { 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 };
const UNIT$1 = SIMPLE_DIVISIONS / 2;
const ACC_TEXT$1 = {
  sharp: "^",
  flat: "_",
  natural: "=",
  "double-sharp": "^^",
  "double-flat": "__"
};
const gcd$1 = (a, b) => b === 0 ? a : gcd$1(b, a % b);
function lengthSuffix$1(divisions) {
  if (divisions <= 0) return "";
  let num = divisions;
  let den = UNIT$1;
  const g = gcd$1(num, den) || 1;
  num /= g;
  den /= g;
  if (num === 1 && den === 1) return "";
  if (num === 1 && den === 2) return "/";
  if (den === 1) return String(num);
  return `${num}/${den}`;
}
function withAbcDivisions(src) {
  const song = structuredClone(src);
  for (const part of song.parts) {
    let divisions = 1;
    for (const m of part.measures) {
      if (m.attrs?.divisions !== void 0) divisions = m.attrs.divisions;
      for (const el of m.elements) {
        if (el.kind === "chord" && el.grace) continue;
        if ((el.kind === "chord" || el.kind === "space") && el.duration) {
          el.duration = { ...el.duration, divisions: Math.round(nominalQuarters(el, divisions) * SIMPLE_DIVISIONS) };
        }
        if (el.onset) el.onset = Math.round(el.onset / divisions * SIMPLE_DIVISIONS);
      }
    }
  }
  return song;
}
const GRACE_LEN$1 = { quarter: "2", eighth: "", "16th": "/", "32nd": "/4", "64th": "/8" };
class EmitterAbc extends AbcFamilyEmitter {
  versionLine = "%abc-2.1";
  /** MusicXML 形状的歌先换时值口径，否则 `L:1/8` 下写出的是原始 divisions（八分写成 `E1/8`）；
   *  简谱形状的（只有度数）先补音高与 ABC 口径的记号（`abcpitch.ts`）。 */
  emitSong(song, fallbackNumber) {
    return super.emitSong(isXmlShaped(song) ? withAbcDivisions(song) : withAbcPitches(song), fallbackNumber);
  }
  /** 音名 + 八度：第 4 八度大写、第 5 八度小写，再往外用 `'` 与 `,`（ABC §4.1）。 */
  noteText(n) {
    const p = n.pitch;
    if (!p) return "";
    let s = n.accidental ? ACC_TEXT$1[n.accidental] ?? "" : "";
    const oct = p.octave;
    s += oct >= 5 ? p.step.toLowerCase() : p.step;
    if (oct > 5) s += "'".repeat(oct - 5);
    else if (oct < 4) s += ",".repeat(4 - oct);
    return s;
  }
  /** `z` 带时值；不可见休止用 ABC 的 `x`（invisible rest）。 */
  restText(ch) {
    return ch.printObject === false ? "x" : "z";
  }
  durationText(el) {
    const dur = el.kind === "chord" ? el.duration : el.duration;
    return dur ? lengthSuffix$1(dur.divisions) : "";
  }
  /** tie 的 start 端写 `-`（ABC §4.11）。 */
  tieText(ch) {
    return ch.notes.some((n) => n.tie?.start) ? "-" : "";
  }
  /** ABC 没有「节奏音符」，退化成一个不发音高的 `x`——比丢掉强，且时值对得上。 */
  rhythmText() {
    return "x";
  }
  headerExtra() {
    return ["L:1/8"];
  }
  /** 同时发声的几个音包进 `[]`（ABC §4.17）。单音不包——包了读回来也对，但不幂等。 */
  chordGroupText(inner, noteCount) {
    return noteCount > 1 ? `[${inner}]` : inner;
  }
  /** ABC 的多连音不要冒号（音符是字母，`(3` 无歧义）。比例是 §4.13 表里的固定默认值才写简写；
   *  `(5`/`(7`/`(9` 的默认值随拍号变，一律写完整形。 */
  tupletText(actual, normal) {
    return ABC_FIXED_TUPLET$1[actual] === normal ? `(${actual}` : `(${actual}:${normal}:${actual}`;
  }
  /** ABC 按个数收尾（§4.13），不写 `)`。 */
  tupletCloses = false;
  /** 小节内临时多声部分隔（ABC §7.4）。 */
  overlayText = "&";
  /** 分支不从小节起点开始时，前面用不可见休止 `x` 占住。 */
  overlayPad(divisions) {
    return divisions > 0 ? `x${lengthSuffix$1(divisions)}` : "";
  }
  /** 拉丁词必须空格分开，否则读回来粘成一个音节。 */
  lyricSeparator = " ";
  /** ABC §5.1 的跳音符。 */
  lyricSkip = "*";
  lyricSlotRule = "abc";
  /** ABC 默认「代码换行即谱面换行」（§6.1），所以写真换行而不是 123 的 `$`。
   *  换页 ABC 没有对应记号，退化成换行。 */
  breakText() {
    return "\n";
  }
  trailingBreak = false;
  /** 倚音长度相对倚音单位（八分，ABC §4.12 单位由软件定）：`{g/}` 十六分、`{g2}` 四分。 */
  graceDurationText(ch) {
    return GRACE_LEN$1[ch.duration.type ?? "eighth"] ?? "";
  }
  /** `{/g}` 短倚音（acciaccatura，ABC §4.12）。 */
  graceSlashText(ch) {
    return ch.grace?.slash ? "/" : "";
  }
  /** 音名调号。带 mode 的（`Em`）照 ABC 写法还原。 */
  keyValue(k) {
    if (k.spelling === "none") return "none";
    const sp = keySpelling(k, "mode").replace(/^([#b])([A-G])$/, "$2$1");
    const mode = k.mode && k.mode !== "major" && k.mode !== "ionian" ? k.mode.slice(0, 3) : "";
    return sp + (mode === "min" ? "m" : mode);
  }
}
const EMITTER_ABC = new EmitterAbc();
function emitAbc(doc) {
  return EMITTER_ABC.emitDoc(doc);
}
const UNIT = SIMPLE_DIVISIONS / 2;
const ACC_TEXT = {
  sharp: "^",
  flat: "_",
  natural: "=",
  "double-sharp": "^^",
  "double-flat": "__"
};
const ABC_FIXED_TUPLET = { 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 };
const GRACE_LEN = { quarter: "2", eighth: "", "16th": "/", "32nd": "/4", "64th": "/8" };
const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
function lengthSuffix(divisions) {
  if (divisions <= 0) return "";
  let num = divisions;
  let den = UNIT;
  const g = gcd(num, den) || 1;
  num /= g;
  den /= g;
  if (num === 1 && den === 1) return "";
  if (num === 1 && den === 2) return "/";
  if (den === 1) return String(num);
  return `${num}/${den}`;
}
function withDegrees$1(src) {
  const missing = src.parts.some((p) => p.measures.some((m) => m.elements.some((el) => el.kind === "chord" && el.notes.some((n) => n.pitch && !n.degree))));
  if (!missing) return src;
  const song = structuredClone(src);
  for (const part of song.parts) assignDegrees(part, song.key ?? { fifths: 0 });
  return song;
}
function marksOffSustains(src) {
  const host = /* @__PURE__ */ new Map();
  for (const p of src.parts) for (const m of p.measures) for (const el of m.elements) {
    if (el.kind === "chord") for (const su of el.sustains ?? []) host.set(su.id, el.id);
  }
  if (!src.marks.some((mk) => host.has(mk.start) || host.has(mk.end))) return src;
  return {
    ...src,
    marks: src.marks.map((mk) => ({ ...mk, start: host.get(mk.start) ?? mk.start, end: host.get(mk.end) ?? mk.end }))
  };
}
const ZERO_SPAN = { line: 0, offset: 0 };
function museJoin(text) {
  const parts = parseLyricLine(text, 1, ZERO_SPAN, void 0, "*").syllables;
  if (parts.length < 2) return text;
  return parts.map((p) => (p.leadingPunctuation ?? "") + p.text + (p.trailingPunctuation ?? "")).join("~");
}
const oneLine = (s) => s.split(/\r\n?|\n/).map((x) => x.trim()).filter(Boolean).join(" ");
class EmitterJcx extends AbcFamilyEmitter {
  /** Muse 3.1 以前的版本号；文件按 GBK 落盘（`jcxcodec.ts`），新旧版 Muse 都能开 */
  versionLine = "%MUSE2";
  /** 度数 → 字母（C=1）+ 八度：第 0 个八度大写、高一个八度小写，再往外用 `'` 与 `,`（与读入端 ABC 词法同口径）。 */
  noteText(n) {
    const d = n.degree;
    if (!d || d.number < 1) return "";
    const letter = LETTER_OF_DEGREE[d.number - 1] ?? "C";
    let s = d.accidental ? ACC_TEXT[d.accidental] ?? "" : "";
    const oct = d.octaveShift;
    s += oct >= 1 ? letter.toLowerCase() + "'".repeat(oct - 1) : letter + ",".repeat(-oct);
    return s;
  }
  /** `z`；不可见休止 Muse 写 `@`（它的 `x` 是节奏音符）。 */
  restText(ch) {
    return ch.printObject === false ? "@" : "z";
  }
  durationText(el) {
    return el.duration ? lengthSuffix(el.duration.divisions) : "";
  }
  tieText(ch) {
    return ch.notes.some((n) => n.tie?.start) ? "-" : "";
  }
  /** 节奏音符（有声无音高）：Muse 的 X 音符。 */
  rhythmText() {
    return "X";
  }
  chordGroupText(inner, noteCount) {
    return noteCount > 1 ? `[${inner}]` : inner;
  }
  tupletText(actual, normal) {
    return ABC_FIXED_TUPLET[actual] === normal ? `(${actual}` : `(${actual}:${normal}:${actual}`;
  }
  tupletCloses = false;
  /** 中文连写，拉丁词由基类补空格 */
  lyricSeparator = "";
  lyricSkip = "*";
  lyricSlotRule = "abc";
  /** Muse 没有 `{多字}` 与印刷段号；多字一音用 `~` 连，一字多音的延长位只能写 `*` */
  lyricStyle = {
    joinMulti: museJoin,
    labels: false,
    extend: "*"
  };
  /** 代码换行就是谱面换行（读入端同口径），所以写真换行；换页 Muse 没有记号，退成换行 */
  breakText() {
    return "\n";
  }
  trailingBreak = false;
  graceDurationText(ch) {
    return GRACE_LEN[ch.duration.type ?? "eighth"] ?? "";
  }
  /** 后倚音 `{@C}` */
  graceSlashText(ch) {
    return ch.grace?.after ? "@" : "";
  }
  /** 音符前引号里的字 Muse 一律印在音符上方（`"_…"` 才在下方），没有 ABC 的 `^` 前缀，写了会照印出来 */
  annotationText(word) {
    return `"${word.replace(/"/g, "'")}"`;
  }
  annotationBeforeChord = true;
  /** 渐强 `(<` … `<)`、渐弱 `(>` … `>)` */
  wedgeText(type, edge) {
    const c = type === "crescendo" ? "<" : ">";
    return edge === "start" ? `(${c}` : `${c})`;
  }
  /** Muse 的 `K:` 定的是调号（1 = 大调主音）：前置升降号形（`bE`，Muse 自己存出来就是这样），带调式时照 ABC 写 `Em`。 */
  keyValue(k) {
    if (k.spelling === "none") return "C";
    const mode = k.mode && k.mode !== "major" && k.mode !== "ionian" ? k.mode.slice(0, 3) : "";
    if (mode) return keySpelling(k, "mode") + (mode === "min" || mode === "aeo" ? "m" : mode);
    if (k.tonicDegree && k.tonicDegree !== "1") return keySpelling({ fifths: k.fifths });
    return keySpelling(k);
  }
  /** 正文**按声部分块**写（Muse 自己存出来就是这样）：`[V: n]` 一行，随后这个声部的各行音乐，各跟各的 `w:`。
   *  不照基类按第一声部切系统交错写——各声部在 Muse 里的断行各不相同，`w:` 又只对紧挨在前的那行，
   *  按第一声部切会把别的声部几行并成一行、几行词并成一条。 */
  bodyLines(song) {
    const L = [];
    song.parts.forEach((part, i) => {
      const ranges = systemRanges(part);
      const texts = this.partSystems(part, song, ranges, true);
      L.push(`[V: ${i + 1}]`);
      ranges.forEach((sys, r) => {
        if (!texts[r]) return;
        L.push(texts[r]);
        L.push(...lyricLines$1(part, this.lyricSeparator, this.lyricSkip, sys, this.lyricSlotRule, this.lyricStyle));
      });
    });
    return L;
  }
  /** 一首歌 → Muse 文本。MusicXML 形状的先投成简谱形状（时值换成以四分为 `SIMPLE_DIVISIONS` 的口径），再补度数。
   *  别的来源时值本就是这个口径，不投——投了长休止会拆成一串四分休止。 */
  emitSong(src) {
    const song = marksOffSustains(withDegrees$1(isXmlShaped(src) ? projectForJianpu(src) : src));
    const L = [];
    for (const d of song.museDirectives ?? []) L.push(`%%${oneLine(d)}`);
    L.push(`T:${oneLine(song.work.title ?? "")}`);
    for (const st of song.work.subtitles) L.push(`T:${oneLine(st)}`);
    for (const c of song.identification?.creators ?? []) if (oneLine(c.text)) L.push(`C:${oneLine(c.text)}`);
    for (const t2 of song.pageText?.topRight ?? []) if (oneLine(t2)) L.push(`C:${oneLine(t2)}`);
    for (const s of getMeta(song, "source")) L.push(`S:${oneLine(s)}`);
    for (const t2 of song.pageText?.topLeft ?? []) if (oneLine(t2)) L.push(`I:${oneLine(t2)}`);
    if (song.time) L.push(`M:${song.time.beats}/${song.time.beatType}`);
    L.push("L:1/8");
    for (const t2 of song.tempos ?? []) {
      if (typeof t2 !== "number") continue;
      const beat = song.tempoBeat ? `${song.tempoBeat.num}/${song.tempoBeat.den}` : "1/4";
      L.push(`Q:${beat}=${t2}`);
    }
    L.push(`K:${song.key ? this.keyValue(song.key) : "C"}`);
    song.parts.forEach((part, i) => {
      const a = ["style=jianpu"];
      if (part.name) a.push(`name="${part.name.replace(/"/g, "'")}"`);
      if (part.abbrev) a.push(`sname="${part.abbrev.replace(/"/g, "'")}"`);
      if (part.museAttrs) a.push(part.museAttrs);
      L.push(`V:${i + 1} ${a.join(" ")}`);
    });
    for (const r of song.remarks ?? []) {
      if (r.startsWith("P:")) continue;
      L.push("%%begintext", ...r.split(/\r\n?|\n/), "%%endtext");
    }
    L.push(...this.bodyLines(song));
    return L.join("\n");
  }
  /** 整份文档 → 文本。**Muse 一个文件一首**：多曲文档只写第一首（`capability.ts` 报 `multiSong` 丢失）。 */
  emitDoc(doc) {
    const first = doc.songs[0];
    const version = doc.sourceFormat === "jcx" && /^\s*%MUSE3/.test(doc.source ?? "") ? "%MUSE3" : this.versionLine;
    return [version, first ? this.emitSong(first) : "T:\nK:C"].join("\n") + "\n";
  }
}
const EMITTER_JCX = new EmitterJcx();
function emitJcx(doc) {
  return EMITTER_JCX.emitDoc(doc);
}
const TOMATO = {
  id: "tomato",
  name: "番茄简谱",
  shortName: "番茄",
  octaveUp: "'",
  octaveDown: ",",
  accidentals: { "#": "sharp", $: "flat", "=": "natural" },
  rhythmToken: "9",
  nineIsRhythm: true,
  lyricSkip: ["@"],
  // `||/` 必须排在 `||` 之前，否则永远匹配不到两边细双线。
  barlines: [
    [":|:", "repeat-both"],
    [":||", "repeat-end"],
    ["||/", "double"],
    ["|:", "repeat-start"],
    [":|", "repeat-end"],
    ["||", "end"],
    ["|/", "hidden"],
    ["|*", "invisible"],
    ["|", "normal"]
  ],
  wordSeparator: "/",
  joinToken: "~",
  header: {
    versionLine: "V:1.0",
    // 与 D:/P: 一同构成 sniffDialect 的番茄特征
    titleField: "B",
    creditField: "Z",
    tempoField: "J",
    keyMeter: "split",
    keyField: "D",
    meterField: "P",
    keyStyle: "prefix"
  },
  emit: {
    tokenGap: " ",
    blankBetweenGroups: true,
    voltaCloseAfterBarline: false,
    voltaLeadBarline: false,
    voltaOpenEnd: "start",
    labelWrap: ['"', '"'],
    pageFields: false
  }
};
const SHIGE = {
  id: "shige",
  name: "诗歌本文本谱",
  shortName: "诗歌本",
  octaveUp: "g",
  octaveDown: "d",
  accidentals: {
    "#": "sharp",
    "♯": "sharp",
    // ♯
    b: "flat",
    "♭": "flat",
    // ♭
    "♮": "natural",
    // ♮
    "𝄪": "double-sharp",
    // 𝄪
    "𝄫": "double-flat"
    // 𝄫
  },
  rhythmToken: "X",
  nineIsRhythm: false,
  // 规范里的占位符是 `/`（写出去用它）；`@` 是实际谱面里也见得到的写法，只认不写。
  lyricSkip: ["/", "@"],
  // 诗歌本的小节线是 `| || ||| |: :| :|:`：`|||` 才是左细右粗的终止线。
  barlines: [
    [":|:", "repeat-both"],
    ["|||", "end"],
    // 规范未列 `||/`，但实际谱面里大量使用（沿用番茄的「两边细双线」）。
    ["||/", "double"],
    ["|:", "repeat-start"],
    [":|", "repeat-end"],
    ["||", "double"],
    ["|/", "hidden"],
    ["|*", "invisible"],
    ["|", "normal"]
  ],
  wordSeparator: " ",
  header: {
    titleField: "T",
    indexFields: { left: "XL", right: "XR" },
    creditField: "Z",
    tempoField: "J",
    keyMeter: "combined",
    // 诗歌本把调号与拍号写在一行：`1=G4/4`
    keyStyle: "suffix"
  },
  emit: {
    tokenGap: "",
    blankBetweenGroups: false,
    voltaCloseAfterBarline: true,
    voltaLeadBarline: true,
    voltaOpenEnd: "end",
    labelWrap: ["<", ">"],
    hiddenRestNoLyric: "9",
    pageFields: true
  }
};
const DIALECTS = { tomato: TOMATO, shige: SHIGE };
function dialectSpec(d) {
  return DIALECTS[d];
}
const TOMATO_KEYS = /^\s*(V|B|D|P)\s*:/;
const SHIGE_KEYS = /^\s*(T|XL|XR|TL|TR|BL|BC|BR|FontSize|Margin)\s*:/i;
const SHIGE_KEY_METER = /^\s*1\s*=/;
function sniffDialect(text) {
  let tomato = 0;
  let shige = 0;
  let hasBody = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    if (TOMATO_KEYS.test(line)) tomato++;
    if (SHIGE_KEYS.test(line)) shige++;
    if (SHIGE_KEY_METER.test(line)) shige += 2;
    if (/^\s*[QCW]\d*\s*[<"]?/.test(line) && /^\s*[QCW]\d*(?:"[^"]*"|<[^>]*>)?\s*:/.test(line)) {
      hasBody = true;
    }
  }
  if (tomato === 0 && shige === 0) {
    return {
      dialect: null,
      reason: hasBody ? t("sniff.noHeader") : t("sniff.notPu")
    };
  }
  if (tomato > shige) return { dialect: "tomato", reason: t("sniff.tomato", { n: tomato }) };
  if (shige > tomato) return { dialect: "shige", reason: t("sniff.shige", { n: shige }) };
  return { dialect: "tomato", reason: t("sniff.tie") };
}
const GlyphCodes = {
  // Repeats / navigation
  segno: String.fromCharCode(57415),
  coda: String.fromCharCode(57416)
};
function isPhraseChord(e) {
  return "notes" in e && "slurEnds" in e;
}
function chordsOf$1(m) {
  return m.entries.filter(isPhraseChord);
}
const SECTION_WORD_RE = /^(intro|verse|chorus|pre-?chorus|bridge|coda|outro|ending|interlude|solo|refrain|tag|前奏|主歌|副歌|间奏|尾奏|尾声|桥段|插曲)\s*\d*$/i;
var BarStyle = /* @__PURE__ */ ((BarStyle2) => {
  BarStyle2["REGULAR"] = "regular";
  BarStyle2["DOTTED"] = "dotted";
  BarStyle2["DASHED"] = "dashed";
  BarStyle2["HEAVY"] = "heavy";
  BarStyle2["LIGHT_LIGHT"] = "light-light";
  BarStyle2["LIGHT_HEAVY"] = "light-heavy";
  BarStyle2["HEAVY_LIGHT"] = "heavy-light";
  BarStyle2["HEAVY_HEAVY"] = "heavy-heavy";
  BarStyle2["TICK"] = "tick";
  BarStyle2["SHORT"] = "short";
  BarStyle2["NONE"] = "none";
  return BarStyle2;
})(BarStyle || {});
var StartStopDiscontinue = /* @__PURE__ */ ((StartStopDiscontinue2) => {
  StartStopDiscontinue2["START"] = "start";
  StartStopDiscontinue2["STOP"] = "stop";
  StartStopDiscontinue2["DISCONTINUE"] = "discontinue";
  return StartStopDiscontinue2;
})(StartStopDiscontinue || {});
var PlaySpecKind = /* @__PURE__ */ ((PlaySpecKind2) => {
  PlaySpecKind2[PlaySpecKind2["Dacapo"] = 0] = "Dacapo";
  PlaySpecKind2[PlaySpecKind2["DalSegno"] = 1] = "DalSegno";
  PlaySpecKind2[PlaySpecKind2["ToCoda"] = 2] = "ToCoda";
  PlaySpecKind2[PlaySpecKind2["Fine"] = 3] = "Fine";
  return PlaySpecKind2;
})(PlaySpecKind || {});
class JumpSpec {
  constructor(kind) {
    this.kind = kind;
  }
  value = null;
}
class TimePosition {
  mid = 0;
  pass = 0;
  offset = new Fraction(0);
  constructor(m, t2) {
    if (m !== void 0 && t2 !== void 0) {
      if (m < 0) throw new Error("");
      this.mid = m;
      this.offset = t2;
    }
  }
  compareTo(a) {
    const diff = this.mid - a.mid;
    if (diff !== 0) return diff;
    return this.offset.minus(a.offset).compareTo(new Fraction(0));
  }
}
class PlayItem extends TimePosition {
  end = 0;
  endOfPass = false;
  /** 首小节要跳过的和弦个数（弱起式接入，`.Repeat` 里写作 `11.2-20V4`）。 */
  skip = 0;
  /** 末小节只取前这么多个和弦（-1 = 整节，`.Repeat` 里写作 `11.1-11.1V1`）。 */
  limit = -1;
  clone() {
    const p = new PlayItem();
    p.mid = this.mid;
    p.pass = this.pass;
    p.offset = this.offset;
    p.end = this.end;
    p.endOfPass = this.endOfPass;
    p.skip = this.skip;
    p.limit = this.limit;
    return p;
  }
}
class PlayData {
  coda = /* @__PURE__ */ new Map();
  segno = /* @__PURE__ */ new Map();
  jumpTo = /* @__PURE__ */ new Map();
  measures = [];
  hasRepeat = false;
  isSimpple = false;
  // no repeat, only multiple verse
  /** 谱面速度（♩= 每分钟拍数）。0 = 未标注，试听/导出用 timeline.ts 的默认值。
   *  来源：MusicXML `<sound tempo>` / OMR 页眉的 `♩=76` / .jpwabc `.Title` 的 `Tempo`。 */
  tempo = 0;
  get noRepeat() {
    if (this.hasRepeat) return false;
    if (this.coda.size > 0 || this.segno.size > 0) return false;
    if (this.jumpTo.size > 0) return false;
    return true;
  }
}
function isPlayChord(e) {
  return "notes" in e && "slurEnds" in e;
}
function playOrderOf(parts, jumps) {
  const rep = new RepeatProcessor(parts, jumps);
  const pos = new TimePosition();
  pos.pass = 1;
  const measures = parts[0].measures;
  while (pos.mid < measures.length) {
    const end = rep.process(pos);
    if (end) break;
    if (pos.pass > 10) break;
    if (rep.result.length > 20) break;
  }
  let repeatByVerse = true;
  for (const m of rep.result) {
    const mea = measures[m.end - 1];
    let repStart = m.mid;
    for (let mid = m.mid; mid < m.end; mid++) {
      if (measures[mid].repeatForward) repStart = mid;
    }
    if (!mea.repeatBackward) continue;
    const verseCnt = rep.getPassCountByLrc(repStart, m.end);
    if (verseCnt > 1) repeatByVerse = false;
  }
  let hasVolta = false;
  for (const m of measures) {
    if (m.endingNum && [...m.endingNum].some((n) => n > 1)) hasVolta = true;
  }
  const hasJump = jumps.jumpTo.size > 0;
  const isSimple = rep.result.length === 1;
  if (repeatByVerse && !hasVolta && !hasJump) rep.repeatByLyric();
  const out = expandVoltaByVerse(parts[0], rep.result) ?? rep.result;
  return { measures: out, isSimple, hasRepeat: measures.some((m) => m.repeatBackward) };
}
function playOrderByVerses(measureCount, passes) {
  const out = [];
  for (let p = 0; p < passes; p++) {
    const item = new PlayItem();
    item.pass = p + 1;
    item.mid = 0;
    item.end = measureCount;
    out.push(item);
  }
  return out;
}
function playOrderFromSpec(repeat, part0) {
  const out = [];
  for (const it of repeat.items) {
    const pit = new PlayItem();
    pit.mid = it.first;
    pit.end = it.last + 1;
    pit.pass = it.verse;
    pit.skip = it.skip;
    pit.limit = it.limit;
    pit.endOfPass = it.page;
    const mea = part0?.measures[it.first];
    if (it.skip > 0 && mea) pit.offset = skipOffset(mea, it.skip);
    out.push(pit);
  }
  return out;
}
function verseCount(part, beg, end) {
  const num = /* @__PURE__ */ new Set();
  part.measures.forEach((m, idx) => {
    if (idx < beg || idx >= end) return;
    for (const ent of m.entries) {
      if (!isPlayChord(ent)) continue;
      for (const n of ent.notes) for (const l of n.lyrics) num.add(l.number);
    }
  });
  return num.size;
}
function expandVoltaByVerse(part, items) {
  const measures = part.measures;
  if (items.length === 0) return null;
  let backIdx = -1;
  for (let i = 0; i < measures.length; i++) {
    if (!measures[i].repeatBackward) continue;
    if (backIdx >= 0) return null;
    backIdx = i;
  }
  if (backIdx < 0) return null;
  const volta1End = backIdx + 1;
  if (measures[backIdx].endingRight === null) return null;
  let volta1Beg = -1;
  for (let i = backIdx; i >= 0; i--) {
    if (measures[i].endingLeft) {
      volta1Beg = i;
      break;
    }
  }
  if (volta1Beg < 0) return null;
  const tailBeg = volta1End;
  if (tailBeg >= measures.length || !measures[tailBeg].endingLeft) return null;
  let repStart = 0;
  for (let i = 0; i < volta1Beg; i++) if (measures[i].repeatForward) repStart = i;
  if (repStart >= volta1Beg) return null;
  const verses = verseCount(part, 0, measures.length);
  let maxPass = 0;
  for (const it of items) if (it.pass > maxPass) maxPass = it.pass;
  if (verses <= maxPass) return null;
  if (verseCount(part, volta1Beg, volta1End) !== 1) return null;
  const tailVerses = verseCount(part, tailBeg, measures.length);
  const out = [];
  const push2 = (mid, end, pass) => {
    const p = new PlayItem();
    p.mid = mid;
    p.end = end;
    p.pass = pass;
    out.push(p);
    return p;
  };
  const lead = voltaLead(measures, volta1Beg, volta1End, tailBeg);
  const tailStart = (p) => {
    p.skip = lead;
    if (lead > 0) p.offset = skipOffset(measures[tailBeg], lead);
  };
  push2(repStart, volta1End, 1).endOfPass = true;
  for (let k = 2; k <= verses; k++) {
    push2(repStart, volta1Beg, k);
    const tv = k - 1;
    if (tv <= tailVerses && lead > 0) push2(tailBeg, tailBeg + 1, tv).limit = lead;
    out[out.length - 1].endOfPass = true;
    if (tv <= tailVerses) {
      const p = push2(tailBeg, measures.length, tv);
      tailStart(p);
      p.endOfPass = true;
    }
  }
  for (let v = verses; v <= tailVerses; v++) {
    const p = push2(tailBeg, measures.length, v);
    tailStart(p);
    p.endOfPass = true;
  }
  out[out.length - 1].endOfPass = false;
  return out;
}
class RepeatProcessor {
  constructor(parts, jumps) {
    this.parts = parts;
    this.jumps = jumps;
  }
  inEnding = false;
  endingActive = false;
  loopStart = 0;
  passCount = -1;
  inJump = false;
  /** 本小节的 D.C./D.S. 被当作「房内回头记号」处理过（见 play()）：外层据此跳过收房/反复判定。 */
  loopedBack = false;
  result = [];
  doJump(m, t2) {
    this.inJump = true;
    m.mid = t2.mid;
    const cur = new PlayItem();
    cur.pass = m.pass;
    cur.mid = t2.mid;
    cur.end = t2.mid + 1;
    cur.offset = t2.offset;
    this.result.push(cur);
  }
  play(m) {
    const p0 = this.parts[0];
    const mid = m.mid;
    const mea = p0.measures[mid];
    const tbeg = new TimePosition(mid, new Fraction(0));
    const tend = new TimePosition(mid, mea.duration);
    let res = false;
    let seg = null;
    let tocoda = null;
    let dacapo = false;
    for (const [t2, v] of this.jumps.jumpTo) {
      if (t2.compareTo(tbeg) < 0) continue;
      if (t2.compareTo(tend) > 0) continue;
      if (!this.inJump && v.kind === 1) seg = v.value;
      if (!this.inJump && v.kind === 0) dacapo = true;
      if (this.inJump && v.kind === 2) tocoda = v.value;
      if (this.inJump && v.kind === 3) res = true;
    }
    let newItem = false;
    if (this.result.length === 0) {
      newItem = true;
    } else {
      const last = this.result[this.result.length - 1];
      if (mid !== last.end || m.pass !== last.pass) newItem = true;
      else last.end += 1;
    }
    if (newItem) {
      const cur = new PlayItem();
      cur.pass = m.pass;
      cur.mid = mid;
      cur.end = mid + 1;
      this.result.push(cur);
    }
    if (seg !== null) {
      let t2 = this.jumps.segno.get(seg);
      if (t2 === void 0) t2 = new TimePosition(parseInt(seg, 10) - 1, new Fraction(0));
      this.doJump(m, t2);
    }
    if (tocoda !== null) {
      let t2 = this.jumps.coda.get(tocoda);
      if (t2 === void 0) t2 = new TimePosition(parseInt(tocoda, 10) - 1, new Fraction(0));
      this.doJump(m, t2);
      this.inJump = false;
    }
    if (dacapo && !this.inEnding && mea.repeatBackward) {
      if (this.passCount < 0) {
        this.passCount = this.getPassCountByLrc(this.loopStart, mid + 1);
        if (this.passCount <= 1) this.passCount = 2;
      }
      if (m.pass < this.passCount) dacapo = false;
    }
    if (dacapo) {
      const insideVolta = this.inEnding && m.pass < this.passCount;
      m.pass++;
      m.mid = -1;
      if (insideVolta) {
        this.loopedBack = true;
        this.inEnding = false;
        this.endingActive = false;
      } else {
        this.inJump = true;
      }
    }
    return res;
  }
  getPassCountByEnding(mid) {
    let res = 0;
    const meas = this.parts[0].measures;
    let idx = mid;
    while (idx < meas.length) {
      const mif = meas[idx++];
      const nums = mif.endingNum;
      if (!nums) continue;
      for (const n of nums) if (n > res) res = n;
      if (mif.endingRight === StartStopDiscontinue.DISCONTINUE) break;
    }
    return res;
  }
  onStartEnding(mif, pass) {
    if (this.inJump) return;
    this.inEnding = true;
    this.endingActive = mif.endingNum?.has(pass) === true;
  }
  onRightEnding(m, resetPass) {
    if (this.inJump) return;
    this.endingActive = false;
    this.inEnding = false;
    if (resetPass) {
      m.pass = 1;
      this.passCount = -1;
    }
  }
  onForward(mid, pass) {
    if (this.inJump) return;
    if (pass > 1) return;
    this.loopStart = mid;
  }
  onBackward(m, mif) {
    if (this.inJump) return;
    if (m.pass < this.passCount) {
      m.mid = this.loopStart;
      m.pass++;
    } else {
      m.mid++;
      if (mif.endingRight === null) m.pass = 1;
    }
  }
  update(m) {
    let active = true;
    if (this.inEnding) active = this.endingActive;
    if (active) return this.play(m);
    return false;
  }
  getPassCountByLrcAll() {
    const meas = this.parts[0].measures;
    return this.getPassCountByLrc(0, meas.length);
  }
  /** 段数取各声部的最大值：合唱谱的歌词常只挂在某一个声部上（圣哉三一歌挂在 Q2）。 */
  getPassCountByLrc(beg, end) {
    return Math.max(0, ...this.parts.map((p) => verseCount(p, beg, end)));
  }
  process(m) {
    const p0 = this.parts[0];
    if (m.mid < 0) throw new Error("");
    const mif = p0.measures[m.mid];
    if (mif.endingLeft) {
      if (this.passCount < 0) this.passCount = this.getPassCountByEnding(m.mid);
      this.onStartEnding(mif, m.pass);
    }
    if (mif.repeatForward) this.onForward(m.mid, m.pass);
    const skippedEnding = this.inEnding && !this.endingActive;
    const fine = this.update(m);
    if (fine) return true;
    if (this.loopedBack) {
      this.loopedBack = false;
      m.mid++;
      return m.mid === p0.measures.length;
    }
    if (mif.endingRight !== null) {
      const lastVolta = !mif.endingNum || Math.max(...mif.endingNum) >= this.passCount;
      const closesRepeatGroup = !mif.repeatBackward && lastVolta;
      this.onRightEnding(m, mif.endingRight === StartStopDiscontinue.DISCONTINUE || closesRepeatGroup);
    }
    if (!this.inJump && mif.repeatBackward && !skippedEnding) {
      if (this.passCount < 0) {
        const beg = this.result[this.result.length - 1].mid;
        this.passCount = this.getPassCountByLrc(beg, m.mid + 1);
        if (this.passCount <= 1) this.passCount = 2;
      }
      this.onBackward(m, mif);
    } else {
      m.mid++;
    }
    if (m.mid < 0) {
      console.error("BAD Repeat Info");
      return true;
    }
    return m.mid === p0.measures.length;
  }
  repeatByLyric() {
    const pass = this.getPassCountByLrcAll();
    if (pass <= 1) return false;
    const itemCnt = this.result.length;
    let cur = 1;
    for (let i = 1; i < pass; i++) {
      cur++;
      for (let idx = 0; idx < itemCnt; idx++) {
        const it = this.result[idx].clone();
        it.pass = cur;
        this.result.push(it);
      }
      this.result[this.result.length - 1].endOfPass = true;
    }
    return true;
  }
}
function skipOffset(m, skip) {
  let n = 0;
  for (const ent of m.entries) {
    if (!isPlayChord(ent)) continue;
    if (n === skip) return ent.position;
    n++;
  }
  return new Fraction(0);
}
function chordsOf(m) {
  return m.entries.filter(isPlayChord);
}
function voltaLead(measures, volta1Beg, volta1End, tailBeg) {
  let n = 0;
  for (let i = volta1Beg; i < volta1End; i++) n += chordsOf(measures[i]).length;
  const tail = chordsOf(measures[tailBeg]);
  n = Math.min(n, tail.length - 1);
  if (n <= 0) return 0;
  for (let i = 0; i < n; i++) {
    const c = tail[i];
    if (c.slurStart || c.slurEnds > 0) return 0;
    if (c.notes.some((nt) => nt.tieStart || nt.tieEnd)) return 0;
  }
  return n;
}
class RepeatSpecItem {
  constructor(first, last, verse, skip = 0, page = false, limit = -1) {
    this.first = first;
    this.last = last;
    this.verse = verse;
    this.skip = skip;
    this.page = page;
    this.limit = limit;
  }
  toString() {
    const head = this.skip > 0 ? `${this.first}.${this.skip + 1}` : `${this.first}`;
    const tail = this.limit >= 0 ? `${this.last}.${this.limit}` : `${this.last}`;
    return `${head}-${tail}V${this.verse}${this.page ? "P" : ""}`;
  }
}
const TYPE_BEATS = {
  whole: [4, 0],
  half: [2, 0],
  quarter: [1, 0],
  eighth: [1, 1],
  "16th": [1, 2],
  "32nd": [1, 3],
  "64th": [1, 4]
};
function distinctNumbers(lyrics) {
  const used = /* @__PURE__ */ new Set();
  let max = 0;
  return lyrics.map((l) => {
    const number = used.has(l.number) ? max + 1 : l.number;
    used.add(number);
    max = Math.max(max, number);
    return number === l.number ? l : { ...l, number };
  });
}
function phrasePartOfDoc(song, partIndex = 0, distinctLyrics = false) {
  const part = song.parts[partIndex];
  const idOf = /* @__PURE__ */ new Map();
  if (!part) return { part: { measures: [] }, idOf };
  const div = part.measures[0]?.attrs?.divisions ?? 1;
  const slurStarts = /* @__PURE__ */ new Set();
  const slurEnds = /* @__PURE__ */ new Map();
  for (const mk of song.marks) {
    if (mk.type !== "slur") continue;
    slurStarts.add(mk.start);
    slurEnds.set(mk.end, (slurEnds.get(mk.end) ?? 0) + 1);
  }
  const measures = [];
  let at = new Fraction(0);
  let time = { beats: 4, beatType: 4 };
  for (const m of part.measures) {
    if (m.attrs?.time) time = { beats: m.attrs.time.beats, beatType: m.attrs.time.beatType };
    const out = measureOf(m, at, div, slurStarts, slurEnds, idOf, time);
    measures.push(out);
    at = at.plus(measureEnd(m, div));
  }
  if (distinctLyrics) for (const m of measures) for (const ch of m.entries) for (const n of ch.notes) n.lyrics = distinctNumbers(n.lyrics);
  findRefrain(measures);
  return { part: { measures }, idOf };
}
function onsets(m) {
  const pos = /* @__PURE__ */ new Map();
  const out = /* @__PURE__ */ new Map();
  for (const el of m.elements) {
    if (el.kind !== "chord") continue;
    const p = pos.get(el.voice) ?? 0;
    out.set(el, p);
    if (!el.grace) pos.set(el.voice, p + el.duration.divisions);
  }
  return out;
}
function measureEnd(m, div) {
  const at = onsets(m);
  for (let i = m.elements.length - 1; i >= 0; i--) {
    const el = m.elements[i];
    if (el.kind !== "chord" || el.grace) continue;
    return new Fraction(at.get(el) + el.duration.divisions).divInt(div);
  }
  return new Fraction(0);
}
function measureOf(m, position, div, slurStarts, slurEnds, idOf, time) {
  const out = {
    entries: [],
    barline: null,
    repeatBackward: false,
    repeatForward: false,
    keyChange: m.attrs?.key !== void 0,
    endingLeft: false,
    endingNum: null,
    endingRight: null,
    sectionMark: null,
    time,
    position,
    get duration() {
      const last = this.entries[this.entries.length - 1];
      if (!last) throw new Error("measure has no chord");
      return last.position.plus(last.duration);
    }
  };
  for (const b of m.barlines ?? []) {
    if (b.style !== void 0 && b.location !== "left") out.barline = b.style;
    if (b.repeat === "backward") out.repeatBackward = true;
    else if (b.repeat === "forward") out.repeatForward = true;
    if (b.ending) {
      if (b.location === "left") {
        out.endingLeft = true;
        const digits = b.ending.text?.match(/\d+/g);
        out.endingNum = new Set(digits ? digits.map((d) => parseInt(d, 10)) : b.ending.numbers);
      } else out.endingRight = b.ending.type;
    }
  }
  for (const d of m.directions ?? []) {
    const t2 = (d.text ?? "").trim();
    if (!t2) continue;
    if (d.type === "rehearsal" || d.type === "words" && SECTION_WORD_RE.test(t2)) out.sectionMark = t2;
  }
  const at = onsets(m);
  for (const el of m.elements) {
    if (el.kind !== "chord" || el.grace || el.voice > 1) continue;
    const ch = chordOf(el, at.get(el), div, slurStarts, slurEnds);
    out.entries.push(ch);
    idOf.set(ch, el.id);
  }
  return out;
}
function chordOf(el, onset, div, slurStarts, slurEnds) {
  const rest = el.rest !== void 0;
  const dot = el.duration.dots > 0 ? 1 : 0;
  let beats = 0;
  let beams = 0;
  const type = el.duration.type;
  if (type === void 0) {
    if (rest) beats = 4;
  } else {
    const bb = TYPE_BEATS[type];
    if (!bb) throw new Error("bad note type " + type);
    [beats, beams] = bb;
    if (dot === 1 && beats > 1) beats = beats * 3 / 2;
  }
  const top = rest ? void 0 : topNote(el);
  const lyrics = (el.lyrics ?? []).filter((l) => l.text.length > 0).map((l) => ({ text: l.text, number: l.number, refrain: l.refrain ?? false }));
  const note = {
    number: top?.degree ? String(top.degree.number) : "0",
    jpOctave: top?.degree?.octaveShift ?? 0,
    pitch: top?.pitch ? midiPitch(top.pitch) : 0,
    tieStart: top?.tie?.start ?? false,
    tieEnd: top?.tie?.stop ?? false,
    lyrics
  };
  if (note.tieEnd) note.tieStop = true;
  return {
    notes: [note],
    rest,
    beats,
    beams,
    dot,
    duration: new Fraction(el.duration.divisions).divInt(div),
    position: new Fraction(onset).divInt(div),
    fermata: el.notations?.fermata ?? false,
    slurStart: slurStarts.has(el.id),
    slurEnds: slurEnds.get(el.id) ?? 0,
    id: el.id
  };
}
function findRefrain(measures) {
  const countInf = /* @__PURE__ */ new Map();
  let inEnding = false;
  for (const m of measures) {
    if (m.endingLeft) inEnding = true;
    for (const ch of m.entries) {
      if (inEnding) continue;
      let cnt = 0;
      for (const n of ch.notes) for (const l of n.lyrics) if (l.text.length > 0) cnt++;
      if (cnt === 0) continue;
      const pos = m.position.plus(ch.position);
      const key = pos.toString();
      const prev = countInf.get(key);
      countInf.set(key, { pos, n: (prev?.n ?? 0) + cnt });
    }
    if (m.endingRight !== null) inEnding = false;
  }
  const entries = [...countInf.values()].sort((a, b) => a.pos.compareTo(b.pos));
  let refrainPos = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].n === 1) refrainPos = entries[i].pos;
    else if (entries[i].n > 1) break;
  }
  if (!refrainPos) return;
  for (const m of measures) {
    const last = m.entries[m.entries.length - 1];
    if (!last) continue;
    const end = m.position.plus(last.position.plus(last.duration));
    if (end.compareTo(refrainPos) <= 0) continue;
    for (const ch of m.entries) {
      const pos = m.position.plus(ch.position);
      if (pos.compareTo(refrainPos) < 0) continue;
      for (const n of ch.notes) for (const l of n.lyrics) l.refrain = true;
    }
  }
}
function playDataOfDoc(song, { lead = 0, distinct = false } = {}) {
  const pd = new PlayData();
  const part = song.parts[0];
  if (!part) throw new Error("no part");
  const div = part.measures[0]?.attrs?.divisions ?? 1;
  part.measures.forEach((m, mid) => {
    for (const d of m.directions ?? []) if (d.sound) addSound(pd, d, new TimePosition(mid, cursorAt(m, d).divInt(div)));
  });
  const order = playOrderOf([phrasePartOfDoc(song, lead, distinct).part], pd);
  pd.isSimpple = order.isSimple;
  pd.measures = order.measures;
  pd.hasRepeat = order.hasRepeat;
  return pd;
}
function cursorAt(m, d) {
  const pos = /* @__PURE__ */ new Map();
  let end = 0;
  const n = Math.min(d.afterElements ?? 0, m.elements.length);
  for (let i = 0; i < n; i++) {
    const el = m.elements[i];
    if (el.kind !== "chord" || el.grace) continue;
    const p = pos.get(el.voice) ?? 0;
    end = p + el.duration.divisions;
    pos.set(el.voice, end);
  }
  return new Fraction(end);
}
function addSound(pd, d, tick) {
  const s = d.sound;
  if (s.coda) pd.coda.set(s.coda, tick);
  if (s.segno) pd.segno.set(s.segno, tick);
  if (s.dacapo) pd.jumpTo.set(tick, new JumpSpec(PlaySpecKind.Dacapo));
  if (s.fine) pd.jumpTo.set(tick, new JumpSpec(PlaySpecKind.Fine));
  if (s.dalsegno) {
    const j = new JumpSpec(PlaySpecKind.DalSegno);
    j.value = s.dalsegno;
    pd.jumpTo.set(tick, j);
  }
  if (s.tocoda) {
    const j = new JumpSpec(PlaySpecKind.ToCoda);
    j.value = s.tocoda;
    pd.jumpTo.set(tick, j);
  }
}
function tempoOfDoc(song) {
  for (const m of song.parts[0]?.measures ?? []) {
    for (const d of m.directions ?? []) {
      const t2 = d.sound?.tempo;
      if (t2 !== void 0 && t2 >= 20 && t2 <= 400) return Math.round(t2);
    }
  }
  return 0;
}
function jpAlterOfAccidental(acc) {
  switch (acc) {
    case "sharp":
    case "double-sharp":
      return "#";
    case "flat":
    case "double-flat":
      return "b";
    case "natural":
      return "n";
    default:
      return " ";
  }
}
const pitchIn = (n, rest) => ({
  number: rest || !n?.degree ? "0" : String(n.degree.number),
  jpOctave: n?.degree?.octaveShift ?? 0,
  jpAlter: rest ? " " : jpAlterOfAccidental(n?.degree?.accidental)
});
function jpwInputOfDoc(song) {
  const playData = playDataOfDoc(song);
  playData.tempo = tempoOfDoc(song);
  const part = song.parts[0];
  const view = phrasePartOfDoc(song);
  const div = part.measures[0]?.attrs?.divisions ?? 1;
  const tieStarts = /* @__PURE__ */ new Set();
  const tieEnds = /* @__PURE__ */ new Set();
  const tupStarts = /* @__PURE__ */ new Set();
  const tupEnds = /* @__PURE__ */ new Set();
  for (const mk of song.marks) {
    if (mk.type === "tied") {
      tieStarts.add(mk.start);
      tieEnds.add(mk.end);
    }
    if (mk.type === "tuplet") {
      tupStarts.add(mk.start);
      tupEnds.add(mk.end);
    }
  }
  const graces = /* @__PURE__ */ new Map();
  let pending = [];
  for (const m of part.measures) {
    for (const el of m.elements) {
      if (el.kind !== "chord") continue;
      if (el.grace) {
        for (const n of el.notes) pending.push(pitchIn(n, false));
        if (el.notes.length === 0) pending.push(pitchIn(void 0, true));
        continue;
      }
      if (pending.length) {
        graces.set(el, pending);
        pending = [];
      }
    }
  }
  let fifths = 0;
  let time = { beats: 4, beatType: 4 };
  const measures = part.measures.map((m, mid) => {
    const out = view.part.measures[mid];
    const byId = /* @__PURE__ */ new Map();
    for (const el of m.elements) if (el.kind === "chord") byId.set(el.id, el);
    const entries = [];
    for (const b of m.barlines ?? []) if (b.location === "left" && b.style !== void 0) entries.push(barlineAt(b, new Fraction(0)));
    const at = cursorEnds(m, div);
    let middle = (m.barlines ?? []).filter((b) => b.location === "middle" && b.style !== void 0);
    for (const ch of out.entries) {
      const el = byId.get(view.idOf.get(ch));
      const index = m.elements.indexOf(el);
      for (const b of middle.filter((b2) => (b2.afterElements ?? 0) <= index)) entries.push(barlineAt(b, at[b.afterElements ?? 0]));
      middle = middle.filter((b) => (b.afterElements ?? 0) > index);
      const rest = ch.rest;
      const top = rest ? void 0 : topNote(el);
      const chord = {
        notes: [{
          ...pitchIn(top, rest),
          number: ch.notes[0].number,
          jpOctave: ch.notes[0].jpOctave,
          tieStart: tieStarts.has(el.id),
          tieEnd: tieEnds.has(el.id),
          tupletBegin: tupStarts.has(el.id),
          tupletEnd: tupEnds.has(el.id),
          lyrics: ch.notes[0].lyrics
        }],
        rest,
        dot: ch.dot,
        beats: ch.beats,
        beams: ch.beams,
        slurStart: ch.slurStart,
        slurEnds: ch.slurEnds,
        fermata: ch.fermata,
        graceNotes: graces.get(el) ?? []
      };
      entries.push(chord);
    }
    for (const b of middle) entries.push(barlineAt(b, at[Math.min(b.afterElements ?? 0, m.elements.length)]));
    for (const b of m.barlines ?? []) if (b.location === "right" && b.style !== void 0) entries.push(barlineAt(b, at[m.elements.length]));
    const keyChange = m.attrs?.key !== void 0;
    if (m.attrs?.key) fifths = m.attrs.key.fifths;
    const timeChange = m.attrs?.time !== void 0;
    if (m.attrs?.time) time = { beats: m.attrs.time.beats, beatType: m.attrs.time.beatType };
    const key = new Key();
    key.fifths = fifths;
    return {
      entries,
      newSystem: !!(m.print?.newSystem || m.print?.newPage),
      newPage: !!m.print?.newPage,
      repeatForward: out.repeatForward,
      repeatBackward: out.repeatBackward,
      endingLeft: out.endingLeft,
      endingNum: out.endingNum,
      timeChange,
      keyChange,
      time,
      key: { fifths, name: key.name },
      barline: out.barline
    };
  });
  const credits = (song.credits ?? []).map((c) => ({
    type: c.type ?? null,
    // 逐个 `<credit-words>` 去首尾空白、丢空的再用换行接；模型里已接成一段，分不出元素边界，
    // 只能去整段首尾空白、丢纯空白行（元素内部换行两侧的空格留着，同原文）
    text: c.text.split("\n").filter((t2) => t2.trim().length > 0).join("\n").trim(),
    page: (c.page ?? 1) - 1,
    first: c.text.split("\n")[0].trim()
  }));
  const title = credits.find((c) => c.type === "title" && c.first)?.first ?? song.work.title?.trim() ?? "";
  for (const c of credits) if (c.type === null && c.text === title) c.type = "title";
  return {
    title,
    credit: credits.map(({ type, text, page }) => ({ type, text, page })),
    parts: [{ measures }],
    playData
  };
}
const barlineAt = (b, position) => ({
  style: b.style ?? null,
  repeat: null,
  position
});
function cursorEnds(m, div) {
  const pos = /* @__PURE__ */ new Map();
  const out = [new Fraction(0)];
  let end = 0;
  for (const el of m.elements) {
    if (el.kind === "chord" && !el.grace) {
      const p = pos.get(el.voice) ?? 0;
      end = p + el.duration.divisions;
      pos.set(el.voice, end);
    }
    out.push(new Fraction(end).divInt(div));
  }
  return out;
}
const ZERO = { line: 0, column: 0, offset: 0, length: 0 };
function puBarlineType(b) {
  if (b.repeat === "forward") return "repeat-start";
  if (b.repeat === "backward") return b.alsoForward ? "repeat-both" : "repeat-end";
  switch (b.style) {
    case "none":
      return b.noWidth ? "hidden" : "invisible";
    case "light-light":
      return "double";
    case "light-heavy":
      return "end";
    case "heavy-light":
      return "double";
    case "dotted":
      return "hidden";
    default:
      return "normal";
  }
}
const puOrnaments = (os) => (os ?? []).map((o) => ({ name: o.name, level: o.level, source: ZERO }));
function chordOrnaments(ch) {
  if (ch.ornaments) return puOrnaments(ch.ornaments);
  const out = [];
  const add = (name) => {
    if (!out.some((o) => o.name === name)) out.push({ name, level: 0, source: ZERO });
  };
  if (ch.notations?.fermata) add("yc");
  for (const a of ch.notations?.articulations ?? []) add(decoKey(a) ?? a);
  for (const o of ch.notations?.ornaments ?? []) {
    const k = decoKey(o);
    if (k) add(k);
  }
  return out;
}
const GRACE_DURATION$1 = { eighth: 8, "16th": 16, "32nd": 32 };
function noteOf$1(ch, graceBefore) {
  const deg = ch.notes[0]?.degree;
  const beams = ch.beams?.length;
  const n = {
    kind: "note",
    // 节奏音符在 `PuDoc` 里是 pitch 9 + sound "rhythm"（番茄写 `9`、诗歌本写 `X`）
    pitch: ch.rhythm ? 9 : ch.rest ? 0 : deg?.number ?? 0,
    sound: ch.rhythm ? "rhythm" : ch.rest ? "rest" : "note",
    hidden: ch.printObject === false,
    // 倚音不占对位格；123 来源的倚音没有这一位
    lyricAnchor: ch.lyricAnchor ?? (ch.grace ? false : !ch.rest),
    octave: deg?.octaveShift ?? ch.rest?.octaveShift ?? 0,
    // 123 的倚音不记 beams，减时线记在符号时值上（`{2__}` 是十六分）；没写的按八分画
    duration: beams === void 0 && ch.grace ? GRACE_DURATION$1[ch.duration.type ?? ""] ?? 8 : 4 << (beams ?? 0),
    dots: ch.duration.dots,
    ornaments: chordOrnaments(ch),
    graceBefore,
    graceAfter: [],
    code: "",
    source: ch.source ?? ZERO
  };
  if (deg?.accidental) n.accidental = deg.accidental;
  if (ch.placeholder) n.placeholder = true;
  if (ch.harmony?.text !== void 0) n.chord = ch.harmony.text;
  if (ch.sectionWord !== void 0) n.annotation = ch.sectionWord;
  return n;
}
function sustainOf$1(src) {
  const s = {
    kind: "sustain",
    duration: 4,
    lyricAnchor: src.lyricAnchor ?? false,
    ornaments: puOrnaments(src.ornaments),
    code: "-",
    source: src.source ?? ZERO
  };
  if (src.harmony?.text !== void 0) s.chord = src.harmony.text;
  if (src.sectionWord !== void 0) s.annotation = src.sectionWord;
  return s;
}
function pushInline(row, items, measure) {
  for (const it of items ?? []) {
    row.refs.push({ measure });
    if (it.kind === "boundary") {
      row.elements.push({
        kind: "beat-boundary",
        behavior: it.behavior,
        code: it.behavior === "join" ? "~" : "^",
        source: it.source ?? ZERO
      });
    } else {
      const sub = buildRow(it.measures);
      row.elements.push({
        kind: "inline-layer",
        role: it.role,
        elements: sub.elements,
        marks: [...segmentMarks(it.marks, [sub], 0), ...rowVoltas([it.measures], [sub])[0]],
        code: "",
        source: it.source ?? ZERO
      });
    }
  }
}
function buildRow(measures, ranges) {
  const row = { elements: [], refs: [], indexOf: /* @__PURE__ */ new Map(), anchors: [], measureSpan: /* @__PURE__ */ new Map() };
  for (const mea of measures) {
    const first = row.elements.length;
    const [from, to] = ranges?.get(mea) ?? [0, mea.elements.length];
    const tail = to >= mea.elements.length;
    let pendingGrace = [];
    let lastNote = null;
    for (const el of mea.elements.slice(from, to)) {
      if (el.kind === "space") {
        const n = {
          kind: "note",
          pitch: 0,
          sound: "rest",
          hidden: true,
          lyricAnchor: el.spacer === "x",
          octave: 0,
          duration: el.spacer === "x" ? 4 << (el.beams?.length ?? 0) : 4,
          dots: el.duration?.dots ?? 0,
          ornaments: [],
          graceBefore: [],
          graceAfter: [],
          code: el.spacer,
          source: el.source ?? ZERO
        };
        if (el.harmony?.text) n.chord = el.harmony.text;
        if (pendingGrace.length) {
          n.graceBefore = pendingGrace;
          pendingGrace = [];
        }
        row.indexOf.set(el.id, row.elements.length);
        row.elements.push(n);
        row.refs.push({ id: el.id, space: el, measure: mea });
        if (n.lyricAnchor) row.anchors.push(el);
        continue;
      }
      const ch = el;
      if (ch.grace) {
        const g = noteOf$1(ch, []);
        if (ch.grace.after && lastNote) lastNote.graceAfter.push(g);
        else pendingGrace.push(g);
        continue;
      }
      pushInline(row, ch.before, mea);
      let head;
      if (ch.continued) {
        head = sustainOf$1({ ...ch, lyricAnchor: ch.lyricAnchor ?? !ch.rest });
      } else {
        head = noteOf$1(ch, pendingGrace);
        pendingGrace = [];
        lastNote = head;
      }
      row.indexOf.set(ch.id, row.elements.length);
      row.elements.push(head);
      row.refs.push({ id: ch.id, chord: ch, measure: mea });
      if (head.lyricAnchor) row.anchors.push(ch);
      for (const su of ch.sustains ?? []) {
        pushInline(row, su.before, mea);
        row.indexOf.set(su.id, row.elements.length);
        const s = sustainOf$1(su);
        row.elements.push(s);
        row.refs.push({ id: su.id, chord: ch, sustain: su, measure: mea });
        if (s.lyricAnchor) row.anchors.push(su);
      }
    }
    const right = tail ? (mea.barlines ?? []).find((b) => b.location === "right") : void 0;
    if (right && right.style !== void 0) {
      pushInline(row, right.before, mea);
      row.elements.push(puBar(right));
      row.refs.push({ barline: right, measure: mea });
    }
    if (tail) pushInline(row, mea.trailing, mea);
    let f = -1;
    let l = -1;
    for (let i = first; i < row.elements.length; i++) {
      const ref = row.refs[i];
      if (ref.id === void 0 && !ref.barline) continue;
      if (f < 0) f = i;
      l = i;
    }
    row.measureSpan.set(mea, f < 0 ? { first, last: Math.max(first, row.elements.length - 1) } : { first: f, last: l });
  }
  return row;
}
function puBar(b) {
  const e = {
    kind: "barline",
    type: puBarlineType(b),
    ornaments: b.ornaments ? puOrnaments(b.ornaments) : [],
    code: "|",
    source: b.source ?? ZERO
  };
  if (!b.ornaments && b.jump) e.ornaments.push({ name: b.jump, level: 0, source: ZERO });
  if (b.time) {
    e.temporaryMeter = {
      numerator: b.time.beats,
      denominator: b.time.beatType,
      parenthesized: b.time.parenthesized ?? false
    };
  }
  if (b.annotation !== void 0) e.annotation = b.annotation;
  return e;
}
function rowLyrics(row, infos) {
  if (infos) {
    return infos.map((info, lineIdx) => {
      const syllables = [];
      for (let a = 0; a < Math.min(info.count, row.anchors.length); a++) {
        const hit = (row.anchors[a].lyrics ?? []).find(
          (l) => l.number === info.verseFrom && (l.numberTo ?? l.number) === info.verseTo && (l.lineIndex === void 0 || l.lineIndex === lineIdx)
        );
        const syl = { text: hit?.text ?? "", source: info.sources?.[a] ?? hit?.source ?? ZERO };
        if (hit?.trailingPunctuation) syl.trailingPunctuation = hit.trailingPunctuation;
        syllables.push(syl);
      }
      const line = {
        verseFrom: info.verseFrom,
        verseTo: info.verseTo,
        annotationGap: info.annotationGap,
        syllables,
        source: info.source ?? ZERO
      };
      if (info.annotation !== void 0) line.annotation = info.annotation;
      if (info.joinBrace) line.joinBrace = true;
      return line;
    });
  }
  const verses = /* @__PURE__ */ new Set();
  for (const a of row.anchors) {
    for (const l of a.lyrics ?? []) {
      for (let v = l.number; v <= (l.numberTo ?? l.number); v++) verses.add(v);
    }
  }
  const out = [];
  for (const v of [...verses].sort((a, b) => a - b)) {
    const syllables = [];
    let label;
    for (const a of row.anchors) {
      const hit = (a.lyrics ?? []).find((l) => v >= l.number && v <= (l.numberTo ?? l.number));
      if (hit?.verseLabel !== void 0) label = hit.verseLabel;
      const syl = { text: hit?.text ?? "", source: hit?.source ?? ZERO };
      if (hit?.trailingPunctuation) syl.trailingPunctuation = hit.trailingPunctuation;
      syllables.push(syl);
    }
    if (!syllables.some((s) => s.text !== "")) continue;
    const line = { verseFrom: v, verseTo: v, annotationGap: 20, syllables, source: ZERO };
    if (label !== void 0) line.annotation = label;
    out.push(line);
  }
  return out;
}
function segmentMarks(marks, rows, rowIdx) {
  const row = rows[rowIdx];
  const rowOf = (id) => rows.findIndex((r) => r.indexOf.has(id));
  const out = [];
  for (const m of marks) {
    const type = m.type === "slur" || m.type === "tied" ? "slur" : m.type === "tuplet" ? "tuplet" : m.type === "wedge" ? m.wedgeType === "diminuendo" ? "decrescendo" : "crescendo" : null;
    if (type === null) continue;
    if (m.leadInPreviousLine && rows[rowIdx + 1]?.indexOf.has(m.start)) {
      out.push({
        type,
        start: row.elements.length - (m.leadBack ?? 0),
        end: Math.max(0, row.elements.length - 1),
        level: m.level ?? 0,
        source: ZERO,
        continuationToNext: true
      });
      continue;
    }
    const a = row.indexOf.get(m.start);
    const b = row.indexOf.get(m.end);
    const startRow = a !== void 0 ? rowIdx : rowOf(m.start);
    const endRow = b !== void 0 ? rowIdx : rowOf(m.end);
    if (a === void 0 && b === void 0) {
      if (startRow < 0 || endRow < 0 || rowIdx < startRow || rowIdx > endRow) continue;
    }
    if (m.collapsed) {
      if (a !== void 0) out.push({ type, start: a + 1, end: a, level: m.level ?? 0, source: ZERO });
      continue;
    }
    const seg = (startRow >= 0 ? rowIdx - startRow : 0) + (m.leadInPreviousLine ? 1 : 0);
    const pm = {
      type,
      start: a !== void 0 ? a - (m.startLead ?? 0) : 0,
      end: b !== void 0 ? b + (m.endTrail ?? 0) : Math.max(0, row.elements.length - 1),
      level: seg === 0 ? m.level ?? 0 : m.continuationLevels?.[seg - 1] ?? m.level ?? 0,
      source: ZERO
    };
    if (a === void 0 || m.continuesFromPrevious || m.leadInPreviousLine && seg === 1) pm.continuationFromPrevious = true;
    if (b === void 0) pm.continuationToNext = true;
    if (m.tupletActual !== void 0) pm.caption = String(m.tupletActual);
    out.push(pm);
  }
  return out;
}
const captionOfEnding = (e) => e.captionless ? void 0 : e.text ?? e.numbers.join(".");
function rowVoltas(measuresByRow, rows) {
  const out = rows.map(() => []);
  let open = [];
  const levelOf = (o, r) => {
    const seg = r - o.startRow;
    return seg === 0 ? o.ending.level ?? 0 : o.ending.continuationLevels?.[seg - 1] ?? 0;
  };
  const mark = (o, r, end) => {
    const pm = { type: "volta", start: o.start, end, level: levelOf(o, r), source: ZERO };
    const caption = captionOfEnding(o.ending);
    if (caption !== void 0) pm.caption = caption;
    if (o.fromPrev) pm.continuationFromPrevious = true;
    return pm;
  };
  measuresByRow.forEach((measures, r) => {
    const row = rows[r];
    open = open.map((o) => ({ ...o, start: 0, fromPrev: true }));
    for (const mea of measures) {
      const span2 = row.measureSpan.get(mea);
      for (const b of mea.barlines ?? []) {
        if (b.location !== "left" || b.ending?.type !== "start") continue;
        const e = b.ending;
        const caption = captionOfEnding(e);
        if (e.collapsed) {
          const pm = { type: "volta", start: span2.first, end: span2.first - 1, level: e.level ?? 0, source: ZERO };
          if (caption !== void 0) pm.caption = caption;
          out[r].push(pm);
          continue;
        }
        if (e.leadInPreviousLine && r > 0) {
          const prev = rows[r - 1];
          const pm = {
            type: "volta",
            start: prev.elements.length,
            end: Math.max(0, prev.elements.length - 1),
            level: e.level ?? 0,
            source: ZERO,
            continuationToNext: true
          };
          if (caption !== void 0) pm.caption = caption;
          out[r - 1].push(pm);
          open.push({ ending: e, startRow: r - 1, start: 0, fromPrev: true });
          continue;
        }
        open.push({ ending: e, startRow: r, start: span2.first + (e.startOffset ?? 0), fromPrev: false });
      }
      for (const right of mea.barlines ?? []) {
        if (right.location === "right" && right.ending?.danglingLead) {
          const pm2 = {
            type: "volta",
            start: row.elements.length,
            end: Math.max(0, row.elements.length - 1),
            level: right.ending.level ?? 0,
            source: ZERO,
            continuationToNext: true
          };
          const caption = captionOfEnding(right.ending);
          if (caption !== void 0) pm2.caption = caption;
          out[r].push(pm2);
          continue;
        }
        if (right.location !== "right" || !right.ending || right.ending.type === "start" || !open.length) continue;
        const stop = right.ending;
        let k = stop.pair !== void 0 ? open.findIndex((o2) => o2.ending.pair === stop.pair) : -1;
        if (k < 0) k = open.length - 1;
        const o = open[k];
        const pm = mark(o, r, span2.last + (stop.endOffset ?? 0));
        if (stop.type === "discontinue") pm.openEnd = true;
        out[r].push(pm);
        open.splice(k, 1);
      }
    }
    for (const o of open) out[r].push({ ...mark(o, r, Math.max(0, row.elements.length - 1)), continuationToNext: true });
  });
  return out;
}
function toMetadata(song) {
  const meta = {
    titles: [],
    authors: [],
    remarks: [],
    meters: [],
    tempos: [],
    topLeft: [],
    topRight: [],
    bottomLeft: [],
    bottomCenter: [],
    bottomRight: [],
    fontSizes: [],
    margins: [],
    options: []
  };
  if (song.work.title !== void 0) meta.titles.push(song.work.title);
  meta.titles.push(...song.work.subtitles);
  const scripture = [...getMeta(song, "scripture"), ...getMeta(song, "scripture-ref")].filter((t2) => t2.trim());
  if (scripture.length) meta.scripture = scripture;
  if (song.work.version !== void 0) meta.version = song.work.version;
  for (const c of song.identification?.creators ?? []) meta.authors.push(c.text);
  if (song.key) {
    if (song.key.display !== void 0) meta.mode = song.key.display;
    else if (song.key.spelling && song.key.spelling !== "none") meta.mode = song.key.spelling;
    else if (song.key.spelling !== "none") meta.mode = MusicCommon.keys[song.key.fifths + 7];
    if (song.key.tonicDegree && song.key.tonicDegree !== "1") meta.tonic = song.key.tonicDegree;
  }
  for (const t2 of [song.time, ...song.extraTimes ?? []]) {
    if (!t2) continue;
    meta.meters.push({ numerator: t2.beats, denominator: t2.beatType, parenthesized: t2.parenthesized ?? false });
  }
  if (song.timeNote !== void 0) meta.timeNote = song.timeNote;
  for (const t2 of quarterTempos(song)) meta.tempos.push(t2);
  meta.remarks.push(...song.remarks ?? []);
  const pt = song.pageText;
  if (pt) {
    if (pt.indexLeft !== void 0) meta.indexLeft = pt.indexLeft;
    if (pt.indexRight !== void 0) meta.indexRight = pt.indexRight;
    meta.topLeft.push(...pt.topLeft);
    meta.topRight.push(...pt.topRight);
    meta.bottomLeft.push(...pt.bottomLeft);
    meta.bottomCenter.push(...pt.bottomCenter);
    meta.bottomRight.push(...pt.bottomRight);
  }
  for (const r of song.style?.raw ?? []) {
    if (/^fontsize$/i.test(r.key)) meta.fontSizes.push(r.value);
    else if (/^margin$/i.test(r.key)) meta.margins.push(r.value);
    else meta.options.push({ key: r.key, value: r.value });
  }
  return meta;
}
const breaksInline = (el) => el.kind === "chord" && (el.lineBreakAfter !== void 0 || (el.sustains ?? []).some((su) => su.lineBreakAfter !== void 0));
function splitSystems(part) {
  const rows = [];
  let cur = [];
  let ranges = /* @__PURE__ */ new Map();
  let cont = false;
  let sys;
  let swallow = false;
  const flush = () => {
    if (cur.length) rows.push({ system: sys, measures: cur, ...ranges.size ? { ranges } : {}, ...cont ? { cont } : {} });
    cur = [];
    ranges = /* @__PURE__ */ new Map();
    cont = false;
  };
  for (const m of part.measures) {
    if (m.print?.newSystem || m.print?.newPage) {
      if (!swallow) flush();
      sys = m.print.system;
    }
    swallow = false;
    let from = 0;
    m.elements.forEach((el, i) => {
      if (i === m.elements.length - 1 || !breaksInline(el)) return;
      ranges.set(m, [from, i + 1]);
      cur.push(m);
      flush();
      cont = true;
      from = i + 1;
      swallow = true;
    });
    if (from > 0) ranges.set(m, [from, m.elements.length]);
    cur.push(m);
  }
  flush();
  return rows.length ? rows : [{ system: void 0, measures: [] }];
}
function rowTuplets(measuresByRow, rows) {
  const out = rows.map(() => []);
  measuresByRow.forEach((measures, r) => {
    const row = rows[r];
    let open = null;
    const close = (end) => {
      if (open === null) return;
      out[r].push({ type: "tuplet", start: open, end, level: 0, source: ZERO });
      open = null;
    };
    for (const mea of measures) {
      const span2 = row.measureSpan.get(mea);
      if (!span2) continue;
      for (let i = span2.first; i <= span2.last; i++) {
        const tm = row.refs[i]?.chord?.duration.timeMod;
        if (tm) {
          if (open === null) open = i;
          continue;
        }
        close(i - 1);
      }
    }
    close(row.elements.length - 1);
  });
  return out;
}
function toPuSong(song, index, rawLines) {
  const perPart = song.parts.map((p) => splitSystems(p));
  const bySystem = perPart.some((rows) => rows.some((r) => r.system !== void 0));
  const voiceOf = (pi) => {
    const m = bySystem ? /^P(\d+)$/.exec(song.parts[pi].id) : null;
    return m ? Number(m[1]) : pi + 1;
  };
  const builds = perPart.map((rows) => rows.map((row) => buildRow(row.measures, row.ranges)));
  const voltas = perPart.map((rows, pi) => rowVoltas(rows.map((r) => r.measures), builds[pi]));
  const tuplets = perPart.map((rows, pi) => rowTuplets(rows.map((r) => r.measures), builds[pi]));
  const systems = /* @__PURE__ */ new Map();
  perPart.forEach((rows, pi) => {
    rows.forEach((row, r) => {
      const key = bySystem ? row.system ?? r : r;
      let list = systems.get(key);
      if (!list) systems.set(key, list = []);
      list.push({ pi, r });
    });
  });
  const pages = [];
  let page = { index: 0, groups: [] };
  for (const key of [...systems.keys()].sort((a, b) => a - b)) {
    const voices = [];
    let texts = [];
    let textSources = [];
    let newPage = false;
    for (const { pi, r } of systems.get(key)) {
      const part = song.parts[pi];
      const build = builds[pi][r];
      const sr = perPart[pi][r];
      const p = sr.cont ? void 0 : sr.measures[0]?.print;
      if (bySystem && p?.newPage) newPage = true;
      if (p?.texts) {
        texts = p.texts;
        textSources = p.textSources ?? [];
      }
      const line = {
        part,
        measures: perPart[pi][r].measures,
        refs: build.refs,
        voice: voiceOf(pi),
        elements: build.elements,
        marks: [...segmentMarks(song.marks, builds[pi], r), ...voltas[pi][r], ...tuplets[pi][r]],
        lyrics: rowLyrics(build, p?.lyricLines),
        raw: p?.source ? rawLines[p.source.line] ?? "" : "",
        source: p?.source ?? ZERO
      };
      const caption = bySystem ? p?.caption : part.name;
      if (caption !== void 0) line.caption = caption;
      if (p?.variant !== void 0) line.variant = p.variant;
      voices.push(line);
    }
    if (newPage && page.groups.length) {
      pages.push(page);
      page = { index: pages.length, groups: [] };
    }
    page.groups.push({
      index: page.groups.length,
      system: key,
      texts: texts.map((t2, i) => ({ text: t2, source: textSources[i] ?? ZERO })),
      voices
    });
  }
  pages.push(page);
  return { index, song, metadata: toMetadata(song), pages };
}
const views = /* @__PURE__ */ new WeakMap();
function docView(doc) {
  const hit = views.get(doc);
  if (hit) return hit;
  const rawLines = doc.source && doc.sourceFormat === "pu" ? doc.source.split(/\r?\n/) : [];
  const view = {
    dialect: doc.puDialect ?? "shige",
    doc,
    // MusicXML 读进来的先投成简谱形状（长音拆增时线、减时线按 `<type>` 算、和弦补原文）
    songs: doc.songs.map((s, i) => toPuSong(projectForJianpu(s), i, rawLines)),
    idOf: /* @__PURE__ */ new Map(),
    elementOf: /* @__PURE__ */ new Map(),
    syllableOwner: /* @__PURE__ */ new Map()
  };
  for (const sv of view.songs) {
    for (const pg of sv.pages) {
      for (const g of pg.groups) {
        for (const row of g.voices) {
          row.elements.forEach((el, i) => {
            const id = row.refs[i].id;
            if (id === void 0) return;
            view.idOf.set(el, id);
            if (!view.elementOf.has(id)) view.elementOf.set(id, el);
          });
          const anchors = row.elements.filter((el) => (el.kind === "note" || el.kind === "sustain") && el.lyricAnchor);
          for (const line of row.lyrics) {
            line.syllables.forEach((syl, k) => {
              const owner = anchors[k] && view.idOf.get(anchors[k]);
              if (owner !== void 0) view.syllableOwner.set(syl, owner);
            });
          }
        }
      }
    }
  }
  views.set(doc, view);
  return view;
}
function emptyMetadata() {
  return {
    titles: [],
    authors: [],
    meters: [],
    tempos: [],
    topLeft: [],
    topRight: [],
    bottomLeft: [],
    bottomCenter: [],
    bottomRight: [],
    fontSizes: [],
    margins: [],
    options: [],
    remarks: []
  };
}
function linesOfVoice(song, voice) {
  const out = [];
  for (const page of song.pages) {
    for (const group of page.groups) {
      for (const v of group.voices) if (v.voice === voice) out.push(v);
    }
  }
  return out;
}
function voiceNumbers(song) {
  const seen = [];
  for (const page of song.pages) {
    for (const group of page.groups) {
      for (const v of group.voices) if (!seen.includes(v.voice)) seen.push(v.voice);
    }
  }
  return seen.length > 0 ? seen : [1];
}
function takesLyric(el) {
  return (el.kind === "note" || el.kind === "sustain") && el.lyricAnchor;
}
function marksAt(marks, index, type) {
  return marks.filter((m) => m.type === type && (m.start === index || m.end === index));
}
function tupletRatios(line, count = line.elements.length) {
  const out = new Array(count);
  for (const mk of line.marks) {
    if (mk.type !== "tuplet") continue;
    const n = mk.end - mk.start + 1;
    if (n <= 1) continue;
    for (let i = mk.start; i <= mk.end && i < count; i++) out[i] = { num: n - 1, den: n };
  }
  return out;
}
function elementQuarters(el) {
  if (el.kind === "sustain") return new Fraction(1);
  if (el.kind !== "note" || el.placeholder) return new Fraction(0);
  const base = new Fraction(4, el.duration);
  if (el.dots <= 0) return base;
  const denom = 1 << el.dots;
  return base.timesInt(2 * denom - 1).divInt(denom);
}
function nextSyllables(lyrics, cursors) {
  const out = [];
  lyrics.forEach((line, li) => {
    const syl = line.syllables[cursors[li] ?? 0];
    cursors[li] = (cursors[li] ?? 0) + 1;
    if (!syl || syl.text.length === 0) return;
    const text = syl.text + (syl.trailingPunctuation ?? "");
    for (let v = line.verseFrom; v <= line.verseTo; v += 1) out.push({ verse: v, text });
  });
  return out;
}
const JUMP_NAMES = /* @__PURE__ */ new Set(["dc", "ds", "fine", "ty", "hs"]);
function phrasePartOfSong(doc, songIdx = 0) {
  const view = docView(doc);
  const song = view.songs[songIdx];
  if (!song) return null;
  let voices = voiceNumbers(song);
  const lead = voices.find((v) => linesOfVoice(song, v).some((l) => l.lyrics.length > 0));
  if (lead !== void 0) voices = [lead, ...voices.filter((v) => v !== lead)];
  for (const v of voices) {
    const lines = linesOfVoice(song, v);
    if (lines.length === 0) continue;
    const idOf = /* @__PURE__ */ new Map();
    const { measures } = buildMeasures(lines, (ch, el) => {
      const id = view.idOf.get(el);
      if (id !== void 0) idOf.set(ch, id);
    });
    return { part: { measures }, idOf };
  }
  return null;
}
function distinctVerses(lyrics) {
  let maxUsed = 0;
  const used = /* @__PURE__ */ new Set();
  return lyrics.map((l) => {
    let shift = 0;
    for (let v = l.verseFrom; v <= l.verseTo; v++) {
      if (used.has(v)) shift = Math.max(shift, maxUsed + 1 - l.verseFrom);
    }
    const from = l.verseFrom + shift;
    const to = l.verseTo + shift;
    for (let v = from; v <= to; v++) used.add(v);
    maxUsed = Math.max(maxUsed, to);
    return shift === 0 ? l : { ...l, verseFrom: from, verseTo: to };
  });
}
function jpAlterOf(el) {
  switch (el.accidental) {
    case "sharp":
    case "double-sharp":
      return "#";
    case "flat":
    case "double-flat":
      return "b";
    case "natural":
      return "n";
    default:
      return " ";
  }
}
function edgeAt(marks, index, type) {
  const hit = marksAt(marks, index, type);
  return {
    starts: hit.some((m) => m.start === index && !m.continuationFromPrevious),
    ends: hit.some((m) => m.end === index && !m.continuationToNext)
  };
}
function chordDuration(ch) {
  let dur = new Fraction(ch.beats);
  if (ch.dot > 0) dur = dur.timesInt(3).divInt(2);
  return dur.divInt(1 << ch.beams);
}
function buildMeasures(lines, onChord, renumberVerses = true, pitch) {
  const measures = [];
  const jumps = [];
  let measure = null;
  let newMeasureNeeded = true;
  let lastChord = null;
  let pendingRepeatForward = false;
  let pendingEnding = null;
  const tupletNotes = [];
  const open = () => {
    const m = {
      entries: [],
      barline: null,
      repeatBackward: false,
      repeatForward: false,
      keyChange: false,
      endingLeft: false,
      endingNum: null,
      endingRight: null,
      sectionMark: null,
      seq: [],
      time: { beats: 4, beatType: 4 },
      get duration() {
        const last = this.entries[this.entries.length - 1];
        if (!last?.duration) throw new Error("measure has no chord");
        return last.position.plus(last.duration);
      }
    };
    measure = m;
    measures.push(m);
    return m;
  };
  for (const line of lines) {
    const lyrics = renumberVerses ? distinctVerses(line.lyrics) : line.lyrics;
    const cursors = lyrics.map(() => 0);
    const voltas = line.marks.filter((mk) => mk.type === "volta");
    line.elements.forEach((el, index) => {
      for (const mk of voltas) if (mk.start === index && !mk.continuationFromPrevious) pendingEnding = mk;
      const endsVolta = voltas.filter((mk) => mk.end === index && !mk.continuationToNext);
      const closeVolta = (mea2) => {
        if (!mea2) return;
        for (const mk of endsVolta) mea2.endingRight = mk.openEnd ? StartStopDiscontinue.DISCONTINUE : StartStopDiscontinue.STOP;
      };
      const noteJumps = (mea2, onBarline) => {
        if (!("ornaments" in el)) return;
        for (const orn of el.ornaments) {
          if (JUMP_NAMES.has(orn.name)) jumps.push({ name: orn.name, measure: measures.indexOf(mea2), onBarline });
        }
      };
      const attach = (ch2) => {
        for (const { verse, text } of nextSyllables(lyrics, cursors)) ch2.notes[0].lyrics.push({ text, number: verse, refrain: false });
      };
      if (el.kind === "beat-boundary" || el.kind === "inline-layer") return;
      if (el.kind === "sustain") {
        closeVolta(measure);
        if (measure) noteJumps(measure, false);
        if (lastChord) {
          lastChord.beats += 1;
          lastChord.duration = chordDuration(lastChord);
        }
        if (el.lyricAnchor && lastChord) attach(lastChord);
        return;
      }
      if (el.kind === "barline") {
        const mea2 = measure ?? open();
        mea2.seq.push("barline");
        closeVolta(mea2);
        noteJumps(mea2, true);
        switch (el.type) {
          case "normal":
            mea2.barline = BarStyle.REGULAR;
            break;
          case "double":
            mea2.barline = BarStyle.LIGHT_LIGHT;
            break;
          case "end":
            mea2.barline = BarStyle.LIGHT_HEAVY;
            break;
          case "repeat-start":
            pendingRepeatForward = true;
            break;
          case "repeat-end":
            mea2.repeatBackward = true;
            mea2.barline = BarStyle.LIGHT_HEAVY;
            break;
          case "repeat-both":
            mea2.repeatBackward = true;
            mea2.barline = BarStyle.LIGHT_HEAVY;
            pendingRepeatForward = true;
            break;
          default:
            mea2.barline = BarStyle.NONE;
        }
        newMeasureNeeded = true;
        return;
      }
      const mea = newMeasureNeeded || measure === null ? open() : measure;
      newMeasureNeeded = false;
      if (pendingRepeatForward) {
        mea.repeatForward = true;
        pendingRepeatForward = false;
      }
      if (pendingEnding) {
        mea.endingLeft = true;
        const digits = (pendingEnding.caption ?? "").trim().match(/\d+/g);
        mea.endingNum = digits ? new Set(digits.map((d) => parseInt(d, 10))) : null;
        pendingEnding = null;
      }
      closeVolta(mea);
      noteJumps(mea, false);
      const number = el.sound === "rhythm" ? "0" : String(el.pitch);
      const ch = {
        notes: [{ number, jpOctave: el.octave, pitch: 0, jpAlter: jpAlterOf(el), tieStart: false, tieEnd: false, lyrics: [] }],
        rest: el.hidden || el.sound === "rest" || el.sound === "rhythm" || number === "0",
        beats: 1,
        beams: Math.max(0, Math.round(Math.log2(el.duration / 4))),
        dot: el.dots,
        position: new Fraction(0),
        fermata: el.ornaments.some((o) => o.name === "yc" || o.name === "ycy"),
        slurStart: false,
        slurEnds: 0,
        tupletBegin: false,
        tupletEnd: false,
        tuplet: false
      };
      const tup = edgeAt(line.marks, index, "tuplet");
      if (tup.starts) ch.tupletBegin = true;
      if (tup.ends) ch.tupletEnd = true;
      if (ch.tupletBegin || ch.tupletEnd) tupletNotes.push(ch);
      const slur = edgeAt(line.marks, index, "slur");
      if (slur.starts) ch.slurStart = true;
      if (slur.ends) ch.slurEnds++;
      ch.duration = chordDuration(ch);
      mea.entries.push(ch);
      mea.seq.push(ch);
      onChord(ch, el);
      lastChord = ch;
      line.marks.filter((m) => m.type === "slur" && m.start === index && !m.continuationFromPrevious);
      if (takesLyric(el)) attach(ch);
    });
    const cur = measure;
    if (line !== lines[lines.length - 1] && cur) cur.seq.push("break");
  }
  for (let i = 0; i < Math.floor(tupletNotes.length / 2); i++) {
    tupletNotes[2 * i].tuplet = true;
    tupletNotes[2 * i + 1].tuplet = true;
  }
  let inTuplet = false;
  for (const m of measures) {
    let pos = new Fraction(0);
    for (const ch of m.entries) {
      let dur = chordDuration(ch);
      if (ch.tuplet && ch.tupletBegin) inTuplet = true;
      if (inTuplet || ch.tuplet) dur = dur.timesInt(2).divInt(3);
      if (ch.tuplet && ch.tupletEnd) inTuplet = false;
      ch.duration = dur;
      ch.position = pos;
      pos = pos.plus(dur);
    }
  }
  return { measures, jumps };
}
function playDataOfSong(doc, songIdx = 0, options = {}) {
  const built = songMeasures(doc, songIdx, options);
  return built && playDataOf(doc, songIdx, built);
}
function partOfVoice(song, voice) {
  return song.parts.find((p) => p.id === `P${voice}`) ?? song.parts[voice - 1];
}
function songMeasures(doc, songIdx, options, withPitch) {
  const view = docView(doc);
  const song = view.songs[songIdx];
  if (!song) return null;
  const docVoices = voiceNumbers(song);
  let voices = docVoices;
  if (options.forExpanded) {
    const lead = voices.find((v) => linesOfVoice(song, v).some((l) => l.lyrics.length > 0));
    if (lead !== void 0) voices = [lead, ...voices.filter((v) => v !== lead)];
  }
  const meta = song.metadata;
  const meter = meta.meters[0];
  const time = meter ? { beats: meter.numerator, beatType: meter.denominator } : { beats: 4, beatType: 4 };
  const key = new Key();
  const fifths = doc.songs[songIdx].key?.fifths;
  key.fifths = meta.mode === void 0 && fifths !== void 0 ? fifths : MusicCommon.keyNameToFifth(meta.mode ?? "C");
  const parts = [];
  const names = [];
  const docRank = [];
  let jumps = [];
  const idToChord = /* @__PURE__ */ new Map();
  for (const v of voices) {
    const lines = linesOfVoice(song, v);
    if (lines.length === 0) continue;
    const first = parts.length === 0;
    const built = buildMeasures(lines, (ch, el) => {
      const id = view.idOf.get(el);
      if (id !== void 0) ch.id = id;
    }, !!options.forExpanded);
    if (first) {
      jumps = built.jumps;
      built.measures.forEach((m, measure) => m.entries.forEach((ch, index) => {
        if (ch.id !== void 0) idToChord.set(ch.id, { measure, index });
      }));
    }
    parts.push(built.measures);
    names.push(partOfVoice(doc.songs[songIdx], v)?.name);
    docRank.push(docVoices.indexOf(v));
  }
  if (parts.length === 0) return null;
  return { song, key, time, voices, parts, names, docRank, jumps, idToChord };
}
function playDataOf(doc, songIdx, { song, voices, parts, jumps, idToChord }) {
  const main = parts[0];
  const pd = new PlayData();
  const docSong = doc.songs[songIdx];
  if (docSong.playOrder?.length) {
    pd.measures = playOrderFromSpec({ items: docSong.playOrder.map((p) => specItem(p, idToChord)) }, { measures: main });
    return pd;
  }
  let passes = 0;
  for (const line of linesOfVoice(song, voices[0])) {
    for (const l of line.lyrics) passes = Math.max(passes, l.verseTo);
  }
  if (doc.sourceFormat === "jpwabc") {
    pd.measures = playOrderByVerses(main.length, passes);
    pd.isSimpple = true;
    return pd;
  }
  applyJumps(pd, main, jumps);
  try {
    const order = playOrderOf(parts.map((measures) => ({ measures })), pd);
    pd.isSimpple = order.isSimple;
    pd.hasRepeat = order.hasRepeat;
    pd.measures = order.measures;
    if (pd.measures.length > 0) return pd;
  } catch (e) {
    console.warn("文本谱反复推理失败，按段数逐遍", e);
  }
  pd.measures = playOrderByVerses(main.length, Math.max(1, passes));
  pd.isSimpple = true;
  return pd;
}
function specItem(p, idToChord) {
  const from = p.fromElement !== void 0 ? idToChord.get(p.fromElement) : void 0;
  const to = p.toElement !== void 0 ? idToChord.get(p.toElement) : void 0;
  return new RepeatSpecItem(
    p.fromMeasure - 1,
    p.toMeasure - 1,
    p.verse ?? 0,
    from ? from.index : 0,
    p.pageBreakAfter ?? false,
    to ? to.index + 1 : -1
  );
}
function applyJumps(pd, measures, jumps) {
  const count = measures.length;
  const end = (mid) => new TimePosition(mid, measures[mid].duration);
  const target = (j) => j.onBarline && j.measure + 1 < count ? new TimePosition(j.measure + 1, new Fraction(0)) : new TimePosition(j.measure, new Fraction(0));
  const codas = jumps.filter((j) => j.name === "ty");
  for (const j of jumps) {
    switch (j.name) {
      case "dc":
        pd.jumpTo.set(end(j.measure), new JumpSpec(PlaySpecKind.Dacapo));
        break;
      case "fine":
        pd.jumpTo.set(end(j.measure), new JumpSpec(PlaySpecKind.Fine));
        break;
      case "ds": {
        const s = new JumpSpec(PlaySpecKind.DalSegno);
        s.value = "1";
        pd.jumpTo.set(end(j.measure), s);
        break;
      }
      case "hs":
        pd.segno.set("1", target(j));
        break;
      case "ty":
        if (codas.length >= 2 && j === codas[0]) {
          const s = new JumpSpec(PlaySpecKind.ToCoda);
          s.value = "1";
          pd.jumpTo.set(end(j.measure), s);
        } else {
          pd.coda.set("1", target(j));
        }
        break;
    }
  }
}
function jpwInputOfSong(doc, songIdx = 0) {
  const built = songMeasures(doc, songIdx, {});
  if (!built) return null;
  const playData = playDataOf(doc, songIdx, built);
  const meta = built.song.metadata;
  for (const tempo of meta.tempos) {
    if (typeof tempo === "number" && tempo >= 20 && tempo <= 400) {
      playData.tempo = tempo;
      break;
    }
  }
  const credit = [];
  const push2 = (text, type) => {
    if (text) credit.push({ type, text, page: 0 });
  };
  meta.titles.forEach((t2, i) => push2(t2, i === 0 ? "title" : "subtitle"));
  const credits = doc.songs[songIdx].credits ?? [];
  const original = (a) => credits.find((c) => c.text !== a && c.text.replace(/\n/g, " ") === a)?.text ?? a;
  for (const a of meta.authors) push2(original(a), "composer");
  for (const t2 of meta.topRight) push2(t2, "composer");
  for (const t2 of meta.topLeft) push2(t2, "lyricist");
  const key = { fifths: built.key.fifths, name: built.key.name };
  const pageStarts = new Set(breaksOf(doc.songs[songIdx]).filter((b) => b.page).map((b) => b.id));
  const seq = built.parts[0].flatMap((m) => m.seq);
  const pageAfter = /* @__PURE__ */ new Set();
  seq.forEach((it, i) => {
    if (it !== "break") return;
    const next = seq.slice(i + 1).find((x) => typeof x !== "string");
    if (typeof next === "object" && next.id !== void 0 && pageStarts.has(next.id)) pageAfter.add(i);
  });
  let at = 0;
  const measures = built.parts[0].map((m) => {
    let chords2 = 0;
    const entries = m.seq.map((it) => {
      if (it === "break") return { newPage: pageAfter.has(at++), pass: null };
      at++;
      if (it === "barline") return { style: null, repeat: null, position: new Fraction(chords2 > 0 ? 1 : 0) };
      chords2++;
      const n = it.notes[0];
      const chord = {
        notes: [{
          number: n.number,
          jpOctave: n.jpOctave,
          jpAlter: n.jpAlter,
          tieStart: n.tieStart,
          tieEnd: n.tieEnd,
          tupletBegin: it.tupletBegin,
          tupletEnd: it.tupletEnd,
          lyrics: n.lyrics
        }],
        rest: it.rest,
        dot: it.dot,
        beats: it.beats,
        beams: it.beams,
        slurStart: it.slurStart,
        slurEnds: it.slurEnds,
        fermata: it.fermata,
        graceNotes: []
      };
      return chord;
    });
    return {
      entries,
      newSystem: false,
      newPage: false,
      repeatForward: m.repeatForward,
      repeatBackward: m.repeatBackward,
      endingLeft: m.endingLeft,
      endingNum: m.endingNum,
      timeChange: false,
      keyChange: false,
      time: built.time,
      key,
      barline: m.barline
    };
  });
  return { title: meta.titles[0] ?? "", credit, parts: [{ measures }], playData };
}
function newMeasure(index, key = { fifths: 0 }, time = { beats: 4, beatType: 4 }) {
  return {
    index,
    position: new Fraction(0),
    entries: [],
    key,
    time,
    keyChange: false,
    timeChange: false,
    leftBarline: null,
    barline: null,
    repeatForward: false,
    repeatBackward: false,
    endingLeft: false,
    endingNum: null,
    endingText: null,
    endingRight: null
  };
}
function newChord(measure, id) {
  return {
    kind: "chord",
    id,
    measure,
    position: new Fraction(0),
    notes: [],
    dot: 0,
    beams: 0,
    beats: 0,
    rest: false,
    slurStart: false,
    slurEnds: 0,
    slurEndChord: null,
    fermata: false,
    harmony: null,
    sectionWord: null,
    directions: [],
    articulations: [],
    graceNotes: []
  };
}
function newNote(chord) {
  return {
    chord,
    number: "0",
    jpOctave: 0,
    jpAlter: " ",
    lyrics: [],
    tieStart: false,
    tieEnd: false,
    tieNext: null,
    tiePrev: null,
    tupletBegin: false,
    tupletEnd: false,
    tuplet: null
  };
}
function lyric(text, number, refrain = false) {
  return { text, number, refrain };
}
function breakAtMeasureEnd(m, newPage) {
  const position = m.entries.reduce((p, e) => {
    const end = e.kind === "chord" && e.duration ? e.position.plus(e.duration) : e.position;
    return end.compareTo(p) > 0 ? end : p;
  }, new Fraction(0));
  const br = { kind: "break", position, newPage, pass: null };
  m.entries.push(br);
  return br;
}
function breakAfterChord(m, c, newPage) {
  const i = m.entries.indexOf(c);
  const br = { kind: "break", position: c.duration ? c.position.plus(c.duration) : c.position, newPage, pass: null };
  m.entries.splice(i < 0 ? m.entries.length : i + 1, 0, br);
  return br;
}
function pairTuplets(notes) {
  for (let i = 0; i + 1 < notes.length; i += 2) {
    const a = notes[i];
    const b = notes[i + 1];
    if (a.tupletEnd || b.tupletBegin) throw new Error("");
    const t2 = { first: a, last: b };
    a.tuplet = t2;
    b.tuplet = t2;
  }
}
function endingNums(s) {
  const res = /* @__PURE__ */ new Set();
  for (const it of s.split(",")) {
    const t2 = it.trim();
    if (t2.length) res.add(parseInt(t2, 10));
  }
  return res;
}
function chords(m) {
  return m.entries.filter((e) => e.kind === "chord");
}
function jianpuInputOfDoc(doc, options = {}) {
  const view = docView(doc);
  const song = view.songs[options.song ?? 0];
  if (!song) return null;
  const score = songInput(song, (el) => view.idOf.get(el) ?? null, !!options.forExpanded);
  if (!score) return null;
  const pd = playDataOfSong(doc, options.song ?? 0, options.forExpanded ? { forExpanded: true } : {});
  if (pd) {
    pd.tempo = score.playData.tempo;
    score.playData = pd;
  }
  return score;
}
function marksEdgeAt(marks, index, type) {
  const hit = marksAt(marks, index, type);
  return {
    starts: hit.some((m) => m.start === index && !m.continuationFromPrevious),
    ends: hit.some((m) => m.end === index && !m.continuationToNext)
  };
}
function songInput(song, idOf, forExpanded) {
  const meta = song.metadata;
  const credit = [];
  const pushCredit = (text, type) => {
    if (text) credit.push({ text, type, page: 0 });
  };
  meta.titles.forEach((t2, i) => pushCredit(t2, i === 0 ? "title" : "subtitle"));
  for (const t2 of meta.scripture ?? []) pushCredit(t2, "scripture");
  for (const a of meta.authors) pushCredit(a, "composer");
  for (const t2 of meta.topRight) pushCredit(t2, "composer");
  for (const t2 of meta.topLeft) pushCredit(t2, "lyricist");
  const meter = meta.meters[0];
  const time = meter ? { beats: meter.numerator, beatType: meter.denominator } : { beats: 4, beatType: 4 };
  const key = { fifths: MusicCommon.keyNameToFifth(meta.mode ?? "C") };
  const playData = new PlayData();
  for (const tempo of meta.tempos) {
    if (typeof tempo === "number" && tempo >= 20 && tempo <= 400) {
      playData.tempo = tempo;
      break;
    }
  }
  let voices = voiceNumbers(song);
  if (forExpanded) {
    const lead = voices.find((v) => linesOfVoice(song, v).some((l) => l.lyrics.length > 0));
    if (lead !== void 0) voices = [lead, ...voices.filter((v) => v !== lead)];
  }
  const parts = [];
  for (const v of voices) {
    const lines = linesOfVoice(song, v);
    if (lines.length === 0) continue;
    parts.push({ measures: rowsPart(lines, time, key, idOf, forExpanded, pageEnds(song, v), !forExpanded) });
  }
  if (parts.length === 0) return null;
  return { parts, title: meta.titles[0] ?? "", credit, playData };
}
function pageEnds(song, voice) {
  const out = /* @__PURE__ */ new Set();
  song.pages.forEach((pg, i) => {
    if (i === song.pages.length - 1) return;
    let last = null;
    for (const g of pg.groups) for (const v of g.voices) if (v.voice === voice) last = v;
    if (last) out.add(last);
  });
  return out;
}
function applyEndingStart(mea, mark) {
  const text = (mark.caption ?? "").trim();
  mea.endingLeft = true;
  mea.endingText = text || null;
  const digits = text.match(/\d+/g);
  mea.endingNum = digits ? endingNums(digits.join(",")) : null;
}
function nominal(ch) {
  let dur = new Fraction(ch.beats);
  if (ch.dot > 0) dur = dur.timesInt(3).divInt(2);
  return dur.divInt(1 << ch.beams);
}
function rowsPart(lines, time, key, idOf, renumberVerses, pageEndSet, decorate = false) {
  const measures = [];
  let measure = null;
  const tupletNotes = [];
  const slurOpen = [];
  let newMeasureNeeded = true;
  let lastChord = null;
  let pendingRepeatForward = false;
  let pendingEnding = null;
  let curKey = key;
  let curTime = time;
  const seen = /* @__PURE__ */ new Set();
  const open = (src) => {
    const m = newMeasure(measures.length, curKey, curTime);
    if (src && !seen.has(src)) {
      seen.add(src);
      const k = src.attrs?.key;
      const t2 = src.attrs?.time;
      if (measures.length > 0 && k && k.fifths !== curKey.fifths) {
        m.key = curKey = { fifths: k.fifths };
        m.keyChange = true;
      }
      if (measures.length > 0 && t2 && (t2.beats !== curTime.beats || t2.beatType !== curTime.beatType)) {
        m.time = curTime = { beats: t2.beats, beatType: t2.beatType };
        m.timeChange = true;
      }
      if (src.barlines?.some((b) => b.location === "left" && b.repeat === "forward")) m.repeatForward = true;
    }
    measure = m;
    measures.push(m);
    return m;
  };
  lines.forEach((line, lineIdx) => {
    const refs = line.refs;
    const lyrics = renumberVerses ? distinctVerses(line.lyrics) : line.lyrics;
    const cursors = lyrics.map(() => 0);
    const voltas = line.marks.filter((mk) => mk.type === "volta");
    line.elements.forEach((el, index) => {
      for (const mk of voltas) if (mk.start === index && !mk.continuationFromPrevious) pendingEnding = mk;
      const endsVolta = voltas.filter((mk) => mk.end === index && !mk.continuationToNext);
      const closeVolta = (mea2) => {
        if (!mea2) return;
        for (const mk of endsVolta) mea2.endingRight = mk.openEnd ? StartStopDiscontinue.DISCONTINUE : StartStopDiscontinue.STOP;
      };
      if (el.kind === "beat-boundary" || el.kind === "inline-layer") return;
      if (el.kind === "sustain") {
        closeVolta(measure);
        if (lastChord) {
          lastChord.beats += 1;
          lastChord.duration = nominal(lastChord);
        }
        if (el.lyricAnchor && lastChord) attachLyrics$1(lyrics, cursors, lastChord);
        return;
      }
      if (el.kind === "barline") {
        const mea2 = measure ?? open(refs?.[index]?.measure);
        closeVolta(mea2);
        switch (el.type) {
          case "normal":
            mea2.barline = BarStyle.REGULAR;
            break;
          case "double":
            mea2.barline = BarStyle.LIGHT_LIGHT;
            break;
          case "end":
            mea2.barline = BarStyle.LIGHT_HEAVY;
            break;
          case "repeat-start":
            pendingRepeatForward = true;
            break;
          case "repeat-end":
            mea2.repeatBackward = true;
            mea2.barline = BarStyle.LIGHT_HEAVY;
            break;
          case "repeat-both":
            mea2.repeatBackward = true;
            mea2.barline = BarStyle.LIGHT_HEAVY;
            pendingRepeatForward = true;
            break;
          default:
            mea2.barline = BarStyle.NONE;
        }
        mea2.entries.push({ kind: "bar", position: new Fraction(0) });
        if (decorate && lastChord) {
          for (const orn of el.ornaments) {
            const bm = BARLINE_MARKS[orn.name];
            if (bm?.text) lastChord.directions.push({ text: bm.text, music: false, italic: false, atBarEnd: true });
            else if (bm?.glyph) lastChord.directions.push({ text: bm.glyph, music: true, italic: false, atBarEnd: true });
          }
        }
        newMeasureNeeded = true;
        return;
      }
      const mea = newMeasureNeeded || measure === null ? open(refs?.[index]?.measure) : measure;
      newMeasureNeeded = false;
      if (pendingRepeatForward) {
        mea.repeatForward = true;
        pendingRepeatForward = false;
      }
      if (pendingEnding) {
        applyEndingStart(mea, pendingEnding);
        pendingEnding = null;
      }
      closeVolta(mea);
      const ch = newChord(mea, idOf(el));
      const nt = newNote(ch);
      ch.notes.push(nt);
      nt.number = el.sound === "rhythm" ? "0" : String(el.pitch);
      nt.jpOctave = el.octave;
      nt.jpAlter = jpAlterOf(el);
      ch.beats = 1;
      ch.beams = Math.max(0, Math.round(Math.log2(el.duration / 4)));
      ch.dot = el.dots;
      if (el.hidden || el.sound === "rest" || el.sound === "rhythm" || nt.number === "0") ch.rest = true;
      const tup = marksEdgeAt(line.marks, index, "tuplet");
      if (tup.starts) nt.tupletBegin = true;
      if (tup.ends) nt.tupletEnd = true;
      if (nt.tupletBegin || nt.tupletEnd) tupletNotes.push(nt);
      const slurHits = marksAt(line.marks, index, "slur");
      const slurEnds = slurHits.filter((m) => m.end === index && !m.continuationToNext).length;
      for (let k = 0; k < slurEnds; k++) {
        ch.slurEnds++;
        const from = slurOpen.pop();
        if (from) from.slurEndChord = ch;
      }
      if (slurHits.some((m) => m.start === index && !m.continuationFromPrevious)) {
        ch.slurStart = true;
        slurOpen.push(ch);
      }
      for (const orn of el.ornaments) if (orn.name === "yc" || orn.name === "ycy") ch.fermata = true;
      if (decorate) decorateChord(ch, el);
      ch.duration = nominal(ch);
      mea.entries.push(ch);
      lastChord = ch;
      if (takesLyric(el)) attachLyrics$1(lyrics, cursors, ch);
    });
    if (lineIdx < lines.length - 1 && measure) breakAtMeasureEnd(measure, pageEndSet?.has(line) ?? false);
  });
  pairTuplets(tupletNotes);
  layoutTimes(measures);
  return measures;
}
function decorateChord(ch, el) {
  if (el.chord) ch.harmony = el.chord;
  if (el.annotation) ch.sectionWord = el.annotation;
  for (const orn of el.ornaments) {
    if (orn.name === "zy") ch.articulations.push("accent");
    else if (DYNAMICS[orn.name]) ch.directions.push({ text: DYNAMICS[orn.name], music: true, italic: false });
    else if (TERMS[orn.name]) ch.directions.push({ text: TERMS[orn.name], music: false, italic: true });
  }
  ch.graceNotes = el.graceBefore.map((g) => ({ number: String(g.pitch), jpOctave: g.octave, jpAlter: jpAlterOf(g), duration: g.duration }));
}
function layoutTimes(measures, scaleInner) {
  let inTuplet = false;
  for (const m of measures) {
    let pos = new Fraction(0);
    for (const ent of m.entries) {
      ent.position = pos;
      if (ent.kind !== "chord") continue;
      let dur = nominal(ent);
      const nt = ent.notes[0];
      if (nt?.tuplet && nt.tupletBegin) inTuplet = true;
      if (inTuplet || nt?.tuplet) dur = dur.timesInt(2).divInt(3);
      if (nt?.tuplet && nt.tupletEnd) inTuplet = false;
      ent.duration = dur;
      pos = pos.plus(dur);
    }
  }
  let acc = new Fraction(0);
  for (const m of measures) {
    m.position = acc;
    for (const ent of m.entries) if (ent.kind === "chord") acc = acc.plus(ent.duration);
  }
}
function attachLyrics$1(lyrics, cursors, ch) {
  for (const { verse, text } of nextSyllables(lyrics, cursors)) ch.notes[0].lyrics.push(lyric(text, verse));
}
const DEGREE_ALTER = { sharp: "#", flat: "b", natural: "n" };
const GRACE_DURATION = { eighth: 8, "16th": 16, "32nd": 32 };
function jianpuInputOfJpw(doc) {
  const song = doc.songs[0];
  const part = song?.parts[0];
  if (!song || !part) return null;
  const credit = (song.credits ?? []).map((c) => ({ type: null, text: c.text, page: 0 }));
  let key = { fifths: song.key?.fifths ?? 0 };
  let time = { beats: song.time?.beats ?? 4, beatType: song.time?.beatType ?? 4 };
  const byId = /* @__PURE__ */ new Map();
  const slurEnds = [];
  const marksFrom = /* @__PURE__ */ new Map();
  const marksTo = /* @__PURE__ */ new Map();
  const push2 = (map, id, mk) => {
    const list = map.get(id);
    if (list) list.push(mk);
    else map.set(id, [mk]);
  };
  for (const mk of song.marks) {
    if (mk.type !== "slur" && mk.type !== "tuplet") continue;
    push2(marksFrom, mk.start, mk);
    push2(marksTo, mk.end, mk);
  }
  const inlineBreak = /* @__PURE__ */ new Set();
  const tupletNotes = [];
  const measures = [];
  let graces = [];
  part.measures.forEach((dm, i) => {
    if (dm.attrs?.key && i > 0) key = { fifths: dm.attrs.key.fifths };
    if (dm.attrs?.time && i > 0) time = { beats: dm.attrs.time.beats, beatType: dm.attrs.time.beatType };
    const m = newMeasure(i, key, time);
    m.keyChange = i > 0 && !!dm.attrs?.key;
    m.timeChange = i > 0 && !!dm.attrs?.time;
    const prev = measures[i - 1];
    const brk = dm.print?.newPage ? "page" : dm.print?.newSystem ? "system" : null;
    if (prev && brk && !chords(prev).some((c) => c.id !== null && inlineBreak.has(c.id))) breakAtMeasureEnd(prev, brk === "page");
    measures.push(m);
    for (const el of dm.elements) {
      if (el.kind !== "chord") continue;
      const n0 = el.notes[0];
      if (el.grace) {
        const d2 = n0?.degree;
        const dur = GRACE_DURATION[el.duration.type ?? ""];
        graces.push({
          number: String(d2?.number ?? 1),
          jpOctave: d2?.octaveShift ?? 0,
          jpAlter: DEGREE_ALTER[d2?.accidental ?? ""] ?? " ",
          ...dur ? { duration: dur } : {}
        });
        continue;
      }
      const ch = newChord(m, el.id);
      byId.set(el.id, ch);
      const nt = newNote(ch);
      ch.notes.push(nt);
      const d = n0?.degree;
      ch.rest = !d || !!el.rest;
      nt.number = d && !el.rest ? String(d.number) : "0";
      nt.jpOctave = d?.octaveShift ?? 0;
      nt.jpAlter = DEGREE_ALTER[d?.accidental ?? ""] ?? " ";
      ch.beams = el.beams?.length ?? 0;
      ch.beats = (el.sustains?.length ?? 0) + 1;
      ch.dot = el.duration.dots;
      ch.fermata = !!el.notations?.fermata;
      for (const l of el.lyrics ?? []) nt.lyrics.push(lyric(l.text, l.number));
      ch.graceNotes = graces;
      graces = [];
      for (const mk of marksTo.get(el.id) ?? []) {
        if (mk.type === "slur") ch.slurEnds++;
        else nt.tupletEnd = true;
      }
      for (const mk of marksFrom.get(el.id) ?? []) {
        if (mk.type === "slur") {
          ch.slurStart = true;
          slurEnds.push({ from: ch, to: mk.end });
        } else {
          nt.tupletBegin = true;
        }
      }
      if (nt.tupletBegin) tupletNotes.push(nt);
      if (nt.tupletEnd) tupletNotes.push(nt);
      m.entries.push(ch);
      if (el.lineBreakAfter) {
        inlineBreak.add(el.id);
        breakAfterChord(m, ch, el.lineBreakAfter === "page");
      }
    }
    if ((dm.barlines ?? []).some((b) => b.location === "right")) m.entries.push({ kind: "bar", position: new Fraction(0) });
  });
  const last = measures[measures.length - 1];
  if (last && part.endBreak) breakAtMeasureEnd(last, part.endBreak === "page");
  for (const { from, to } of slurEnds) from.slurEndChord = byId.get(to) ?? null;
  pairTuplets(tupletNotes);
  layoutTimes(measures);
  const playData = playDataOfSong(doc, 0) ?? new PlayData();
  const tempo = quarterTempos(song)[0];
  playData.tempo = typeof tempo === "number" ? tempo : 0;
  return { parts: [{ measures }], title: song.work.title ?? "", credit, playData };
}
const PUNCT_END = /[。！？…；]$/;
const PUNCT_MID = /[，、：]$/;
function mainLyricText(c) {
  const nt = c.notes[0];
  const l = nt?.lyrics.find((x) => x.number === 1 || x.refrain) ?? nt?.lyrics[0];
  return l?.text ?? "";
}
const HEAD_FP_LEN = 8;
function noteKeyOf(c) {
  const nt = c.notes[0];
  return !nt || c.rest ? "R" : nt.number + ":" + nt.jpOctave;
}
function headFpOf(chords2) {
  let i = 0;
  while (i < chords2.length && chords2[i].rest) i++;
  const notes = chords2.slice(i, i + HEAD_FP_LEN);
  if (notes.length < HEAD_FP_LEN) return "";
  return notes.map(noteKeyOf).join(",");
}
const TRAIL_QUOTE = /[”’＂"』」）)〉》〕】]+$/;
function punctScore(text) {
  const t2 = text.replace(TRAIL_QUOTE, "");
  return PUNCT_END.test(t2) ? 6 : PUNCT_MID.test(t2) ? 4 : 0;
}
function lyricPunctScore(c) {
  const ps = [];
  for (const nt of c.notes) for (const l of nt.lyrics) if (l.text) ps.push(punctScore(l.text));
  if (!ps.length) return 0;
  ps.sort((a, b) => a - b);
  return ps[Math.floor(ps.length / 2)];
}
function lyricIsSentenceEnd(c) {
  let end = 0;
  let n = 0;
  for (const nt of c.notes) for (const l of nt.lyrics) {
    if (!l.text) continue;
    if (isSentenceEnd(l.text)) end++;
    n++;
  }
  return n > 0 && end * 2 > n;
}
function isSentenceEnd(text) {
  return PUNCT_END.test(text.replace(TRAIL_QUOTE, ""));
}
const DEF_MIN_MEAS = 3;
const DEF_TARGET_MEAS = 4;
const DEF_MAX_MEAS = 7;
const DEF_MAX_CELLS = 25;
const DEF_MAX_SENTENCE_CELLS = 33;
const DEF_MAX_SENTENCE_MEAS = 8;
const DEF_MIN_CELLS = 14;
const LONG_NOTE_BEATS = 3;
const INTRO_MIN_MEAS = 2;
const DASH_W = 0.7;
const cellsOf = (c) => 1 + Math.max(0, Math.floor(c.beats) - 1) * DASH_W;
function measureFp(chords2) {
  return chords2.map((c) => {
    const nt = c.notes[0];
    if (!nt || c.rest) return "R";
    return nt.number + ":" + nt.jpOctave;
  }).join(",");
}
function computePhraseBreaks(part, opts = {}) {
  const TARGET_MEAS = opts.targetMeas ?? DEF_TARGET_MEAS;
  const MIN_MEAS = opts.minMeas ?? DEF_MIN_MEAS;
  const scaled = opts.targetMeas !== void 0 && opts.targetMeas > DEF_TARGET_MEAS;
  const MAX_MEAS = opts.maxMeas ?? (scaled ? Math.round(TARGET_MEAS * 1.3) : DEF_MAX_MEAS);
  const MAX_SENTENCE_MEAS = opts.maxSentenceMeas ?? (scaled ? Math.round(TARGET_MEAS * 1.4) : DEF_MAX_SENTENCE_MEAS);
  const MAX_CELLS = opts.maxCells ?? DEF_MAX_CELLS;
  const MAX_SENTENCE_CELLS = opts.maxSentenceCells ?? Math.max(DEF_MAX_SENTENCE_CELLS, MAX_CELLS);
  const LEN_WEIGHT = opts.lenWeight ?? 1;
  const SHORT_WORDS = opts.shortSentenceWords ?? 0;
  const REPEAT_LEN_BONUS = opts.repeatLenBonus ?? false;
  const BREAK_WEIGHT = opts.breakWeight ?? 1;
  const LAST_PAIR_WEIGHT = opts.lastPairWeight ?? 1;
  const PAGE_LINES2 = opts.pageLines ?? 0;
  const EVEN_WEIGHT = opts.evenWeight ?? 0;
  const TAIL_WEIGHT = opts.tailWeight ?? 0;
  const CELLS_ARE_ITEMS = opts.cellsAreItems ?? false;
  const CONTENT_ONLY = opts.contentOnly ?? false;
  const JUMP_MEAS = opts.jumpMeasures ?? /* @__PURE__ */ new Set();
  const PARALLEL_WEIGHT = opts.parallelWeight ?? 0;
  const TAIL_LONG_WEIGHT = opts.tailLongWeight ?? 0;
  const ROW_COST = opts.rowCost ?? 20;
  const PARALLEL_SCORE = opts.parallelScore ?? 8;
  const FIT_SLACK = opts.fitSlack ?? 0;
  const MORE_ROWS_SLACK = opts.moreRowsSlack ?? 0;
  const FIT = opts.fit;
  const ABDICATE_RATIO = 1.5;
  const BREAK_QUALITY_WEIGHT = 8;
  const LAST_PAIR_QUALITY_RATIO = 0.6;
  const LAST_PAIR_QUALITY_WEIGHT = 60;
  const SHORT_OUTLIER_RATIO = 0.6;
  const OUTLIER_WEIGHT = 60;
  const HILL_ROUNDS = 2;
  const HILL_PLANS = 8;
  const HILL_MIN_GAIN = 10;
  const D8_RATIO = 0.5;
  const TAIL_TONIC_WEIGHT = 2;
  const RUN_WITH_LEN_WEIGHT = 2;
  const MIN_CELLS = Math.min(DEF_MIN_CELLS, Math.round(MAX_CELLS * 0.6));
  const measures = part.measures;
  const n = measures.length;
  const measureBreaks = /* @__PURE__ */ new Set();
  const midBreaks = /* @__PURE__ */ new Set();
  const sectionStarts = /* @__PURE__ */ new Set();
  const cutList = [];
  const capacityCuts = /* @__PURE__ */ new Set();
  const sectionCutChords = /* @__PURE__ */ new Set();
  const forced = /* @__PURE__ */ new Set();
  let refrainCut = false;
  if (n <= 1) return { measureBreaks, midBreaks, sectionStarts, sectionCutChords, refrainCut, forced, cuts: cutList, capacityCuts };
  const chordsPer = measures.map((m) => chordsOf$1(m));
  const fpPer = chordsPer.map((cs) => measureFp(cs));
  const lyrPer = chordsPer.map((cs) => cs.map(mainLyricText).join(""));
  const repeatEdges = /* @__PURE__ */ new Map();
  const markRepeats = (fp) => {
    const mark = (i, len) => repeatEdges.set(i, Math.max(repeatEdges.get(i) ?? 0, len));
    for (let d = 1; d < n; d++) {
      let i = 0;
      while (i + d < n) {
        if (!fp[i] || fp[i] !== fp[i + d]) {
          i++;
          continue;
        }
        let j = i;
        while (j + d < n && fp[j] && fp[j] === fp[j + d]) j++;
        if (j - i >= 2) {
          const len = j - i;
          mark(i - 1, len);
          mark(j - 1, len);
          mark(i + d - 1, len);
          mark(j + d - 1, len);
        }
        i = j;
      }
    }
  };
  markRepeats(fpPer);
  markRepeats(lyrPer);
  const measureDur = chordsPer.map((cs) => cs.reduce((s, c) => s + (c.duration?.toFloat() ?? 0), 0) || 1);
  const flat = [];
  for (let i = 0; i < n; i++) {
    const cs = chordsPer[i];
    for (let k = 0; k < cs.length; k++) {
      const c = cs[k];
      const within = c.position.plus(c.duration ?? new Fraction(0)).toFloat() / measureDur[i];
      flat.push({ chord: c, mi: i, isLast: k === cs.length - 1, isFirst: k === 0, pos: i + Math.min(1, within) });
    }
  }
  const K = flat.length;
  if (K === 0) return { measureBreaks, midBreaks, sectionStarts, sectionCutChords, refrainCut, forced, cuts: cutList, capacityCuts };
  const okStart = new Array(K).fill(0);
  const okEnd = new Array(K).fill(0);
  const tieFrom = new Array(K).fill(-1);
  {
    const stack = [];
    for (let idx = 0; idx < K; idx++) {
      const c = flat[idx].chord;
      const nt = c.notes[0];
      const nE = (nt?.tieEnd ? 1 : 0) + c.slurEnds;
      const nS = (nt?.tieStart ? 1 : 0) + (c.slurStart ? 1 : 0);
      for (let k = 0; k < nE; k++) {
        const s = stack.pop();
        if (s === void 0) break;
        okStart[s]++;
        okEnd[idx]++;
        if (tieFrom[idx] < 0 || flat[s].chord.beats > flat[tieFrom[idx]].chord.beats) tieFrom[idx] = s;
      }
      for (let k = 0; k < nS; k++) stack.push(idx);
    }
  }
  const depthAfter = new Array(K).fill(0);
  const punctAfter = new Array(K).fill(0);
  const endAfter = new Array(K).fill(false);
  const carriedFrom = new Array(K).fill(-1);
  const carriedAway = /* @__PURE__ */ new Set();
  {
    let depth = 0;
    let pending = 0;
    let pendingFrom = -1;
    let pendingEnd = false;
    let sinceLastPunct = 0;
    for (let idx = 0; idx < K; idx++) {
      const c = flat[idx].chord;
      depth += okStart[idx];
      const txt = mainLyricText(c);
      if (txt) sinceLastPunct++;
      let p = CONTENT_ONLY ? lyricPunctScore(c) : punctScore(txt);
      const pIsEnd = CONTENT_ONLY ? lyricIsSentenceEnd(c) : isSentenceEnd(txt);
      if (p > 0 && sinceLastPunct <= SHORT_WORDS) p = Math.round(p / 2);
      if (txt && p > 0) sinceLastPunct = 0;
      if (p > pending) {
        pending = p;
        pendingFrom = idx;
        pendingEnd = pIsEnd;
      }
      depth -= okEnd[idx];
      depthAfter[idx] = depth;
      const next = flat[idx + 1];
      const carryOn = !c.rest && !!next && next.chord.rest && next.mi === flat[idx].mi;
      if (depth === 0 && !carryOn) {
        punctAfter[idx] = pending;
        endAfter[idx] = pendingEnd;
        if (pending > 0 && pendingFrom >= 0 && pendingFrom !== idx) {
          carriedFrom[idx] = pendingFrom;
          carriedAway.add(pendingFrom);
        }
        pending = 0;
        pendingFrom = -1;
        pendingEnd = false;
      }
    }
  }
  const advancePastLongTie = (from) => {
    let idx = from;
    while (idx + 1 < K && okStart[idx + 1] > 0 && flat[idx + 1].chord.beats >= 2) {
      let j = idx + 1;
      while (j < K && depthAfter[j] !== 0) j++;
      if (j >= K || j === idx) break;
      idx = j;
    }
    return idx;
  };
  const retreatToPunct = (from) => {
    for (let j = from - 1; j >= 0 && from - j <= 2; j--) {
      if (depthAfter[j] !== 0) break;
      if (punctAfter[j] > 0) return j;
      if (flat[j].chord.beats > 1) break;
    }
    return from;
  };
  const repeatBreakIdx = /* @__PURE__ */ new Map();
  for (const [mi, len] of repeatEdges) {
    const idx = flat.findIndex((f) => f.isLast && f.mi === mi);
    if (idx < 0) continue;
    const at = retreatToPunct(advancePastLongTie(idx));
    repeatBreakIdx.set(at, Math.max(repeatBreakIdx.get(at) ?? 0, len));
  }
  const inEnding = new Array(n).fill(false);
  const endingLast = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (!measures[i].endingLeft) continue;
    let j = i;
    while (j < n && measures[j].endingRight === null && (j === i || !measures[j].endingLeft)) j++;
    if (j >= n || measures[j].endingRight === null) continue;
    if (j - i > MAX_MEAS) continue;
    for (let k = i; k <= j; k++) inEnding[k] = true;
    endingLast[j] = true;
    i = j;
  }
  const endingGroups = [];
  {
    let i = 0;
    while (i < n) {
      if (!inEnding[i]) {
        i++;
        continue;
      }
      const startMi = i;
      let first = true;
      let dur = 0;
      let cells = 0;
      let cellsInt = 0;
      let endMi = i;
      while (i < n && inEnding[i]) {
        const from = i;
        while (i < n && inEnding[i] && !endingLast[i]) i++;
        const to = Math.min(i, n - 1);
        i = to + 1;
        endMi = to;
        if (!first) {
          for (let k = from; k <= to; k++) for (const c of chordsPer[k]) {
            dur += c.duration?.toFloat() ?? 0;
            cells += cellsOf(c);
            cellsInt += Math.max(1, Math.floor(c.beats) || 1);
          }
        }
        first = false;
      }
      if (dur > 0) endingGroups.push({ startMi, endMi, dur, cells, cellsInt });
    }
  }
  const endingCut = (i0, i1, key) => {
    if (!endingGroups.length || i0 > i1) return 0;
    const a = flat[i0].mi;
    const b = flat[i1].mi;
    let v = 0;
    for (const g of endingGroups) if (a <= g.startMi && b >= g.endMi) v += g[key];
    return v;
  };
  const fullMeasure = Math.max(...measureDur);
  const pickupStd = measureDur[0] < fullMeasure - 1e-6 ? measureDur[0] : 0;
  const openingRest = pickupStd === 0 && flat[0]?.chord.rest ? flat[0].chord.duration?.toFloat() ?? 0 : 0;
  const startsLikeSong = (idx) => {
    if (!(openingRest > 0)) return false;
    const nx = flat[idx + 1];
    if (!nx || !nx.chord.rest || nx.chord !== chordsPer[nx.mi][0]) return false;
    return Math.abs((nx.chord.duration?.toFloat() ?? 0) - openingRest) < 0.01;
  };
  const headDurAfter = (idx) => {
    const nx = flat[idx + 1];
    if (!nx) return 0;
    let head = 0;
    for (let j = idx + 1; j < K && flat[j].mi === nx.mi; j++) {
      head += flat[j].chord.duration?.toFloat() ?? 0;
      if (flat[j].isLast) break;
    }
    return head;
  };
  const headPenalty = (idx) => {
    const nx = flat[idx + 1];
    if (!nx) return 0;
    const head = headDurAfter(idx);
    let hasNote = false;
    for (let j = idx + 1; j < K && flat[j].mi === nx.mi; j++) {
      if (!flat[j].chord.rest) hasNote = true;
      if (flat[j].isLast) break;
    }
    const partial = !(nx.chord === chordsPer[nx.mi][0]);
    let s = 0;
    if (!hasNote && partial) s += 12;
    const headRest = nx.chord.rest ? nx.chord.duration?.toFloat() ?? 0 : 0;
    const songOpen = startsLikeSong(idx);
    const headWhole = CONTENT_ONLY && headRest > 0 && headRest <= 0.5 && Math.abs(head - Math.round(head)) < 0.01;
    if (headRest > 0 && headRest <= 0.5 && Math.abs(head - pickupStd) > 0.01 && !songOpen && !headWhole) s += 8;
    const tailStuck = lyricPunctScore(flat[idx].chord) > 0 || punctAfter[idx] > 0 && !flat[idx].chord.rest && !mainLyricText(flat[idx].chord);
    if (CONTENT_ONLY && pickupStd > 0 && head > 0 && head < pickupStd - 0.01 && !tailStuck) s += 12;
    if (CONTENT_ONLY && nx.chord.rest && lyricPunctScore(flat[idx].chord) > 0 && !(pickupStd > 0 && Math.abs(head - pickupStd) < 0.01) && !songOpen && !headWhole) s += 8;
    if (CONTENT_ONLY && !nx.chord.rest && !mainLyricText(flat[idx].chord) && !flat[idx].chord.rest) {
      let j = idx;
      while (j >= 0 && !mainLyricText(flat[j].chord)) j--;
      if (j >= 0 && lyricPunctScore(flat[j].chord) === 0) s += 8;
    }
    const prevWordPunct = (() => {
      let j = idx;
      while (j >= 0 && !mainLyricText(flat[j].chord)) j--;
      return j < 0 ? 0 : lyricPunctScore(flat[j].chord);
    })();
    if (CONTENT_ONLY && lyricPunctScore(nx.chord) > 0 && prevWordPunct === 0) s += 8;
    if (nx.chord.beats >= 2 && lyricPunctScore(nx.chord) > 0 && prevWordPunct === 0) s += 10;
    if (TAIL_WEIGHT > 0) {
      let words = 0;
      for (let j = idx; j >= 0; j--) {
        if (punctAfter[j] === 6) {
          if (words >= 1) s += TAIL_WEIGHT * 8;
          break;
        }
        const c = flat[j].chord;
        if (j < idx && c.beats >= 2) break;
        if (!c.rest && mainLyricText(c)) words++;
        if (words > 2) break;
      }
    }
    const tailMax = MAX_CELLS * 0.35;
    const strongEnd = punctAfter[idx] > 0 && flat[idx].chord.beats >= 2;
    const sentenceEndHere = CONTENT_ONLY ? endAfter[idx] : punctAfter[idx] === 6;
    if (TAIL_WEIGHT > 0 && !strongEnd && !sentenceEndHere) {
      let run = 0;
      let runWord = 0;
      for (let j = idx + 1; j < K; j++) {
        run += cellsOf(flat[j].chord);
        if (mainLyricText(flat[j].chord)) runWord = run;
        if (runWord > tailMax) break;
        if ((CONTENT_ONLY ? endAfter[j] : punctAfter[j] === 6) && j < K - 1) {
          const w = CONTENT_ONLY ? punctAfter[j] / 6 : 1;
          s += TAIL_WEIGHT * 10 * (1 - runWord / tailMax) * w;
          break;
        }
      }
    }
    return s;
  };
  const PARALLEL_MAX = 16;
  const PARALLEL_MIN = 4;
  const headKeysFrom = (i) => {
    let j = i;
    while (j < K && flat[j].chord.rest) j++;
    const keys = [];
    for (let t2 = j; t2 < K && keys.length < PARALLEL_MAX; t2++) keys.push(noteKeyOf(flat[t2].chord));
    return keys;
  };
  const commonPrefix = (ka, kb) => {
    let n2 = 0;
    while (n2 < ka.length && n2 < kb.length && ka[n2] === kb[n2]) n2++;
    if (n2 >= 2 && n2 + 1 < ka.length && n2 + 1 < kb.length) {
      let m = n2 + 1;
      while (m < ka.length && m < kb.length && ka[m] === kb[m]) m++;
      if (m - n2 - 1 >= 2) return m - 1;
    }
    return n2;
  };
  const parallelLen = /* @__PURE__ */ new Map();
  if (PARALLEL_WEIGHT > 0) {
    const heads = [];
    for (let i = 0; i < K; i++) {
      if (i > 0) {
        const pv = flat[i - 1];
        if (!(pv.isLast || punctAfter[i - 1] > 0 || pv.chord.beats >= 2 || pv.chord.rest)) continue;
      }
      const keys = headKeysFrom(i);
      if (keys.length >= PARALLEL_MIN) heads.push({ at: i, keys });
    }
    for (let a = 0; a < heads.length; a++) {
      for (let b = a + 1; b < heads.length; b++) {
        const n2 = commonPrefix(heads[a].keys, heads[b].keys);
        if (n2 < PARALLEL_MIN) continue;
        parallelLen.set(heads[a].at, Math.max(parallelLen.get(heads[a].at) ?? 0, n2));
        parallelLen.set(heads[b].at, Math.max(parallelLen.get(heads[b].at) ?? 0, n2));
      }
    }
  }
  const parallelAt = (idx) => {
    if (!(PARALLEL_WEIGHT > 0) || idx + 1 >= K) return 0;
    const c = flat[idx].chord;
    if (!(punctAfter[idx] > 0 || c.beats >= 2 || c.rest || c.fermata)) return 0;
    return parallelLen.get(idx + 1) ?? 0;
  };
  const startsParallel = (idx) => parallelAt(idx) >= PARALLEL_MIN;
  const PARALLEL_STRONG = 8;
  const strongParallel = (idx) => parallelAt(idx) >= PARALLEL_STRONG;
  const scoreBase = (idx) => {
    const ci = flat[idx];
    const c = ci.chord;
    let s = punctAfter[idx];
    if (c.fermata) s += 5;
    if (c.beats >= 2) s += 4;
    if (carriedFrom[idx] >= 0 && flat[carriedFrom[idx]].chord.beats >= 2) s += 4;
    if (c.rest) s += CONTENT_ONLY ? c.beams === 0 ? 4 : 2 : c.beams === 0 ? 1 : 0;
    if (ci.isLast && lyrPer[ci.mi] === "" && ci.mi + 1 < n && lyrPer[ci.mi + 1] !== "") {
      let run = 0;
      for (let j = ci.mi; j >= 0 && lyrPer[j] === "" && run < INTRO_MIN_MEAS; j--) run++;
      if (run >= INTRO_MIN_MEAS) s += 6;
    }
    if (okEnd[idx] > 0) {
      s += 1;
      const st = tieFrom[idx];
      if (st >= 0 && flat[st].chord.beats >= 2) s += 4;
    }
    if (ci.isLast && ci.mi + 1 < n && measures[ci.mi + 1].keyChange) s += 10;
    if (ci.isLast && ci.mi + 1 < n && measures[ci.mi + 1].repeatForward) s += 8;
    if (ci.isLast) {
      const m = measures[ci.mi];
      if (m.repeatBackward || m.barline === BarStyle.LIGHT_HEAVY || m.barline === BarStyle.LIGHT_LIGHT) s += 5;
      if (endingLast[ci.mi]) s += 6;
    }
    const rep = repeatBreakIdx.get(idx);
    const repIsEnd = punctAfter[idx] > 0 || c.rest || c.fermata || okEnd[idx] > 0;
    if (rep !== void 0) {
      const full = REPEAT_LEN_BONUS ? Math.min(10, 6 + rep) : 8;
      s += CONTENT_ONLY && !repIsEnd ? 2 : full;
    }
    if (ci.isLast && JUMP_MEAS.has(ci.mi)) s += 10;
    return s;
  };
  const scoreAt = (idx) => scoreBase(idx) + (startsParallel(idx) ? PARALLEL_SCORE : 0);
  const cand = [];
  for (let idx = 0; idx < K; idx++) {
    if (depthAfter[idx] !== 0) continue;
    const mi = flat[idx].mi;
    if (inEnding[mi] && !(flat[idx].isLast && endingLast[mi])) continue;
    if (flat[idx].isLast || scoreBase(idx) > 0) cand.push(idx);
  }
  if (cand[cand.length - 1] !== K - 1) cand.push(K - 1);
  const sectionMi = [...Array(n).keys()].filter((mi) => mi > 0 && measures[mi].sectionMark);
  const retreatPastPickupRest = (at) => {
    if (flat[at].isLast) return at;
    let idx = at;
    while (idx >= 0 && flat[idx].chord.rest && flat[idx].chord.beams > 0) idx--;
    if (!(idx >= 0 && idx !== at && depthAfter[idx] === 0)) return at;
    if (CONTENT_ONLY && pickupStd > 0 && Math.abs(headDurAfter(idx) - pickupStd) > 0.01 && Math.abs(headDurAfter(at) - pickupStd) < 0.01) return at;
    return idx;
  };
  const aroundSectionPickup = (at0) => {
    const at = retreatPastPickupRest(at0);
    let leadingChords = 0;
    for (let idx = at + 1; idx < K && idx <= at + 3; idx++) {
      const c = flat[idx].chord;
      if (c.beats > 1) break;
      if (!c.rest) leadingChords++;
      if (punctAfter[idx] === 6 && leadingChords > 0 && leadingChords <= 2) return idx;
      if (leadingChords > 2) break;
    }
    let pickupChords = 0;
    for (let idx = at; idx >= 0 && at - idx <= 3; idx--) {
      if (punctAfter[idx] === 6 && pickupChords > 0 && pickupChords <= 3) return idx;
      const c = flat[idx].chord;
      if (c.beats > 1) break;
      if (!c.rest) pickupChords++;
      if (pickupChords > 3) break;
    }
    return at;
  };
  const sectionCutIdx = /* @__PURE__ */ new Map();
  for (const mi of sectionMi) {
    const at = flat.findIndex((f) => f.isLast && f.mi === mi - 1);
    if (at < 0) continue;
    let idx = at;
    while (idx < K && depthAfter[idx] !== 0) idx++;
    idx = advancePastLongTie(idx);
    idx = aroundSectionPickup(idx);
    if (idx < K) sectionCutIdx.set(mi, idx);
  }
  {
    let sawVerse = false, refrainIdx = -1;
    outer: for (let idx = 0; idx < K; idx++) {
      for (const nt of flat[idx].chord.notes) {
        for (const lrc of nt.lyrics) {
          if (lrc.text.length === 0) continue;
          if (!lrc.refrain) {
            sawVerse = true;
            continue;
          }
          if (!sawVerse) continue;
          if (K - idx >= Math.max(8, K / 8)) refrainIdx = idx;
          break outer;
        }
      }
    }
    if (refrainIdx > 0) {
      sectionCutIdx.set(flat[refrainIdx].mi, aroundSectionPickup(refrainIdx - 1));
      refrainCut = true;
    }
  }
  for (const idx of new Set(sectionCutIdx.values())) {
    if (cand.includes(idx)) continue;
    const at = cand.findIndex((c) => c > idx);
    cand.splice(at < 0 ? cand.length : at, 0, idx);
  }
  const M = cand.length;
  const sectionCuts = [];
  for (const [, idx] of sectionCutIdx) {
    const b = cand.indexOf(idx);
    if (b < 0) continue;
    sectionCuts.push(b + 1);
    if (flat[idx].isLast) sectionStarts.add(flat[idx].mi + 1);
    else sectionCutChords.add(flat[idx].chord);
  }
  const ends = [0, ...cand.map((i) => flat[i].pos)];
  const idxAt = [-1, ...cand];
  const cellsUpto = new Array(K + 1).fill(0);
  for (let i = 0; i < K; i++) cellsUpto[i + 1] = cellsUpto[i] + cellsOf(flat[i].chord);
  const cellsBetween = (a, b) => cellsUpto[idxAt[b] + 1] - cellsUpto[idxAt[a] + 1] - endingCut(idxAt[a] + 1, idxAt[b], "cells");
  const cellsIntUpto = new Array(K + 1).fill(0);
  for (let i = 0; i < K; i++) cellsIntUpto[i + 1] = cellsIntUpto[i] + Math.max(1, Math.floor(flat[i].chord.beats) || 1);
  const cellsIntBetween = (a, b) => CELLS_ARE_ITEMS ? cellsIntUpto[idxAt[b] + 1] - cellsIntUpto[idxAt[a] + 1] - endingCut(idxAt[a] + 1, idxAt[b], "cellsInt") : cellsBetween(a, b);
  const durUpto = new Array(K + 1).fill(0);
  for (let i = 0; i < K; i++) durUpto[i + 1] = durUpto[i] + (flat[i].chord.duration?.toFloat() ?? 0);
  const durBetween = (a, b) => durUpto[idxAt[b] + 1] - durUpto[idxAt[a] + 1] - endingCut(idxAt[a] + 1, idxAt[b], "dur");
  const isSentenceEndAt = (i) => CONTENT_ONLY ? endAfter[i] : punctAfter[i] === 6;
  const endPunctUpto = new Array(K + 1).fill(0);
  for (let i = 0; i < K; i++)
    endPunctUpto[i + 1] = endPunctUpto[i] + ((CONTENT_ONLY ? endAfter[i] : punctAfter[i] === 6) ? 1 : 0);
  const crossedEndPunct = (a, b) => endPunctUpto[idxAt[b]] - endPunctUpto[idxAt[a] + 1];
  const INF = Number.POSITIVE_INFINITY;
  const BASE_BREAK = 8;
  const CONTENT_BASE_BREAK = 24;
  const breakCost = (b, hi) => {
    if (b === hi) return 0;
    const sc = scoreAt(cand[b - 1]);
    const base = CONTENT_ONLY ? Math.max(0, BASE_BREAK * (1 - sc / CONTENT_BASE_BREAK)) : Math.max(0, BASE_BREAK - sc * BREAK_WEIGHT);
    const noEvidence = CONTENT_ONLY && sc < 1 ? 3 : 0;
    return base + noEvidence + (flat[cand[b - 1]].isLast || sc >= 4 ? 0 : 6) + headPenalty(cand[b - 1]);
  };
  const CROSSED_END_PUNCT_COST = 4;
  const SPLIT_SHORT_SENTENCE_COST = 24;
  const lenCost = (meas, cells, segEnd, maxCells = MAX_CELLS, maxMeas = MAX_MEAS, target = TARGET_MEAS, lenW = LEN_WEIGHT, cellsInt = cells) => (
    // **contentOnly 下只剩「排不排得下」这一条**：小节数上限、行太稀那几项都是绝对量、
    // 直接挂在版心容量上，不该由它们决定乐句断在哪儿（见 PhraseOptions.contentOnly）。
    // 行长目标这一项留着，但**由调用方决定用不用**：第一遍 DP 传 lenW = 0（纯内容断句），
    // 方案选优那几遍传的 target 是「本段小节数 ÷ 行数」——那是个**相对**量，不含纸张，
    // 只是让 DP 排得出指定的行数（行数本身不进 quality 的评分）。
    lenW * (meas - target) ** 2 + (!CONTENT_ONLY && meas > maxMeas ? (meas - maxMeas) ** 2 * 40 : 0) + (!CONTENT_ONLY && cellsInt > maxCells ? (cellsInt - maxCells) ** 2 * 8 : 0) + // 段末/曲末行是唯一可短于 MIN 的行，但也**不该短到只剩一小节**——软罚让 DP 宁可把前面几行
    // 各让出一点，也别甩出一个孤零零的尾巴（"不要有只有一节的情况"）。
    (!CONTENT_ONLY && segEnd && meas < MIN_MEAS ? (MIN_MEAS - meas) ** 2 * 10 : 0) + // 「尾巴太短」在小节短促的谱上按小节数量不出来：「基督更美」每小节才 4 格，末行 3 小节
    // 合规、实则只有 7.7 格（同曲其余行 15.7）。故段末行的下限也认格数，与非段末行的 MIN_CELLS
    // 同一口径——非段末行是硬约束，段末行仍只软罚（末行本来就可以短一些）。
    (!CONTENT_ONLY && segEnd && cells < MIN_CELLS ? (MIN_CELLS - cells) ** 2 : 0)
  );
  const FORCED_CUT_TAIL_CELLS = 8;
  const forcedCuts = [];
  {
    const keyChangeMeas = /* @__PURE__ */ new Set();
    if (CONTENT_ONLY) {
      for (let mi = 1; mi < n; mi++) if (measures[mi].keyChange) keyChangeMeas.add(mi - 1);
    }
    if (CONTENT_ONLY) {
      for (let mi = INTRO_MIN_MEAS - 1; mi + 1 < n; mi++) {
        if (lyrPer[mi] !== "" || lyrPer[mi + 1] === "") continue;
        let run = 0;
        for (let j = mi; j >= 0 && lyrPer[j] === "" && run < INTRO_MIN_MEAS; j--) run++;
        if (run >= INTRO_MIN_MEAS) keyChangeMeas.add(mi);
      }
    }
    for (let i = 0; i < M; i++) {
      const idx = cand[i];
      if (idx === K - 1 || !flat[idx].isLast) continue;
      if (!JUMP_MEAS.has(flat[idx].mi) && !keyChangeMeas.has(flat[idx].mi)) continue;
      if (cellsUpto[K] - cellsUpto[idx + 1] < FORCED_CUT_TAIL_CELLS) continue;
      let at = i;
      if (!JUMP_MEAS.has(flat[idx].mi)) {
        let sung = idx + 1;
        while (sung < K && !mainLyricText(flat[sung].chord)) sung++;
        for (let j = i + 1; j < M && cand[j] < sung; j++) at = j;
      }
      forcedCuts.push(at + 1);
      const fi = flat[cand[at]];
      if (fi.isLast) forced.add(fi.mi + 1);
    }
  }
  const cuts = [0, .../* @__PURE__ */ new Set([...sectionCuts, ...forcedCuts])].sort((p, q) => p - q);
  if (cuts[cuts.length - 1] !== M) cuts.push(M);
  const runDP = (targetFor, lenW) => {
    const dp = new Array(M + 1).fill(INF);
    const nextB2 = new Array(M + 1).fill(-1);
    dp[M] = 0;
    for (let s = cuts.length - 1; s >= 1; s--) {
      const lo = cuts[s - 1], hi = cuts[s];
      const target = targetFor(s);
      for (let a = hi - 1; a >= lo; a--) {
        for (let b = a + 1; b <= hi; b++) {
          const meas = ends[b] - ends[a], cells = cellsBetween(a, b);
          if (b > a + 1 && (meas > MAX_MEAS * 2 || cells > MAX_CELLS * 2)) break;
          if (b < hi && (CONTENT_ONLY ? meas < 2 && scoreAt(cand[b - 1]) < 4 : meas < MIN_MEAS && cells < MIN_CELLS)) continue;
          const bc = breakCost(b, hi);
          const crossed = crossedEndPunct(a, b);
          const endsAtSentence = isSentenceEndAt(idxAt[b]);
          let splitSentence = 0;
          if (b < hi && !endsAtSentence) {
            const bi = idxAt[b];
            const softCut = flat[bi].chord.beats < LONG_NOTE_BEATS && !flat[bi].chord.fermata && !flat[bi].chord.rest && !strongParallel(bi);
            for (let p = idxAt[b] + 1; p <= idxAt[hi]; p++) {
              if (punctAfter[p] !== 6) continue;
              const sentenceCells = CELLS_ARE_ITEMS ? cellsIntUpto[p + 1] - cellsIntUpto[idxAt[a] + 1] : cellsUpto[p + 1] - cellsUpto[idxAt[a] + 1];
              const sentenceMeas = flat[p].pos - ends[a];
              if (softCut && sentenceCells <= MAX_SENTENCE_CELLS && sentenceMeas <= MAX_SENTENCE_MEAS) {
                splitSentence = SPLIT_SHORT_SENTENCE_COST;
              }
              break;
            }
          }
          const wholeSentence = endsAtSentence && crossed === 0 && meas <= MAX_SENTENCE_MEAS && cells <= MAX_SENTENCE_CELLS;
          const lineMaxCells = wholeSentence ? MAX_SENTENCE_CELLS : MAX_CELLS;
          const lineMaxMeas = wholeSentence ? MAX_SENTENCE_MEAS : MAX_MEAS;
          const lastPair = b < hi && nextB2[b] === hi ? Math.min(40, LAST_PAIR_WEIGHT * (meas - (ends[hi] - ends[b])) ** 2) : 0;
          const cost = lenCost(meas, cells, b === hi, lineMaxCells, lineMaxMeas, target, lenW, cellsIntBetween(a, b)) + bc + splitSentence + lastPair + crossed * CROSSED_END_PUNCT_COST + dp[b];
          if (cost < dp[a]) {
            dp[a] = cost;
            nextB2[a] = b;
          }
        }
        if (dp[a] === INF) {
          const b = Math.min(a + 1, hi);
          dp[a] = dp[b] + lenCost(ends[b] - ends[a], cellsBetween(a, b), b === hi, MAX_CELLS, MAX_MEAS, target, lenW);
          nextB2[a] = b;
        }
      }
    }
    return { dp, nextB: nextB2 };
  };
  const linesPerSeg = (nb) => {
    const out = new Array(cuts.length - 1).fill(0);
    for (let a = 0; a < M; ) {
      const b = nb[a];
      if (b <= a) break;
      const s = cuts.findIndex((c) => c >= b);
      if (s >= 1) out[s - 1]++;
      a = b;
    }
    return out;
  };
  let { nextB } = runDP(() => TARGET_MEAS, CONTENT_ONLY ? 0 : LEN_WEIGHT);
  if (PAGE_LINES2 > 0) {
    const base = linesPerSeg(nextB);
    const total = base.reduce((x, y) => x + y, 0);
    const want = Math.ceil(total / PAGE_LINES2) * PAGE_LINES2;
    if (total > 0 && want > total) {
      const plan = base.slice();
      const spanOf2 = (i) => ends[cuts[i + 1]] - ends[cuts[i]];
      for (let d = want - total; d > 0; d--) {
        let bi = 0;
        for (let i = 1; i < plan.length; i++)
          if (spanOf2(i) / plan[i] > spanOf2(bi) / plan[bi]) bi = i;
        plan[bi]++;
      }
      const alt = runDP((sIdx) => {
        const span2 = ends[cuts[sIdx]] - ends[cuts[sIdx - 1]];
        const k = plan[sIdx - 1];
        return k > 0 ? span2 / k : TARGET_MEAS;
      }, LEN_WEIGHT * 4).nextB;
      const got = linesPerSeg(alt);
      let ok = got.reduce((x, y) => x + y, 0) === want;
      for (let a = 0; ok && a < M; ) {
        const b = alt[a];
        if (b <= a) {
          ok = false;
          break;
        }
        if (ends[b] - ends[a] < MIN_MEAS && cellsBetween(a, b) < MIN_CELLS) ok = false;
        a = b;
      }
      if (ok) nextB = alt;
    }
  }
  if (EVEN_WEIGHT > 0) {
    const segs = cuts.length - 1;
    const base = linesPerSeg(nextB);
    const lineFits = (a, b) => {
      if (!FIT) return true;
      const p0 = FIT.spans.get(flat[idxAt[a] + 1]?.chord);
      const p1 = FIT.spans.get(flat[idxAt[b]]?.chord);
      return !(p0 && p1) || p1.x1 - p0.x0 < FIT.width;
    };
    const quality = (nb) => {
      const cells = [];
      const durs = [];
      const bySeg = /* @__PURE__ */ new Map();
      let weak = 0;
      let parallel = 0;
      let tailLong = 0;
      let tailTonic = 0;
      const rows = [];
      for (let a = 0; a < M; ) {
        const b = nb[a];
        if (b <= a) break;
        cells.push(cellsBetween(a, b));
        durs.push(durBetween(a, b));
        if (PARALLEL_WEIGHT > 0) {
          const tc = b < M ? flat[cand[b - 1]].chord : null;
          rows.push({
            keys: headKeysFrom(idxAt[a] + 1),
            dur: durBetween(a, b),
            tonic: !!tc && !tc.rest && tc.notes[0]?.number === "1",
            // **放不下的行不给奖励**（口径同 `parallel`）：那一行终归要被补刀切开，
            // 切完「两行一样长、各收在主音上」也就不成立了。139《主爱有多少》的 4 行方案
            // （31/32/33/36 拍，每行都超版心）正是这么把 D5 又拽了回来。
            fits: !FIT || lineFits(a, b),
            // 这一行的**下一行**是不是平行开头（值多少，见下面 parallel 那一段）
            par: 0
          });
        }
        const segNo = cuts.findIndex((c) => c >= b);
        if (!bySeg.has(segNo)) bySeg.set(segNo, []);
        bySeg.get(segNo).push(durBetween(a, b));
        const hi = cuts.find((c) => c >= b) ?? M;
        weak += breakCost(b, hi);
        if (!CONTENT_ONLY) {
          const over = cellsIntBetween(a, b) - MAX_CELLS;
          if (over > 0) weak += 100 + over ** 2 * 8;
        }
        if (!CONTENT_ONLY) {
          const short = MIN_CELLS - cellsIntBetween(a, b);
          if (short > 0 && b < M) weak += short ** 2;
        }
        if (b < M && (!FIT || lineFits(a, b)) && rows.length)
          rows[rows.length - 1].par = Math.min(parallelAt(cand[b - 1]), 12) / 12;
        if (b < M && (!FIT || lineFits(a, b))) {
          const ti = cand[b - 1];
          const tc = flat[ti].chord;
          const carried = carriedFrom[ti] >= 0 ? flat[carriedFrom[ti]].chord : null;
          const breath = punctAfter[ti] > 0 && !!flat[ti + 1] && flat[ti + 1].chord.rest;
          const long = carriedAway.has(ti) || breath ? false : tc.beats >= 2 || tc.fermata;
          if (long || carried && carried.beats >= 2) tailLong += 1;
        }
        a = b;
      }
      if (!cells.length) return INF;
      const mean = cells.reduce((x, y) => x + y, 0) / cells.length;
      const variance = cells.reduce((x, c) => x + (c - mean) ** 2, 0) / cells.length;
      if (!CONTENT_ONLY) return variance + weak + ROW_COST * cells.length;
      const segCv = (xs) => {
        if (xs.length < 2) return 0;
        const mu = xs.reduce((x, y) => x + y, 0) / xs.length;
        if (!(mu > 0)) return 0;
        return Math.sqrt(xs.reduce((x, c) => x + (c - mu) ** 2, 0) / xs.length) / mu;
      };
      let cv;
      if (CONTENT_ONLY) {
        let acc = 0;
        let cnt = 0;
        for (const xs of bySeg.values()) {
          acc += segCv(xs) * xs.length;
          cnt += xs.length;
        }
        cv = cnt ? acc / cnt : 0;
      } else {
        cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
      }
      const segOutlier = (xs) => {
        if (xs.length < 2) return 0;
        const m = [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)] || 1;
        return Math.max(0, Math.max(...xs) / m - 1.4);
      };
      const outlier = segOutlier(durs);
      const segShortOutlier = (xs) => {
        if (xs.length < 3) return 0;
        const m = [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)] || 1;
        return Math.max(0, SHORT_OUTLIER_RATIO - Math.min(...xs.slice(0, -1)) / m);
      };
      const shortOutlier = CONTENT_ONLY ? segShortOutlier(durs) : 0;
      const lastPair = durs.length >= 2 ? Math.max(0, LAST_PAIR_QUALITY_RATIO - Math.min(durs[durs.length - 1], durs[durs.length - 2]) / Math.max(durs[durs.length - 1], durs[durs.length - 2], 1e-9)) : 0;
      const evenOf = (k) => {
        const r = rows[k];
        if (!r || !r.fits) return 1;
        let best2 = 0;
        let found = false;
        for (let j = 0; j < rows.length; j++) {
          if (j === k || !rows[j].fits) continue;
          const n2 = commonPrefix(r.keys, rows[j].keys);
          if (n2 < PARALLEL_MIN) continue;
          const lo = Math.min(r.dur, rows[j].dur);
          const hi2 = Math.max(r.dur, rows[j].dur);
          if (!(hi2 > 0)) continue;
          found = true;
          best2 = Math.max(best2, lo / hi2);
        }
        return found ? best2 : 1;
      };
      for (let i = 0; i < rows.length; i++) parallel += rows[i].par * evenOf(i + 1);
      for (let k = 0; k < rows.length; k++) {
        if (!rows[k].tonic || !rows[k].fits) continue;
        for (let j = 0; j < rows.length; j++) {
          if (j === k || !rows[j].tonic || !rows[j].fits) continue;
          if (commonPrefix(rows[k].keys, rows[j].keys) >= PARALLEL_MIN) {
            tailTonic += 1;
            break;
          }
        }
      }
      const breakW = CONTENT_ONLY ? BREAK_QUALITY_WEIGHT : 1;
      if (typeof window !== "undefined" && window.__qDebug) window.__qDebug.push({
        lines: cells.length,
        durs: durs.map((d) => Math.round(d * 10) / 10),
        widths: (() => {
          const o = [];
          for (let a = 0; a < M; ) {
            const b = nb[a];
            if (b <= a) break;
            o.push(Math.round(lineSpan(a, b)));
            a = b;
          }
          return o;
        })(),
        cv: +(EVEN_WEIGHT * 100 * cv).toFixed(2),
        outlier: +(OUTLIER_WEIGHT * outlier).toFixed(2),
        shortOut: +(OUTLIER_WEIGHT * shortOutlier).toFixed(2),
        lastPair: +(CONTENT_ONLY ? LAST_PAIR_QUALITY_WEIGHT * lastPair : 0).toFixed(2),
        weak: +(breakW * (weak / cells.length)).toFixed(2),
        parallel: +(-PARALLEL_WEIGHT * (parallel / cells.length) * 10).toFixed(2),
        tailLong: +(-TAIL_LONG_WEIGHT * (tailLong / cells.length) * 10).toFixed(2),
        tailTonic: +(-(CONTENT_ONLY ? TAIL_TONIC_WEIGHT : 0) * (tailTonic / cells.length) * 10).toFixed(2)
      });
      return EVEN_WEIGHT * 100 * cv + OUTLIER_WEIGHT * (outlier + shortOutlier) + (CONTENT_ONLY ? LAST_PAIR_QUALITY_WEIGHT * lastPair : 0) + breakW * (weak / cells.length) - PARALLEL_WEIGHT * (parallel / cells.length) * 10 - TAIL_LONG_WEIGHT * (tailLong / cells.length) * 10 - (CONTENT_ONLY ? TAIL_TONIC_WEIGHT : 0) * (tailTonic / cells.length) * 10;
    };
    const runWith = (want, lenW = RUN_WITH_LEN_WEIGHT) => {
      const r = runDP((sIdx) => {
        const span2 = ends[cuts[sIdx]] - ends[cuts[sIdx - 1]];
        const k = want[sIdx - 1];
        return k > 0 ? span2 / k : TARGET_MEAS;
      }, lenW);
      return { nb: r.nextB, lines: linesPerSeg(r.nextB) };
    };
    const deltas = CONTENT_ONLY ? [-3, -2, -1, 0, 1, 2, 3] : [0, 1, 2];
    const options = [];
    const add = (w) => {
      if (w.some((v) => v < 1)) return;
      if (!options.some((o) => o.every((v, i) => v === w[i]))) options.push(w);
    };
    add(base.slice());
    add(base.map((v) => Math.ceil(v * 1.5)));
    add(base.map((v) => v * 2));
    if (CONTENT_ONLY) {
      add(base.map((v) => v * 3));
      add(base.map((v) => v * 4));
    }
    if (segs <= 3) {
      const grid = (i, acc) => {
        if (i === segs) return add(acc.slice());
        for (const d of deltas) {
          acc.push(base[i] + d);
          grid(i + 1, acc);
          acc.pop();
        }
      };
      grid(0, []);
    } else {
      for (let i = 0; i < segs; i++)
        for (const d of deltas) {
          if (d === 0) continue;
          const w = base.slice();
          w[i] += d;
          add(w);
        }
    }
    const overRatio = (nb) => {
      if (!(paperCap > 0)) return 1;
      let mx = 0;
      for (let a = 0; a < M; ) {
        const b = nb[a];
        if (b <= a) break;
        mx = Math.max(mx, lineSpan(a, b));
        a = b;
      }
      return mx / paperCap;
    };
    const paperCap = FIT ? FIT.width : MAX_CELLS;
    const lineSpan = (a, b) => {
      if (!FIT) return cellsIntBetween(a, b);
      const p0 = FIT.spans.get(flat[idxAt[a] + 1]?.chord);
      const p1 = FIT.spans.get(flat[idxAt[b]]?.chord);
      return p0 && p1 ? p1.x1 - p0.x0 : cellsIntBetween(a, b);
    };
    const notTooThin = (nb, frac = 1 / 3, withLast = false) => {
      if (!(paperCap > 0)) return true;
      const floor = paperCap * frac;
      const segsOf2 = [];
      for (let a = 0; a < M; ) {
        const b = nb[a];
        if (b <= a) break;
        segsOf2.push(lineSpan(a, b));
        a = b;
      }
      return segsOf2.every((c, i) => !withLast && i === segsOf2.length - 1 || c >= floor);
    };
    const fitsPaper = (nb) => {
      if (!(paperCap > 0)) return true;
      const floor = paperCap * 0.4;
      const segsOf2 = [];
      for (let a = 0; a < M; ) {
        const b = nb[a];
        if (b <= a) break;
        segsOf2.push(lineSpan(a, b));
        a = b;
      }
      return segsOf2.every((c, i) => c < paperCap && (i === segsOf2.length - 1 || c >= floor));
    };
    let best = { score: INF, nb: nextB };
    const fits = [];
    const rowsOf = (nb) => {
      let n2 = 0;
      for (let a = 0; a < M; ) {
        const b = nb[a];
        if (b <= a) break;
        n2++;
        a = b;
      }
      return n2;
    };
    const all = [];
    const consider = (sc, nb) => {
      if (sc < best.score) best = { score: sc, nb };
      all.push({ score: sc, nb, rows: rowsOf(nb) });
      if (fitsPaper(nb)) fits.push({ score: sc, nb, rows: rowsOf(nb) });
    };
    const tryWant = (want) => {
      const got = runWith(want);
      if (CONTENT_ONLY && !got.lines.every((v, i) => v === want[i])) {
        const hard = runWith(want, RUN_WITH_LEN_WEIGHT * 4);
        if (notTooThin(hard.nb)) consider(quality(hard.nb), hard.nb);
      }
      consider(quality(got.nb), got.nb);
    };
    for (const want of options) tryWant(want);
    if (FIT_SLACK > 0 && !fits.length && MAX_CELLS > 0) {
      const need = base.map((_, i) => {
        const lo = cuts[i];
        const hi = cuts[i + 1] ?? M;
        return Math.max(1, Math.ceil(lineSpan(lo, hi) / paperCap));
      });
      for (let d = 0; d <= 2; d++) tryWant(need.map((v, i) => Math.max(base[i], v) + d));
    }
    if (typeof window !== "undefined" && window.__evenDebug) window.__evenDebug = { base, tried: options.map((w) => {
      const g = runWith(w);
      return { want: w, got: g.lines, q: g.lines.every((v, i) => v === w[i]) ? quality(g.nb) : null };
    }), first: quality(nextB) };
    if (typeof window !== "undefined" && window.__phraseDebug !== void 0) {
      window.__phraseDebug = cand.map((idx, i) => ({
        i,
        idx,
        mi: flat[idx].mi,
        isLast: flat[idx].isLast,
        text: mainLyricText(flat[idx].chord),
        next: idx + 1 < K ? mainLyricText(flat[idx + 1].chord) : "",
        score: scoreAt(idx),
        head: headPenalty(idx),
        parallel: startsParallel(idx)
      }));
    }
    if (quality(nextB) <= best.score) best = { score: quality(nextB), nb: nextB };
    consider(quality(nextB), nextB);
    const alignParallel = (nb) => {
      if (!(PARALLEL_WEIGHT > 0)) return null;
      const bs = [0];
      for (let a = 0; a < M; ) {
        const b = nb[a];
        if (b <= a) break;
        bs.push(b);
        a = b;
      }
      if (bs.length < 4) return null;
      const keysAt = (a) => headKeysFrom(idxAt[a] + 1);
      let changed = false;
      for (let k = 1; k + 2 < bs.length; k++) {
        const keys = keysAt(bs[k]);
        let best2 = { n: 0, dur: 0 };
        for (let j = 0; j < k; j++) {
          const n2 = commonPrefix(keysAt(bs[j]), keys);
          if (n2 >= PARALLEL_MIN && n2 > best2.n) best2 = { n: n2, dur: durBetween(bs[j], bs[j + 1]) };
        }
        if (!best2.n || !(best2.dur > 0)) continue;
        let pick = bs[k + 1];
        const diff0 = Math.abs(durBetween(bs[k], pick) - best2.dur);
        let diff = diff0;
        for (let b = bs[k] + 1; b < bs[k + 2]; b++) {
          if (scoreAt(cand[b - 1]) - headPenalty(cand[b - 1]) <= 0) continue;
          const d = Math.abs(durBetween(bs[k], b) - best2.dur);
          if (d < diff) {
            diff = d;
            pick = b;
          }
        }
        if (pick !== bs[k + 1] && diff <= diff0 / 2 && diff0 - diff >= 1) {
          bs[k + 1] = pick;
          changed = true;
        }
      }
      if (!changed) return null;
      const out = nb.slice();
      for (let i = 0; i + 1 < bs.length; i++) out[bs[i]] = bs[i + 1];
      return out;
    };
    for (const o of [...all]) {
      const v = alignParallel(o.nb);
      if (v && notTooThin(v)) consider(quality(v), v);
    }
    const boundsOf = (nb) => {
      const bs = [0];
      for (let a = 0; a < M; ) {
        const b = nb[a];
        if (b <= a) break;
        bs.push(b);
        a = b;
      }
      return bs;
    };
    const nbOf = (bs) => {
      const nb = new Array(M + 1).fill(0);
      for (let i = 0; i + 1 < bs.length; i++) nb[bs[i]] = bs[i + 1];
      return nb;
    };
    const cutSet = new Set(cuts);
    const decentCut = (b) => {
      if (!(b > 0 && b <= M)) return false;
      const idx = cand[b - 1];
      if (scoreAt(idx) - headPenalty(idx) <= 0) return false;
      const endsHere = punctAfter[idx] > 0;
      const head = flat[idx + 1];
      if (head && !endsHere && lyricPunctScore(head.chord) > 0) return false;
      if (!flat[idx].chord.rest && !mainLyricText(flat[idx].chord)) {
        let j = idx;
        while (j >= 0 && !mainLyricText(flat[j].chord)) j--;
        if (j >= 0 && lyricPunctScore(flat[j].chord) === 0) return false;
      }
      return true;
    };
    const overflows = (nb) => {
      if (!FIT) return 0;
      let n2 = 0;
      for (let a = 0; a < M; ) {
        const b = nb[a];
        if (b <= a) break;
        if (!lineFits(a, b)) n2++;
        a = b;
      }
      return n2;
    };
    const sectionEdges = [...sectionCuts].sort((a, b) => a - b);
    const segRatio = (nb) => {
      const bySeg = /* @__PURE__ */ new Map();
      for (let a = 0; a < M; ) {
        const b = nb[a];
        if (b <= a) break;
        const sNo = sectionEdges.filter((c) => c < b).length;
        const arr = bySeg.get(sNo) ?? [];
        arr.push(durBetween(a, b));
        bySeg.set(sNo, arr);
        a = b;
      }
      let worst = 1;
      for (const xs of bySeg.values()) {
        if (xs.length < 2) continue;
        const hi = Math.max(...xs);
        if (hi > 0) worst = Math.min(worst, Math.min(...xs) / hi);
      }
      return worst;
    };
    const improve = (nb0) => {
      const bs = boundsOf(nb0);
      if (bs.length < 3) return null;
      const q0 = quality(nb0);
      let curQ = q0;
      let moved = false;
      for (let round = 0; round < HILL_ROUNDS; round++) {
        let changed = false;
        for (let k = 1; k + 1 < bs.length; k++) {
          if (cutSet.has(bs[k])) continue;
          const lo = bs[k - 1] + 1;
          const hi = bs[k + 1] - 1;
          const from = bs[k];
          let bestB = from;
          let bestQ = curQ;
          for (let b = lo; b <= hi; b++) {
            if (b === from || !decentCut(b)) continue;
            bs[k] = b;
            const q = quality(nbOf(bs));
            if (q < bestQ - 1e-9) {
              bestQ = q;
              bestB = b;
            }
          }
          bs[k] = bestB;
          if (bestB !== from) {
            curQ = bestQ;
            changed = true;
            moved = true;
          }
        }
        if (!changed) break;
      }
      if (typeof window !== "undefined" && Array.isArray(window.__hillDebug))
        window.__hillDebug.push({ q0: +q0.toFixed(2), q1: +curQ.toFixed(2), moved, bs: bs.slice() });
      if (!moved || q0 - curQ < HILL_MIN_GAIN) return null;
      const out = nbOf(bs);
      return segRatio(out) >= D8_RATIO && overflows(out) === 0 ? out : null;
    };
    for (const o of [...all].sort((a, b) => a.score - b.score).slice(0, HILL_PLANS)) {
      const v = improve(o.nb);
      if (v && notTooThin(v)) consider(quality(v), v);
    }
    if (MORE_ROWS_SLACK > 0) {
      const ok = all.filter((f) => f.score <= best.score + MORE_ROWS_SLACK && notTooThin(f.nb, 0.35, true));
      ok.sort((a, b) => b.rows - a.rows || a.score - b.score);
      if (ok.length) best = { score: ok[0].score, nb: ok[0].nb };
    }
    const abdicated = CONTENT_ONLY && overRatio(best.nb) >= ABDICATE_RATIO;
    if (FIT_SLACK > 0 || abdicated) {
      const slack = abdicated ? Infinity : FIT_SLACK;
      const ok = fits.filter((f) => f.score <= best.score + slack);
      if (abdicated) ok.sort((a, b) => a.score - b.score || b.rows - a.rows);
      else ok.sort((a, b) => b.rows - a.rows || a.score - b.score);
      if (ok.length) best = { score: ok[0].score, nb: ok[0].nb };
      else if (abdicated) {
        const near = all.filter((f) => notTooThin(f.nb, 0.35));
        near.sort((a, b) => overRatio(a.nb) - overRatio(b.nb) || a.score - b.score);
        if (near.length && overRatio(near[0].nb) < overRatio(best.nb)) best = { score: near[0].score, nb: near[0].nb };
      }
    }
    if (CONTENT_ONLY) {
      const breathThrown = (idx) => {
        const nx = flat[idx + 1];
        if (!nx || !nx.chord.rest || nx.chord === chordsPer[nx.mi][0]) return false;
        if (!(punctAfter[idx] > 0 || lyricPunctScore(flat[idx].chord) > 0)) return false;
        const head = headDurAfter(idx);
        if (pickupStd > 0 && Math.abs(head - pickupStd) < 0.01) return false;
        const headRest = nx.chord.duration?.toFloat() ?? 0;
        return !(headRest <= 0.5 && Math.abs(head - Math.round(head)) < 0.01);
      };
      const bs = boundsOf(best.nb);
      let q = quality(best.nb);
      for (let k = 1; k + 1 < bs.length; k++) {
        if (cutSet.has(bs[k])) continue;
        const idx = cand[bs[k] - 1];
        if (!breathThrown(idx)) continue;
        const from = bs[k];
        let pick = -1;
        let pickQ = q + HILL_MIN_GAIN;
        for (let j = idx + 1; j < K && flat[j].mi === flat[idx].mi && flat[j].chord.rest; j++) {
          const b = cand.indexOf(j) + 1;
          if (b <= from || b >= bs[k + 1] || breathThrown(j) || !decentCut(b)) continue;
          bs[k] = b;
          const nb = nbOf(bs);
          const qb = quality(nb);
          if (qb < pickQ && segRatio(nb) >= Math.min(D8_RATIO, segRatio(best.nb)) && overflows(nb) <= overflows(best.nb)) {
            pick = b;
            pickQ = qb;
          }
          bs[k] = from;
        }
        if (pick > 0) {
          bs[k] = pick;
          best = { score: pickQ, nb: nbOf(bs) };
          q = pickQ;
        }
      }
    }
    if (typeof window !== "undefined" && Array.isArray(window.__tryPlan)) {
      const bs = window.__tryPlan.map((fi) => cand.findIndex((c) => c === fi) + 1).filter((b) => b > 0);
      const nb = new Array(M + 1).fill(0);
      let a = 0;
      for (const b of [...bs, M]) {
        nb[a] = b;
        a = b;
      }
      window.__tryPlanQ = { bs, q: quality(nb) };
    }
    if (typeof window !== "undefined" && window.__cutsDebug !== void 0)
      window.__cutsDebug = { cuts: cuts.map((c) => c === 0 ? 0 : flat[cand[c - 1]].mi + 1), M, segs: cuts.length - 1 };
    nextB = best.nb;
  }
  for (const idx of cand) {
    cutList.push({
      chord: flat[idx].chord,
      mi: flat[idx].mi,
      isLast: flat[idx].isLast,
      score: scoreAt(idx) - headPenalty(idx),
      end: endAfter[idx],
      parallel: Math.min(parallelAt(idx), 12)
    });
  }
  const brk = (b) => {
    const ci = flat[cand[b - 1]];
    if (ci.isLast) measureBreaks.add(ci.mi + 1);
    else midBreaks.add(ci.chord);
  };
  for (let a = 0; a < M; ) {
    const b = nextB[a];
    if (b <= a) break;
    if (b < M) brk(b);
    a = b;
  }
  for (const c of [...midBreaks]) {
    const idx = flat.findIndex((f) => f.chord === c);
    const nx = flat[idx + 1];
    if (idx < 0 || !nx || !nx.chord.rest || !nx.isLast) continue;
    midBreaks.delete(c);
    if (nx.isLast) measureBreaks.add(nx.mi + 1);
    else midBreaks.add(nx.chord);
  }
  for (const mi of [...measureBreaks]) {
    if (mi >= n || !chordsPer[mi].length) continue;
    if (!chordsPer[mi].every((c) => c.rest)) continue;
    measureBreaks.delete(mi);
    if (mi + 1 < n) measureBreaks.add(mi + 1);
  }
  return { measureBreaks, midBreaks, sectionStarts, sectionCutChords, refrainCut, forced, cuts: cutList, capacityCuts };
}
function fitForInput(fit, idOf) {
  const byId = /* @__PURE__ */ new Map();
  for (const [c, sp] of fit.spans) if (c.id !== null) byId.set(c.id, sp);
  const spans = /* @__PURE__ */ new Map();
  for (const [c, id] of idOf) {
    const sp = byId.get(id);
    if (sp) spans.set(c, sp);
  }
  return { width: fit.width, spans };
}
function flattenBook(part) {
  const chords2 = [];
  const isLast = [];
  for (const m of part.measures) {
    const cs = chordsOf$1(m);
    cs.forEach((c, k) => {
      chords2.push(c);
      isLast.push(k === cs.length - 1);
    });
  }
  const idxOf = /* @__PURE__ */ new Map();
  chords2.forEach((c, i) => idxOf.set(c, i));
  const cellUpto = [0];
  const durUpto = [0];
  chords2.forEach((c, i) => {
    cellUpto[i + 1] = cellUpto[i] + cellsOfChord(c);
    durUpto[i + 1] = durUpto[i] + (c.duration?.toFloat() ?? 0);
  });
  return { chords: chords2, isLast, idxOf, cellUpto, durUpto };
}
class Fit {
  constructor(metric, cells) {
    this.metric = metric;
    this.cells = cells;
  }
  /** 版心「装得下多少」的量纲：真实坐标下是宽度，退化时是格数。 */
  get capacity() {
    return this.metric ? this.metric.width : this.cells;
  }
  get on() {
    return this.capacity > 0;
  }
  /** 拍平序列（由 `bind` 注入）。 */
  book = { chords: [], isLast: [], idxOf: /* @__PURE__ */ new Map(), cellUpto: [0], durUpto: [0] };
  bind(book) {
    this.book = book;
    return this;
  }
  /** 一行有多宽。 */
  ofLine(l) {
    return this.spanOf(l.from, l.to);
  }
  /** 全曲拍平序列里 `[from, to]`（含端点）这一段有多宽。 */
  spanOf(from, to) {
    const b = this.book;
    if (from > to) return 0;
    if (this.metric) {
      const a = this.metric.spans.get(b.chords[from]);
      const z = this.metric.spans.get(b.chords[to]);
      if (a && z) return z.x1 - a.x0;
    }
    return b.cellUpto[to + 1] - b.cellUpto[from];
  }
}
const cellsOfChord = (c) => Math.max(1, Math.floor(c.beats) || 1);
function describeLines(part, breaks, useMidBreaks) {
  const flat = [];
  part.measures.forEach((m, i) => {
    const cs = chordsOf$1(m);
    cs.forEach((c, k) => flat.push({ chord: c, mi: i, k, isLast: k === cs.length - 1 }));
  });
  const out = [];
  let start = 0;
  const emit = (end, mi, chord, section) => {
    const seg = flat.slice(start, end + 1);
    if (!seg.length) return;
    const from = start;
    start = end + 1;
    const headEnd = seg.findIndex((f) => f.isLast);
    const head = seg.slice(0, headEnd < 0 ? seg.length : headEnd + 1);
    const last = seg[seg.length - 1];
    const text = mainLyricText(last.chord);
    out.push({
      cells: seg.reduce((n, f) => n + cellsOfChord(f.chord), 0),
      dur: seg.reduce((n, f) => n + (f.chord.duration?.toFloat() ?? 0), 0),
      fromMi: seg[0].mi,
      toMi: last.mi,
      bars: seg.filter((f) => f.isLast).length,
      beats: seg.reduce((n, f) => n + f.chord.beats, 0),
      head: {
        dur: head.reduce((n, f) => n + (f.chord.duration?.toFloat() ?? 0), 0),
        full: seg[0].k === 0,
        hasNote: head.some((f) => !f.chord.rest),
        cells: head.reduce((n, f) => n + cellsOfChord(f.chord), 0),
        rest: seg[0].chord.rest,
        beams: seg[0].chord.beams,
        firstBeats: seg[0].chord.beats,
        firstDur: seg[0].chord.duration?.toFloat() ?? 0,
        firstPunct: lyricPunctScore(seg[0].chord),
        text: mainLyricText(seg[0].chord)
      },
      tail: (() => {
        let lastWord = "";
        let lastWordPunct = 0;
        for (let j = seg.length - 1; j >= 0; j--) {
          const t2 = mainLyricText(seg[j].chord);
          if (!t2) continue;
          lastWord = t2;
          lastWordPunct = lyricPunctScore(seg[j].chord);
          break;
        }
        let p = seg.length - 1;
        while (p >= 0 && !seg[p].isLast) p--;
        const tailBar = seg.slice(p + 1);
        const restOnlyBar = tailBar.length > 0 && tailBar.every((f) => f.chord.rest);
        const restBarDur = restOnlyBar ? tailBar.reduce((n, f) => n + (f.chord.duration?.toFloat() ?? 0), 0) : 0;
        return {
          text,
          punct: lyricPunctScore(last.chord),
          beats: last.chord.beats,
          lastWord,
          lastWordPunct,
          restOnlyBar,
          restBarDur
        };
      })(),
      headFp: headFpOf(seg.map((f) => f.chord)),
      mi,
      chord,
      section,
      from,
      to: end,
      fromCut: from > 0 && (breaks.capacityCuts.has(flat[from - 1].chord) || flat[from - 1].isLast && breaks.capacityCuts.has(flat[from - 1].mi + 1))
    });
  };
  flat.forEach((f, idx) => {
    if (useMidBreaks && (breaks.midBreaks.has(f.chord) || breaks.sectionCutChords.has(f.chord)))
      return emit(idx, null, f.chord, breaks.sectionCutChords.has(f.chord));
    if (f.isLast && (breaks.measureBreaks.has(f.mi + 1) || breaks.sectionStarts.has(f.mi + 1)))
      emit(idx, f.mi + 1, null, breaks.sectionStarts.has(f.mi + 1));
  });
  emit(flat.length - 1, null, null, false);
  return out;
}
function mergePairsUniform(part, breaks, useMidBreaks) {
  const lines = describeLines(part, breaks, useMidBreaks);
  const canPairAt = (i) => {
    const a = lines[i];
    const b = lines[i + 1];
    if (!b) return false;
    if (a.section) return false;
    if (a.mi !== null && breaks.forced?.has(a.mi)) return false;
    if (a.mi === null && a.chord === null) return false;
    const bIsLast = i + 1 === lines.length - 1;
    return bIsLast || b.tail.punct > 0 || b.tail.beats >= 2 || b.tail.lastWordPunct > 0;
  };
  for (let i = 0; i + 1 < lines.length; i += 2) if (!canPairAt(i)) return 0;
  let merged = 0;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const a = lines[i];
    if (a.mi !== null) breaks.measureBreaks.delete(a.mi);
    if (a.chord) breaks.midBreaks.delete(a.chord);
    merged++;
  }
  return merged;
}
function linesAreOk(lines, f) {
  for (let i = 0; i < lines.length; i++) {
    if (f.on && f.ofLine(lines[i]) >= f.capacity) return false;
    if (i < lines.length - 1 && !lines[i].section) {
      const l = lines[i];
      if (l.bars <= 1 && l.beats < (l.head.full ? 4 : 8)) return false;
    }
  }
  return true;
}
function cloneBreaks(b) {
  return {
    measureBreaks: new Set(b.measureBreaks),
    midBreaks: new Set(b.midBreaks),
    sectionStarts: new Set(b.sectionStarts),
    sectionCutChords: new Set(b.sectionCutChords),
    cuts: b.cuts,
    // 只读的候选断点表，拷贝时共享
    capacityCuts: new Set(b.capacityCuts),
    refrainCut: b.refrainCut,
    forced: new Set(b.forced)
  };
}
function evenLayout(part, breaks, cells, fit) {
  const out = cloneBreaks(breaks);
  return out;
}
function chooseLineLayout(part, breaks, cells, opt = {}) {
  const useMidBreaks = opt.useMidBreaks ?? true;
  const allowPairs = opt.allowPairs ?? true;
  const f = new Fit(opt.fit, cells).bind(flattenBook(part));
  const write = (from) => {
    breaks.measureBreaks.clear();
    for (const v of from.measureBreaks) breaks.measureBreaks.add(v);
    breaks.midBreaks.clear();
    for (const v of from.midBreaks) breaks.midBreaks.add(v);
    breaks.capacityCuts.clear();
    for (const v of from.capacityCuts) breaks.capacityCuts.add(v);
  };
  const phrase = cloneBreaks(breaks);
  const phraseLines = describeLines(part, phrase, useMidBreaks);
  const medCells = (() => {
    const cs = phraseLines.map((l) => f.ofLine(l)).sort((x, y) => x - y);
    return cs.length ? cs[Math.floor(cs.length / 2)] : 0;
  })();
  const sparse = f.on && medCells > 0 && medCells < f.capacity * 0.6;
  if (allowPairs && sparse) {
    const pairs = cloneBreaks(breaks);
    const merged = mergePairsUniform(part, pairs, useMidBreaks);
    if (merged > 0 && linesAreOk(describeLines(part, pairs, useMidBreaks), f)) {
      write(pairs);
      return "pairs";
    }
  }
  if (linesAreOk(phraseLines, f)) return "phrase";
  write(evenLayout(part, phrase, cells, opt.fit));
  return "even";
}
function pageBreakLines(lines, sectionEnds, pageLines) {
  const pageAt = /* @__PURE__ */ new Set();
  if (lines <= 0) return pageAt;
  const rawBounds = [0, ...[...sectionEnds].filter((n) => n > 0 && n < lines).sort((a, b) => a - b), lines];
  const merged = [rawBounds[0]];
  for (let i = 1; i < rawBounds.length; i++) {
    if (i < rawBounds.length - 1 && rawBounds[i] - merged[merged.length - 1] < 2) continue;
    merged.push(rawBounds[i]);
  }
  const bounds = [merged[0]];
  for (let i = 1; i < merged.length; i++) {
    const start = bounds[bounds.length - 1];
    if (merged[i] - start > pageLines && merged[i - 1] > start) bounds.push(merged[i - 1]);
  }
  const last = merged[merged.length - 1];
  if (bounds[bounds.length - 1] !== last) bounds.push(last);
  for (let s = 0; s + 1 < bounds.length; s++) {
    const beg = bounds[s];
    const len = bounds[s + 1] - beg;
    for (let p = pageLines; p <= len - 1; p += pageLines) pageAt.add(beg + p);
    pageAt.add(beg + len);
    if (len % pageLines === 1 && len >= pageLines + 1) {
      pageAt.delete(beg + len - 1);
      pageAt.add(beg + len - 2);
    }
  }
  return pageAt;
}
const PAGE_LINES = 4;
function voiceStream(song, voice) {
  const lines = linesOfVoice(song, voice);
  const st = { voice, lines, origin: [], elements: [], ticks: [] };
  let tick = new Fraction(0);
  lines.forEach((line, lineIdx) => {
    const ratios = tupletRatios(line);
    line.elements.forEach((el, elIdx) => {
      st.origin.push({ lineIdx, elIdx });
      st.elements.push(el);
      st.ticks.push(tick);
      const r = ratios[elIdx];
      const q = elementQuarters(el);
      tick = tick.plus(r ? q.timesInt(r.num).divInt(r.den) : q);
    });
  });
  return st;
}
function opensLine(el) {
  return el.kind === "barline" && (el.type === "repeat-start" || el.type === "repeat-both");
}
function alignCut(els, k) {
  let at = k;
  while (at < els.length && !opensLine(els[at]) && (els[at].kind === "barline" || els[at].kind === "beat-boundary")) at += 1;
  while (at > 0 && opensLine(els[at - 1])) at -= 1;
  return at;
}
function indexAtTick(st, tick) {
  for (let i = 0; i < st.ticks.length; i++) {
    if (st.ticks[i].compareTo(tick) >= 0) return alignCut(st.elements, i);
  }
  return st.elements.length;
}
function puPhraseLines(sdoc, songIdx = 0, opt = {}) {
  const view = docView(sdoc);
  const song = view.songs[songIdx];
  if (!song) return null;
  const input = phrasePartOfSong(sdoc, songIdx);
  if (!input) return null;
  const part = input.part;
  const noteMap = /* @__PURE__ */ new Map();
  for (const [ch, id] of input.idOf) {
    const el = view.elementOf.get(id);
    if (el?.kind === "note") noteMap.set(ch, el);
  }
  const voices = voiceNumbers(song);
  const streams = /* @__PURE__ */ new Map();
  for (const v of voices) streams.set(v, voiceStream(song, v));
  if (streams.size === 0) return null;
  const where = /* @__PURE__ */ new Map();
  for (const st of streams.values()) {
    st.elements.forEach((el, idx) => {
      if (el.kind === "note") where.set(el, { voice: st.voice, idx });
    });
  }
  const firstChord = part.measures.flatMap((m) => chordsOf$1(m)).find((c) => noteMap.has(c));
  const leadEl = firstChord ? noteMap.get(firstChord) : void 0;
  const lead = streams.get((leadEl && where.get(leadEl)?.voice) ?? voices[0]);
  if (!lead) return null;
  const breaks = computePhraseBreaks(part, { pageLines: PAGE_LINES });
  if (opt.measure) {
    const score = jianpuInputOfDoc(sdoc, { song: songIdx, forExpanded: true });
    const measured = score?.parts[0] ? opt.measure(score) : null;
    if (measured) chooseLineLayout(part, breaks, 0, { fit: fitForInput(measured, input.idOf) });
  }
  const idxOf = (ch) => {
    const el = noteMap.get(ch);
    const at = el ? where.get(el) : void 0;
    return at && at.voice === lead.voice ? at.idx : null;
  };
  const cuts = /* @__PURE__ */ new Set();
  const sectionAt = /* @__PURE__ */ new Set();
  part.measures.forEach((m, mid) => {
    if (mid > 0 && breaks.measureBreaks.has(mid)) {
      const first = chordsOf$1(m).find((c) => noteMap.has(c));
      const raw = first ? idxOf(first) : null;
      const i = raw === null ? null : alignCut(lead.elements, raw);
      if (i !== null && i > 0) {
        cuts.add(i);
        if (breaks.sectionStarts.has(mid)) sectionAt.add(i);
      }
    }
    for (const ch of chordsOf$1(m)) {
      if (!noteMap.has(ch)) continue;
      if (!breaks.midBreaks.has(ch) && !breaks.sectionCutChords.has(ch)) continue;
      const i = idxOf(ch);
      if (i === null) continue;
      let at = i + 1;
      while (at < lead.elements.length && lead.elements[at].kind === "sustain") at += 1;
      at = alignCut(lead.elements, at);
      if (at > 0 && at < lead.elements.length) {
        cuts.add(at);
        if (breaks.sectionCutChords.has(ch)) sectionAt.add(at);
      }
    }
  });
  const starts = [0, ...[...cuts].sort((a, b) => a - b)];
  const sectionEnds = /* @__PURE__ */ new Set();
  const lines = [];
  starts.forEach((from, i) => {
    const to = starts[i + 1] ?? lead.elements.length;
    const segs = segsOf(voices, streams, lead, from, to);
    if (segs.length > 0) lines.push({ segs, pageAfter: false });
    if (to < lead.elements.length && sectionAt.has(to)) sectionEnds.add(lines.length);
  });
  if (lines.length === 0) return null;
  const pageAt = pageBreakLines(lines.length, sectionEnds, PAGE_LINES);
  lines.forEach((l, i) => {
    l.pageAfter = pageAt.has(i + 1) && i + 1 < lines.length;
  });
  return lines;
}
function segsOf(voices, streams, lead, from, to) {
  const tickFrom = lead.ticks[from] ?? new Fraction(0);
  const tickTo = to < lead.ticks.length ? lead.ticks[to] : null;
  const segs = [];
  for (const v of voices) {
    const st = streams.get(v);
    const a = st === lead ? from : indexAtTick(st, tickFrom);
    const b = st === lead ? to : tickTo === null ? st.elements.length : indexAtTick(st, tickTo);
    if (b > a) segs.push({ voice: v, from: a, to: b });
  }
  return segs;
}
function phraseCuts(sdoc, songIdx = 0, opt = {}) {
  const lines = puPhraseLines(sdoc, songIdx, opt);
  if (!lines) return null;
  const view = docView(sdoc);
  const song = view.songs[songIdx];
  if (!song) return null;
  const streams = new Map(voiceNumbers(song).map((v) => [v, voiceStream(song, v)]));
  const cuts = [];
  lines.forEach((line, i) => {
    if (i === 0) return;
    const seg = line.segs[0];
    const st = seg ? streams.get(seg.voice) : void 0;
    if (!seg || !st) return;
    let id = null;
    let source = null;
    for (let k = seg.from; k < seg.to; k++) {
      const el = st.elements[k];
      if (source === null && el.source.length > 0) source = el.source;
      const got = view.idOf.get(el);
      if (id === null && got !== void 0) id = got;
      if (id !== null && source !== null) break;
    }
    cuts.push({ id, source, page: lines[i - 1].pageAfter });
  });
  return cuts;
}
const DIGIT = "[0-9]";
const INTEGER = `${DIGIT}+`;
const FLOAT = `[-+]?${DIGIT}*\\.${DIGIT}+`;
const NUMBER = `(?:${FLOAT}|${INTEGER})`;
const HEXQUAD = "[a-fA-F0-9]{4}";
const UNICHAR = `(?:\\\\x${HEXQUAD}|[\\u0100-\\udbff])`;
const PITCH = `(?:(?:#b|b|#)?[0-7][,'gd]*|[xX]${UNICHAR}?)`;
const DURATION = "(?:-+|_+\\.*|\\.*_+|\\.+)";
const VALUE = `(?:[tT][rR][uU][eE]|[fF][aA][lL][sS][eE]|${NUMBER})`;
const PARAMLIST = `\\((?:${VALUE}|,)*\\)`;
const CONTROLTYPE = "(?:UnderlineOnly|Unconnect|Connect|Other|None|All)";
const CONTROL = `(?:\\{C:${NUMBER}(?:${PARAMLIST})?(?:,${CONTROLTYPE})*\\}|\\{C:0,,\\})`;
const SLURSTART = `(?:\\(|\\{\\((?:,(?:${FLOAT})?|0:0,${FLOAT},${INTEGER})\\})`;
const TUPLET = "\\{\\([0-9]\\}";
const ARTICULATION = "(?:DunYin|BoYin|YanYin|ZhongYin)";
const ARTICULATIONS = `\\{${ARTICULATION}(?:,${ARTICULATION})*\\}`;
const GRACE = `\\{${PITCH}+\\}`;
const CHORD = `\\[${PITCH}+\\]`;
const HOUSE = `\\[(?:结束句|${DIGIT}+\\.)`;
const BARLINETYPE = "(?:\\[\\|\\]|:\\|:|\\|\\||\\|\\]|\\|:|:\\||::|\\|)";
const ESCAPE = `(?:\\\\[sbtnfr"'\\\\]|\\\\x${HEXQUAD}|\\\\0${DIGIT}{4})`;
const RULES = [
  ["preludeBeg", `\\(${CONTROL}?`],
  ["preludeEnd", `\\)${CONTROL}?`],
  ["note", `${SLURSTART}*${CONTROL}?(?:${TUPLET})?(?:${ARTICULATIONS})?(?:${GRACE})?(?:${PITCH}|${CHORD})${DURATION}?${CONTROL}?\\)*`],
  ["lbrack", "\\["],
  ["rbrack", "\\]"],
  ["barline", `${BARLINETYPE}${CONTROL}?(?:${HOUSE})?`],
  ["rbrace", "\\)"],
  ["return", `\\$(?:${PARAMLIST})?`],
  ["timesig", `${INTEGER}/${INTEGER}${CONTROL}?`],
  ["string", `"(?:${ESCAPE}|[^"\\\\])*?"`],
  ["comment", "//[^\\r\\n]*"],
  ["ws", "[ \\t\\r\\n]+"]
].map(([t2, src]) => [t2, new RegExp(src, "y")]);
function lexVoice(text) {
  const out = [];
  let pos = 0;
  let line = 0;
  let lineStart = 0;
  const advance = (to) => {
    for (let i = pos; i < to; i++) {
      if (text.charCodeAt(i) === 10) {
        line++;
        lineStart = i + 1;
      }
    }
    pos = to;
  };
  while (pos < text.length) {
    let best = null;
    let bestLen = 0;
    for (const [type, re] of RULES) {
      re.lastIndex = pos;
      const m = re.exec(text);
      if (m && m[0].length > bestLen) {
        best = type;
        bestLen = m[0].length;
      }
    }
    if (best === null) {
      advance(pos + 1);
      continue;
    }
    out.push({ type: best, text: text.substr(pos, bestLen), start: pos, end: pos + bestLen, line, column: pos - lineStart });
    advance(pos + bestLen);
  }
  return out;
}
function parseVoiceText(text) {
  const out = [];
  for (const t2 of lexVoice(text)) {
    if (t2.type === "ws" || t2.type === "comment") continue;
    if (t2.type === "lbrack" || t2.type === "rbrack" || t2.type === "rbrace") return null;
    out.push(t2);
  }
  return out;
}
class Section {
  constructor(name) {
    this.name = name;
  }
  lines = [];
  /** `lines[i]` 在原文里的 0 基行号与行首偏移（跳过的注释与空行照算）。`model/fromjpw.ts` 填 `SourceSpan` 用 */
  lineNos = [];
  lineOffsets = [];
  parse() {
    return true;
  }
  static create(n) {
    const nn = n.toLowerCase().substring(1).trim();
    switch (nn) {
      case "voice":
        return new VoiceSection(nn);
      case "words":
        return new WordsSection(nn);
      case "attachments":
        return new GenericSection(nn);
      case "page":
        return new GenericSection(nn);
      case "title":
        return new TitleSection(nn);
      case "fonts":
        return new GenericSection(nn);
      case "options":
        return new GenericSection(nn);
      case "layout":
        return new LayoutSection(nn);
      case "repeat":
        return new RepeatSection(nn);
      default:
        throw new Error(`unknown section: ${n}`);
    }
  }
}
class GenericSection extends Section {
}
class LayoutSection extends Section {
  linesPerPage = null;
  breakPoints = null;
  get desc() {
    if (this.breakPoints !== null) return `BreakPoints = ${this.breakPoints}`;
    if (this.linesPerPage !== null) return `LinesPerPage = ${this.linesPerPage}`;
    return null;
  }
  parse() {
    for (const l of this.lines) {
      if (!l.includes("=")) continue;
      const low = l.toLowerCase();
      const arr = low.split("=");
      if (arr.length !== 2) return false;
      switch (arr[0].trim()) {
        case "linesperpage":
          this.linesPerPage = arr[1].trim();
          break;
        case "breakpoints":
          this.breakPoints = arr[1].trim();
          break;
        default:
          return false;
      }
    }
    return true;
  }
}
class RepeatSection extends Section {
  data = [];
  parse() {
    const d = this.lines.join("\n").replace(/,/g, "\n");
    this.data.push(...d.split("\n"));
    return true;
  }
}
class VoiceSection extends Section {
  voiceData;
  parse() {
    const text = this.lines.join("\n");
    const voice = parseVoiceText(text);
    if (voice === null) return false;
    this.voiceData = voice;
    return true;
  }
}
class WordsItem {
  text = "";
  alignPos = -1;
  /** 这个字在原文里的位置（0 基行号、列、全文偏移、长度）：谱面上点一个字要选中它。`/` 占位的空项没有 */
  source;
  constructor(s) {
    if (s === void 0) return;
    this.text = "";
    for (const ch of s) {
      if (ch === "[") {
        this.alignPos = this.text.length;
        continue;
      } else if (ch === "]") {
        continue;
      } else {
        this.text += ch;
      }
    }
  }
}
class WordsSegment {
  passFirst = 0;
  passLast = 0;
  measure = 0;
  noteIndex = 0;
  control = null;
  data = [];
}
const ASCII_LETTER = /[a-zA-Z]/;
class WordsSection extends Section {
  segments = [];
  // ctrl = "(\([0-9a-zA-Z.,]+\))?"; sticky-anchored at scan position.
  static regLrcSpec = /W(\d+)(-(\d+))?(\([0-9a-zA-Z.,]+\))?(@(\d+),(\d+))?(\([0-9a-zA-Z.,]+\))?:/y;
  parse() {
    const text = this.lines.join("\n");
    const joinedStarts = [];
    for (let i = 0, at = 0; i < this.lines.length; at += this.lines[i].length + 1, i++) joinedStarts.push(at);
    const spanAt = (from, to) => {
      let i = joinedStarts.length - 1;
      while (i > 0 && joinedStarts[i] > from) i--;
      const lineOffset = this.lineOffsets[i];
      const line = this.lineNos[i];
      if (lineOffset === void 0 || line === void 0) return void 0;
      const column = from - joinedStarts[i];
      return { line, column, offset: lineOffset + column, length: to - from };
    };
    const item = (s, from, to) => {
      const it = new WordsItem(s);
      it.source = spanAt(from, to);
      return it;
    };
    let pos = 0;
    let lineBegin = true;
    const punc = ".,;'!?。：，；！？“”｡､、";
    const reg = WordsSection.regLrcSpec;
    const quoteTail = /* @__PURE__ */ new Set();
    const openQuoteHeads = /* @__PURE__ */ new Set();
    while (pos < text.length) {
      const ch = text[pos];
      if (ch === "\n") {
        pos++;
        lineBegin = true;
        continue;
      }
      if (lineBegin) {
        reg.lastIndex = pos;
        const m = reg.exec(text);
        if (m) {
          const seg = new WordsSegment();
          seg.passFirst = parseInt(m[1], 10);
          seg.passLast = m[3] ? parseInt(m[3], 10) : seg.passFirst;
          seg.measure = 1;
          seg.noteIndex = 1;
          if (m[6]) {
            seg.measure = parseInt(m[6], 10);
            seg.noteIndex = parseInt(m[7], 10);
          }
          if (m[8]) {
            seg.control = m[8].substring(1, m[8].length - 1).split(",");
          }
          this.segments.push(seg);
          pos += m[0].length;
          lineBegin = false;
          continue;
        }
      }
      lineBegin = false;
      if (ch === "{") {
        const end = text.indexOf("}", pos + 1);
        if (end < 0) throw new Error("");
        const t2 = text.substring(pos + 1, end);
        this.last().data.push(item(t2, pos, end + 1));
        pos = end + 1;
        continue;
      }
      if (this.segments.length === 0) throw new Error("");
      if (" -()".includes(ch)) {
        pos++;
        continue;
      }
      if (ch === "/") {
        pos++;
        this.last().data.push(new WordsItem());
        continue;
      }
      if (ch.charCodeAt(0) <= 127 && ASCII_LETTER.test(ch)) {
        let end = pos + 1;
        while (end < text.length) {
          const ch2 = text[end];
          if (ch2.charCodeAt(0) >= 127) break;
          if (!ASCII_LETTER.test(ch2)) break;
          end++;
        }
        const t2 = text.substring(pos, end);
        this.last().data.push(item(t2, pos, end));
        pos = end + 1;
        continue;
      }
      if (punc.includes(ch)) {
        const last = this.last().data;
        if (last.length > 0) {
          const prev = last[last.length - 1];
          prev.text += ch;
          if (prev.source && prev.source.offset + prev.source.length === spanAt(pos, pos + 1)?.offset) {
            prev.source.length++;
            if (ch === "“") quoteTail.add(prev);
          }
          pos++;
          continue;
        }
      }
      if (ch.charCodeAt(0) < 127) console.error("unsupported char?");
      const one = item(ch, pos, pos + ch.length);
      if (ch === "“" && this.last().data.length === 0) openQuoteHeads.add(one);
      this.last().data.push(one);
      pos += ch.length;
    }
    for (const s of this.segments) {
      let prev = null;
      for (const d of s.data) {
        if (prev === null) {
          prev = d;
          continue;
        }
        if (prev.text.endsWith("“")) {
          prev.text = prev.text.replace(/“$/, "");
          d.text = "“" + d.text;
          const ps = prev.source;
          const ds = d.source;
          if (ps && ds && quoteTail.has(prev) && ps.offset + ps.length <= ds.offset && ps.line === ds.line) {
            ps.length--;
            ds.length += ds.offset - (ps.offset + ps.length);
            ds.column -= ds.offset - (ps.offset + ps.length);
            ds.offset = ps.offset + ps.length;
          }
        }
        prev = d;
      }
      if (s.data.length > 1 && s.data[0].text === "" && openQuoteHeads.has(s.data[0])) s.data.shift();
    }
    return true;
  }
  last() {
    return this.segments[this.segments.length - 1];
  }
}
class TitleSection extends Section {
  values = /* @__PURE__ */ new Map();
  get title() {
    return this.getValue("title");
  }
  get keyAndMeters() {
    return this.getValue("KeyAndMeters");
  }
  get wordsMusicBy() {
    return this.getValue("WordsByAndMusicBy");
  }
  /** 速度/表情记号原文。JP-Word 用 `Expression` 一个字段兼记两者：可以是纯文字
   *  （`Expression = 热烈欢快地`），也可以是速度（`Expression = {♩=80}`）。
   *  parse() 已剥掉外层 {}，故这里拿到的是 `♩=80` / `热烈欢快地`。 */
  get expression() {
    return this.getValue("Expression");
  }
  /** 从 Expression 里取 ♩=NN 的数值；没写速度（纯表情文字）或超范围则 0。
   *  本项目写出的是 `♩`；JP-Word 自己存的是 ASCII `J`（它按音乐字体映射成四分音符），
   *  两种都认，免得读别处来的谱丢速度。 */
  get tempo() {
    const m = /[J♩]\s*=\s*(\d+)/i.exec(this.expression ?? "");
    const v = m ? parseInt(m[1], 10) : 0;
    return v >= 20 && v <= 400 ? v : 0;
  }
  get key() {
    const km = this.keyAndMeters;
    if (km === null) return null;
    const arr = km.split(",");
    return substringAfter$1(arr[0], "=").trim();
  }
  get meter() {
    const km = this.keyAndMeters;
    if (km === null) return null;
    const arr = km.split(",");
    return arr[1].trim();
  }
  getValue(key) {
    return this.values.get(key.toLowerCase()) ?? null;
  }
  parse() {
    for (const l of this.lines) {
      if (l.trim().length === 0) continue;
      const idx = l.indexOf("=");
      if (idx > 0) {
        const key = l.substring(0, idx).trim();
        let v = l.substring(idx + 1).trim();
        v = substringAfter$1(v, "{");
        v = substringBeforeLast(v, "}");
        this.values.set(key.toLowerCase(), v);
      } else {
        console.error("bad line");
      }
    }
    return true;
  }
}
class JpwFile {
  lines = [];
  sections = [];
  static fromString(s) {
    const res = new JpwFile();
    let ok;
    try {
      ok = res.parse(s.split("\n"));
    } catch {
      return null;
    }
    return ok ? res : null;
  }
  getLyric() {
    return this.sections.find((s) => s instanceof WordsSection) ?? null;
  }
  getVoice() {
    return this.sections.find((s) => s instanceof VoiceSection) ?? null;
  }
  getTitle() {
    return this.sections.find((s) => s instanceof TitleSection) ?? null;
  }
  getSection(cls) {
    return this.sections.find((s) => s instanceof cls) ?? null;
  }
  parse(lines) {
    let offset = 0;
    for (const [no, raw] of lines.entries()) {
      const at = offset;
      offset += raw.length + 1;
      const l = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      if (l.startsWith("//")) continue;
      if (l.length === 0) continue;
      if (l.startsWith(".")) {
        this.sections.push(Section.create(l));
        continue;
      }
      if (this.sections.length === 0) throw new Error("");
      const sec = this.sections[this.sections.length - 1];
      sec.lines.push(l);
      sec.lineNos.push(no);
      sec.lineOffsets.push(at);
    }
    for (const s of this.sections) {
      if (!s.parse()) return false;
    }
    return true;
  }
}
function substringAfter$1(s, delim) {
  const i = s.indexOf(delim);
  return i < 0 ? s : s.substring(i + delim.length);
}
function substringBeforeLast(s, delim) {
  const i = s.lastIndexOf(delim);
  return i < 0 ? s : s.substring(0, i);
}
function durationOf(beams, dots, beats) {
  const base = SIMPLE_DIVISIONS >> Math.min(beams, 6);
  let total = base;
  let add = base;
  for (let k = 0; k < dots; k++) {
    add = Math.floor(add / 2);
    total += add;
  }
  total += beats * SIMPLE_DIVISIONS;
  const types = ["quarter", "eighth", "16th", "32nd", "64th", "128th", "256th"];
  return { divisions: total, type: types[Math.min(beams, 6)], dots };
}
function accidentalOf(jpAlter) {
  switch (jpAlter) {
    case "#":
      return "sharp";
    case "b":
      return "flat";
    case "n":
      return "natural";
    default:
      return void 0;
  }
}
const REPEAT_ROW = /^(\d+)(?:\.(\d+))?-(\d+)(?:\.(\d+))?V(\d+)(P)?$/i;
function convertRepeat(rows, part) {
  const out = [];
  const parsed = rows.flatMap((r) => r.split(",")).map((raw) => REPEAT_ROW.exec(raw.trim())).filter((m) => m !== null);
  const base = parsed.some((m) => Number(m[1]) === 0) ? 1 : 0;
  for (const m of parsed) {
    const p = { fromMeasure: Number(m[1]) + base, toMeasure: Number(m[3]) + base, verse: Number(m[5]) };
    if (m[6]) p.pageBreakAfter = true;
    if (part) {
      if (m[2]) {
        const id = nthNoteId(part, p.fromMeasure, Number(m[2]));
        if (id !== void 0) p.fromElement = id;
      }
      if (m[4]) {
        const id = nthNoteId(part, p.toMeasure, Number(m[4]));
        if (id !== void 0) p.toElement = id;
      }
    }
    out.push(p);
  }
  return out;
}
function nthNoteId(part, measureNo, n) {
  const m = part.measures[measureNo - 1];
  if (!m) return void 0;
  let k = 0;
  for (const el of m.elements) {
    if (el.kind === "chord" && !el.grace) {
      k++;
      if (k === n) return el.id;
    }
  }
  return void 0;
}
function spanOf(sec, t2) {
  const lineOffset = sec.lineOffsets[t2.line];
  const lineNo = sec.lineNos[t2.line];
  if (lineOffset === void 0 || lineNo === void 0) return void 0;
  return { line: lineNo, column: t2.column, offset: lineOffset + t2.column, length: t2.end - t2.start };
}
const CONTROL_RE = /\{C:[^{}]*\}/g;
function readNote(txt, stat) {
  const nt = {
    kind: "note",
    number: "0",
    jpOctave: 0,
    jpAlter: " ",
    pitch: 0,
    step: " ",
    rest: false,
    beams: 0,
    beats: 1,
    dot: 0,
    slurStart: false,
    slurEnds: 0,
    fermata: false,
    tupletBegin: false,
    tupletEnd: false,
    graces: [],
    lyrics: []
  };
  let acc = "";
  txt = txt.replace(CONTROL_RE, "");
  const tupletText = "{(3}";
  if (txt.includes(tupletText)) {
    if (stat.inTuplet) throw new Error("");
    nt.tupletBegin = true;
    stat.inTuplet = true;
    txt = txt.replace(tupletText, "");
  }
  const graceMatch = txt.match(/\{([#b0-7',gd]+)\}/);
  if (graceMatch) {
    for (const g of graceMatch[1].matchAll(/(#b|#|b)?([0-7])([',gd]*)/g)) {
      const gn = { number: g[2], jpOctave: 0, jpAlter: " ", pitch: 0, step: " ", rest: false, chord: { rest: false } };
      if (g[1] === "#b") gn.jpAlter = "n";
      else if (g[1] === "#" || g[1] === "b") gn.jpAlter = g[1];
      for (const c of g[3]) {
        if (c === ",") gn.jpOctave -= 1;
        else if (c === "'") gn.jpOctave += 1;
      }
      applyJpPitch(stat, gn);
      nt.graces.push({ number: gn.number, jpOctave: gn.jpOctave, jpAlter: gn.jpAlter, pitch: gn.pitch, step: gn.step, rest: gn.rest });
    }
    txt = txt.replace(graceMatch[0], "");
  }
  const artMatch = txt.match(/\{(?:DunYin|BoYin|YanYin|ZhongYin)(?:,(?:DunYin|BoYin|YanYin|ZhongYin))*\}/);
  if (artMatch) {
    if (artMatch[0].includes("YanYin")) nt.fermata = true;
    txt = txt.replace(artMatch[0], "");
  }
  let opened = 0;
  for (const ch of txt) {
    if (ch >= "0" && ch <= "9") {
      nt.number = ch;
      switch (acc) {
        case "#":
          nt.jpAlter = "#";
          break;
        case "b":
          nt.jpAlter = "b";
          break;
        case "#b":
          nt.jpAlter = "n";
          break;
      }
      continue;
    }
    switch (ch) {
      case ",":
        nt.jpOctave -= 1;
        break;
      case "'":
        nt.jpOctave++;
        break;
      case "_":
        nt.beams += 1;
        break;
      case "-":
        nt.beats++;
        break;
      case ".":
        nt.dot++;
        break;
      case "#":
      case "b":
        acc += ch;
        break;
      case "(":
        nt.slurStart = true;
        opened++;
        break;
      case ")":
        if (stat.slurDepth > 0) {
          stat.slurDepth--;
          nt.slurEnds++;
        } else if (stat.inTuplet) {
          stat.inTuplet = false;
          nt.tupletEnd = true;
        } else {
          nt.slurEnds++;
        }
        break;
    }
  }
  stat.slurDepth += opened;
  const pitched = { ...nt, pitch: 0, chord: { rest: false } };
  applyJpPitch(stat, pitched);
  nt.pitch = pitched.pitch;
  nt.step = pitched.step;
  nt.rest = pitched.rest;
  return nt;
}
function readVoice(sec, fifths, time) {
  const out = [];
  let mea = null;
  let newMeasure2 = false;
  const stat = { basePitch: MusicCommon.getBasePitch(MusicCommon.keys[fifths + 7]), fifths, alter: {}, inTuplet: false, slurDepth: 0 };
  const tupNotes = [];
  let pendingTime = null;
  let pendingKey = null;
  const open = () => {
    const m = { entries: [], fifths, time, keyChange: false, timeChange: false };
    out.push(m);
    return m;
  };
  for (const tok of sec.voiceData) {
    if (tok.type === "note") {
      if (mea === null || newMeasure2) {
        mea = open();
        newMeasure2 = false;
        if (pendingTime !== null) {
          mea.time = pendingTime;
          mea.timeChange = true;
          pendingTime = null;
        }
        if (pendingKey !== null) {
          mea.fifths = pendingKey;
          mea.keyChange = true;
          stat.basePitch = MusicCommon.getBasePitch(MusicCommon.keys[pendingKey + 7]);
          stat.fifths = pendingKey;
          stat.alter = {};
          pendingKey = null;
        }
      }
      const nt = readNote(tok.text, stat);
      nt.source = spanOf(sec, tok);
      if (nt.tupletEnd || nt.tupletBegin) tupNotes.push(nt);
      mea.entries.push(nt);
    } else if (tok.type === "barline") {
      if (mea === null) {
        mea = open();
        newMeasure2 = false;
      }
      const txt = tok.text.replace(CONTROL_RE, "");
      const bar = { kind: "bar", style: "regular" };
      switch (txt) {
        case "|":
          bar.style = "regular";
          break;
        case "|]":
          bar.style = "light-heavy";
          break;
        case "[|]":
          bar.style = "none";
          break;
        case "||":
          bar.style = "light-light";
          break;
        case "|:":
          bar.style = "heavy-light";
          bar.repeat = "forward";
          break;
        case ":|":
          bar.style = "light-heavy";
          bar.repeat = "backward";
          break;
        case "::":
        case ":|:":
          bar.style = "light-heavy";
          bar.repeat = "backward";
          bar.alsoForward = true;
          break;
        default:
          throw new Error(`bad barline: ${txt}`);
      }
      bar.source = spanOf(sec, tok);
      mea.entries.push(bar);
      newMeasure2 = mea.entries.length > 1;
      stat.alter = {};
    } else if (tok.type === "timesig") {
      const m2 = /^(\d+)\/(\d+)/.exec(tok.text);
      if (m2) pendingTime = { beats: parseInt(m2[1], 10), beatType: parseInt(m2[2], 10) };
    } else if (tok.type === "string") {
      const m2 = /^"1=([#b]?[A-G])"$/.exec(tok.text);
      if (m2) pendingKey = MusicCommon.keyNameToFifth(m2[1]);
    } else if (tok.type === "return") {
      const ret = tok.text;
      const args = substringBefore(substringAfter(ret, "("), ")").split(",");
      mea?.entries.push({
        kind: "break",
        page: args.length >= 4 && args[3].toLowerCase() === "true",
        source: spanOf(sec, tok)
      });
    }
  }
  for (let i = 0; i < Math.floor(tupNotes.length / 2); i++) {
    if (tupNotes[2 * i].tupletEnd || tupNotes[2 * i + 1].tupletBegin) throw new Error("");
  }
  let curTime = time;
  let curKey = fifths;
  for (const m of out) {
    if (m.timeChange) curTime = m.time;
    else m.time = curTime;
    if (m.keyChange) curKey = m.fifths;
    else m.fifths = curKey;
  }
  return out;
}
function assignLyrics(measures, f) {
  for (const seg of f.getLyric()?.segments ?? []) {
    const notes = [];
    let mid = 0;
    for (const m of measures) {
      if (!m.entries.some((e) => e.kind === "note")) continue;
      mid++;
      let nid = 0;
      for (const ent of m.entries) {
        if (ent.kind === "break") {
          if (ent !== m.entries[m.entries.length - 1]) {
            mid++;
            nid = 0;
          }
          continue;
        }
        if (ent.kind !== "note") continue;
        nid++;
        if (mid < seg.measure) continue;
        if (mid === seg.measure && nid < seg.noteIndex) continue;
        notes.push(ent);
      }
    }
    let idx = 0;
    for (const it of seg.data) {
      if (idx >= notes.length) break;
      for (let pass = seg.passFirst; pass <= seg.passLast; pass++) {
        if (it.text.length > 0) notes[idx].lyrics.push({ number: pass, text: it.text, ...it.source ? { source: { ...it.source } } : {} });
      }
      idx++;
    }
  }
}
function buildPart(src, ids, marks) {
  const part = { id: "P1", measures: [] };
  let prevKeyFifths = null;
  let prevTime = "";
  const breakAfterOf = /* @__PURE__ */ new Map();
  const openSlurs = [];
  let openTuplet = null;
  let pendingInline = null;
  for (const sm of src) {
    let mea = { number: String(part.measures.length + 1), elements: [] };
    const timeKey = `${sm.time.beats}/${sm.time.beatType}`;
    if (prevKeyFifths === null || sm.keyChange || sm.fifths !== prevKeyFifths) {
      mea.attrs = { ...mea.attrs ?? {}, key: { fifths: sm.fifths } };
    }
    if (prevTime === "" || sm.timeChange || timeKey !== prevTime) {
      mea.attrs = { ...mea.attrs ?? {}, time: { beats: sm.time.beats, beatType: sm.time.beatType } };
    }
    prevKeyFifths = sm.fifths;
    prevTime = timeKey;
    openTuplet = null;
    pendingInline = null;
    for (const ent of sm.entries) {
      if (ent.kind === "break") {
        const target = mea.elements.length > 0 ? mea : part.measures[part.measures.length - 1] ?? mea;
        breakAfterOf.set(target, ent.page ? "page" : "system");
        const last = mea.elements.length > 0 ? mea.elements[mea.elements.length - 1] : void 0;
        pendingInline = last?.kind === "chord" ? { chord: last, kind: ent.page ? "page" : "system" } : null;
        if (ent.source) {
          const els = target.elements;
          (part.breakSources ??= []).push({ page: ent.page, after: els[els.length - 1]?.id ?? null, source: ent.source });
        }
        continue;
      }
      if (ent.kind === "bar") {
        const b = { location: "right", style: ent.style };
        if (ent.repeat) b.repeat = ent.repeat;
        if (ent.alsoForward) b.alsoForward = true;
        if (ent.source) b.source = ent.source;
        pendingInline = null;
        if (mea.elements.length === 0) {
          const left = (mea.barlines ?? []).find((x) => x.location === "left");
          if (left) {
            left.style ??= b.style;
            left.repeat ??= b.repeat;
          } else {
            (mea.barlines ??= []).push({ ...b, location: "left" });
          }
        } else {
          (mea.barlines ??= []).push(b);
          part.measures.push(mea);
          mea = { number: String(part.measures.length + 1), elements: [] };
        }
        continue;
      }
      if (pendingInline) {
        pendingInline.chord.lineBreakAfter = pendingInline.kind;
        pendingInline = null;
      }
      const ch = {
        kind: "chord",
        id: ids.next(),
        notes: [],
        duration: durationOf(ent.beams, ent.dot, Math.max(0, ent.beats - 1)),
        voice: 1,
        staff: 1
      };
      if (ent.source) ch.source = ent.source;
      if (ent.rest) ch.rest = {};
      const num = Number(ent.number);
      if (Number.isFinite(num) && num !== 0) {
        const acc = accidentalOf(ent.jpAlter);
        ch.notes.push({
          // `.jpwabc` 只有简谱度数，不填绝对音高：从前照 `fromscore` 抄了个只有音名字母、八度恒为 0 的 `pitch`，
          // 导出 MusicXML 时投影层（`xmlproject.ts`）见有音高就不再按度数 + 调号推，整首掉到第 0 八度
          degree: { number: num, octaveShift: ent.jpOctave, ...acc ? { accidental: acc } : {} }
        });
      }
      if (ent.beams > 0) ch.beams = Array.from({ length: ent.beams }, () => "continue");
      for (let k = 0; k < ent.beats - 1; k++) {
        const su = { id: ids.next() };
        (ch.sustains ??= []).push(su);
      }
      if (ent.fermata) ch.notations = { fermata: true };
      for (const g of ent.graces) {
        const gnum = Number(g.number);
        const gacc = accidentalOf(g.jpAlter);
        mea.elements.push({
          kind: "chord",
          id: ids.next(),
          notes: [{ degree: { number: Number.isFinite(gnum) && gnum > 0 ? gnum : 1, octaveShift: g.jpOctave, ...gacc ? { accidental: gacc } : {} } }],
          duration: { divisions: 0, dots: 0 },
          grace: {},
          voice: 1,
          staff: 1
        });
      }
      for (const lr of ent.lyrics) (ch.lyrics ??= []).push({ number: lr.number, text: lr.text, ...lr.source ? { source: lr.source } : {} });
      mea.elements.push(ch);
      for (let k = 0; k < ent.slurEnds; k++) {
        const start = openSlurs.pop();
        if (start !== void 0) marks.push({ type: "slur", start, end: ch.id, level: openSlurs.length });
      }
      if (ent.slurStart) openSlurs.push(ch.id);
      if (ent.tupletBegin) openTuplet = ch.id;
      if (openTuplet !== null && ent.tupletEnd) {
        marks.push({ type: "tuplet", start: openTuplet, end: ch.id, tupletActual: 3, tupletNormal: 2 });
        openTuplet = null;
      }
    }
    if (mea.elements.length || mea.barlines?.length) part.measures.push(mea);
  }
  const merged = [];
  let carry = [];
  for (const m of part.measures) {
    if (m.elements.length === 0) {
      for (const b of m.barlines ?? []) carry.push({ ...b, location: "left" });
      const after = breakAfterOf.get(m);
      if (after && merged.length) {
        const prev = merged[merged.length - 1];
        if (breakAfterOf.get(prev) !== "page") breakAfterOf.set(prev, after);
      }
      continue;
    }
    if (carry.length) {
      m.barlines = [...carry, ...m.barlines ?? []];
      carry = [];
    }
    merged.push(m);
  }
  if (carry.length && merged.length) {
    const last = merged[merged.length - 1];
    last.barlines = [...last.barlines ?? [], ...carry.map((b) => ({ ...b, location: "right" }))];
  }
  part.measures = merged;
  breaksAfterToStart(part, breakAfterOf);
  for (let i = 0; i < part.measures.length; i++) part.measures[i].number = String(i + 1);
  return part;
}
function unescape(str) {
  return str.replace(/\\n/g, "\n");
}
function readJpwSource(f) {
  const title = f.getTitle();
  const fifths = MusicCommon.keyNameToFifth(title?.key ?? "C");
  const [beats, beatType] = (title?.meter ?? "4/4").split("/");
  const time = { beats: parseInt(beats, 10), beatType: parseInt(beatType, 10) };
  const voice = f.getVoice();
  if (!voice) throw new Error(t("err.noVoice"));
  const measures = readVoice(voice, fifths, time);
  assignLyrics(measures, f);
  let passes = 0;
  for (const seg of f.getLyric()?.segments ?? []) passes = Math.max(passes, seg.passLast);
  return { measures, fifths, time, passes };
}
function jpwToScoreDoc(f) {
  const doc = emptyDoc("jpwabc");
  const ids = new IdGen();
  const song = emptySong();
  const title = f.getTitle();
  const titleText = unescape(title?.title ?? "");
  if (titleText) song.work.title = titleText;
  const author = title?.wordsMusicBy ?? null;
  if (author !== null && unescape(author)) {
    const text = unescape(author);
    song.credits = [{ text }];
    if (text !== titleText) {
      const one = text.replace(/\n/g, " ");
      song.identification = { creators: [{ type: (text.includes("\n") ? null : creatorTypeOf(one)) ?? "composer", text: one }] };
    }
  }
  if (title?.tempo) song.tempos = [title.tempo];
  const src = readJpwSource(f).measures;
  const m0 = src[0];
  if (m0) {
    song.key = { fifths: m0.fifths, ...title?.key ? { spelling: title.key } : {} };
    song.time = { beats: m0.time.beats, beatType: m0.time.beatType };
  }
  const marks = [];
  song.parts = [buildPart(src, ids, marks)];
  song.marks = marks;
  const rows = f.getSection(RepeatSection)?.data;
  if (rows?.length) {
    const play = convertRepeat(rows, song.parts[0]);
    if (play.length) song.playOrder = play;
  }
  doc.songs.push(song);
  return doc;
}
function substringAfter(s, delim) {
  const i = s.indexOf(delim);
  return i < 0 ? s : s.substring(i + delim.length);
}
function substringBefore(s, delim) {
  const i = s.indexOf(delim);
  return i < 0 ? s : s.substring(0, i);
}
function relayoutDocBreaks(sdoc, opt) {
  let changed = false;
  sdoc.songs.forEach((song, si) => {
    const cuts = phraseCuts(sdoc, si, { measure: opt.measure ?? null });
    if (!cuts || cuts.length === 0) return;
    const starts = [];
    for (const cut of cuts) if (cut.id !== null) starts.push({ id: cut.id, page: cut.page });
    if (applyBreaks(song, starts, { mid: opt.midBreaks, pages: "write" })) changed = true;
  });
  return changed;
}
function commentStart(raw) {
  let quoted2 = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') quoted2 = !quoted2;
    else if (ch === "%" && !quoted2) return i;
  }
  return -1;
}
const VERSION_RE = /^%(123|abc)-/;
function chordLines(doc) {
  const out = [];
  for (const song of doc.songs) {
    for (const part of song.parts) {
      for (const mea of part.measures) {
        for (const el of mea.elements) {
          if (el.kind === "chord") out.push(el.source?.line ?? -1);
        }
      }
    }
  }
  return out;
}
function collectComments(text, lineToChord) {
  const out = [];
  let pending = [];
  let seen = false;
  text.split(/\r?\n/).forEach((raw, ln) => {
    const trimmed = raw.trim();
    if (trimmed === "") return;
    const cut = commentStart(raw);
    if (trimmed.startsWith("%")) {
      if (!trimmed.startsWith("%%") && !VERSION_RE.test(trimmed)) pending.push({ text: trimmed, head: !seen });
      return;
    }
    const at = lineToChord.get(ln);
    if (at !== void 0) {
      for (const p of pending) out.push({ text: p.text, at, head: p.head });
      pending = [];
      if (cut > 0) out.push({ text: raw.slice(cut).trimEnd(), at, head: false });
    } else if (cut > 0) {
      pending.push({ text: raw.slice(cut).trimEnd(), head: !seen });
    }
    seen = true;
  });
  for (const p of pending) out.push({ text: p.text, at: null, head: p.head });
  return out;
}
function spliceComments(oldText, oldDoc, newText, newDoc) {
  const oldLines = chordLines(oldDoc);
  const newLines = chordLines(newDoc);
  if (oldLines.length !== newLines.length) return newText;
  const lineToChord = /* @__PURE__ */ new Map();
  oldLines.forEach((line, k) => {
    if (line >= 0 && !lineToChord.has(line)) lineToChord.set(line, k);
  });
  const comments = collectComments(oldText, lineToChord);
  if (comments.length === 0) return newText;
  const head = [];
  const tail = [];
  const before = /* @__PURE__ */ new Map();
  for (const c of comments) {
    const line = c.at === null ? -1 : newLines[c.at] ?? -1;
    if (c.head) head.push(c.text);
    else if (line < 0) tail.push(c.text);
    else before.set(line, [...before.get(line) ?? [], c.text]);
  }
  const raws = newText.split("\n");
  const out = [];
  let at = 0;
  if (head.length > 0) {
    if (VERSION_RE.test(raws[0]?.trim() ?? "")) out.push(raws[at++]);
    out.push(...head);
  }
  for (let i = at; i < raws.length; i++) {
    out.push(...before.get(i) ?? []);
    out.push(raws[i]);
  }
  out.push(...tail);
  return out.join("\n");
}
const BREAK_RE = /\$(\([^)]*\))?/g;
const BREAK_LINE = "$(true)";
const BREAK_PAGE = "$(true,0,0,true)";
function stripBreaks(text) {
  return text.replace(BREAK_RE, " ").replace(/\s+/g, " ").trim();
}
function anchorTable(f) {
  const out = [];
  let mid = 0;
  for (const m of readJpwSource(f).measures) {
    if (!m.entries.some((e) => e.kind === "note")) continue;
    mid++;
    let nid = 0;
    for (const ent of m.entries) {
      if (ent.kind === "break") {
        if (ent !== m.entries[m.entries.length - 1]) {
          mid++;
          nid = 0;
        }
        continue;
      }
      if (ent.kind !== "note") continue;
      nid++;
      out.push({ mid, nid });
    }
  }
  return out;
}
const WORDS_SPEC_RE = /^W(\d+)(-\d+)?(\([0-9a-zA-Z.,]+\))?@(\d+),(\d+)/;
function retargetWords(oldFile, newText) {
  const newFile = JpwFile.fromString(newText);
  const words = newFile?.getSection(WordsSection);
  if (!newFile || !words) return newText;
  let before;
  let after;
  try {
    before = anchorTable(oldFile);
    after = anchorTable(newFile);
  } catch {
    return newText;
  }
  if (before.length === 0 || before.length !== after.length) return newText;
  const raws = newText.split("\n");
  for (const no of words.lineNos) {
    const raw = raws[no];
    if (raw === void 0) continue;
    const m = WORDS_SPEC_RE.exec(raw);
    if (!m) continue;
    const mid = parseInt(m[4], 10);
    const nid = parseInt(m[5], 10);
    const at = before.findIndex((p) => p.mid > mid || p.mid === mid && p.nid >= nid);
    const to = at < 0 ? null : after[at];
    if (!to) continue;
    const head = m[0].slice(0, m[0].length - `@${m[4]},${m[5]}`.length);
    raws[no] = `${head}@${to.mid},${to.nid}${raw.slice(m[0].length)}`;
  }
  return raws.join("\n");
}
function relayoutJpwabcText(text, sdoc, opt = {}) {
  const cuts = phraseCuts(sdoc, 0, { measure: opt.measure ?? null });
  if (!cuts || cuts.length === 0) return text;
  const file = JpwFile.fromString(text);
  const voice = file?.getSection(VoiceSection) ?? null;
  if (!file || !voice || voice.lines.length === 0) return text;
  const at = /* @__PURE__ */ new Map();
  for (const cut of cuts) {
    if (!cut.source) continue;
    const list = at.get(cut.source.line) ?? [];
    list.push(cut);
    at.set(cut.source.line, list);
  }
  if (at.size === 0) return text;
  const lastRaw = voice.lines[voice.lines.length - 1];
  const lastMark = [...lastRaw.matchAll(BREAK_RE)].pop()?.[0] ?? BREAK_PAGE;
  const out = [];
  let buf = "";
  const push2 = (piece) => {
    const s = stripBreaks(piece);
    if (s.length === 0) return;
    buf = buf.length === 0 ? s : `${buf} ${s}`;
  };
  const flush = (mark) => {
    if (buf.length === 0) return;
    out.push(buf + mark);
    buf = "";
  };
  voice.lines.forEach((raw, i) => {
    const here = (at.get(voice.lineNos[i]) ?? []).slice().sort((a, b) => a.source.column - b.source.column);
    let from = 0;
    for (const cut of here) {
      const col = cut.source.column;
      if (col < from) continue;
      push2(raw.slice(from, col));
      flush(cut.page ? BREAK_PAGE : BREAK_LINE);
      from = col;
    }
    push2(raw.slice(from));
  });
  flush(lastMark);
  if (out.length === 0) return text;
  const raws = text.split("\n");
  const crlf = text.includes("\r\n");
  const first = voice.lineNos[0];
  const drop = new Set(voice.lineNos);
  const layout = file.getSection(LayoutSection);
  if (layout && layout.breakPoints !== null) {
    layout.lineNos.forEach((no, i) => {
      if (/^\s*breakpoints\s*=/i.test(layout.lines[i])) drop.add(no);
    });
  }
  const merged = [];
  raws.forEach((raw, no) => {
    if (no === first) merged.push(...out.map((l) => crlf ? `${l}\r` : l));
    if (!drop.has(no)) merged.push(raw);
  });
  return retargetWords(file, merged.join("\n"));
}
function keyNameOf(fifths, style = "prefix") {
  const idx = tonicStep(fifths);
  const alter = keyAlter(idx, fifths);
  const sign = alter < 0 ? "b" : alter > 0 ? "#" : "";
  return style === "suffix" ? STEPS$2[idx] + sign : sign + STEPS$2[idx];
}
const KEY_DISPLAY = {
  prefix: /^(?:[A-G][#$b♭♯]?|[#$b♭♯][A-G])$/,
  suffix: /^[A-G][b#$♭♯]?$/
};
function keyText(k, style) {
  if (!k) return "C";
  if (k.display && KEY_DISPLAY[style].test(k.display)) return k.display;
  const sp = k.spelling && k.spelling !== "none" ? k.spelling : keySpelling(k);
  const m = /^([#b]?)([A-G])([#b]?)$/.exec(sp);
  if (!m) return keyNameOf(k.fifths, style);
  const sign = m[1] || m[3] || "";
  return style === "suffix" ? m[2] + sign : sign + m[2];
}
function meterText(song) {
  const parts = [];
  let inParen = false;
  for (const t2 of [song.time, ...song.extraTimes ?? []]) {
    if (!t2) continue;
    const paren = t2.parenthesized === true;
    if (!paren && inParen) parts[parts.length - 1] += ")";
    parts.push((paren && !inParen ? "(" : "") + `${t2.beats}/${t2.beatType}`);
    inParen = paren;
  }
  if (inParen) parts[parts.length - 1] += ")";
  return parts.join(" ");
}
function pushField(L, name, value) {
  for (const line of value.split(/\r?\n/)) {
    const t2 = line.trim();
    if (t2) L.push(`${name}:${t2}`);
  }
}
function isSafeRemark(line) {
  const t2 = line.trim();
  if (!t2) return false;
  if (t2.startsWith("#") || /^-{5,}$/.test(t2) || /^\[fenye\]$/i.test(t2)) return false;
  if (/^\s*[A-Za-z]+\s*[:：]/.test(t2) || /^\s*[1-7]\s*=/.test(t2)) return false;
  return !(/[|]/.test(t2) && /[0-9]/.test(t2));
}
function headerLines$1(song, d, opts) {
  const h = d.header;
  const L = [];
  if (h.versionLine) L.push(song.work.version ? `V:${song.work.version}` : h.versionLine);
  const number = opts.fromAbc ? void 0 : song.work.number;
  const inTitle = number && !h.indexFields ? `${number} ` : "";
  if (song.work.title !== void 0 || inTitle) {
    L.push(`${h.titleField}:${inTitle}${(song.work.title ?? "").split(/\r?\n/).join(" ")}`);
  }
  for (const st of song.work.subtitles) pushField(L, h.titleField, st);
  const pt = song.pageText;
  if (h.indexFields && d.emit.pageFields) {
    const left = pt?.indexLeft ?? (pt?.indexRight === void 0 ? number : void 0);
    if (left !== void 0) L.push(`${h.indexFields.left}:${left}`);
    if (pt?.indexRight !== void 0) L.push(`${h.indexFields.right}:${pt.indexRight}`);
  }
  for (const c of song.identification?.creators ?? []) pushField(L, h.creditField, c.text);
  const key = keyText(song.key, h.keyStyle);
  const meter = meterText(song);
  if (h.keyMeter === "split") {
    L.push(`${h.keyField}:${key}`);
    if (meter) L.push(`${h.meterField}:${meter}`);
  } else {
    const tonic = song.key?.tonicDegree ?? "1";
    const note = song.timeNote ? ` ${song.timeNote}` : "";
    L.push(`${tonic}=${key}${meter}${meter ? note : ""}`);
  }
  if (song.tempos?.length) L.push(`${h.tempoField}:${quarterTempos(song).join(" ")}`);
  if (d.emit.pageFields) {
    for (const [field, arr] of [
      ["TL", pt?.topLeft],
      ["TR", pt?.topRight],
      ["BL", pt?.bottomLeft],
      ["BC", pt?.bottomCenter],
      ["BR", pt?.bottomRight]
    ]) {
      for (const t2 of arr ?? []) for (const line of t2.split(/\r?\n/)) L.push(`${field}:${line.trim()}`);
    }
    for (const r of song.style?.raw ?? []) {
      if (/^(fontsize|margin|space|off)$/i.test(r.key)) L.push(`${r.key}:${r.value}`);
    }
  }
  for (const r of song.remarks ?? []) for (const line of r.split(/\r?\n/)) if (isSafeRemark(line)) L.push(line.trim());
  return L;
}
const PU_COMMANDS = /* @__PURE__ */ new Set([
  "zkh",
  "ykh",
  ...Object.keys(DYNAMICS),
  ...Object.keys(TERMS),
  "yc",
  "ycy",
  "bc",
  "zy",
  "dy",
  "hx",
  "shy",
  "xhy",
  "sby",
  "xby",
  "cy",
  "tr",
  "fine",
  "dc",
  "ds",
  "ty",
  "hs",
  "sbf"
]);
const TERM_OF = Object.fromEntries(
  Object.entries(TERMS).map(([name, text]) => [text, name])
);
function commandText(o) {
  return `&${o.name}${"+".repeat(Math.max(0, o.level))}`;
}
function ornamentsOf$1(el) {
  if (el.ornaments?.length) return el.ornaments.filter((o) => PU_COMMANDS.has(o.name));
  const out = [];
  const add = (name) => {
    if (name && PU_COMMANDS.has(name) && !out.some((o) => o.name === name)) out.push({ name, level: 0 });
  };
  const n = el.notations;
  if (n?.fermata) add("yc");
  for (const a of n?.articulations ?? []) add(PU_COMMANDS.has(a) ? a : decoKey(a));
  for (const o of n?.ornaments ?? []) add(PU_COMMANDS.has(o) ? o : decoKey(o));
  return out;
}
function directionCommands(mea) {
  const out = /* @__PURE__ */ new Map();
  for (const dir of mea.directions ?? []) {
    let name;
    if (dir.type === "dynamics" && dir.text && dir.text in DYNAMICS) name = dir.text;
    else if (dir.type === "words" && dir.text) name = TERM_OF[dir.text.trim()] ?? decoKey(dir.text.trim());
    else if (dir.type === "segno" || dir.type === "coda") name = decoKey(dir.type);
    if (!name) continue;
    const at = Math.min(dir.afterElements ?? 0, Math.max(0, mea.elements.length - 1));
    const list = out.get(at) ?? [];
    list.push({ name, level: 0 });
    out.set(at, list);
  }
  return out;
}
function accidentalChar(d, acc) {
  if (!acc) return "";
  const exact = Object.entries(d.accidentals).find(([, sem]) => sem === acc)?.[0];
  if (exact) return exact;
  const single = acc === "double-sharp" ? "sharp" : acc === "double-flat" ? "flat" : void 0;
  return single ? Object.entries(d.accidentals).find(([, sem]) => sem === single)?.[0] ?? "" : "";
}
function octaveText(d, shift) {
  if (!shift) return "";
  return (shift > 0 ? d.octaveUp : d.octaveDown).repeat(Math.abs(shift));
}
function headText(ch, d, anchored) {
  if (ch.rhythm) return d.rhythmToken;
  if (ch.rest) {
    if (ch.printObject === false) return anchored ? "8" : d.emit.hiddenRestNoLyric ?? "0";
    return "0" + octaveText(d, ch.rest.octaveShift);
  }
  const deg = topNote(ch)?.degree;
  if (!deg) return "0";
  return String(deg.number) + accidentalChar(d, deg.accidental) + octaveText(d, deg.octaveShift);
}
function durationText$1(beams, dots) {
  return "/".repeat(beams) + ".".repeat(dots);
}
function graceText(ch, d) {
  const lines = ch.beams?.length ?? Math.max(1, GRACE_LINES.indexOf(ch.duration.type ?? "eighth"));
  return headText(ch, d, false) + "/".repeat(Math.max(0, lines - 1));
}
const GRACE_LINES = ["quarter", "eighth", "16th", "32nd", "64th"];
function planArcs(marks, pos) {
  const plan = {
    opens: /* @__PURE__ */ new Map(),
    closes: /* @__PURE__ */ new Map(),
    wedgeStart: /* @__PURE__ */ new Map(),
    wedgeEnd: /* @__PURE__ */ new Map(),
    dropped: { nested: 0, oddTuplet: 0 },
    inTuplet: /* @__PURE__ */ new Set()
  };
  const PRIO = { tuplet: 0, tied: 1, slur: 2 };
  const cands = [];
  for (const m of marks) {
    const s = pos.get(m.start);
    const e = pos.get(m.end);
    if (s === void 0 || e === void 0 || e < s) continue;
    if (m.type === "wedge") {
      if (e === s) continue;
      const sign = (m.wedgeType === "diminuendo" ? ">" : "<") + "+".repeat(m.level ?? 0);
      const list = plan.wedgeStart.get(m.start) ?? [];
      list.push(sign);
      plan.wedgeStart.set(m.start, list);
      plan.wedgeEnd.set(m.end, (plan.wedgeEnd.get(m.end) ?? 0) + 1);
      continue;
    }
    if (PRIO[m.type] === void 0) continue;
    if (m.collapsed) continue;
    if (m.type === "tuplet") {
      const n = e - s + 1;
      const odd = m.tupletActual !== void 0 && (m.tupletActual !== n || (m.tupletNormal ?? 2) !== n - 1);
      if (n < 2 || odd) {
        plan.dropped.oddTuplet++;
        continue;
      }
    }
    cands.push({ m, s, e });
  }
  cands.sort((a, b) => PRIO[a.m.type] - PRIO[b.m.type] || a.s - b.s || a.e - b.e);
  const kept = [];
  const fits = (a, b) => {
    if (a.e < b.s || b.e < a.s || a.s === b.s) return true;
    const [x, y] = a.s < b.s ? [a, b] : [b, a];
    return x.e <= y.e;
  };
  for (const c of cands) {
    if (kept.every((k) => fits(k, c))) kept.push(c);
    else if (c.m.type === "tuplet") plan.dropped.oddTuplet++;
    else plan.dropped.nested++;
  }
  kept.sort((a, b) => a.s - b.s || a.e - b.e || PRIO[a.m.type] - PRIO[b.m.type]);
  for (const k of kept) {
    const list = plan.opens.get(k.m.start) ?? [];
    list.push(k.m.type === "tuplet" ? "(y" : "(");
    plan.opens.set(k.m.start, list);
    plan.closes.set(k.m.end, (plan.closes.get(k.m.end) ?? 0) + 1);
    if (k.m.type === "tuplet") for (let p = k.s + 1; p <= k.e; p++) plan.inTuplet.add(p);
  }
  return plan;
}
function isStreamElement(el, mea) {
  if (el.kind === "space") return el.spacer === "x";
  if (el.grace) return false;
  const lane = melodyLane(mea);
  return !lane || el.staff === lane.staff && el.voice === lane.voice;
}
const hasText = (ls) => !!ls?.some((l) => l.text !== "" || !!l.trailingPunctuation);
function chordAnchored(ch) {
  if (ch.continued) return ch.lyricAnchor ?? (!ch.rest || !!ch.rhythm);
  if (!ch.rest || ch.rhythm) return true;
  return ch.lyricAnchor === true || hasText(ch.lyrics);
}
function barlineType(b) {
  if (b.repeat === "backward") return b.alsoForward ? "repeat-both" : "repeat-end";
  if (b.repeat === "forward") return "repeat-start";
  switch (b.style) {
    case void 0:
      return null;
    case "light-heavy":
    case "heavy-heavy":
      return "end";
    case "light-light":
    case "heavy-light":
      return "double";
    case "none":
      return b.noWidth ? "hidden" : "invisible";
    default:
      return "normal";
  }
}
function barlineCode(d, type) {
  const found = [...d.barlines].reverse().find(([, t2]) => t2 === type);
  return found ? found[0] : "|";
}
class Line {
  tokens = [];
  push(s) {
    if (s) this.tokens.push(s);
  }
  /** 贴在上一个片段后面（记号、注释、收弧） */
  glue(s) {
    if (!s) return;
    if (this.tokens.length) this.tokens[this.tokens.length - 1] += s;
    else this.tokens.push(s);
  }
  get empty() {
    return this.tokens.length === 0;
  }
  text(gap) {
    return this.tokens.join(gap);
  }
}
function quoted(s) {
  return `"${s.replace(/"/g, "'")}"`;
}
function writeInline(items, line, st) {
  for (const it of items ?? []) {
    if (it.kind === "boundary") {
      line.push(it.behavior === "join" ? "~" : "^");
      continue;
    }
    const sub = new Line();
    const pos = /* @__PURE__ */ new Map();
    let p = 0;
    for (const m of it.measures) {
      for (const el of m.elements) {
        pos.set(el.id, p++);
        if (el.kind === "chord") for (const su of el.sustains ?? []) pos.set(su.id, p++);
      }
    }
    const subSt = {
      ...st,
      plan: planArcs(it.marks, pos),
      pos,
      openVoltas: 0,
      autoBoundaries: false,
      consumedLeft: /* @__PURE__ */ new Set()
    };
    it.measures.forEach((m, mi) => {
      writeMeasureBody(m, 0, Infinity, sub, subSt, []);
      writeRightBarline(it.measures, mi, sub, subSt, true);
    });
    line.push(`{${it.role === "voice" ? "dsb" : "bz"}${sub.text(" ")}}`);
  }
}
function writeTail(id, host, line, st, opts) {
  if (opts.at) line.glue("@");
  for (const o of [...ornamentsOf$1(host), ...opts.extra ?? []]) line.glue(commandText(o));
  if (host.harmony) {
    const text = harmonyText(host.harmony);
    if (text) line.glue(quoted(`hx:${text}`));
  }
  if (host.sectionWord) line.glue(quoted(host.sectionWord));
  for (const q of opts.quotes ?? []) line.glue(q);
  for (const w of st.plan.wedgeStart.get(id) ?? []) line.glue(w);
  line.glue(")".repeat(st.plan.closes.get(id) ?? 0));
  line.glue("!".repeat(st.plan.wedgeEnd.get(id) ?? 0));
}
function writeMeasureBody(mea, from, to, line, st, slots, startBeat = 0) {
  const d = st.d;
  const dirs = directionCommands(mea);
  const mids = (mea.barlines ?? []).filter((b) => b.location === "middle");
  let midIdx = 0;
  let pendingGrace = [];
  let pendingHarmony;
  let lastMain = -1;
  let beat = startBeat;
  let prev = null;
  let syncopated = false;
  const groupBeats = st.time && st.time.beatType === 8 && st.time.beats % 3 === 0 ? 1.5 : 1;
  for (const [j, el] of mea.elements.entries()) {
    const dur = (el.kind === "chord" ? el.duration.divisions : el.duration?.divisions ?? 0) / SIMPLE_DIVISIONS;
    if (j < from || j >= to) {
      if (el.kind === "chord" && !el.grace) beat += dur;
      continue;
    }
    while (midIdx < mids.length && (mids[midIdx].afterElements ?? 0) <= j) {
      const t2 = barlineType(mids[midIdx]);
      if (t2) line.push(barlineCode(d, t2));
      midIdx++;
    }
    if (el.kind === "chord" && el.grace) {
      if (el.grace.after && lastMain >= 0) {
        line.tokens[lastMain] += quoted(`hyy:${graceText(el, d)}`);
      } else if (!el.grace.after) {
        pendingGrace.push(el);
      }
      continue;
    }
    if (el.kind === "space" && el.spacer === "y") {
      pendingHarmony ??= el.harmony;
      continue;
    }
    if (!isStreamElement(el, mea)) continue;
    const p = st.pos.get(el.id) ?? -1;
    const beams = el.beams?.length ?? 0;
    if (el.kind === "chord") writeInline(el.before, line, st);
    if (st.autoBoundaries && prev && prev.beams > 0 && beams > 0 && !st.plan.inTuplet.has(p)) {
      const sameBeat = Math.floor(prev.beat + 1e-9) === Math.floor(beat + 1e-9);
      if (groupBeats !== 1) {
        const g = Math.floor(beat / groupBeats + 1e-9);
        if (Math.floor(prev.beat / groupBeats + 1e-9) !== g) {
          if (sameBeat) line.push("^");
        } else if (Math.floor(prev.beat - g * groupBeats + 1e-9) !== Math.floor(beat - g * groupBeats + 1e-9)) {
          line.push("~");
        }
      } else if (syncopated && prev.beams !== beams && !sameBeat) {
        line.push("^");
      }
    }
    prev = { beams, beat };
    const end = beat + dur;
    if (beat % 1 !== 0 && Math.floor(beat + 1e-9) !== Math.floor(end - 1e-9)) syncopated = true;
    beat = end;
    const opens = (st.plan.opens.get(el.id) ?? []).join("");
    const extra = dirs.get(j) ?? [];
    if (el.kind === "space") {
      line.push(opens + "8" + durationText$1(beams, el.duration?.dots ?? 0));
      slots.push({ lyrics: el.lyrics });
      writeTail(el.id, { ...el, harmony: el.harmony ?? pendingHarmony }, line, st, { at: false, extra });
      pendingHarmony = void 0;
      continue;
    }
    const ch = el;
    const anchored = chordAnchored(ch);
    const graceQuote = pendingGrace.length ? [quoted(`yy:${pendingGrace.map((g) => graceText(g, d)).join(" ")}`)] : [];
    pendingGrace = [];
    const tailDots = (st.plan.closes.get(ch.id) ?? 0) > 0 ? ch.duration.dots : 0;
    if (ch.continued) {
      line.push(opens + "-");
    } else {
      line.push(opens + headText(ch, d, anchored) + durationText$1(beams, ch.duration.dots - tailDots));
    }
    lastMain = line.tokens.length - 1;
    if (anchored) slots.push({ lyrics: ch.lyrics });
    const at = anchored && (ch.continued || !!ch.rest && !ch.rhythm && ch.printObject !== false);
    const host = ch.harmony || !pendingHarmony ? ch : { ...ch, harmony: pendingHarmony };
    pendingHarmony = void 0;
    writeTail(ch.id, host, line, st, { at, extra, quotes: graceQuote });
    line.glue(".".repeat(tailDots));
    for (const su of ch.sustains ?? []) writeSustain(su, line, st, slots);
  }
  if (pendingGrace.length && lastMain >= 0) {
    line.tokens[lastMain] += quoted(`hyy:${pendingGrace.map((g) => graceText(g, d)).join(" ")}`);
  }
  if (to >= mea.elements.length) {
    for (; midIdx < mids.length; midIdx++) {
      const t2 = barlineType(mids[midIdx]);
      if (t2) line.push(barlineCode(d, t2));
    }
    writeInline(mea.trailing, line, st);
  }
  return beat;
}
function writeSustain(su, line, st, slots) {
  writeInline(su.before, line, st);
  line.push((st.plan.opens.get(su.id) ?? []).join("") + "-");
  const anchored = su.lyricAnchor === true || hasText(su.lyrics);
  if (anchored) slots.push({ lyrics: su.lyrics });
  writeTail(su.id, su, line, st, { at: anchored });
}
function voltaOpenText(e, st) {
  let s = "[" + "+".repeat(e.level ?? 0);
  if (!e.captionless) s += quoted(e.text ?? e.numbers.join(","));
  if (st.d.emit.voltaOpenEnd === "start" && st.voltaOpenEnd.get(e)) s += "/";
  return s;
}
function writeLeft(mea, line, st) {
  const lefts = (mea.barlines ?? []).filter((b) => b.location === "left");
  for (const b of lefts) {
    if (st.consumedLeft.has(b)) continue;
    const t2 = barlineType(b);
    const orns = (b.ornaments ?? []).map(commandText).join("");
    if (t2) {
      writeInline(b.before, line, st);
      line.push(barlineCode(st.d, t2) + orns);
    } else if (orns) {
      if (line.empty) line.push(barlineCode(st.d, "hidden") + orns);
      else line.glue(orns);
    }
  }
  for (const b of lefts) {
    const e = b.ending;
    if (!e || e.type !== "start" || e.collapsed || e.danglingLead) continue;
    closeVoltas(line, st);
    if (st.d.emit.voltaLeadBarline && line.empty) line.push(barlineCode(st.d, "hidden"));
    line.push(voltaOpenText(e, st));
    st.openVoltas++;
  }
}
function closeVoltas(line, st) {
  if (st.openVoltas <= 0 || !st.closeOpenVoltas) return;
  const text = "]".repeat(st.openVoltas);
  st.openVoltas = 0;
  if (st.d.emit.voltaCloseAfterBarline) {
    line.glue(text);
    return;
  }
  const last = line.tokens.length - 1;
  if (last >= 0 && /^[|:]/.test(line.tokens[last])) line.tokens.splice(last, 0, text);
  else line.push(text);
}
function writeRightBarline(measures, mi, line, st, lineEnd) {
  const d = st.d;
  const mea = measures[mi];
  const rights = (mea.barlines ?? []).filter((b) => b.location === "right");
  const bar = rights.find((b) => barlineType(b) !== null);
  const next = measures[mi + 1];
  const nextLeft = next?.barlines?.find((b) => b.location === "left" && barlineType(b) !== null);
  let type = bar ? barlineType(bar) : null;
  if (nextLeft) {
    const lt = barlineType(nextLeft);
    if (lt === "repeat-start") type = type === "repeat-end" || type === "repeat-both" ? "repeat-both" : "repeat-start";
    else if (type === null || type === "normal") type = lt;
    st.consumedLeft.add(nextLeft);
  }
  const stops = rights.filter((b) => b.ending && (b.ending.type === "stop" || b.ending.type === "discontinue"));
  let closeText = "";
  for (const b of stops) {
    if (st.openVoltas <= 0) break;
    st.openVoltas--;
    closeText += "]" + (b.ending.type === "discontinue" && d.emit.voltaOpenEnd === "end" ? "/" : "");
  }
  if (closeText && !d.emit.voltaCloseAfterBarline) {
    line.push(closeText);
    closeText = "";
  }
  const nextTime = next?.attrs?.time;
  const meter = bar?.time ?? (nextTime && (!st.time || nextTime.beats !== st.time.beats || nextTime.beatType !== st.time.beatType) ? nextTime : void 0);
  if (type === null && !lineEnd && next) type = "normal";
  if (type === null && meter) type = "hidden";
  if (type !== null) {
    if (bar) writeInline(bar.before, line, st);
    let s = barlineCode(d, type);
    s += closeText;
    for (const o of [...bar?.ornaments ?? [], ...nextLeft?.ornaments ?? []]) s += commandText(o);
    if (meter) s += quoted(`p:${meter.beats}/${meter.beatType}`);
    if (bar?.annotation) s += quoted(bar.annotation);
    line.push(s);
  } else if (closeText) {
    line.glue(closeText);
  }
  if (nextTime) st.time = nextTime;
  if (!next) closeVoltas(line, st);
  return type === null;
}
const CJK_ONE = /^[぀-ヿ㐀-鿿豈-﫿]$/u;
const TRAILING_OK = PU_LYRIC_PUNCTUATION + '”’"）)';
function lyricToken(l) {
  let core = ((l.leadingPunctuation ?? "") + l.text).replace(/[{}]/g, "");
  let tail = l.trailingPunctuation ?? "";
  if ([...tail].some((c) => !TRAILING_OK.includes(c))) {
    core += tail;
    tail = "";
  }
  while (core.length > 1 && TRAILING_OK.includes(core[core.length - 1])) {
    tail = core[core.length - 1] + tail;
    core = core.slice(0, -1);
  }
  if (!core) return tail ? `{${tail}}` : "";
  const plain = CJK_ONE.test(core) || /^[A-Za-z']+$/.test(core);
  return (plain ? core : `{${core}}`) + tail;
}
function lyricSpecs(slots, infos) {
  if (infos?.length) {
    const key = (i) => `${i.verseFrom}-${i.verseTo}`;
    const counts = /* @__PURE__ */ new Map();
    for (const i of infos) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
    return infos.map((i, idx) => ({
      from: i.verseFrom,
      to: i.verseTo,
      ...i.annotation !== void 0 ? { label: i.annotation } : {},
      gap: i.annotationGap,
      joinBrace: !!i.joinBrace,
      ...counts.get(key(i)) > 1 ? { lineIndex: idx } : {}
    }));
  }
  const specs = /* @__PURE__ */ new Map();
  for (const s of slots) {
    const seen = /* @__PURE__ */ new Map();
    for (const l of s.lyrics ?? []) {
      if (l.text === "" && !l.trailingPunctuation) continue;
      const to = l.numberTo ?? l.number;
      const range = `${l.number}-${to}`;
      const nth = seen.get(range) ?? 0;
      seen.set(range, nth + 1);
      const k = `${range}#${nth}`;
      let spec = specs.get(k);
      if (!spec) specs.set(k, spec = { from: l.number, to, gap: 20, joinBrace: false, ...nth ? { nth } : {} });
      if (spec.label === void 0 && l.verseLabel !== void 0) spec.label = l.verseLabel;
    }
  }
  return [...specs.values()].sort((a, b) => a.from - b.from || a.to - b.to || (a.nth ?? 0) - (b.nth ?? 0));
}
function lyricLine(slots, spec, single, d) {
  const skip = d.lyricSkip[0] ?? "@";
  const pieces = [];
  let pendingSkips = 0;
  let any = false;
  let prev = "";
  for (const s of slots) {
    const hit = s.lyrics?.filter((l) => l.number === spec.from && (l.numberTo ?? l.number) === spec.to && (spec.lineIndex === void 0 || l.lineIndex === void 0 || l.lineIndex === spec.lineIndex))[spec.nth ?? 0];
    const tok = hit ? lyricToken(hit) : "";
    if (!tok) {
      pendingSkips++;
      continue;
    }
    if (pendingSkips) {
      pieces.push(skip.repeat(pendingSkips));
      prev = skip;
      pendingSkips = 0;
    }
    if (/[A-Za-z']$/.test(prev) && /^[A-Za-z']/.test(tok)) pieces.push(d.wordSeparator);
    pieces.push(tok);
    prev = tok;
    any = true;
  }
  if (!any) return null;
  let body = pieces.join("");
  if (spec.joinBrace) body += "}";
  else if (body.endsWith("}")) body += skip;
  const num = single && spec.from === 1 && spec.to === 1 ? "" : `${spec.from}${spec.to !== spec.from ? `-${spec.to}` : ""}`;
  let label = "";
  if (spec.label !== void 0) {
    const [open, close] = d.emit.labelWrap;
    const enc = spec.label.replace(/ /g, "_").replace(/@/g, "%40").replace(/["<>]/g, "");
    label = open + enc + (spec.gap !== 20 ? `%${spec.gap}` : "") + close;
  }
  return `C${num}:${label}${body}`;
}
function positions(part) {
  const pos = /* @__PURE__ */ new Map();
  let p = 0;
  for (const mea of part.measures) {
    for (const el of mea.elements) {
      if (!isStreamElement(el, mea)) continue;
      pos.set(el.id, p++);
      if (el.kind === "chord") for (const su of el.sustains ?? []) pos.set(su.id, p++);
    }
  }
  return pos;
}
function voltaEnds(part) {
  const out = /* @__PURE__ */ new WeakMap();
  const open = [];
  for (const mea of part.measures) {
    for (const b of mea.barlines ?? []) {
      const e = b.ending;
      if (!e) continue;
      if (e.type === "start") {
        open.push(e);
        continue;
      }
      const at = e.pair !== void 0 ? open.findIndex((s) => s.pair === e.pair) : open.length - 1;
      if (at < 0) continue;
      out.set(open[at], e.type === "discontinue");
      open.splice(at, 1);
    }
  }
  return out;
}
const FALLBACK_MEASURES_PER_LINE = 4;
function withLines(song) {
  const part = song.parts[0];
  if (!part || part.measures.length <= 8) return song;
  const hasBreaks = (s) => {
    const p = s.parts[0];
    return p.measures.some((m, i) => i > 0 && (m.print?.newSystem || m.print?.newPage)) || p.measures.some((m) => m.elements.some((el) => el.kind === "chord" && !!el.lineBreakAfter));
  };
  if (hasBreaks(song)) return song;
  const doc = { sourceFormat: "123", songs: [structuredClone(song)], diagnostics: [] };
  const phrased = doc.songs[0];
  if (relayoutDocBreaks(doc, { measure: null, midBreaks: "snap" }) && hasBreaks(phrased)) return phrased;
  for (const p of phrased.parts) {
    p.measures.forEach((m, i) => {
      if (i > 0 && i % FALLBACK_MEASURES_PER_LINE === 0) m.print = { ...m.print, newSystem: true };
    });
  }
  return phrased;
}
function withDegrees(song) {
  const missing = song.parts.some((p) => p.measures.some((m) => m.elements.some((el) => el.kind === "chord" && el.notes.some((n) => n.pitch && !n.degree))));
  if (!missing) return song;
  const copy = structuredClone(song);
  fillDegreesFromPitch(copy);
  return copy;
}
function puArcLosses(src) {
  const song = projectForJianpu(src);
  const out = { nested: 0, oddTuplet: 0 };
  for (const part of song.parts) {
    const own = ownIds(part, (el, mi) => isStreamElement(el, part.measures[mi]));
    const plan = planArcs(ownMarks(song, own), positions(part));
    out.nested += plan.dropped.nested;
    out.oddTuplet += plan.dropped.oddTuplet;
  }
  return out;
}
function qPrefix(song, pi, first, firstSystem, d) {
  const [open, close] = d.emit.labelWrap;
  const caption = first?.print?.caption ?? (firstSystem ? song.parts[pi]?.name : void 0);
  const num = song.parts.length > 1 ? String(pi + 1) : "";
  const cap = caption ? open + caption.replace(/["<>]/g, "") + close : "";
  return `Q${first?.print?.variant ?? ""}${num}${cap}:`;
}
function emitPuSong(src, dialect, opts = {}) {
  const d = dialectSpec(dialect);
  const song = withDegrees(withLines(projectForJianpu(src)));
  const L = headerLines$1(song, d, opts);
  if (d.emit.blankBetweenGroups) L.push("");
  const hasBoundaries = song.parts.some((p) => p.measures.some((m) => m.elements.some((el) => el.kind === "chord" && (el.before ?? []).some((it) => it.kind === "boundary"))));
  const states = song.parts.map((part) => {
    const own = ownIds(part, (el, mi) => isStreamElement(el, part.measures[mi]));
    const pos = positions(part);
    return {
      d,
      plan: planArcs(ownMarks(song, own), pos),
      pos,
      voltaOpenEnd: voltaEnds(part),
      openVoltas: 0,
      time: song.time,
      autoBoundaries: !hasBoundaries,
      consumedLeft: /* @__PURE__ */ new Set(),
      closeOpenVoltas: !opts.fromPu,
      carryBeat: 0
    };
  });
  const ranges = systemRanges(song.parts[0]);
  const pranges = song.parts.map((part) => partRanges(ranges, song.parts[0], part));
  ranges.forEach((_, ri) => {
    const group = [];
    song.parts.forEach((part, pi) => {
      const sys = pranges[pi][ri];
      const st = states[pi];
      const last = Math.min(sys.to, part.measures.length - 1);
      if (sys.from > last) return;
      const first = part.measures[sys.from];
      if (pi === 0 && ri > 0 && (sys.fromEl === 0 ? first?.print?.newPage : ranges[ri - 1].inline === "page")) group.push("[fenye]");
      if (pi === 0 && sys.fromEl === 0) for (const t2 of first?.print?.texts ?? []) pushField(group, "W", t2);
      const line = new Line();
      const slots = [];
      for (let mi = sys.from; mi <= last; mi++) {
        const mea = part.measures[mi];
        const fromEl = mi === sys.from ? sys.fromEl : 0;
        const toEl = mi === sys.to ? sys.toEl : Infinity;
        if (fromEl === 0) writeLeft(mea, line, st);
        const end = writeMeasureBody(mea, fromEl, toEl, line, st, slots, fromEl === 0 ? st.carryBeat : 0);
        st.carryBeat = 0;
        if (toEl >= mea.elements.length && writeRightBarline(part.measures, mi, line, st, mi === last)) st.carryBeat = end;
      }
      if (line.empty) return;
      group.push(qPrefix(song, pi, first, ri === 0, d) + line.text(d.emit.tokenGap));
      const infos = sys.fromEl === 0 && song.parts.length && first?.print?.lyricLines;
      const specs = lyricSpecs(slots, infos || void 0);
      for (const spec of specs) {
        const text = lyricLine(slots, spec, specs.length === 1, d);
        if (text !== null) group.push(text);
      }
    });
    if (!group.length) return;
    L.push(...group);
    if (d.emit.blankBetweenGroups) L.push("");
  });
  while (L.length && L[L.length - 1] === "") L.pop();
  return L.join("\n");
}
function emitPu(doc, dialect) {
  const opts = { fromPu: doc.sourceFormat === "pu", fromAbc: doc.sourceFormat === "abc" };
  return doc.songs.map((s) => emitPuSong(s, dialect, opts)).join("\n-----\n") + "\n";
}
function fromPuBarline(el) {
  const b = { location: "right" };
  switch (el.type) {
    case "end":
      b.style = "light-heavy";
      break;
    case "double":
      b.style = "light-light";
      break;
    case "repeat-start":
      b.style = "heavy-light";
      b.repeat = "forward";
      break;
    case "repeat-end":
      b.style = "light-heavy";
      b.repeat = "backward";
      break;
    case "repeat-both":
      b.style = "light-heavy";
      b.repeat = "backward";
      b.alsoForward = true;
      break;
    // `|/` 不显形也不占宽、`|*` 不显形但占宽：MusicXML 两者都只能是 none
    case "hidden":
      b.style = "none";
      b.noWidth = true;
      break;
    case "invisible":
      b.style = "none";
      break;
    default:
      b.style = "regular";
      break;
  }
  if (el.ornaments.length) b.ornaments = ornamentsOf(el.ornaments);
  if (el.temporaryMeter) {
    b.time = { beats: el.temporaryMeter.numerator, beatType: el.temporaryMeter.denominator };
    if (el.temporaryMeter.parenthesized) b.time.parenthesized = true;
  }
  if (el.annotation !== void 0) b.annotation = el.annotation;
  b.source = el.source;
  return b;
}
const ornamentsOf = (os) => os.map((o) => ({ name: o.name, level: o.level }));
function beamsOf(duration) {
  let n = 0;
  let d = duration;
  while (d > 4 && n < 6) {
    d /= 2;
    n++;
  }
  return n;
}
function durationFrom(duration, dots, sustains) {
  const beams = beamsOf(duration);
  const base = SIMPLE_DIVISIONS >> Math.min(beams, 6);
  let total = base;
  let add = base;
  for (let k = 0; k < dots; k++) {
    add = Math.floor(add / 2);
    total += add;
  }
  total += sustains * SIMPLE_DIVISIONS;
  const types = ["quarter", "eighth", "16th", "32nd", "64th", "128th", "256th"];
  return { divisions: total, type: types[Math.min(beams, 6)], dots };
}
const harmonyOf = (text) => ({ root: { step: "C", alter: 0 }, kind: "", text });
function attachedOf(el) {
  const out = [];
  if (el.chord !== void 0 && el.chordSource) out.push({ kind: "harmony", name: el.chord, source: el.chordSource });
  if (el.annotation !== void 0 && el.annotationSource) {
    out.push({ kind: "annotation", name: el.annotation, source: el.annotationSource });
  }
  for (const o of el.ornaments) out.push({ kind: "deco", name: o.name, source: o.source });
  out.sort((a, b) => a.source.offset - b.source.offset);
  return out.length ? out : void 0;
}
function chordOfNote(n, voice, ids, grace) {
  const beams = beamsOf(n.duration);
  const ch = {
    kind: "chord",
    id: ids.next(),
    notes: [],
    duration: grace ? { ...durationFrom(n.duration, n.dots, 0), divisions: 0 } : durationFrom(n.duration, n.dots, 0),
    voice,
    staff: 1,
    source: n.source
  };
  if (grace) ch.grace = grace;
  if (n.sound === "rhythm") {
    ch.rhythm = true;
  } else if (n.pitch === 0) {
    ch.rest = n.octave ? { octaveShift: n.octave } : {};
  } else {
    const note = {
      degree: { number: n.pitch, octaveShift: n.octave }
    };
    if (n.accidental) note.degree.accidental = n.accidental;
    ch.notes.push(note);
  }
  if (n.hidden) ch.printObject = false;
  if (grace || n.lyricAnchor !== (n.pitch !== 0 || n.sound === "rhythm")) ch.lyricAnchor = n.lyricAnchor;
  if (beams > 0) ch.beams = Array.from({ length: beams }, () => "continue");
  if (n.chord !== void 0) ch.harmony = harmonyOf(n.chord);
  if (n.annotation !== void 0) ch.sectionWord = n.annotation;
  if (n.ornaments.length) {
    ch.ornaments = ornamentsOf(n.ornaments);
    const fermata = n.ornaments.some((o) => /^(yc|fermata)$/i.test(o.name));
    const arts = n.ornaments.filter((o) => !/^(yc|fermata)$/i.test(o.name)).map((o) => o.name);
    ch.notations = { ...fermata ? { fermata: true } : {}, ...arts.length ? { articulations: arts } : {} };
  }
  const att = attachedOf(n);
  if (att) ch.attachedSources = att;
  return ch;
}
function convertLine(elements, voice, ids, startMeasureNo, carry) {
  const measures = [];
  const idAt = /* @__PURE__ */ new Map();
  const measureAt = /* @__PURE__ */ new Map();
  const anchors = [];
  let mea = { number: String(startMeasureNo), elements: [] };
  let host = null;
  let pending = [];
  const takePending = (target) => {
    if (pending.length) {
      target.before = pending;
      pending = [];
    }
  };
  const flush = (bar) => {
    if (bar) (mea.barlines ??= []).push(bar);
    if (mea.elements.length || mea.barlines?.length) measures.push(mea);
    mea = { number: String(startMeasureNo + measures.length), elements: [] };
    host = null;
  };
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    switch (el.kind) {
      case "barline": {
        const b = fromPuBarline(el);
        takePending(b);
        measureAt.set(i, measures.length);
        flush(b);
        break;
      }
      case "sustain": {
        if (!host) {
          const prev = carry.last;
          const ch = {
            kind: "chord",
            id: ids.next(),
            notes: prev ? prev.notes.map((nt) => ({ ...nt.degree ? { degree: { ...nt.degree } } : {} })) : [],
            duration: durationFrom(4, 0, 0),
            voice,
            staff: 1,
            continued: true,
            source: el.source
          };
          if (prev?.rest || !prev) ch.rest = {};
          if (prev?.rhythm) ch.rhythm = true;
          if (el.lyricAnchor !== (!ch.rest || !!ch.rhythm)) ch.lyricAnchor = el.lyricAnchor;
          if (el.chord !== void 0) ch.harmony = harmonyOf(el.chord);
          if (el.annotation !== void 0) ch.sectionWord = el.annotation;
          if (el.ornaments.length) ch.ornaments = ornamentsOf(el.ornaments);
          const att2 = attachedOf(el);
          if (att2) ch.attachedSources = att2;
          takePending(ch);
          mea.elements.push(ch);
          idAt.set(i, ch.id);
          measureAt.set(i, measures.length);
          if (el.lyricAnchor) anchors.push(ch);
          host = ch;
          carry.last = ch;
          break;
        }
        const su = { id: ids.next(), source: el.source };
        if (el.chord !== void 0) su.harmony = harmonyOf(el.chord);
        if (el.annotation !== void 0) su.sectionWord = el.annotation;
        if (el.ornaments.length) su.ornaments = ornamentsOf(el.ornaments);
        if (el.lyricAnchor) su.lyricAnchor = true;
        const att = attachedOf(el);
        if (att) su.attachedSources = att;
        takePending(su);
        (host.sustains ??= []).push(su);
        host.duration = durationFrom(4 << (host.beams?.length ?? 0), host.duration.dots, host.sustains.length);
        idAt.set(i, su.id);
        measureAt.set(i, measures.length);
        if (el.lyricAnchor) anchors.push(su);
        break;
      }
      case "note": {
        const n = el;
        for (const g of n.graceBefore) mea.elements.push(chordOfNote(g, voice, ids, {}));
        const ch = chordOfNote(n, voice, ids, void 0);
        takePending(ch);
        mea.elements.push(ch);
        for (const g of n.graceAfter) mea.elements.push(chordOfNote(g, voice, ids, { after: true }));
        idAt.set(i, ch.id);
        measureAt.set(i, measures.length);
        host = ch;
        carry.last = ch;
        if (n.lyricAnchor) anchors.push(ch);
        break;
      }
      case "beat-boundary":
        pending.push({ kind: "boundary", behavior: el.behavior, source: el.source });
        break;
      case "inline-layer": {
        const sub = convertLine(el.elements, voice, ids, 1, { last: null });
        const marks = [];
        convertMarks(el.marks, sub, marks, { pending: /* @__PURE__ */ new Map() }, sub.measures);
        pending.push({ kind: "layer", role: el.role, measures: sub.measures, marks, source: el.source });
        break;
      }
    }
  }
  if (pending.length) {
    if (mea.elements.length || mea.barlines?.length || measures.length === 0) {
      mea.trailing = pending;
      measures.push(mea);
      mea = { number: String(startMeasureNo + measures.length), elements: [] };
    } else {
      measures[measures.length - 1].trailing = pending;
    }
    pending = [];
  }
  flush();
  return { measures, idAt, measureAt, anchors, length: elements.length };
}
function attachLyrics(anchors, lyrics) {
  const infos = [];
  const rangeKey = (l) => `${l.verseFrom}-${l.verseTo}`;
  const dup = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  for (const l of lyrics) (seen.has(rangeKey(l)) ? dup : seen).add(rangeKey(l));
  for (const [lineIdx, line] of lyrics.entries()) {
    const info = {
      verseFrom: line.verseFrom,
      verseTo: line.verseTo,
      annotationGap: line.annotationGap,
      count: line.syllables.length,
      source: line.source,
      sources: line.syllables.map((syl) => syl.source)
    };
    if (line.annotation !== void 0) info.annotation = line.annotation;
    if (line.joinBrace) info.joinBrace = true;
    infos.push(info);
    let labelled = false;
    for (let k = 0; k < line.syllables.length && k < anchors.length; k++) {
      const syl = line.syllables[k];
      if (syl.text === "" && !syl.trailingPunctuation) continue;
      const l = { number: line.verseFrom, text: syl.text };
      if (line.verseTo !== line.verseFrom) l.numberTo = line.verseTo;
      if (syl.trailingPunctuation) l.trailingPunctuation = syl.trailingPunctuation;
      if (!labelled && line.annotation !== void 0) {
        l.verseLabel = line.annotation;
        labelled = true;
      }
      if (dup.has(rangeKey(line))) l.lineIndex = lineIdx;
      l.source = syl.source;
      const a = anchors[k];
      (a.lyrics ??= []).push(l);
    }
  }
  return infos;
}
function convertMarks(marks, r, out, cross, measures, voltas) {
  for (const m of marks) {
    if (m.type === "volta") {
      applyVolta(r, m, measures, voltas ?? { open: [] });
      continue;
    }
    const type = m.type === "slur" ? "slur" : m.type === "tuplet" ? "tuplet" : "wedge";
    const start = nearestId(r.idAt, m.start, 1);
    const end = nearestId(r.idAt, m.end, -1);
    const lead = start === void 0 ? 0 : nearestIndex(r.idAt, m.start, 1) - m.start;
    const trail = end === void 0 ? 0 : m.end - nearestIndex(r.idAt, m.end, -1);
    const setTrail = (mk2) => {
      if (trail > 0 && !m.continuationToNext) mk2.endTrail = trail;
      else delete mk2.endTrail;
    };
    const key = m.type;
    if (start === void 0 && m.continuationToNext && !m.continuationFromPrevious) {
      const lm = { type, start: -1, end: -1, leadInPreviousLine: true, continuesToNext: true };
      if (m.level) lm.level = m.level;
      if (r.length - m.start > 0) lm.leadBack = r.length - m.start;
      if (m.type === "crescendo") lm.wedgeType = "crescendo";
      if (m.type === "decrescendo") lm.wedgeType = "diminuendo";
      const q = cross.pending.get(key);
      if (q) q.push(lm);
      else cross.pending.set(key, [lm]);
      continue;
    }
    if (start === void 0 && end !== void 0 && m.start > m.end && !m.continuationToNext && !m.continuationFromPrevious) {
      const mk2 = { type, start: end, end, collapsed: true };
      if (m.level) mk2.level = m.level;
      if (m.type === "crescendo") mk2.wedgeType = "crescendo";
      if (m.type === "decrescendo") mk2.wedgeType = "diminuendo";
      out.push(mk2);
      continue;
    }
    if (start === void 0 || end === void 0) continue;
    if (m.continuationFromPrevious) {
      const queue = cross.pending.get(key);
      const head = queue?.shift();
      if (head) {
        if (head.start === -1) {
          head.start = start;
          if (lead > 0) head.startLead = lead;
          out.push(head);
        }
        head.end = end;
        if (m.closeSource) head.closeSource = m.closeSource;
        setTrail(head);
        delete head.continuesToNext;
        (head.continuationLevels ??= []).push(m.level);
        if (m.continuationToNext) {
          head.continuesToNext = true;
          queue.push(head);
        }
        continue;
      }
    }
    const mk = { type, start, end };
    if (type === "slur") {
      mk.openSource = m.source;
      if (m.closeSource) mk.closeSource = m.closeSource;
    }
    if (lead > 0 && !m.continuationFromPrevious) mk.startLead = lead;
    setTrail(mk);
    if (m.level) mk.level = m.level;
    if (m.type === "crescendo") mk.wedgeType = "crescendo";
    if (m.type === "decrescendo") mk.wedgeType = "diminuendo";
    if (type === "tuplet") {
      const actual = Number(m.caption);
      if (m.caption !== void 0 && Number.isFinite(actual)) mk.tupletActual = actual;
      mk.tupletNormal = 2;
    }
    if (m.continuationFromPrevious) mk.continuesFromPrevious = true;
    if (m.continuationToNext) {
      mk.continuesToNext = true;
      const q = cross.pending.get(key);
      if (q) q.push(mk);
      else cross.pending.set(key, [mk]);
    }
    out.push(mk);
  }
}
function nearestIndex(idAt, from, dir) {
  for (let i = from; i >= 0 && i < from + 64; i += dir) {
    if (idAt.has(i)) return i;
    if (dir === -1 && i === 0) break;
  }
  return void 0;
}
function nearestId(idAt, from, dir) {
  for (let i = from; i >= 0 && i < from + 64; i += dir) {
    const id = idAt.get(i);
    if (id !== void 0) return id;
    if (dir === -1 && i === 0) break;
  }
  return void 0;
}
function measureEdge(r, k, which) {
  let hit;
  for (const [i, mk] of r.measureAt) {
    if (mk !== k) continue;
    if (hit === void 0 || (which === "first" ? i < hit : i > hit)) hit = i;
  }
  return hit;
}
function nearestMeasure(r, from, dir) {
  for (let i = from; i >= 0 && i < from + 64; i += dir) {
    const k = r.measureAt.get(i);
    if (k !== void 0) return k;
    if (dir === -1 && i === 0) break;
  }
  return void 0;
}
let voltaPair = 0;
function applyVolta(r, m, measures, voltas) {
  const caption = m.caption ?? "1";
  const stopType = m.openEnd ? "discontinue" : "stop";
  const putStart = (mea2, ending2) => {
    const existing = (mea2.barlines ?? []).find((b) => b.location === "left");
    if (existing && !existing.ending) existing.ending = ending2;
    else if (existing) mea2.barlines.push({ location: "left", ending: ending2 });
    else (mea2.barlines ??= []).unshift({ location: "left", ending: ending2 });
  };
  const makeStart = (cap, level) => {
    const ns = cap.split(/[.,]/).map((x) => Number(x.trim())).filter((x) => Number.isFinite(x) && x > 0);
    const e = { numbers: ns.length ? ns : [1], type: "start", text: cap };
    if (m.caption === void 0) e.captionless = true;
    if (level) e.level = level;
    return e;
  };
  let start = null;
  if (m.continuationFromPrevious) {
    const head = voltas.open.shift();
    if (head?.start) {
      start = head.start;
      (start.continuationLevels ??= []).push(m.level);
    } else if (head?.lead) {
      const ph = head.lead.placeholder;
      ph.mea.barlines = (ph.mea.barlines ?? []).filter((b) => b !== ph.bar);
      if (!ph.mea.barlines.length) delete ph.mea.barlines;
      const k2 = nearestMeasure(r, m.start, 1);
      const mea2 = k2 === void 0 ? void 0 : measures[k2];
      if (!mea2) return;
      start = makeStart(head.lead.caption, head.lead.level);
      start.leadInPreviousLine = true;
      start.continuationLevels = [m.level];
      putStart(mea2, start);
    }
  }
  if (!start) {
    const k2 = nearestMeasure(r, m.start, 1);
    const mea2 = k2 === void 0 ? void 0 : measures[k2];
    if (!mea2) {
      if (m.continuationToNext) {
        const last2 = measures[measures.length - 1];
        if (!last2) return;
        const e = makeStart(caption, m.level);
        e.danglingLead = true;
        const bar = { location: "right", ending: e };
        (last2.barlines ??= []).push(bar);
        voltas.open.push({ start: null, lead: { caption, level: m.level, placeholder: { mea: last2, bar } } });
      }
      return;
    }
    start = makeStart(caption, m.level);
    const first = measureEdge(r, k2, "first");
    if (first !== void 0 && m.start !== first) start.startOffset = m.start - first;
    putStart(mea2, start);
    const kEnd = m.continuationToNext ? void 0 : nearestMeasure(r, m.end, -1);
    if (kEnd !== void 0 && kEnd < k2) {
      start.collapsed = true;
      return;
    }
  }
  if (m.continuationToNext) {
    voltas.open.push({ start });
    return;
  }
  const k = nearestMeasure(r, m.end, -1);
  const mea = k === void 0 ? void 0 : measures[k];
  if (!mea) return;
  start.pair ??= ++voltaPair;
  const ending = { numbers: start.numbers, type: stopType, text: start.text ?? caption, pair: start.pair };
  const last = measureEdge(r, k, "last");
  if (last !== void 0 && m.end !== last) ending.endOffset = m.end - last;
  const right = (mea.barlines ?? []).find((b) => b.location === "right");
  if (right && !right.ending) right.ending = ending;
  else (mea.barlines ??= []).push({ location: "right", ending });
}
function markPlaceholders(song) {
  if (song.parts.length < 2) return;
  const read = song.parts.map((part) => {
    const chords2 = part.measures.flatMap((m) => m.elements).filter((el) => el.kind === "chord" && !el.grace);
    const hidden = chords2.filter((ch) => !!ch.rest && !ch.rhythm && ch.printObject === false);
    const counted = chords2.reduce((t2, ch) => t2 + ch.duration.divisions, 0);
    const own = hidden.reduce((t2, ch) => t2 + ch.duration.divisions / ((ch.sustains?.length ?? 0) + 1), 0);
    return { hidden, counted, bare: counted - own };
  });
  if (!read.some((r) => r.hidden.length)) return;
  const fits = (total2) => read.filter((r) => r.counted === total2 || r.bare === total2).length;
  const lead = read[0];
  const total = fits(lead.bare) > fits(lead.counted) ? lead.bare : lead.counted;
  for (const r of read) {
    if (r.counted === total || r.bare !== total) continue;
    for (const ch of r.hidden) ch.placeholder = true;
  }
}
function puToScoreDoc(pu) {
  const doc = emptyDoc("pu");
  doc.puDialect = pu.dialect;
  doc.source = pu.source;
  doc.diagnostics = [...pu.diagnostics];
  const ids = new IdGen();
  for (const ps of pu.songs) {
    const song = emptySong();
    const meta = ps.metadata;
    if (meta.titles[0] !== void 0) song.work.title = meta.titles[0];
    song.work.subtitles = meta.titles.slice(1);
    if (meta.version !== void 0) song.work.version = meta.version;
    if (meta.authors.length) {
      song.identification = { creators: meta.authors.map(creatorOf) };
    }
    if (meta.mode !== void 0 || meta.tonic !== void 0) {
      song.key = { fifths: 0 };
      if (meta.mode !== void 0) {
        song.key.spelling = normalizeSpelling(meta.mode);
        if (song.key.spelling !== meta.mode) song.key.display = meta.mode;
      }
      if (meta.tonic !== void 0 && meta.tonic !== "1") song.key.tonicDegree = meta.tonic;
    }
    const [m0, ...mRest] = meta.meters;
    if (m0) song.time = { beats: m0.numerator, beatType: m0.denominator, parenthesized: m0.parenthesized };
    if (mRest.length) {
      song.extraTimes = mRest.map((m) => ({ beats: m.numerator, beatType: m.denominator, parenthesized: m.parenthesized }));
    }
    if (meta.timeNote !== void 0) song.timeNote = meta.timeNote;
    if (meta.tempos.length) song.tempos = [...meta.tempos];
    if (meta.remarks.length) song.remarks = [...meta.remarks];
    if (meta.indexLeft !== void 0 || meta.indexRight !== void 0 || meta.topLeft.length || meta.topRight.length || meta.bottomLeft.length || meta.bottomCenter.length || meta.bottomRight.length) {
      song.pageText = {
        ...meta.indexLeft !== void 0 ? { indexLeft: meta.indexLeft } : {},
        ...meta.indexRight !== void 0 ? { indexRight: meta.indexRight } : {},
        topLeft: meta.topLeft,
        topRight: meta.topRight,
        bottomLeft: meta.bottomLeft,
        bottomCenter: meta.bottomCenter,
        bottomRight: meta.bottomRight
      };
    }
    const raw = [];
    for (const f of meta.fontSizes) raw.push({ key: "FontSize", value: f });
    for (const g of meta.margins) raw.push({ key: "Margin", value: g });
    for (const o of meta.options) raw.push({ key: o.key, value: o.value });
    if (raw.length) song.style = { raw };
    const byVoice = /* @__PURE__ */ new Map();
    const marks = [];
    const cross = /* @__PURE__ */ new Map();
    let system = 0;
    ps.pages.forEach((page, pageIdx) => {
      page.groups.forEach((group, groupIdx) => {
        group.voices.forEach((line, voiceIdx) => {
          let pv = byVoice.get(line.voice);
          if (!pv) {
            const part = { id: `P${line.voice}`, measures: [] };
            if (line.caption !== void 0) part.name = line.caption;
            pv = { part, carry: { last: null }, voltas: { open: [] } };
            byVoice.set(line.voice, pv);
          }
          const r = convertLine(line.elements, line.voice, ids, pv.part.measures.length + 1, pv.carry);
          if (r.measures.length === 0) r.measures.push({ number: String(pv.part.measures.length + 1), elements: [] });
          const lyricLines2 = attachLyrics(r.anchors, line.lyrics);
          let cs = cross.get(line.voice);
          if (!cs) cross.set(line.voice, cs = { pending: /* @__PURE__ */ new Map() });
          convertMarks(line.marks, r, marks, cs, r.measures, pv.voltas);
          const first = r.measures[0];
          const p = { newSystem: true, system, source: line.source };
          if (groupIdx === 0 && pageIdx > 0) {
            p.newPage = true;
            if (page.breakSource) {
              const prev = pv.part.measures[pv.part.measures.length - 1]?.elements;
              (pv.part.breakSources ??= []).push({ page: true, after: prev?.[prev.length - 1]?.id ?? null, source: page.breakSource });
            }
          }
          if (voiceIdx === 0 && group.texts.length) {
            p.texts = group.texts.map((t2) => t2.text);
            p.textSources = group.texts.map((t2) => t2.source);
          }
          if (line.caption !== void 0) p.caption = line.caption;
          if (line.variant !== void 0) p.variant = line.variant;
          if (lyricLines2.length) p.lyricLines = lyricLines2;
          first.print = p;
          pv.part.measures.push(...r.measures);
        });
        system++;
      });
    });
    song.parts = [...byVoice.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.part);
    for (const part of song.parts) part.endBreak = "system";
    for (const part of song.parts) {
      for (let i = 0; i < part.measures.length; i++) part.measures[i].number = String(i + 1);
    }
    song.marks = marks;
    markPlaceholders(song);
    doc.songs.push(song);
  }
  return doc;
}
function escape(s) {
  return s.replace(/\n/g, "\\n");
}
const isChord = (e) => "notes" in e && "beats" in e;
const isLineBreak = (e) => "newPage" in e && "pass" in e;
const isBarline = (e) => "style" in e && "repeat" in e;
class LyricProcessor {
  constructor(part) {
    this.part = part;
  }
  refrain = null;
  verses = /* @__PURE__ */ new Map();
  texts = /* @__PURE__ */ new Map();
  numVerses = 0;
  mid = 0;
  nid = 0;
  inVerse = true;
  static reg = /^\d\./;
  static punc = /[，。！？、“”：；]+/g;
  lines(res) {
    for (const [k, v] of this.texts) {
      let head = "W" + k.passFirst;
      if (k.passFirst !== k.passLast) head += "-" + k.passLast;
      head += "@" + k.measure + "," + k.noteIndex + ":";
      res.push(head);
      let str = v;
      if (str.endsWith("/")) str = str.replace(/\/+$/, "");
      res.push(str);
    }
  }
  appendSlash() {
    if (this.inVerse) {
      for (const v of this.verses.values()) this.texts.set(v, (this.texts.get(v) ?? "") + "/");
    } else if (this.refrain) {
      this.texts.set(this.refrain, (this.texts.get(this.refrain) ?? "") + "/");
    }
  }
  makeText(txt) {
    if (txt.length === 1) return txt;
    const mat = LyricProcessor.reg.exec(txt);
    if (mat) {
      return `{${mat[0]}[${txt.substring(mat[0].length)}]}`;
    }
    const left = txt.replace(LyricProcessor.punc, "");
    const quote = left.length !== 1;
    return quote ? `{${txt}}` : txt;
  }
  onChord(ch) {
    const lrcs = ch.notes[0].lyrics;
    if (lrcs.length > this.numVerses) this.numVerses = lrcs.length;
    const lrc = lrcs[0];
    if (!lrc) {
      this.appendSlash();
      return;
    }
    if (lrc.refrain) {
      if (!this.refrain) {
        const seg = { passFirst: 1, passLast: 1, measure: this.mid, noteIndex: this.nid };
        this.refrain = seg;
        this.texts.set(seg, "");
      }
      this.texts.set(this.refrain, (this.texts.get(this.refrain) ?? "") + this.makeText(lrc.text));
      this.inVerse = false;
    } else {
      const present = /* @__PURE__ */ new Set();
      for (const it of lrcs) {
        if (!this.verses.has(it.number)) {
          const seg2 = { passFirst: it.number, passLast: it.number, measure: this.mid, noteIndex: this.nid };
          this.verses.set(it.number, seg2);
          this.texts.set(seg2, "");
        }
        const seg = this.verses.get(it.number);
        this.texts.set(seg, (this.texts.get(seg) ?? "") + this.makeText(it.text));
        present.add(it.number);
      }
      for (const [num, seg] of this.verses) {
        if (present.has(num)) continue;
        this.texts.set(seg, (this.texts.get(seg) ?? "") + "/");
      }
      this.inVerse = true;
    }
  }
  process() {
    for (const m of this.part.measures) {
      this.mid++;
      this.nid = 0;
      for (const ch of m.entries) {
        if (isLineBreak(ch)) {
          if (ch !== m.entries[m.entries.length - 1]) {
            this.mid++;
            this.nid = 0;
          }
          continue;
        }
        if (!isChord(ch)) continue;
        this.nid++;
        this.onChord(ch);
      }
    }
    if (this.refrain) this.refrain.passLast = this.numVerses;
  }
}
class JpwWriter {
  lines = [];
  write(scr) {
    this.lines.push("// ************** JPW-ABC File Ver 1.0 (for JP-Word v5.50m) **************");
    this.makeMetaData(scr);
    this.makeVoiceData(scr.parts[0]);
    this.makeWordData(scr.parts[0]);
    this.makeRepeatData(scr);
  }
  makeRepeatData(scr) {
    if (scr.playData.noRepeat) return;
    if (scr.playData.measures.length === 0) return;
    this.lines.push(".Repeat");
    for (const it of scr.playData.measures) {
      const head = it.skip > 0 ? `${it.mid + 1}.${it.skip + 1}` : `${it.mid + 1}`;
      const tail = it.limit >= 0 ? `${it.end}.${it.limit}` : `${it.end}`;
      this.lines.push(`${head}-${tail}V${it.pass}`);
    }
  }
  makeMetaData(scr) {
    this.lines.push(".Title");
    this.lines.push("Title = " + escape(scr.title));
    const firstMea = scr.parts[0].measures[0];
    const tm = firstMea.time;
    this.lines.push(`KeyAndMeters = {1=${firstMea.key.name},${tm.beats}/${tm.beatType}}`);
    const authors = [];
    for (const it of scr.credit) {
      if (it.type === "title") continue;
      if (it.type === "subtitle") continue;
      if (it.page !== 0) continue;
      authors.push(escape(it.text.trim()));
    }
    const order = (s) => s.includes("词") ? 5 : s.includes("译") ? 4 : s.includes("曲") ? 3 : s.includes("编") ? 2 : 1;
    authors.sort((a, b) => order(b) - order(a));
    this.lines.push(`WordsByAndMusicBy = ${authors.join("\\n")}`);
    if (scr.playData.tempo > 0) this.lines.push(`Expression = {♩=${scr.playData.tempo}}`);
  }
  makeWordData(part) {
    const proc = new LyricProcessor(part);
    proc.process();
    this.lines.push(".Words");
    proc.lines(this.lines);
  }
  makeNotations(ch) {
    return ch.fermata ? "{YanYin}" : "";
  }
  static alter(p) {
    switch (p.jpAlter) {
      case "n":
        return "#b";
      case "b":
      case "#":
        return p.jpAlter;
      case " ":
      case "":
      case "\0":
        return "";
      default:
        throw new Error("bad jpAlter");
    }
  }
  /** 倚音：`{` 一串音高 `}`，排在主音之前（文法 `Note` 里 Grace 就在 Pitch 之前）。
   *  倚音不带时值：排版那一端固定按八分音符画（`layout.ts::addGraceNotes`）。 */
  graceVoice(ch) {
    if (!ch.graceNotes.length) return "";
    let str = "";
    for (const g of ch.graceNotes) {
      if (g.jpAlter === "n" || g.jpAlter === "b" || g.jpAlter === "#") str += JpwWriter.alter(g);
      str += g.number;
      for (let i = 0; i < g.jpOctave; i++) str += "'";
      for (let i = 0; i < -g.jpOctave; i++) str += ",";
    }
    return `{${str}}`;
  }
  chordVoice(ch) {
    const nt = ch.notes[0];
    let str = JpwWriter.alter(nt);
    str += nt.number;
    if (!ch.rest) {
      for (let i = 0; i < nt.jpOctave; i++) str += "'";
      for (let i = 0; i < -nt.jpOctave; i++) str += ",";
    }
    if (ch.dot === 1 && ch.beats <= 1) str += ".";
    for (let i = 0; i < ch.beams; i++) str += "_";
    for (let i = 1; i < ch.beats; i++) str += "-";
    return str;
  }
  makeBarline(m) {
    if (m.repeatBackward) return ":|";
    switch (m.barline) {
      case BarStyle.NONE:
        return "[|]";
      case BarStyle.LIGHT_LIGHT:
        return "||";
      case BarStyle.LIGHT_HEAVY:
        return "|]";
      case BarStyle.HEAVY_LIGHT:
        throw new Error("unsupported heavy-light");
      case null:
      case BarStyle.DOTTED:
      case BarStyle.REGULAR:
        return "|";
      default:
        throw new Error("bad barline " + m.barline);
    }
  }
  makeVoiceData(part) {
    this.lines.push(".Voice");
    let l = "";
    part.measures.forEach((m, mid) => {
      if (mid > 0 && m.newSystem && l.length > 0) {
        l += m.newPage ? "$(true,0,0,true)" : "$(true)";
        this.lines.push(l);
        l = "";
      }
      if (m.repeatForward) {
        l += "|:";
        if (m.endingLeft) {
          l += "[";
          const nums = m.endingNum;
          if (nums.size === 1) l += [...nums][0];
          else throw new Error("multi-ending");
        }
      }
      const prevM = mid > 0 ? part.measures[mid - 1] : null;
      if (prevM && m.timeChange && (m.time.beats !== prevM.time.beats || m.time.beatType !== prevM.time.beatType)) {
        l += `${m.time.beats}/${m.time.beatType} `;
      }
      if (prevM && m.keyChange && m.key.fifths !== prevM.key.fifths) l += `"1=${m.key.name}" `;
      let hasBarline = false;
      m.entries.forEach((ch, idx) => {
        if (isLineBreak(ch)) {
          if (!hasBarline && idx === m.entries.length - 1) {
            l += this.makeBarline(m);
            hasBarline = true;
          }
          l += ch.newPage ? "$(true,0,0,true)" : "$(true)";
          this.lines.push(l);
          l = "";
        } else if (isChord(ch)) {
          const nt = ch.notes[0];
          if (nt.tieStart) l += "(";
          if (ch.slurStart) l += "(";
          if (nt.tupletBegin) l += "{(3}";
          l += this.makeNotations(ch);
          l += this.graceVoice(ch);
          l += this.chordVoice(ch);
          if (nt.tieEnd) l += ")";
          if (nt.tupletEnd) l += ")";
          l += ")".repeat(ch.slurEnds);
          l += " ";
        } else if (isBarline(ch)) {
          if (!ch.position.equals(0)) {
            const bl = this.makeBarline(m);
            const next = part.measures[mid + 1];
            if (next?.repeatForward) ;
            else {
              if (/[|\]]$/.test(l)) l += " ";
              l += bl;
            }
            hasBarline = true;
          }
        }
      });
      if (!hasBarline) {
        const bl = this.makeBarline(m);
        const next = part.measures[mid + 1];
        if (bl === "|" && next?.repeatForward) ;
        else {
          l += bl;
        }
      }
    });
    if (l.trim().length > 0) {
      l += "$(true,0,0,true)";
      this.lines.push(l);
    }
  }
  get code() {
    return this.lines.join("\n");
  }
}
function writeJpwabc(score) {
  const w = new JpwWriter();
  w.write(score);
  return w.code;
}
function emitJpwabc(doc, songIdx = 0) {
  const song = doc.songs[songIdx];
  if (!song) return null;
  const src = isXmlShaped(song) ? jpwInputOfDoc(song) : jpwInputOfSong(doc, songIdx);
  return src ? writeJpwabc(src) : null;
}
const SUFFIX_TO_LY = [
  [/^maj7$/i, "maj7"],
  [/^M7$/, "maj7"],
  [/^m7$/i, "m7"],
  [/^min7$/i, "m7"],
  [/^m7b5$/i, "m7.5-"],
  [/^dim7$/i, "dim7"],
  [/^dim$/i, "dim"],
  [/^aug$/i, "aug"],
  [/^sus4$/i, "sus4"],
  [/^sus2$/i, "sus2"],
  [/^maj9$/i, "maj9"],
  [/^m9$/i, "m9"],
  [/^m6$/i, "m6"],
  [/^6$/i, "6"],
  [/^9$/i, "9"],
  [/^m$/i, "m"],
  [/^min$/i, "m"],
  [/^7$/i, "7"],
  [/^5$/i, "5"],
  [/^add9$/i, "9"],
  [/^(\d+)$/, "$1"]
];
const LY_TO_SUFFIX = [
  [/^maj7$/, "maj7"],
  [/^m7\.5-$/, "m7b5"],
  [/^m7$/, "m7"],
  [/^m6$/, "m6"],
  [/^m9$/, "m9"],
  [/^dim7$/, "dim7"],
  [/^dim$/, "dim"],
  [/^aug$/, "aug"],
  [/^sus4$/, "sus4"],
  [/^sus2$/, "sus2"],
  [/^maj9$/, "maj9"],
  [/^m$/, "m"],
  [/^7$/, "7"],
  [/^6$/, "6"],
  [/^9$/, "9"],
  [/^5$/, "5"]
];
function lyPitchToText(ly) {
  const m = /^([a-g])(isis|eses|ses|is|es|ff|ss|s|f)?$/i.exec(ly.trim());
  if (!m) return null;
  const step = m[1].toUpperCase();
  const mod = (m[2] ?? "").toLowerCase();
  const alter = mod === "isis" ? "##" : mod === "eses" || mod === "ses" || mod === "ff" ? "bb" : mod === "is" ? "#" : mod === "es" || mod === "s" || mod === "f" ? "b" : "";
  return step + alter;
}
function textPitchToLy(text) {
  const m = /^([A-Ga-g])([#♯b♭]|##|bb)?$/.exec(text.trim());
  if (!m) return null;
  const step = m[1].toLowerCase();
  const acc = m[2] ?? "";
  const alter = acc === "#" || acc === "♯" ? "is" : acc === "##" ? "isis" : acc === "b" || acc === "♭" ? "es" : acc === "bb" ? "eses" : "";
  return step + alter;
}
function lySuffixToText(suffix) {
  const s = suffix.replace(/^:/, "");
  if (!s) return "";
  for (const [re, out] of LY_TO_SUFFIX) if (re.test(s)) return out;
  return s;
}
function textSuffixToLy(suffix) {
  const s = suffix.trim();
  if (!s) return "";
  for (const [re, out] of SUFFIX_TO_LY) if (re.test(s)) return ":" + out;
  return null;
}
function parseChordToken(tok) {
  const m = /^([a-g](?:isis|eses|is|es|s|f)?)(\d+(?:\.*)|)((?:\*\d+(?:\/\d+)?)?)((?::[^/]*)?)(?:\/([a-g](?:isis|eses|is|es|s|f)?))?$/i.exec(tok.trim());
  if (!m) return null;
  const dur = m[2] ?? "";
  let whole = null;
  if (dur) {
    const denom = Number(/(\d+)/.exec(dur)?.[1] ?? "0");
    if (denom) {
      const dots = (dur.match(/\./g) ?? []).length;
      whole = 1 / denom;
      let add = whole / 2;
      for (let i = 0; i < dots; i++) {
        whole += add;
        add /= 2;
      }
    }
  }
  const mult = m[3] ?? "";
  if (whole !== null && mult) {
    const mm = /^\*(\d+)(?:\/(\d+))?$/.exec(mult);
    if (mm) whole *= Number(mm[1]) / Number(mm[2] ?? "1");
  }
  return { pitch: m[1], whole, suffix: m[4] ?? "", bass: m[5] ?? null };
}
function wholeToDuration(whole) {
  let best = null;
  for (const denom of [1, 2, 4, 8, 16, 32, 64]) {
    let v = 1 / denom;
    let add = v;
    for (let dots = 0; dots < 4; dots++) {
      const text = String(denom) + ".".repeat(dots);
      const err = Math.abs(v - whole);
      if (err < 1e-9) return { text, exact: true };
      if (!best || err < best.err) best = { err, text };
      add /= 2;
      v += add;
    }
  }
  return { text: best ? best.text : "4", exact: false };
}
function harmonyToChordToken(text, whole) {
  const m = /^([A-Ga-g](?:[#♯b♭]|##|bb)?)(.*?)(?:\/([A-Ga-g](?:[#♯b♭]|##|bb)?))?$/.exec(text.trim());
  if (!m) return null;
  const pitch = textPitchToLy(m[1]);
  if (!pitch) return null;
  const suffix = textSuffixToLy(m[2] ?? "");
  if (suffix === null) return null;
  const bass = m[3] ? textPitchToLy(m[3]) : null;
  return pitch + durationText(whole) + suffix + (bass ? "/" + bass : "");
}
function durationText(whole) {
  const exact = wholeToDuration(whole);
  if (exact.exact) return exact.text;
  for (const base of [1, 2, 4, 8, 16, 32, 64]) {
    for (let dots = 0; dots < 4; dots++) {
      const v = 1 / base + 1 / base * (1 - 2 ** -dots);
      const k = whole / v;
      if (Math.abs(k - Math.round(k)) < 1e-6 && Math.round(k) >= 2 && Math.round(k) <= 64) {
        return String(base) + ".".repeat(dots) + "*" + Math.round(k);
      }
    }
  }
  return exact.text;
}
const BEAM_LETTER = ["", "q", "s", "d", "h"];
const MEASURES_PER_LINE = 4;
const MAJOR_BY_FIFTHS = {
  [-7]: "Cb",
  [-6]: "Gb",
  [-5]: "Db",
  [-4]: "Ab",
  [-3]: "Eb",
  [-2]: "Bb",
  [-1]: "F",
  0: "C",
  1: "G",
  2: "D",
  3: "A",
  4: "E",
  5: "B",
  6: "F#",
  7: "C#"
};
const alterOf = (jpAlter) => (jpAlter || "").trim();
const octaveMarks = (jpOctave) => jpOctave > 0 ? "'".repeat(jpOctave) : ",".repeat(-jpOctave);
const pitchOf = (n) => alterOf(n.jpAlter) + n.number + octaveMarks(n.jpOctave);
const noteOf = (n, letter, dots) => letter + pitchOf(n) + dots;
const isRestToken = (c) => c.rest || c.notes.length === 0;
function chordBody(c, letter, dots) {
  if (isRestToken(c)) return letter + "0" + dots;
  if (c.notes.length === 1) return noteOf(c.notes[0], letter, dots);
  const inner = c.notes.map((n) => alterOf(n.jpAlter) + n.number + octaveMarks(n.jpOctave)).join("");
  return "," + inner + dots;
}
function sustainOf(c) {
  const n = Math.max(0, (c.beats || 1) - 1);
  return n ? " " + Array(n).fill("-").join(" ") : "";
}
function ornamentsBefore(c, tupletSize, warnings) {
  let out = "";
  if (c.notes.some((n) => n.tupletBegin)) {
    const grp = c.notes.find((n2) => n2.tuplet)?.tuplet;
    const n = grp ? tupletSize.get(grp) ?? 0 : 0;
    if (n >= 2) out += n + "[ ";
    else {
      warnings.add("有连音组数不出音数（按三连音写出）");
      out += "3[ ";
    }
  }
  if (c.graceNotes.length) {
    const letter = (dur) => dur === 16 ? "s" : dur === 32 ? "d" : dur === 64 ? "h" : "";
    out += "g[" + c.graceNotes.map((g) => letter(g.duration) + alterOf(g.jpAlter) + g.number + octaveMarks(g.jpOctave)).join("") + "] ";
  }
  return out;
}
const BARE_DIRECTION = /^(Fine|D\.?C\.?|Segno|ToCoda|D\.?S\.?)$/i;
const JUMP_OUT = {
  fine: "Fine",
  dc: "DC",
  "d.c.": "DC",
  ds: "DS",
  "d.s.": "DS",
  segno: "Segno",
  tocoda: "ToCoda"
};
const DYNAMIC_NAME = new Map(Object.entries(DYNAMICS).map(([k, v]) => [v, k]));
function ornamentsAfter(c, plan, warnings) {
  let out = plan.slurClose.get(c) ?? "";
  out += plan.slurOpen.get(c) ?? "";
  if (c.notes.some((n) => n.tupletEnd)) out += " ]";
  if (c.fermata) out += " \\fermata";
  const said = /* @__PURE__ */ new Set();
  if (c.sectionWord && c.sectionWord.trim()) {
    said.add(c.sectionWord.trim());
    out += ' ^"' + c.sectionWord.trim().replace(/"/g, "'") + '"';
  }
  const arts = [];
  for (const a of c.articulations) {
    const name = a.trim();
    if (!name) continue;
    if (name in DYNAMICS) {
      out += " \\" + name;
      continue;
    }
    arts.push(name);
  }
  if (arts.length) warnings.add("演奏法记号尚未导出：" + arts.join(" "));
  for (const d of c.directions) {
    const text = d.text.trim();
    if (!text) continue;
    if (said.has(text)) continue;
    if (d.music) {
      const name = DYNAMIC_NAME.get(text);
      if (name) {
        out += " \\" + name;
        continue;
      }
      if (text === GlyphCodes.segno) {
        out += " Segno";
        continue;
      }
      if (text === GlyphCodes.coda) {
        out += " ToCoda";
        continue;
      }
      warnings.add("有一种字形记号写不出（既不是力度，也不是 segno / coda）");
      continue;
    }
    out += BARE_DIRECTION.test(text) ? " " + (JUMP_OUT[text.toLowerCase()] ?? text) : ' ^"' + text.replace(/"/g, "'") + '"';
  }
  return out;
}
const HEADER_TYPES = /* @__PURE__ */ new Set(["subtitle", "composer", "poet", "arranger", "copyright", "opus"]);
function headerLines(score, first) {
  const out = [];
  if (score.title) out.push("title=" + score.title.replace(/\n/g, " "));
  const seen = /* @__PURE__ */ new Set();
  for (const cr of score.credit) {
    const type = (cr.type || "").toLowerCase();
    if (!HEADER_TYPES.has(type) || !cr.text || seen.has(type)) continue;
    seen.add(type);
    out.push(type + "=" + cr.text.replace(/\n/g, " "));
  }
  const key = first ? MAJOR_BY_FIFTHS[first.key.fifths] : void 0;
  if (key) out.push("1=" + key);
  if (first) out.push(first.time.beats + "/" + first.time.beatType);
  return out;
}
const isHan = (text) => /[\u3400-\u9fff\uf900-\ufaff]/.test(text);
const LYRIC_HOLD = '""';
const latinQuote = (text) => '"' + text.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
const HAN = /[\u3400-\u9fff\uf900-\ufaff]/;
const OPEN_QUOTE = /[\u2018\u201c\u300a]/;
function hanziGlue(text) {
  let out = "";
  for (const c of text) {
    const prev = out.slice(-1);
    if (prev && HAN.test(prev) && (HAN.test(c) || OPEN_QUOTE.test(c))) out += "_";
    out += c;
  }
  return out;
}
function samePitch(a, b) {
  const x = a.notes[0], y = b.notes[0];
  if (!x || !y || isRestToken(a) || isRestToken(b)) return false;
  return x.number === y.number && x.jpOctave === y.jpOctave && (y.jpAlter.trim() === "" || y.jpAlter === x.jpAlter);
}
function planJly(measures, warnings) {
  const order = [];
  const index = /* @__PURE__ */ new Map();
  for (const m of measures) for (const e of m.entries) {
    if (e.kind !== "chord") continue;
    const c = e;
    index.set(c, order.length);
    order.push(c);
  }
  const at = /* @__PURE__ */ new Map();
  const verses = [];
  for (const c of order) {
    for (const n of c.notes) for (const ly of n.lyrics) {
      if (!ly.text) continue;
      if (isRestToken(c)) {
        warnings.add("有歌词挂在休止符上：jianpu-ly 那边休止不占歌词位，这个字已略过");
        continue;
      }
      let per = at.get(c);
      if (!per) {
        per = /* @__PURE__ */ new Map();
        at.set(c, per);
      }
      const list = per.get(ly.number) ?? [];
      if (!list.includes(ly.text)) list.push(ly.text);
      per.set(ly.number, list);
      if (!verses.includes(ly.number)) verses.push(ly.number);
    }
  }
  const has = (c, v) => (at.get(c)?.get(v)?.length ?? 0) > 0;
  const groups = [];
  const tieAfter = /* @__PURE__ */ new Set();
  order.forEach((c, i) => {
    if (!c.slurStart) return;
    const j = c.slurEndChord ? index.get(c.slurEndChord) : void 0;
    if (j === void 0 || j < i) {
      warnings.add("有配不上对的圆滑线（少了收尾），已略过");
      return;
    }
    const melisma = verses.every((v) => {
      const hits = order.slice(i, j + 1).filter((x) => has(x, v));
      return hits.length <= 1 && (hits.length === 0 || hits[0] === c);
    });
    if (melisma && j === i + 1 && samePitch(c, order[j])) {
      tieAfter.add(c);
      return;
    }
    groups.push({ start: i, end: j, melisma });
  });
  const slurOpen = /* @__PURE__ */ new Map();
  const slurClose = /* @__PURE__ */ new Map();
  const closing = /* @__PURE__ */ new Map();
  for (const g of groups) {
    slurOpen.set(order[g.start], g.melisma ? " (" : " \\(");
    const list = closing.get(g.end) ?? [];
    list.push(g);
    closing.set(g.end, list);
  }
  for (const [end, list] of closing) {
    list.sort((a, b) => b.start - a.start);
    slurClose.set(order[end], list.map((g) => g.melisma ? " )" : " \\)").join(""));
  }
  const swallowed = /* @__PURE__ */ new Set();
  for (const g of groups) if (g.melisma) for (let i = g.start + 1; i <= g.end; i++) swallowed.add(order[i]);
  for (const c of tieAfter) swallowed.add(order[index.get(c) + 1]);
  const slots = order.filter((c) => !isRestToken(c) && !swallowed.has(c));
  return { slurOpen, slurClose, tieAfter, slots, verses, at };
}
function chordLine(measures, warnings) {
  const chords2 = [];
  for (const m of measures) for (const e of m.entries) {
    if (e.kind !== "chord") continue;
    const c = e;
    if (!c.harmony || isRestToken(c)) continue;
    chords2.push({ text: c.harmony, position: m.position.plus(c.position), duration: c.duration ?? new Fraction(1, 4) });
  }
  if (!chords2.length) return null;
  let end = chords2[chords2.length - 1].position.plus(chords2[chords2.length - 1].duration);
  for (const m of measures) for (const e of m.entries) {
    if (e.kind !== "chord") continue;
    const stop = m.position.plus(e.position).plus(e.duration ?? new Fraction(0));
    if (stop.toFloat() > end.toFloat()) end = stop;
  }
  const toks = [];
  chords2.forEach((c, i) => {
    const next = chords2[i + 1]?.position ?? end;
    const whole = Math.max(1 / 64, next.minus(c.position).toFloat() / 4);
    const tok = harmonyToChordToken(c.text, whole);
    if (tok) {
      toks.push(tok);
      if (!wholeToDuration(whole).exact && !/\*/.test(tok)) warnings.add("和弦时值不是规整时值，已按最接近的写出（" + c.text + "）");
    } else {
      warnings.add("和弦符号写不出（上游用 LilyPond 和弦语法，认不出的后缀没法写）：" + c.text);
    }
  });
  return toks.length ? "chords=" + toks.join(" ") : null;
}
function endingMarks(measures, warnings) {
  const before = /* @__PURE__ */ new Map();
  const after = /* @__PURE__ */ new Map();
  const plain = { before, after };
  const fwd = measures.map((m, i) => [m, i]).filter(([m]) => m.repeatForward).map(([, i]) => i);
  const back = measures.map((m, i) => [m, i]).filter(([m]) => m.repeatBackward).map(([, i]) => i);
  const ends = measures.flatMap((m, i) => [...m.endingNum ?? []].map((n) => ({ i, n })));
  const alt = ends.filter((e) => e.n === 2).map((e) => e.i);
  if (fwd.length !== 1 || back.length !== 1 || alt.length === 0 || ends.some((e) => e.n !== 2)) {
    if (fwd.length || back.length || ends.length) {
      warnings.add("反复跳跃的写法不是上游能表达的那一种（一次反复 + 一段第二房），已退化成普通小节线");
    }
    return plain;
  }
  const add = (map, i, word) => {
    map.set(i, (map.get(i) ?? "") + word);
  };
  add(before, fwd[0], "R{");
  add(after, back[0], "}");
  add(before, alt[0], "A{");
  add(after, alt[alt.length - 1], "}");
  return { before, after };
}
function lyricLines(plan, warnings) {
  const out = [];
  const numbered = plan.verses.length > 1;
  for (const v of plan.verses) {
    const latin = [];
    const han = [];
    let lastLatin = -1;
    let lastHan = -1;
    plan.slots.forEach((c, i) => {
      const texts = plan.at.get(c)?.get(v) ?? [];
      const l = texts.filter((t2) => !isHan(t2));
      const h = texts.filter((t2) => isHan(t2));
      if (l.length && h.length) {
        warnings.add("同一段歌词里拉丁与汉字混排：已拆成 `L:` 与 `H:` 两行（上游没有混排写法）");
      }
      latin.push(l.length ? latinQuote(l.join(" ")) : LYRIC_HOLD);
      han.push(h.length ? h.map(hanziGlue).join("_") : LYRIC_HOLD);
      if (l.length) lastLatin = i;
      if (h.length) lastHan = i;
    });
    const already = (arr) => {
      const first = arr.find((t2) => t2 !== "");
      return !!first && (first.startsWith(v + ". ") || first.startsWith(v + "."));
    };
    const label = (arr) => numbered && !already(arr) ? v + ". " : "";
    if (lastLatin >= 0) out.push("L: " + label(latin) + latin.slice(0, lastLatin + 1).join(" "));
    if (lastHan >= 0) out.push("H: " + label(han) + han.slice(0, lastHan + 1).join(" "));
  }
  if (out.some((l) => l.startsWith("L:"))) {
    warnings.add("拉丁歌词的连字符（`syl- la- bles`）尚未导出，按空格分音节写出");
  }
  return out;
}
function emitJlyOfScore(score, warnings = /* @__PURE__ */ new Set()) {
  const measures = score.parts[0]?.measures ?? [];
  const lines = headerLines(score, measures[0] ?? null);
  const chordRow = chordLine(measures, warnings);
  if (chordRow) lines.push(chordRow);
  const plan = planJly(measures, warnings);
  let tokens = [];
  const flush = () => {
    if (tokens.length) {
      lines.push(tokens.join(" "));
      tokens = [];
    }
  };
  let sinceBreak = 0;
  let pendingBreakWord = null;
  const marks = endingMarks(measures, warnings);
  const chordOrder = [];
  for (const m of measures) for (const e of m.entries) if (e.kind === "chord") chordOrder.push(e);
  const posOfNote = /* @__PURE__ */ new Map();
  chordOrder.forEach((c, i) => c.notes.forEach((n) => posOfNote.set(n, i)));
  const tupletSize = /* @__PURE__ */ new Map();
  for (const c of chordOrder) for (const n of c.notes) {
    const t2 = n.tuplet;
    if (!t2) continue;
    const a = posOfNote.get(t2.first);
    const b = posOfNote.get(t2.last);
    if (a !== void 0 && b !== void 0 && b >= a) tupletSize.set(t2, b - a + 1);
  }
  for (let mIdx = 0; mIdx < measures.length; mIdx++) {
    const m = measures[mIdx];
    if (marks.before.has(mIdx)) {
      flush();
      tokens.push(marks.before.get(mIdx));
    }
    if (m.timeChange) {
      flush();
      lines.push(m.time.beats + "/" + m.time.beatType);
      sinceBreak = 0;
    }
    if (m.keyChange) {
      const tonic = MAJOR_BY_FIFTHS[m.key.fifths];
      if (tonic) {
        flush();
        lines.push("1=" + tonic);
        sinceBreak = 0;
      }
    }
    if (m.repeatForward && !marks.before.has(mIdx)) {
      flush();
      tokens.push('\\bar ".|:"');
    }
    for (const e of m.entries) {
      if (e.kind === "chord") {
        const c = e;
        if (c.beams >= BEAM_LETTER.length) warnings.add("有超过 4 条减时线（64 分）的时值，已按 64 分写出");
        const dots = ".".repeat(c.dot || 0);
        tokens.push(ornamentsBefore(c, tupletSize, warnings) + chordBody(c, BEAM_LETTER[c.beams] ?? "", dots) + sustainOf(c) + ornamentsAfter(c, plan, warnings));
        if (plan.tieAfter.has(c)) tokens.push("~");
      } else if (e.kind === "break") {
        const brk = e.newPage ? "\\pageBreak" : "\\break";
        const atEnd = !m.entries.slice(m.entries.indexOf(e) + 1).some((x) => x.kind === "chord");
        if (atEnd) pendingBreakWord = brk;
        else {
          tokens.push(brk);
          flush();
          sinceBreak = 0;
        }
      }
    }
    if (m.endingNum && m.endingNum.size) {
      if (m.endingNum && [...m.endingNum].some((n) => n > 2)) warnings.add("反复跳跃有第 3 房及以后：上游只能表达两房（`R{ } A{ }`）");
    }
    tokens.push(m.repeatBackward && !marks.after.has(mIdx) ? '\\bar ":|."' : "|");
    if (pendingBreakWord) {
      tokens.push(pendingBreakWord);
      flush();
      sinceBreak = 0;
      pendingBreakWord = null;
    }
    if (marks.after.has(mIdx)) tokens.push(marks.after.get(mIdx));
    if (++sinceBreak >= MEASURES_PER_LINE) {
      flush();
      sinceBreak = 0;
    }
  }
  flush();
  const lyrics = lyricLines(plan, warnings);
  if (lyrics.length) lines.push(...lyrics);
  const notes = [...warnings].map((w) => "% " + w);
  return [...notes, ...lines].filter((l) => l.trim() !== "").join("\n") + "\n";
}
function emitJly(doc) {
  const warnings = /* @__PURE__ */ new Set();
  const score = jianpuInputOfDoc(doc) ?? jianpuInputOfJpw(doc);
  if (!score) throw new Error("noLines");
  if (score.parts.length > 1) {
    warnings.add("多声部：jianpu-ly 导出只写第一声部（共 " + score.parts.length + " 个）");
  }
  if (doc.songs.length > 1) {
    warnings.add("多曲：jianpu-ly 导出只写第一首（共 " + doc.songs.length + " 首）");
  }
  const extraVoice = doc.songs.some((s) => s.parts.some((p) => p.measures.some((m) => m.elements.some((e) => e.voice > 1))));
  if (extraVoice) {
    warnings.add("多声部：投影只取第 1 声部，第 2 及以后的声部不会出现在导出的文本里");
  }
  return { text: emitJlyOfScore(score, warnings), warnings: [...warnings] };
}
const NOTE_COMMANDS = /* @__PURE__ */ new Set([
  "zkh",
  "ykh",
  // 伴奏括弧
  "ppp",
  "pp",
  "p",
  "mp",
  "mf",
  "f",
  "ff",
  "fff",
  "sf",
  "fp",
  "sfp",
  "sfz",
  // 力度
  "cresc",
  "dim",
  "rit",
  "tempo",
  "atempo",
  // 术语
  "yc",
  "ycy",
  "bc",
  "zy",
  "dy",
  "hx",
  // 延长/保持/重音/顿音/呼吸
  "shy",
  "xhy",
  "sby",
  "xby",
  "cy",
  "tr"
  // 滑音/波音/颤音
]);
const BARLINE_COMMANDS = /* @__PURE__ */ new Set(["fine", "dc", "ds", "ty", "hs", "sbf"]);
const ALL_COMMANDS = [...NOTE_COMMANDS, ...BARLINE_COMMANDS].sort((a, b) => b.length - a.length);
function span(ctx, column, length = 1) {
  return { line: ctx.line, column, offset: ctx.lineOffset + column, length };
}
function report(ctx, code, message, column, length = 1) {
  ctx.diagnostics.push({ severity: "warning", code, message, source: span(ctx, column, length) });
}
function applyModifier(ctx, note, ch) {
  const d = ctx.dialect;
  const acc = d.accidentals[ch];
  if (ch === d.octaveUp) note.octave += 1;
  else if (ch === d.octaveDown) note.octave -= 1;
  else if (ch === "/") note.duration *= 2;
  else if (ch === ".") note.dots += 1;
  else if (acc !== void 0) note.accidental = acc;
  else return false;
  note.code += ch;
  note.source.length += ch.length;
  return true;
}
function scanNote(ctx, src, start, baseDuration = 4) {
  const d = ctx.dialect;
  const head = src[start] ?? "0";
  let cursor = start + 1;
  let pitch;
  let sound;
  let hidden = false;
  let lyricAnchor = true;
  if (head === d.rhythmToken && !/[0-9]/.test(head)) {
    pitch = 9;
    sound = "rhythm";
  } else if (head === "9") {
    if (d.nineIsRhythm) {
      pitch = 9;
      sound = "rhythm";
    } else {
      pitch = 0;
      sound = "rest";
      hidden = true;
      lyricAnchor = false;
    }
  } else if (head === "8") {
    pitch = 0;
    sound = "rest";
    hidden = true;
  } else {
    pitch = Number(head);
    sound = pitch === 0 ? "rest" : "note";
    if (pitch === 0) lyricAnchor = false;
  }
  const note = {
    kind: "note",
    pitch,
    sound,
    hidden,
    lyricAnchor,
    octave: 0,
    duration: baseDuration,
    dots: 0,
    ornaments: [],
    graceBefore: [],
    graceAfter: [],
    code: head,
    source: span(ctx, start, 1)
  };
  while (cursor < src.length && applyModifier(ctx, note, src[cursor])) cursor += 1;
  return { note, next: cursor };
}
function scanGraceNotes(ctx, body, columnBase) {
  const out = [];
  const sub = { ...ctx, lineOffset: ctx.lineOffset + columnBase };
  let cursor = 0;
  while (cursor < body.length) {
    const ch = body[cursor];
    if (/[0-9]/.test(ch) || ch === ctx.dialect.rhythmToken) {
      const r = scanNote(sub, body, cursor, 8);
      r.note.source.column += columnBase;
      out.push(r.note);
      cursor = r.next;
      continue;
    }
    if (!/\s/.test(ch)) {
      report(ctx, "unsupported-grace-token", t("diag.pu.graceChar", { ch }), columnBase + cursor);
    }
    cursor += 1;
  }
  return out;
}
function parseMeter(raw, parenthesized = false) {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(raw);
  if (!m) return void 0;
  const numerator = Number(m[1]);
  const denominator = Number(m[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return void 0;
  }
  return { numerator, denominator, parenthesized };
}
function interpretQuoted(ctx, body, columnBase) {
  const hx = /^hx:\s*/i.exec(body);
  if (hx) return { chord: body.slice(hx[0].length) };
  const meter = /^p:\s*/i.exec(body);
  if (meter) {
    const parsed = parseMeter(body.slice(meter[0].length));
    if (parsed) return { meter: parsed };
    report(ctx, "bad-temporary-meter", t("diag.pu.tempMeter", { body }), columnBase, body.length);
    return { annotation: body };
  }
  const grace = /^(h?yy):\s*/i.exec(body);
  if (grace) {
    const notes = scanGraceNotes(ctx, body.slice(grace[0].length), columnBase + grace[0].length);
    return grace[1].toLowerCase() === "yy" ? { graceBefore: notes } : { graceAfter: notes };
  }
  return { annotation: body };
}
function applyQuoted(target, q, source) {
  if (q.meter !== void 0 && target.kind === "barline") target.temporaryMeter = q.meter;
  if (q.annotation !== void 0) {
    target.annotation = q.annotation;
    if (target.kind !== "barline") target.annotationSource = source;
  }
  if (q.chord !== void 0 && (target.kind === "note" || target.kind === "sustain")) {
    target.chord = q.chord;
    target.chordSource = source;
  }
  if (target.kind !== "note") return;
  if (q.graceBefore) target.graceBefore.push(...q.graceBefore);
  if (q.graceAfter) target.graceAfter.push(...q.graceAfter);
}
function makeMark(open, end, ctx, toNext = false) {
  const mark = {
    type: open.type,
    start: open.start,
    end,
    level: open.level,
    source: span(ctx, open.column)
  };
  if (open.caption !== void 0) mark.caption = open.caption;
  if (open.openEnd) mark.openEnd = true;
  if (open.fromPrevious) mark.continuationFromPrevious = true;
  if (toNext) mark.continuationToNext = true;
  return mark;
}
function lastAttachable(elements) {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i];
    if (el.kind === "note" || el.kind === "sustain" || el.kind === "barline") return el;
  }
  return void 0;
}
function readQuotedRun(src, index) {
  if (src[index] !== '"') return void 0;
  const end = src.indexOf('"', index + 1);
  if (end < 0) return void 0;
  return { body: src.slice(index + 1, end), next: end + 1 };
}
function countPluses(src, index) {
  let n = index;
  while (src[n] === "+") n += 1;
  return { level: n - index, next: n };
}
function parseMusicLine(ctx, src, startColumn, carriedCurves = [], carriedVoltas = []) {
  const d = ctx.dialect;
  const elements = [];
  const marks = [];
  const curves = carriedCurves.map((m) => ({ ...m, start: 0, fromPrevious: true }));
  const voltas = carriedVoltas.map((m) => ({ ...m, start: 0, fromPrevious: true }));
  const wedges = [];
  let i = startColumn;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9]/.test(ch) || ch === d.rhythmToken) {
      const r = scanNote(ctx, src, i);
      elements.push(r.note);
      i = r.next;
      continue;
    }
    if (ch === "-") {
      elements.push({
        kind: "sustain",
        duration: 4,
        lyricAnchor: false,
        ornaments: [],
        code: "-",
        source: span(ctx, i)
      });
      i += 1;
      continue;
    }
    if (ch === "@") {
      const prev2 = elements[elements.length - 1];
      if (prev2?.kind === "note" || prev2?.kind === "sustain") {
        prev2.lyricAnchor = true;
        prev2.code += "@";
        prev2.source.length += 1;
      } else {
        report(ctx, "orphan-lyric-anchor", t("diag.pu.orphanAnchor"), i);
      }
      i += 1;
      continue;
    }
    if (ch === "~" || ch === "^") {
      elements.push({
        kind: "beat-boundary",
        behavior: ch === "~" ? "join" : "split",
        code: ch,
        source: span(ctx, i)
      });
      i += 1;
      continue;
    }
    if (ch === "|" || ch === ":") {
      const found = d.barlines.find(([code]) => src.startsWith(code, i));
      if (found) {
        const [code, type] = found;
        const bar = {
          kind: "barline",
          type,
          ornaments: [],
          code,
          source: span(ctx, i, code.length)
        };
        elements.push(bar);
        i += code.length;
        continue;
      }
      report(ctx, "bad-barline", t("diag.pu.badBarline", { ch }), i);
      i += 1;
      continue;
    }
    if (ch === "(") {
      const isTuplet = src[i + 1] === "y";
      curves.push({
        type: isTuplet ? "tuplet" : "slur",
        start: elements.length,
        level: curves.length + 1,
        column: i
      });
      i += isTuplet ? 2 : 1;
      continue;
    }
    if (ch === ")") {
      const open = curves.shift();
      if (open === void 0) {
        report(ctx, "unmatched-slur-end", t("diag.pu.extraParen"), i);
      } else {
        open.level = 1;
        const mk = makeMark(open, Math.max(0, elements.length - 1), ctx);
        mk.closeSource = span(ctx, i);
        marks.push(mk);
      }
      i += 1;
      continue;
    }
    if (ch === "<" || ch === ">") {
      const { level, next } = countPluses(src, i + 1);
      wedges.push({
        type: ch === "<" ? "crescendo" : "decrescendo",
        start: Math.max(0, elements.length - 1),
        level,
        column: i
      });
      i = next;
      continue;
    }
    if (ch === "!") {
      const open = wedges.pop();
      if (open === void 0) report(ctx, "unmatched-wedge-end", t("diag.pu.extraBang"), i);
      else marks.push(makeMark(open, Math.max(0, elements.length - 1), ctx));
      i += 1;
      continue;
    }
    if (ch === "[") {
      const prevEl = elements[elements.length - 1];
      const adjacent = prevEl?.kind === "note" && prevEl.source.column + prevEl.source.length === i;
      if (adjacent) {
        const end = src.indexOf("]", i + 1);
        if (end < 0) {
          report(ctx, "unterminated-grace", t("diag.pu.graceOpen"), i);
          i += 1;
          continue;
        }
        let body = src.slice(i + 1, end);
        let after = false;
        if (/^h/i.test(body)) {
          after = true;
          body = body.slice(1);
        }
        const notes = scanGraceNotes(ctx, body, i + 1 + (after ? 1 : 0));
        if (after) prevEl.graceAfter.push(...notes);
        else prevEl.graceBefore.push(...notes);
        prevEl.code += src.slice(i, end + 1);
        prevEl.source.length += end + 1 - i;
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const { level, next } = countPluses(src, i + 1);
      let cursor = next;
      let caption;
      const quoted2 = readQuotedRun(src, cursor);
      if (quoted2) {
        caption = quoted2.body;
        cursor = quoted2.next;
      }
      let openEnd = false;
      if (src[cursor] === "/") {
        openEnd = true;
        cursor += 1;
      }
      const open = { type: "volta", start: elements.length, level, column: i };
      if (caption !== void 0) open.caption = caption;
      if (openEnd) open.openEnd = true;
      voltas.push(open);
      i = cursor;
      continue;
    }
    if (ch === "]") {
      let cursor = i + 1;
      let openEnd = false;
      if (src[cursor] === "/") {
        openEnd = true;
        cursor += 1;
      }
      const open = voltas.pop();
      if (open === void 0) {
        report(ctx, "unmatched-volta-end", t("diag.pu.extraBracket"), i);
      } else {
        if (openEnd) open.openEnd = true;
        marks.push(makeMark(open, Math.max(0, elements.length - 1), ctx));
      }
      i = cursor;
      continue;
    }
    if (ch === "&") {
      const bare = /^&(\++)?(?=["\s]|$|[0-9])/.exec(src.slice(i));
      if (bare) {
        const lvl = bare[1]?.length ?? 0;
        const host = lastAttachable(elements);
        const lastOrn = host?.ornaments[host.ornaments.length - 1];
        if (lvl > 0 && lastOrn) lastOrn.level += lvl;
        i += bare[0].length;
        continue;
      }
      const tail = src.slice(i + 1);
      let known = "";
      for (const cand of ALL_COMMANDS) {
        if (cand.length > known.length && tail.toLowerCase().startsWith(cand)) known = cand;
      }
      const m = known ? { 0: "&" + tail.slice(0, known.length) } : /^&(?:a\s+tempo|[A-Za-z]+)/.exec(src.slice(i));
      if (!m) {
        i += 1;
        continue;
      }
      const rawName = m[0].slice(1);
      const name = rawName.replace(/\s+/g, "").toLowerCase();
      const { level, next } = countPluses(src, i + m[0].length);
      const target = lastAttachable(elements);
      const orn = { name, level, source: span(ctx, i, next - i) };
      if (target === void 0) {
        report(ctx, "orphan-command", t("diag.pu.orphanCommand", { name: rawName }), i, next - i);
      } else {
        if (!NOTE_COMMANDS.has(name) && !BARLINE_COMMANDS.has(name)) {
          report(ctx, "unknown-command", t("diag.pu.unknownCommand", { name: rawName }), i, next - i);
        }
        target.ornaments.push(orn);
      }
      i = next;
      continue;
    }
    if (ch === '"') {
      const quoted2 = readQuotedRun(src, i);
      if (!quoted2) {
        report(ctx, "unterminated-quote", t("diag.pu.quoteOpen"), i);
        i = src.length;
        continue;
      }
      const meaning = interpretQuoted(ctx, quoted2.body, i + 1);
      const target = lastAttachable(elements);
      if (target === void 0) {
        report(ctx, "orphan-annotation", t("diag.pu.orphanAnnotation", { body: quoted2.body }), i);
      } else {
        applyQuoted(target, meaning, span(ctx, i, quoted2.next - i));
      }
      i = quoted2.next;
      continue;
    }
    if (ch === "{") {
      const end = src.indexOf("}", i + 1);
      if (end < 0) {
        report(ctx, "unterminated-layer", t("diag.pu.layerOpen"), i);
        i = src.length;
        continue;
      }
      const inner = src.slice(i + 1, end);
      const roleMatch = /^\s*(bz|dsb)/i.exec(inner);
      const role = roleMatch && roleMatch[1].toLowerCase() === "dsb" ? "voice" : "accompaniment";
      const bodyStart = roleMatch ? roleMatch[0].length : 0;
      const sub = parseMusicLine(ctx, src.slice(0, end), i + 1 + bodyStart);
      elements.push({
        kind: "inline-layer",
        role,
        elements: sub.elements,
        marks: sub.marks,
        code: src.slice(i, end + 1),
        source: span(ctx, i, end + 1 - i)
      });
      i = end + 1;
      continue;
    }
    if (/[A-G]/.test(ch)) {
      const chord = /^[A-G][#b]?(?:maj|min|sus|dim|aug|add|m|M)?\d*(?:\/[A-G][#b]?)?/.exec(
        src.slice(i)
      );
      const host = lastAttachable(elements);
      if (chord && host?.kind === "note") {
        host.chord = chord[0];
        host.chordSource = span(ctx, i, chord[0].length);
        i += chord[0].length;
        continue;
      }
    }
    let back = elements.length - 1;
    while (back >= 0 && elements[back].kind === "beat-boundary") back -= 1;
    const prev = back >= 0 ? elements[back] : void 0;
    if (prev?.kind === "note" && applyModifier(ctx, prev, ch)) {
      i += 1;
      continue;
    }
    report(ctx, "unexpected-char", t("diag.pu.badChar", { ch }), i);
    i += 1;
  }
  const lastIndex = Math.max(0, elements.length - 1);
  for (const open of curves) {
    const mark = makeMark(open, lastIndex, ctx, true);
    marks.push(mark);
    (open.pending ??= []).push({ list: marks, mark });
  }
  for (const open of voltas) marks.push(makeMark(open, lastIndex, ctx, true));
  for (const open of wedges) {
    report(ctx, "unclosed-wedge", t("diag.pu.wedgeOpen"), open.column);
    marks.push(makeMark(open, lastIndex, ctx));
  }
  return { elements, marks, carriedCurves: curves, carriedVoltas: voltas };
}
const LYRIC_PUNCTUATION = PU_LYRIC_PUNCTUATION;
const LYRIC_QUOTES = PU_LYRIC_QUOTES;
function isCjk(ch) {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 13312 && c <= 40959 || // CJK 统一表意
  c >= 63744 && c <= 64255 || // 兼容表意
  c >= 12352 && c <= 12543;
}
function parseLyricBody(ctx, src, startColumn) {
  const d = ctx.dialect;
  const out = [];
  const skipChars = new Set(d.lyricSkip);
  const wordSeparator = d.wordSeparator;
  const pushSyllable = (text, column, length) => {
    out.push({ text, source: span(ctx, column, length) });
  };
  let i = startColumn;
  while (i < src.length) {
    const ch = src[i];
    if (skipChars.has(ch)) {
      pushSyllable("", i, 1);
      i += 1;
      continue;
    }
    if (ch === wordSeparator) {
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if ("-0^|*".includes(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(" || ch === "（") {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j += 1;
      const cp2 = src.codePointAt(j);
      if (cp2 === void 0) {
        i += 1;
        continue;
      }
      const len = cp2 > 65535 ? 2 : 1;
      pushSyllable(ch + src.slice(j, j + len), i, j + len - i);
      i = j + len;
      continue;
    }
    if (ch === ")" || ch === "）") {
      const prev = out[out.length - 1];
      if (prev) {
        prev.trailingPunctuation = (prev.trailingPunctuation ?? "") + ch;
        prev.source.length += 1;
      }
      i += 1;
      continue;
    }
    if (ch === "<") {
      const end = src.indexOf(">", i + 1);
      if (end < 0) {
        report(ctx, "unterminated-lyric-annotation", t("diag.pu.lyricNoteOpen"), i);
        i += 1;
        continue;
      }
      i = end + 1;
      continue;
    }
    if (ch === "}") {
      i += 1;
      continue;
    }
    if (ch === "{") {
      const end = src.indexOf("}", i + 1);
      if (end < 0) {
        report(ctx, "unterminated-lyric-group", t("diag.pu.lyricGroupOpen"), i);
        i += 1;
        continue;
      }
      pushSyllable(src.slice(i + 1, end), i, end + 1 - i);
      i = end + 1;
      continue;
    }
    if (LYRIC_PUNCTUATION.includes(ch)) {
      const prev = out[out.length - 1];
      if (prev) {
        prev.trailingPunctuation = (prev.trailingPunctuation ?? "") + ch;
        prev.source.length += 1;
      } else {
        pushSyllable(ch, i, 1);
      }
      i += 1;
      continue;
    }
    if (LYRIC_QUOTES.includes(ch)) {
      const isOpen = ch === "“" || ch === "‘";
      if (isOpen) {
        const start = i;
        i += 1;
        while (i < src.length && /\s/.test(src[i])) i += 1;
        if (i < src.length) {
          const next = src[i];
          pushSyllable(ch + next, start, i + 1 - start);
          i += 1;
        }
      } else {
        const prev = out[out.length - 1];
        if (prev) {
          prev.trailingPunctuation = (prev.trailingPunctuation ?? "") + ch;
          prev.source.length += 1;
        }
        i += 1;
      }
      continue;
    }
    if (/[A-Za-z']/.test(ch)) {
      let end = i;
      while (end < src.length && /[A-Za-z']/.test(src[end])) end += 1;
      pushSyllable(src.slice(i, end), i, end - i);
      i = end;
      continue;
    }
    const cp = src.codePointAt(i);
    const chLen = cp > 65535 ? 2 : 1;
    const text = src.slice(i, i + chLen);
    if (!isCjk(text) && cp < 127) {
      report(ctx, "unexpected-lyric-char", t("diag.pu.lyricChar", { text }), i, chLen);
    }
    if (d.joinToken !== void 0 && text === d.joinToken) {
      i += chLen;
      const nextCp = src.codePointAt(i);
      if (nextCp !== void 0) {
        const nextLen = nextCp > 65535 ? 2 : 1;
        const prev = out[out.length - 1];
        if (prev) {
          prev.text += src.slice(i, i + nextLen);
          prev.source.length += 1 + nextLen;
        } else {
          pushSyllable(src.slice(i, i + nextLen), i, nextLen);
        }
        i += nextLen;
      }
      continue;
    }
    pushSyllable(text, i, chLen);
    i += chLen;
  }
  return out;
}
function stripLyricAnnotation(ctx, src, startColumn) {
  let i = startColumn;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  const open = src[i];
  if (open !== '"' && open !== "<") return { gap: 20, next: startColumn };
  const close = open === '"' ? '"' : ">";
  const end = src.indexOf(close, i + 1);
  if (end < 0) {
    report(ctx, "unterminated-lyric-annotation", t("diag.pu.lyricNoteOpen"), i);
    return { gap: 20, next: startColumn };
  }
  let body = src.slice(i + 1, end);
  let gap = 20;
  const gapMatch = /%(\d+)\s*$/.exec(body);
  if (gapMatch) {
    gap = Number(gapMatch[1]);
    body = body.slice(0, gapMatch.index);
  }
  body = body.replace(/_/g, " ").replace(/%40/g, "@");
  return { annotation: body, gap, next: end + 1 };
}
const METADATA_KEYS = /* @__PURE__ */ new Set([
  "V",
  "B",
  "Z",
  "D",
  "P",
  "J",
  // 番茄
  "T",
  "XL",
  "XR",
  "TL",
  "TR",
  "BL",
  "BC",
  "BR",
  // 有谱
  "FONTSIZE",
  "MARGIN",
  "SPACE",
  "OFF"
  // 版面指令：`Space: qu=10`、`Off: hx;`
]);
function parseShigeKeyLine(meta, value, tonic = "1") {
  const pre = /^([b#$♭♯])([A-G])/.exec(value.trim());
  const m = pre ?? /^([A-Ga-g])([b#$♭♯]?)/.exec(value.trim());
  if (pre) meta.mode = `${pre[1]}${pre[2]}`;
  else if (m) {
    const letter = m[1].toUpperCase();
    meta.mode = m[2] ? `${m[2]}${letter}` : letter;
  }
  if (tonic !== "1") meta.tonic = tonic;
  const rest = value.trim().slice(m ? m[0].length : 0);
  let tail = null;
  for (const mm of rest.matchAll(/(\d+)\s*\/\s*(\d+)/g)) {
    meta.meters.push({
      numerator: Number(mm[1]),
      denominator: Number(mm[2]),
      parenthesized: false
    });
    tail = rest.slice((mm.index ?? 0) + mm[0].length);
  }
  const note = tail?.trim();
  if (note && !/\d/.test(note) && note.length <= 8) meta.timeNote = note;
}
function applyMetadata(ctx, meta, key, value, column) {
  const v = value.trim();
  switch (key.toUpperCase()) {
    case "V":
      meta.version = v;
      break;
    case "B":
    case "T":
      meta.titles.push(v);
      break;
    case "Z":
      meta.authors.push(v);
      break;
    case "D": {
      if (!/^(?:[A-G][#$b♭♯]?|[#$b♭♯][A-G])$/.test(v)) {
        report(ctx, "bad-mode", t("diag.pu.badKey", { v }), column, v.length);
      }
      meta.mode = v;
      break;
    }
    case "P": {
      let inParen = false;
      for (const tok of v.split(/\s+/)) {
        if (tok.startsWith("(")) inParen = true;
        const parsed = parseMeter(tok.replace(/[()]/g, ""), inParen);
        if (parsed) meta.meters.push(parsed);
        if (tok.endsWith(")")) inParen = false;
      }
      if (meta.meters.length === 0) {
        report(ctx, "bad-meter", t("diag.pu.badMeter", { v }), column, v.length);
      }
      break;
    }
    case "J": {
      const num = /^(\d+(?:\.\d+)?)\s*/.exec(v);
      if (num) {
        meta.tempos.push(Number(num[1]));
        const text = v.slice(num[0].length).trim();
        if (text) meta.tempos.push(text);
      } else if (v) {
        meta.tempos.push(v);
      }
      break;
    }
    case "XL":
      meta.indexLeft = v;
      break;
    case "XR":
      meta.indexRight = v;
      break;
    case "TL":
      meta.topLeft.push(v);
      break;
    case "TR":
      meta.topRight.push(v);
      break;
    case "BL":
      meta.bottomLeft.push(v);
      break;
    case "BC":
      meta.bottomCenter.push(v);
      break;
    case "BR":
      meta.bottomRight.push(v);
      break;
    case "FONTSIZE":
      meta.fontSizes.push(v);
      break;
    case "MARGIN":
      meta.margins.push(v);
      break;
    case "SPACE":
    case "OFF":
      meta.options.push({ key: key.toUpperCase(), value: v });
      break;
    default:
      report(ctx, "unknown-metadata", t("diag.pu.unknownField", { key }), column, key.length);
  }
}
const BODY_PREFIX = /^\s*([QCW])([!+-]?)(\d*)(?:-(\d+))?([!+-]?)(?:"([^"]*)"|<([^>]*)>)?\s*[:：]/;
const META_PREFIX = /^\s*([A-Za-z]+)\s*[:：]/;
const SONG_SPLIT = /^-{5,}\s*$/;
function parsePuAst(text, options = {}) {
  const diagnostics = [];
  let dialect = options.dialect;
  if (dialect === void 0) {
    const sniffed = sniffDialect(text);
    if (sniffed.dialect === null) {
      return {
        dialect: "tomato",
        source: text,
        songs: [],
        diagnostics: [
          {
            severity: "error",
            code: "unknown-dialect",
            message: sniffed.reason,
            source: { line: 0, column: 0, offset: 0, length: 0 }
          }
        ]
      };
    }
    dialect = sniffed.dialect;
  }
  const ctx = { dialect: dialectSpec(dialect), diagnostics, line: 0, lineOffset: 0 };
  const songs = [];
  let metadata = emptyMetadata();
  let pages = [];
  let page = { index: 0, groups: [] };
  let group = null;
  let pendingTexts = [];
  let lastVoice = null;
  const carriedCurves = /* @__PURE__ */ new Map();
  const carriedVoltas = /* @__PURE__ */ new Map();
  const dropUnresolvedCurves = () => {
    for (const list of carriedCurves.values()) {
      for (const open of list) {
        for (const { list: marks, mark } of open.pending ?? []) {
          const at = marks.indexOf(mark);
          if (at >= 0) marks.splice(at, 1);
        }
      }
    }
    carriedCurves.clear();
  };
  let autoVerse = 0;
  let tailOverride = false;
  let lastRealVoice = null;
  const flushGroup = () => {
    if (group && group.voices.length > 0) page.groups.push(group);
    group = null;
    lastVoice = null;
  };
  const flushPage = () => {
    flushGroup();
    if (page.groups.length > 0) pages.push(page);
    page = { index: pages.length, groups: [] };
  };
  const flushSong = () => {
    flushPage();
    if (pages.length === 0) return;
    songs.push({ index: songs.length, metadata, pages });
    metadata = emptyMetadata();
    pages = [];
    page = { index: 0, groups: [] };
  };
  const lines = text.split(/\r?\n/);
  const starts = lineStarts(text);
  for (let ln = 0; ln < lines.length; ln += 1) {
    const raw = lines[ln];
    ctx.line = ln;
    ctx.lineOffset = starts[ln];
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      flushGroup();
      continue;
    }
    if (trimmed.startsWith("#")) continue;
    if (SONG_SPLIT.test(trimmed)) {
      flushSong();
      dropUnresolvedCurves();
      carriedVoltas.clear();
      continue;
    }
    if (/^\[fenye\]$/i.test(trimmed)) {
      flushPage();
      page.breakSource = { line: ln, column: raw.indexOf("["), offset: starts[ln] + raw.indexOf("["), length: trimmed.length };
      continue;
    }
    const keyLine = /^\s*([1-7])\s*=/.exec(raw);
    if (keyLine) {
      parseShigeKeyLine(metadata, raw.slice(raw.indexOf("=") + 1), keyLine[1]);
      continue;
    }
    const body = BODY_PREFIX.exec(raw);
    if (body) {
      const kind = body[1];
      const variant = body[2] || body[5] || "";
      const numberText = body[3] ?? "";
      const rangeEnd = body[4];
      const caption = body[6] ?? body[7];
      const contentAt = body[0].length;
      if (kind === "W") {
        pendingTexts.push({
          text: raw.slice(contentAt).trim(),
          source: span(ctx, contentAt, raw.length - contentAt)
        });
        continue;
      }
      if (kind === "Q") {
        const voiceNo = numberText ? Number(numberText) : 1;
        if (group && group.voices.some((v) => v.voice === voiceNo)) flushGroup();
        if (!group) {
          group = { index: page.groups.length, texts: pendingTexts, voices: [] };
          pendingTexts = [];
          autoVerse = 0;
        }
        let musicAt = contentAt;
        const dup = BODY_PREFIX.exec(raw.slice(musicAt));
        if (dup && dup[1] === "Q") musicAt += dup[0].length;
        while (raw[musicAt] === ":" || raw[musicAt] === " ") musicAt += 1;
        const parsed = parseMusicLine(
          ctx,
          raw,
          musicAt,
          carriedCurves.get(voiceNo) ?? [],
          carriedVoltas.get(voiceNo) ?? []
        );
        carriedCurves.set(voiceNo, parsed.carriedCurves);
        carriedVoltas.set(voiceNo, parsed.carriedVoltas);
        const line = {
          voice: voiceNo,
          elements: parsed.elements,
          marks: parsed.marks,
          lyrics: [],
          raw,
          source: span(ctx, 0, raw.length)
        };
        if (caption !== void 0) line.caption = caption;
        if (variant === "!" || variant === "-" || variant === "+") line.variant = variant;
        if (parsed.elements.length === 0) {
          tailOverride = lastRealVoice !== null;
          continue;
        }
        group.voices.push(line);
        lastVoice = line;
        lastRealVoice = line;
        tailOverride = false;
        autoVerse = 0;
        continue;
      }
      if (tailOverride) {
        report(
          ctx,
          "lyric-without-music",
          t("diag.pu.lyricNoMusic"),
          0,
          raw.length
        );
        continue;
      }
      if (lastVoice === null) {
        report(ctx, "orphan-lyric", t("diag.pu.orphanLyric"), 0, raw.length);
        continue;
      }
      const ann = stripLyricAnnotation(ctx, raw, contentAt);
      const verseFrom = numberText ? Number(numberText) : ++autoVerse;
      const verseTo = rangeEnd ? Number(rangeEnd) : verseFrom;
      const lyric2 = {
        verseFrom,
        verseTo,
        annotationGap: ann.gap,
        syllables: parseLyricBody(ctx, raw, Math.max(ann.next, contentAt)),
        source: span(ctx, 0, raw.length)
      };
      if (ann.annotation !== void 0) lyric2.annotation = ann.annotation;
      if (/\}\s*$/.test(raw)) lyric2.joinBrace = true;
      lastVoice.lyrics.push(lyric2);
      continue;
    }
    const meta = META_PREFIX.exec(raw);
    if (meta && METADATA_KEYS.has(meta[1].toUpperCase())) {
      applyMetadata(ctx, metadata, meta[1], raw.slice(meta[0].length), 0);
      continue;
    }
    if (/[|]/.test(trimmed) && /[0-9]/.test(trimmed)) {
      report(ctx, "unrecognized-line", t("diag.pu.noQ", { text: trimmed.slice(0, 20) }), 0, raw.length);
    } else {
      metadata.remarks.push(trimmed);
    }
  }
  dropUnresolvedCurves();
  flushSong();
  return { dialect, source: text, songs, diagnostics };
}
function parsePu(text, options = {}) {
  return puToScoreDoc(parsePuAst(text, options));
}
const EPS = 1e-6;
const beatsOf = (t2) => t2.beats * (4 / t2.beatType);
function measureQuarters(m, divisions, xml) {
  const out = /* @__PURE__ */ new Map();
  for (const el of m.elements) {
    if (el.kind === "chord" && el.grace) continue;
    const d = el.duration;
    if (!d) continue;
    const raw = d.divisions / divisions;
    const q = !xml && d.timeMod ? raw * d.timeMod.normal / d.timeMod.actual : raw;
    out.set(el.voice, (out.get(el.voice) ?? 0) + q);
  }
  return out;
}
function checkMeasureDurations(doc, opts = {}) {
  const out = [];
  doc.songs.forEach((song, songIndex) => {
    const xml = isXmlShaped(song);
    song.parts.forEach((part, partIndex) => {
      let time = song.time;
      let divisions = SIMPLE_DIVISIONS;
      const rows = part.measures.map((m) => {
        if (m.attrs?.time) time = m.attrs.time;
        if (m.attrs?.divisions) divisions = m.attrs.divisions;
        const wants = opts.meters?.length ? opts.meters.map(beatsOf) : time ? [time, ...song.extraTimes ?? []].map(beatsOf) : [];
        const byVoice = measureQuarters(m, divisions, xml);
        return { m, wants, byVoice, got: byVoice.values().next().value ?? 0 };
      });
      const n = rows.length;
      const ok = rows.map((r) => r.wants.length === 0 || r.m.elements.length === 0 || !!r.m.implicit || r.wants.some((w) => Math.abs(r.got - w) < EPS));
      const short = (i) => rows[i].wants.some((w) => rows[i].got < w - EPS);
      const fills = (a, b) => rows[a].wants.some((w) => Math.abs(rows[a].got + rows[b].got - w) < EPS);
      const pickup = opts.pickup?.(songIndex, partIndex) ?? true;
      if (pickup && n >= 2 && !ok[0] && short(0) && short(n - 1) && fills(0, n - 1)) ok[0] = ok[n - 1] = true;
      if (pickup && n >= 2 && !ok[0] && short(0)) ok[0] = true;
      for (let i = 0; i + 1 < n; i++) {
        if (!ok[i] && !ok[i + 1] && short(i) && short(i + 1) && fills(i, i + 1)) ok[i] = ok[i + 1] = true;
      }
      rows.forEach((r, measureIndex) => {
        if (r.byVoice.size < 2) return;
        for (const [, q] of [...r.byVoice].slice(1)) {
          if (Math.abs(q - r.got) < EPS) continue;
          if (xml && q < r.got) continue;
          const issue = { songIndex, partIndex, measureIndex, want: r.got, got: q, ids: r.m.elements.map((e) => e.id) };
          const src = r.m.elements.find((e) => e.source)?.source;
          if (src) issue.source = src;
          out.push(issue);
        }
      });
      rows.forEach((r, measureIndex) => {
        if (ok[measureIndex]) return;
        const want = r.wants.reduce((best, w) => Math.abs(w - r.got) < Math.abs(best - r.got) ? w : best, r.wants[0]);
        const issue = { songIndex, partIndex, measureIndex, want, got: r.got, ids: r.m.elements.map((e) => e.id) };
        const src = r.m.elements.find((e) => e.source)?.source;
        if (src) issue.source = src;
        out.push(issue);
      });
    });
  });
  return out;
}
function beatText(q) {
  for (const d of [1, 2, 4, 8, 16, 3, 6, 12]) {
    const n = Math.round(q * d);
    if (Math.abs(n / d - q) > EPS) continue;
    if (d === 1) return String(n);
    const whole = Math.floor(n / d);
    const rest = n - whole * d;
    return whole ? `${whole} ${rest}/${d}` : `${rest}/${d}`;
  }
  return q.toFixed(2);
}
function describeBeatIssue(i) {
  const diff = i.got - i.want;
  return t(diff < 0 ? "beat.short" : "beat.over", { d: beatText(Math.abs(diff)), want: beatText(i.want), got: beatText(i.got) });
}
export {
  lyricOfVerse as $,
  AccidentalCarry as A,
  BARE_DIRECTION as B,
  CJK_FIELD_ALIAS as C,
  DYNAMICS as D,
  eachElement as E,
  eachMeasure$1 as F,
  eachNote as G,
  eachPart as H,
  IdGen as I,
  JpwFile as J,
  elementIndex as K,
  LEXER_123 as L,
  emit123 as M,
  emitAbc as N,
  emitJcx as O,
  emitJly as P,
  emitJpwabc as Q,
  RepeatSection as R,
  SOURCE_ID_PREFIX as S,
  emitPu as T,
  emitPuSong as U,
  emitSong as V,
  expandEndingNumbers as W,
  findElement as X,
  jpwToScoreDoc as Y,
  ZERO_SPAN$1 as Z,
  keyNameOf as _,
  arcsToNextNote as a,
  measureDuration as a0,
  normalizeSpelling as a1,
  parse123 as a2,
  parseAbc as a3,
  parseAbcFamily as a4,
  parseFieldLine as a5,
  parseInstruction as a6,
  parseJcx as a7,
  parseKey as a8,
  parseLinebreak as a9,
  parseLyricLine as aa,
  parsePlayOrder as ab,
  parsePu as ac,
  parsePuAst as ad,
  parseTempo as ae,
  parseTempoBeat as af,
  parseTime as ag,
  parseTimes as ah,
  parseVoiceClef as ai,
  phraseCuts as aj,
  primarySong as ak,
  puPhraseLines as al,
  puToScoreDoc as am,
  relayoutDocBreaks as an,
  relayoutJpwabcText as ao,
  sniffDialect as ap,
  spliceComments as aq,
  writeJpwabc as ar,
  duration123 as as,
  jpPitch as at,
  jianpuInputOfDoc as au,
  puArcLosses as b,
  projectForMusicXml as c,
  parseChordToken as d,
  eachChord as e,
  lySuffixToText as f,
  getLang as g,
  emptySong as h,
  inlineBreakOf$1 as i,
  SIMPLE_DIVISIONS as j,
  emptyDoc as k,
  lyPitchToText as l,
  melodyLane as m,
  nestArcsInTuplets as n,
  CJK_INSTRUCTION_ALIAS as o,
  projectForJianpu as p,
  applyBreaks as q,
  breakAfter as r,
  breaksAfterToStart as s,
  t,
  breaksOf as u,
  verseCount$1 as v,
  checkMeasureDurations as w,
  decoKey as x,
  describeBeatIssue as y,
  docView as z
};
