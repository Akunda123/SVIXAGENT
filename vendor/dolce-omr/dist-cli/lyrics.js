function connectedComponents(bin, minArea = 4, out) {
  const { w, h, data } = bin;
  const labels = out ?? new Int32Array(w * h);
  labels.fill(0);
  const comps = [];
  let next = 1;
  const stack = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (data[idx] !== 1 || labels[idx] !== 0) continue;
      const id = next++;
      let minX = x, maxX = x, minY = y, maxY = y, area = 0, sx = 0, sy = 0;
      stack.length = 0;
      stack.push(idx);
      labels[idx] = id;
      while (stack.length) {
        const cur = stack.pop();
        const cy = cur / w | 0;
        const cx = cur - cy * w;
        area++;
        sx += cx;
        sy += cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            if (nx < 0 || nx >= w) continue;
            const nIdx = ny * w + nx;
            if (data[nIdx] === 1 && labels[nIdx] === 0) {
              labels[nIdx] = id;
              stack.push(nIdx);
            }
          }
        }
      }
      if (area < minArea) continue;
      const bbox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
      comps.push({ id, bbox, area, cx: sx / area, cy: sy / area });
    }
  }
  return comps;
}
const rright = (r) => r.x + r.w;
const rbottom = (r) => r.y + r.h;
const rcx = (r) => r.x + r.w / 2;
const rcy = (r) => r.y + r.h / 2;
const RHYTHM_DIGIT = 9;
const REJOINED_ARC_ID = 6e6;
const isRejoinedArc = (k) => k.id >= REJOINED_ARC_ID && k.id < REJOINED_ARC_ID + 1e6;
const SECTION_RE = /(intro|verse|chorus|pre-?chorus|bridge|coda|outro|ending|interlude|solo|fine|tag|refrain)\d*/gi;
const BRACKET_RE = /[[【][^\]】]*[\]】]/g;
const CN_SECTION_RE = /(副歌|主歌|前奏|间奏|尾奏|尾声|过门|引子|结束)/g;
const blankNonChord = (s) => s.replace(BRACKET_RE, (m) => " ".repeat(m.length)).replace(JUMP_RE, (m) => " ".repeat(m.length)).replace(SECTION_RE, (m) => " ".repeat(m.length)).replace(CN_SECTION_RE, (m) => " ".repeat(m.length)).replace(KEY_METER_RE, (m) => " ".repeat(m.length));
const CHORD_HANZI_RE = /[或升降]/g;
const CHORD_TOKEN_RE = /^[A-G][#♯b♭]?(?:maj|min|dim|aug|sus|add|m|M)?\d*(?:sus\d*|add\d*)?(?:\/[A-G][#♯b♭]?)?/;
const CHORD_SEP_RE = /[\s()\-–—_,.·、|]/;
const JUMP_RE = /D\s*[.,·]\s*[CS]\s*[.,·]?(?:\s*al\s*[.,·]?\s*(?:Fine|Coda))?|\bFine\b|\bTo\s*Coda\b/gi;
const KEY_METER_RE = /\d\s*[=＝:：]\s*[#♯b♭]?[A-G]|(?:[#♯b♭]?[A-G]\s*)?\d+\s*\/\s*\d+/g;
function scanChords(s0) {
  const s = s0.replace(JUMP_RE, (m) => " ".repeat(m.length)).replace(KEY_METER_RE, (m) => " ".repeat(m.length));
  const toks = [];
  let hit = 0, total = 0;
  for (let i = 0; i < s.length; ) {
    if (CHORD_SEP_RE.test(s[i])) {
      i++;
      continue;
    }
    const m = CHORD_TOKEN_RE.exec(s.slice(i));
    if (m && m[0].length) {
      toks.push({ tok: m[0], index: i });
      hit += m[0].length;
      total += m[0].length;
      i += m[0].length;
    } else {
      total++;
      i++;
    }
  }
  return { toks, hit, total };
}
function chordCoverage(s) {
  const { toks, hit, total } = scanChords(s);
  return { cov: total ? hit / total : 0, count: toks.length };
}
function splitChordTokens(s) {
  return scanChords(s).toks;
}
function normalizeChord(tok) {
  let s = tok.replace(/\s/g, "").replace(/♯/g, "#").replace(/♭/g, "b");
  s = s.replace(/^([A-G][#b]?)M(?!aj)/, (_, r) => `${r}m`);
  s = s.replace(/(maj|min|sus|add|dim|aug)/gi, (m) => m.toLowerCase());
  return s;
}
function isAnnotationLine(text0) {
  const text = text0.replace(/[[【][^\]】]*[\]】]/g, " ").replace(CN_SECTION_RE, " ");
  const hanzi = text.match(/[一-鿿]/g) ?? [];
  if (hanzi.some((ch) => !/[或升降]/.test(ch))) return false;
  const rest = text.replace(SECTION_RE, " ").replace(CHORD_HANZI_RE, " ");
  if (!rest.trim()) return text0.trim().length > 0;
  if (!/[A-Za-z]/.test(rest)) return false;
  const { cov, count } = chordCoverage(rest);
  return count >= 2 ? cov >= 0.85 : count === 1 && cov === 1;
}
function chordCandidates(rawText, srcX, mkBbox) {
  return splitChordTokens(blankNonChord(rawText)).map(({ tok, index }) => {
    const x0 = srcX(index), x1 = srcX(index + tok.length);
    return { tok: normalizeChord(tok), x: x0, bbox: mkBbox(x0, Math.max(x1, x0 + 1)) };
  }).filter((c) => /^[A-G]/.test(c.tok));
}
function placeChords(row, cands, regions) {
  const nums = row.nums;
  if (!nums.length) return;
  const lefts = nums.map((n) => n.bbox.x);
  const extraY = /* @__PURE__ */ new Map();
  for (const c of [...cands].sort((a, b) => a.x - b.x)) {
    const x = c.x;
    let i = 0;
    while (i + 1 < lefts.length && lefts[i + 1] <= x) i++;
    let frac = 0;
    if (i + 1 < lefts.length && x > lefts[i]) {
      const gap = lefts[i + 1] - lefts[i];
      if (gap > 1) {
        const t = (x - lefts[i]) / gap;
        if (t >= 0.65) {
          i += 1;
        } else if (t >= 0.35) frac = t;
      }
    }
    if (nums[i].chord === c.tok) continue;
    if (frac > 0 && nums[i].chord !== void 0) {
      const extra = nums[i].extraChords ??= [];
      const ys = extraY.get(nums[i]) ?? [];
      extraY.set(nums[i], ys);
      const clash = extra.findIndex((e) => Math.abs(e.offset - frac) < 0.1);
      if (clash >= 0) {
        if (c.bbox.y > ys[clash]) {
          extra[clash] = { tok: c.tok, offset: frac };
          ys[clash] = c.bbox.y;
          regions.push({ text: c.tok, bbox: c.bbox });
        }
      } else if (!extra.some((e) => e.tok === c.tok)) {
        extra.push({ tok: c.tok, offset: frac });
        ys.push(c.bbox.y);
        regions.push({ text: c.tok, bbox: c.bbox });
      }
      continue;
    }
    if (nums[i].chord !== void 0 && i + 1 < nums.length && nums[i + 1].chord === void 0) {
      i += 1;
      frac = 0;
    }
    if (nums[i].chord !== void 0) continue;
    nums[i].chord = c.tok;
    if (frac > 0) nums[i].chordOffset = frac;
    regions.push({ text: c.tok, bbox: c.bbox });
  }
}
function median(xs, fallback = 0) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : fallback;
}
function unionRect(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y
  };
}
function unionRects(rs) {
  if (!rs.length) return { x: 0, y: 0, w: 0, h: 0 };
  return rs.reduce(unionRect);
}
function overlapX(a, b) {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
}
function overlapRatioX(a, b) {
  return overlapX(a, b) / Math.min(a.w, b.w);
}
function overlapRatioY(a, b) {
  return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) / Math.min(a.h, b.h);
}
function clusterByY(items, keyOf, tol) {
  const sorted = [...items].sort((a, b) => keyOf(a) - keyOf(b));
  const lines = [];
  for (const it of sorted) {
    const ln = lines.find((L) => Math.abs(median(L.map(keyOf)) - keyOf(it)) < tol);
    if (ln) ln.push(it);
    else lines.push([it]);
  }
  return lines;
}
function findLineByY(lines, keyOf, y, tol) {
  return lines.find((L) => Math.abs(median(L.map(keyOf)) - y) < tol) ?? null;
}
function createSurface(w, h, fill = 255) {
  const width = Math.max(1, Math.round(w)), height = Math.max(1, Math.round(h));
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  if (fill !== 255) for (let p = 0; p < data.length; p += 4) {
    data[p] = data[p + 1] = data[p + 2] = fill;
  }
  return { width, height, data };
}
function surfaceFromBinary(bin) {
  const s = createSurface(bin.w, bin.h);
  const d = s.data;
  for (let i = 0; i < bin.data.length; i++) {
    const v = bin.data[i] ? 0 : 255;
    const p = i * 4;
    d[p] = d[p + 1] = d[p + 2] = v;
  }
  return s;
}
function buildTaps(dstLen, s0, span, lim) {
  const scale = span / dstLen;
  if (scale > 1) {
    const n2 = Math.ceil(scale) + 1;
    const start2 = new Int32Array(dstLen);
    const wts2 = new Float32Array(dstLen * n2);
    for (let i = 0; i < dstLen; i++) {
      const a = s0 + i * scale, b = a + scale;
      const i0 = Math.floor(a);
      start2[i] = i0;
      let sum = 0;
      for (let k = 0; k < n2; k++) {
        const x = i0 + k;
        const w = Math.max(0, Math.min(b, x + 1) - Math.max(a, x));
        wts2[i * n2 + k] = w;
        sum += w;
      }
      if (sum > 0) for (let k = 0; k < n2; k++) wts2[i * n2 + k] /= sum;
    }
    clampStarts(start2, n2, lim);
    return { start: start2, wts: wts2, n: n2 };
  }
  const n = 2;
  const start = new Int32Array(dstLen);
  const wts = new Float32Array(dstLen * n);
  for (let i = 0; i < dstLen; i++) {
    const c = s0 + (i + 0.5) * scale - 0.5;
    const i0 = Math.floor(c), f = c - i0;
    start[i] = i0;
    wts[i * n] = 1 - f;
    wts[i * n + 1] = f;
  }
  clampStarts(start, n, lim);
  return { start, wts, n };
}
function clampStarts(start, n, lim) {
  for (let i = 0; i < start.length; i++) {
    if (start[i] < 0) start[i] = 0;
    else if (start[i] + n > lim) start[i] = Math.max(0, lim - n);
  }
}
function blit(dst, src, s, d) {
  const sx = Math.max(0, s.x), sy = Math.max(0, s.y);
  const sw = Math.min(src.width - sx, s.w), sh = Math.min(src.height - sy, s.h);
  const dx = Math.round(d.x), dy = Math.round(d.y);
  const dw = Math.max(1, Math.round(d.w)), dh = Math.max(1, Math.round(d.h));
  if (sw <= 0 || sh <= 0) return;
  const tx = buildTaps(dw, sx, sw, src.width);
  const ty = buildTaps(dh, sy, sh, src.height);
  const row0 = ty.start[0];
  const rowN = ty.start[dh - 1] + ty.n - row0;
  const mid = new Float32Array(dw * rowN * 3);
  for (let y = 0; y < rowN; y++) {
    const sRow = (row0 + y) * src.width * 4;
    const mRow = y * dw * 3;
    for (let i = 0; i < dw; i++) {
      const st = tx.start[i];
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < tx.n; k++) {
        const w = tx.wts[i * tx.n + k];
        if (!w) continue;
        const p = sRow + (st + k) * 4;
        r += src.data[p] * w;
        g += src.data[p + 1] * w;
        b += src.data[p + 2] * w;
      }
      mid[mRow + i * 3] = r;
      mid[mRow + i * 3 + 1] = g;
      mid[mRow + i * 3 + 2] = b;
    }
  }
  for (let j = 0; j < dh; j++) {
    const oy = dy + j;
    if (oy < 0 || oy >= dst.height) continue;
    const st = ty.start[j] - row0;
    for (let i = 0; i < dw; i++) {
      const ox = dx + i;
      if (ox < 0 || ox >= dst.width) continue;
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < ty.n; k++) {
        const w = ty.wts[j * ty.n + k];
        if (!w) continue;
        const m = ((st + k) * dw + i) * 3;
        r += mid[m] * w;
        g += mid[m + 1] * w;
        b += mid[m + 2] * w;
      }
      const p = (oy * dst.width + ox) * 4;
      dst.data[p] = r;
      dst.data[p + 1] = g;
      dst.data[p + 2] = b;
      dst.data[p + 3] = 255;
    }
  }
}
function probe(name) {
  const p = globalThis.__omrProbe;
  if (p) p[name] = (p[name] ?? 0) + 1;
}
const PAIRS = "㑳㑇㥮㤘㩳㧐䃮鿎䰾鲃䲁鳚䴉鹮丟丢並并乾干亂乱亙亘亞亚佇伫佈布佔占併并來来侖仑侶侣侷局俁俣係系俔伣俠侠俬私倀伥倆俩倈俫倉仓個个們们倖幸倫伦偉伟側侧偵侦偽伪傑杰傖伧傘伞備备傢家傭佣傯偬傳传傴伛債债傷伤傾倾僂偻僅仅僉佥僑侨僕仆僞伪僥侥僨偾僱雇價价儀仪儁俊儂侬億亿儈侩儉俭儐傧儔俦儕侪儘尽償偿優优儲储儷俪儺傩儻傥儼俨兇凶兌兑兒儿兗兖內内兩两冊册冑胄冪幂凈净凍冻凜凛凱凯別别刪删剄刭則则剋克剎刹剗刬剛刚剝剥剮剐剴剀創创剷铲劃划劄札劇剧劉刘劊刽劌刿劍剑劑剂勁劲動动務务勛勋勝胜勞劳勢势勩勚勱劢勳勋勵励勸劝勻匀匭匦匯汇匱匮區区協协卹恤卻却卽即厙厍厠厕厤历厭厌厲厉厴厣參参叄叁叢丛吒咤吳吴吶呐呂吕咼呙員员唄呗唸念問问啓启啞哑啟启喚唤喪丧喫吃喬乔單单喲哟嗆呛嗇啬嗊唝嗎吗嗚呜嗩唢嗶哔嘆叹嘍喽嘓啯嘔呕嘖啧嘗尝嘜唛嘩哗嘮唠嘯啸嘰叽嘵哓嘸呒嘽啴噁恶噓嘘噝咝噠哒噥哝噦哕噯嗳噲哙噴喷噸吨噹当嚀咛嚇吓嚐尝嚕噜嚙啮嚥咽嚦呖嚨咙嚮向嚲亸嚳喾嚴严嚶嘤囀啭囁嗫囂嚣囅冁囈呓囉啰囌苏囑嘱囪囱圇囵國国圍围園园圓圆圖图團团垻坝埡垭執执堅坚堊垩堖垴堝埚堯尧報报場场塊块塋茔塏垲塒埘塗涂塚冢塢坞塤埙塵尘塹堑墊垫墜坠墮堕墳坟墶垯墻墙墾垦壇坛壋垱壎埙壓压壘垒壙圹壚垆壞坏壟垄壢坜壩坝壪塆壯壮壺壶壼壸壽寿夠够夢梦夥伙夾夹奐奂奧奥奩奁奪夺奬奖奮奋奼姹妝妆姍姗姦奸娛娱婁娄婦妇婭娅媧娲媯妫媼媪媽妈嫋袅嫗妪嫵妩嫺娴嫻娴嫿婳嬀妫嬃媭嬈娆嬋婵嬌娇嬙嫱嬡嫒嬤嬷嬪嫔嬰婴嬸婶孃娘孌娈孫孙學学孿孪宮宫寀采寢寝實实寧宁審审寫写寬宽寵宠寶宝將将專专尋寻對对導导尷尴屆届屍尸屓屃屜屉屢屡層层屨屦屬属岡冈峯峰峴岘島岛峽峡崍崃崑昆崗岗崙仑崢峥崬岽嵐岚嵗岁嶁嵝嶄崭嶇岖嶔嵚嶗崂嶠峤嶢峣嶧峄嶨峃嶮崄嶸嵘嶺岭嶼屿嶽岳巋岿巒峦巔巅巖岩巰巯巹卺帥帅師师帳帐帶带幀帧幃帏幗帼幘帻幟帜幣币幫帮幬帱幷并幹干幾几庫库廁厕廂厢廄厩廈厦廎庼廕荫廚厨廝厮廟庙廠厂廡庑廢废廣广廩廪廬庐廳厅弒弑弔吊張张強强彆别彈弹彌弥彎弯彔录彙汇彠彟彥彦彫雕彿佛後后徑径從从徠徕復复徵征徹彻恆恒恥耻悅悦悵怅悶闷悽凄惡恶惱恼惲恽惻恻愛爱愜惬愨悫愴怆愷恺愾忾慄栗態态慍愠慘惨慚惭慟恸慣惯慤悫慪怄慫怂慮虑慳悭慶庆慼戚慾欲憂忧憊惫憐怜憑凭憒愦憖慭憚惮憤愤憫悯憮怃憲宪憶忆懇恳應应懌怿懍懔懞蒙懟怼懣懑懨恹懲惩懶懒懷怀懸悬懺忏懼惧懾慑戀恋戇戆戔戋戧戗戩戬戰战戱戯戲戏戶户扞捍拋抛拚拼挱挲挾挟捨舍捫扪捱挨捲卷掃扫掄抡掙挣掛挂採采揀拣揚扬換换揮挥損损搖摇搗捣搧扇搶抢摑掴摜掼摟搂摯挚摳抠摶抟摺折摻掺撈捞撏挦撐撑撓挠撝㧑撣掸撥拨撫抚撲扑撳揿撻挞撾挝撿捡擁拥擄掳擇择擊击擋挡擓㧟擔担據据擠挤擡抬擣捣擬拟擯摈擰拧擱搁擲掷擴扩擷撷擺摆擻擞擼撸擾扰攄摅攆撵攏拢攔拦攖撄攙搀攛撺攜携攝摄攢攒攣挛攤摊攪搅攬揽敎教敗败敘叙敵敌數数斂敛斃毙斕斓斬斩斷断於于旂旗昇升時时晉晋晝昼暈晕暉晖暘旸暢畅暫暂曄晔曆历曇昙曉晓曏向曖暧曠旷曨昽曬晒書书會会朧胧朮术東东枴拐柵栅柺拐査查桿杆梔栀梘枧條条梟枭梲棁棄弃棊棋棖枨棗枣棟栋棡㭎棧栈棲栖棶梾椏桠楊杨楓枫楨桢業业極极榘矩榦干榪杩榮荣榲榅榿桤構构槍枪槓杠槤梿槧椠槨椁槳桨樁桩樂乐樅枞樑梁樓楼標标樞枢樣样樸朴樹树樺桦橈桡橋桥機机橢椭橫横檁檩檉柽檔档檜桧檟槚檢检檣樯檮梼檯台檳槟檸柠檻槛櫃柜櫓橹櫚榈櫛栉櫝椟櫞橼櫟栎櫥橱櫧槠櫨栌櫪枥櫫橥櫬榇櫱蘖櫳栊櫸榉櫻樱欄栏欅榉權权欏椤欒栾欖榄欞棂欽钦歎叹歐欧歟欤歡欢歲岁歷历歸归歿殁殘残殞殒殤殇殫殚殭僵殮殓殯殡殲歼殺杀殻壳殼壳毀毁毆殴毿毵氂牦氈毡氌氇氣气氫氢氬氩氳氲氾泛汎泛汙污決决沒没沖冲況况泝溯洩泄洶汹浹浃涇泾涼凉淒凄淚泪淥渌淨净淩凌淪沦淵渊淶涞淺浅渙涣減减渢沨渦涡測测渾浑湊凑湞浈湧涌湯汤溈沩準准溝沟溫温溮浉溳涢溼湿滄沧滅灭滌涤滎荥滙汇滬沪滯滞滲渗滷卤滸浒滻浐滾滚滿满漁渔漊溇漚沤漢汉漣涟漬渍漲涨漵溆漸渐漿浆潁颍潑泼潔洁潙沩潛潜潤润潯浔潰溃潷滗潿涠澀涩澆浇澇涝澐沄澗涧澠渑澤泽澦滪澮浍澱淀濁浊濃浓濕湿濘泞濛蒙濜浕濟济濤涛濫滥濰潍濱滨濺溅濼泺濾滤瀅滢瀆渎瀉泻瀋沈瀏浏瀕濒瀘泸瀝沥瀟潇瀠潆瀦潴瀧泷瀨濑瀰弥瀲潋瀾澜灃沣灄滠灑洒灕漓灘滩灝灏灣湾灤滦灧滟灩滟災灾為为烏乌烴烃無无煉炼煒炜煙烟煢茕煥焕煩烦煬炀熅煴熒荧熗炝熱热熲颎熾炽燁烨燈灯燉炖燒烧燙烫燜焖營营燦灿燬毁燭烛燴烩燻熏燼烬燾焘爍烁爐炉爛烂爭争爲为爺爷爾尔牀床牆墙牘牍牴抵牽牵犖荦犛牦犢犊犧牺狀状狹狭狽狈猙狰猶犹猻狲獁犸獃呆獄狱獅狮獎奖獨独獪狯獫猃獮狝獰狞獲获獵猎獷犷獸兽獺獭獻献獼猕玀猡現现琱雕琺珐琿珲瑋玮瑒玚瑣琐瑤瑶瑩莹瑪玛瑲玱璉琏璡琎璣玑璦瑷璫珰環环璵玙璽玺璿璇瓊琼瓏珑瓔璎瓚瓒甌瓯甕瓮產产産产畝亩畢毕畫画異异畵画當当疇畴疊叠痙痉痠酸痾疴瘋疯瘍疡瘓痪瘞瘗瘡疮瘧疟瘮瘆瘲疭瘺瘘瘻瘘療疗癆痨癇痫癉瘅癒愈癘疠癟瘪癡痴癢痒癤疖癥症癧疬癩癞癬癣癭瘿癮瘾癰痈癱瘫癲癫發发皁皂皚皑皰疱皸皲皺皱盃杯盜盗盞盏盡尽監监盤盘盧卢盪荡眞真眥眦眾众睏困睜睁睞睐瞘眍瞜䁖瞞瞒瞼睑矇蒙矓眬矚瞩矯矫硃朱硜硁硤硖硨砗硯砚碕埼碩硕碭砀碸砜確确碼码磑硙磚砖磣碜磧碛磯矶磽硗磾䃅礄硚礎础礙碍礦矿礪砺礫砾礬矾礱砻祕秘祿禄禍祸禎祯禕祎禡祃禦御禪禅禮礼禰祢禱祷禿秃秈籼稅税稈秆稜棱稟禀種种稱称穀谷穇䅟穌稣積积穎颖穠秾穡穑穢秽穩稳穫获窩窝窪洼窮穷窯窑窵窎窶窭窺窥竄窜竅窍竇窦竈灶竊窃竪竖競竞筆笔筍笋筧笕箇个箋笺箏筝節节範范築筑篋箧篔筼篤笃篩筛篳筚簀箦簍篓簑蓑簞箪簡简簣篑簫箫簹筜簽签簾帘籃篮籌筹籙箓籛篯籜箨籟籁籠笼籤签籩笾籪簖籬篱籮箩籲吁粵粤糉粽糝糁糞粪糧粮糰团糲粝糴籴糶粜糾纠紀纪紂纣約约紅红紆纡紇纥紈纨紉纫紋纹納纳紐纽紓纾純纯紕纰紖纼紗纱紘纮紙纸級级紛纷紜纭紝纴紡纺紮扎細细紱绂紲绁紳绅紵纻紹绍紺绀紼绋紿绐絀绌終终絃弦組组絅䌹絆绊絎绗結结絕绝絛绦絝绔絞绞絡络絢绚給给絨绒絰绖統统絲丝絳绛絶绝絹绢綁绑綃绡綆绠綈绨綉绣綌绤綏绥綑捆經经綜综綠绿綢绸綣绻綫线綬绶維维綯绹綰绾綱纲網网綳绷綴缀綵彩綸纶綹绺綺绮綻绽綽绰綾绫綿绵緄绲緇缁緊紧緋绯緑绿緒绪緔绱緗缃緘缄緙缂線线緝缉緞缎締缔緡缗緣缘緦缌編编緩缓緬缅緯纬緱缑緲缈練练緹缇緻致縈萦縉缙縊缢縋缒縐绉縑缣縕缊縗缞縛缚縝缜縞缟縟缛縣县縧绦縫缝縭缡縮缩縱纵縲缧縴纤縵缦縶絷縷缕縹缥總总績绩繃绷繅缫繆缪繒缯織织繕缮繚缭繞绕繡绣繩绳繪绘繫系繭茧繮缰繯缳繰缲繳缴繹绎繼继繽缤繾缱纈缬纊纩續续纍累纏缠纓缨纔才纖纤纘缵纜缆缽钵罃䓨罈坛罌罂罎坛罰罚罵骂罷罢羅罗羆罴羈羁羋芈羣群羥羟羨羡義义羶膻習习翫玩翬翚翹翘翽翙耬耧耮耢聖圣聞闻聯联聰聪聲声聳耸聵聩聶聂職职聹聍聽听聾聋肅肃脅胁脈脉脛胫脣唇脩修脫脱脹胀腎肾腖胨腦脑腫肿腳脚腸肠膃腽膕腘膚肤膞䏝膠胶膩腻膽胆膾脍膿脓臉脸臍脐臏膑臘腊臚胪臟脏臠脔臢臜臥卧臨临臺台與与興兴舉举舊旧舖铺舘馆艙舱艤舣艦舰艫舻艱艰艷艳芻刍苧苎茲兹荊荆莊庄莖茎莢荚莧苋華华菴庵菸烟萇苌萊莱萬万萵莴葉叶葒荭葤荮葦苇葯药葷荤蒐搜蒓莼蒔莳蒞莅蒼苍蓀荪蓆席蓋盖蓮莲蓯苁蓴莼蓽荜蔔卜蔘参蔞蒌蔣蒋蔥葱蔦茑蔭荫蕁荨蕆蒇蕎荞蕒荬蕓芸蕕莸蕘荛蕢蒉蕩荡蕪芜蕭萧蕷蓣薀蕰薈荟薊蓟薌芗薑姜薔蔷薘荙薟莶薦荐薩萨薹苔薺荠藍蓝藎荩藝艺藥药藪薮藭䓖藴蕴藶苈藹蔼藺蔺蘀萚蘄蕲蘆芦蘇苏蘊蕴蘋苹蘚藓蘞蔹蘢茏蘭兰蘺蓠蘿萝虆蔂處处虛虚虜虏號号虧亏虯虬蛺蛱蛻蜕蜆蚬蝕蚀蝟猬蝦虾蝨虱蝸蜗螄蛳螞蚂螢萤螮䗖螻蝼蟄蛰蟈蝈蟎螨蟣虮蟬蝉蟯蛲蟲虫蟶蛏蟻蚁蠅蝇蠆虿蠍蝎蠐蛴蠑蝾蠔蚝蠟蜡蠣蛎蠨蟏蠱蛊蠶蚕蠻蛮衆众衊蔑術术衕同衚胡衛卫衝冲袞衮袷夹裊袅裏里補补裝装裡里製制複复褌裈褘袆褲裤褳裢褸褛褻亵襇裥襏袯襖袄襝裣襠裆襤褴襪袜襬摆襯衬襲袭襴襕覈核見见覎觃規规覓觅視视覘觇覡觋覦觎親亲覬觊覯觏覲觐覷觑覺觉覽览覿觌觀观觴觞觶觯觸触訂订訃讣計计訊讯訌讧討讨訐讦訒讱訓训訕讪訖讫託托記记訛讹訝讶訟讼訢䜣訣诀訥讷訩讻訪访設设許许訴诉訶诃診诊註注証证詁诂詆诋詎讵詐诈詒诒詔诏評评詖诐詗诇詘诎詛诅詞词詠咏詡诩詢询詣诣試试詩诗詫诧詬诟詭诡詮诠詰诘話话該该詳详詵诜詼诙詿诖誄诔誅诛誆诓誇夸誌志認认誑诳誕诞誘诱誚诮語语誠诚誡诫誣诬誤误誥诰誦诵誨诲說说説说誰谁課课誶谇誹诽誼谊誾訚調调諂谄諄谆談谈諉诿請请諍诤諏诹諑诼諒谅論论諗谂諛谀諜谍諝谞諞谝諡谥諢诨諤谔諦谛諧谐諫谏諭谕諮咨諱讳諳谙諶谌諷讽諸诸諺谚諼谖諾诺謀谋謁谒謂谓謄誊謅诌謊谎謎谜謐谧謔谑謖谡謗谤謙谦謚谥講讲謝谢謠谣謡谣謨谟謫谪謬谬謳讴謹谨謾谩譁哗證证譎谲譏讥譖谮識识譙谯譚谭譜谱譟噪譫谵譭毁譯译議议譴谴護护譽誉譾谫讀读變变讋詟讎雠讒谗讓让讕谰讖谶讚赞讜谠讞谳谿溪豈岂豎竖豐丰豔艳豬猪豶豮貍狸貓猫貙䝙貝贝貞贞負负財财貢贡貧贫貨货販贩貪贪貫贯責责貯贮貰贳貲赀貳贰貴贵貶贬買买貸贷貺贶費费貼贴貽贻貿贸賀贺賁贲賂赂賃赁賄贿賅赅資资賈贾賊贼賑赈賒赊賓宾賕赇賙赒賚赉賜赐賞赏賠赔賡赓賢贤賣卖賤贱賦赋賧赕質质賫赍賬账賭赌賴赖賵赗賺赚賻赙購购賽赛賾赜贄贽贅赘贇赟贈赠贊赞贋赝贍赡贏赢贐赆贓赃贔赑贖赎贗赝贛赣贜赃赬赪趕赶趙赵趨趋趲趱跡迹踐践踰逾踴踊蹌跄蹕跸蹟迹蹠跖蹣蹒蹤踪蹺跷躂跶躉趸躊踌躋跻躍跃躑踯躒跞躓踬躕蹰躚跹躡蹑躥蹿躦躜躪躏軀躯車车軋轧軌轨軍军軑轪軒轩軔轫軛轭軟软軤轷軫轸軲轱軸轴軹轵軺轺軻轲軼轶軾轼較较輅辂輇辁輈辀載载輊轾輒辄輓挽輔辅輕轻輛辆輜辎輝辉輞辋輟辍輥辊輦辇輩辈輪轮輬辌輯辑輳辏輸输輻辐輾辗輿舆轀辒轂毂轄辖轅辕轆辘轉转轍辙轎轿轔辚轟轰轡辔轢轹轤轳辦办辭辞辮辫辯辩農农迴回逕径這这連连週周進进遊游運运過过達达違违遙遥遜逊遞递遠远遡溯適适遲迟遶绕遷迁選选遺遗遼辽邁迈還还邇迩邊边邏逻邐逦郟郏郵邮鄆郓鄉乡鄒邹鄔邬鄖郧鄧邓鄭郑鄰邻鄲郸鄴邺鄶郐鄺邝酇酂酈郦醃腌醖酝醜丑醞酝醟蒏醣糖醫医醬酱醱酦釀酿釁衅釃酾釅酽釋释釐厘釓钆釔钇釕钌釗钊釘钉釙钋針针釣钓釤钐釦扣釧钏釩钒釵钗釷钍釹钕釺钎鈀钯鈁钫鈃钘鈄钭鈈钚鈉钠鈍钝鈎钩鈐钤鈑钣鈔钞鈕钮鈞钧鈣钙鈥钬鈦钛鈧钪鈮铌鈰铈鈴铃鈷钴鈸钹鈹铍鈺钰鈾铀鈿钿鉀钾鉅巨鉆钻鉈铊鉉铉鉍铋鉑铂鉕钷鉗钳鉚铆鉛铅鉞钺鉢钵鉤钩鉦钲鉬钼鉭钽鉶铏鉸铰鉺铒鉻铬鉿铪銀银銃铳銅铜銍铚銑铣銓铨銖铢銘铭銚铫銜衔銠铑銣铷銥铱銦铟銨铵銩铥銪铕銫铯銬铐銱铞銳锐銷销銹锈銻锑銼锉鋁铝鋃锒鋅锌鋇钡鋌铤鋏铗鋒锋鋙铻鋝锊鋟锓鋤锄鋥锃鋦锔鋨锇鋪铺鋭锐鋮铖鋯锆鋰锂鋱铽鋶锍鋸锯鋼钢錁锞錄录錆锖錈锩錐锥錒锕錕锟錘锤錙锱錚铮錛锛錟锬錠锭錡锜錢钱錦锦錨锚錫锡錮锢錯错録录錳锰錶表錸铼錼镎鍀锝鍁锨鍆钔鍇锴鍈锳鍊炼鍋锅鍍镀鍔锷鍘铡鍚钖鍛锻鍠锽鍤锸鍥锲鍩锘鍬锹鍰锾鍵键鍶锶鍺锗鍼针鍾钟鎂镁鎊镑鎌镰鎔镕鎖锁鎘镉鎚锤鎛镈鎡镃鎢钨鎣蓥鎦镏鎧铠鎩铩鎪锼鎬镐鎭镇鎮镇鎰镒鎳镍鎵镓鎸镌鏃镞鏇旋鏈链鏌镆鏐镠鏑镝鏗铿鏘锵鏜镗鏝镘鏞镛鏟铲鏡镜鏢镖鏤镂鏨錾鏰镚鏵铧鏷镤鏹镪鏺䥽鏽锈鐃铙鐋铴鐐镣鐓镦鐔镡鐘钟鐙镫鐝镢鐠镨鐦锎鐧锏鐨镄鐫镌鐮镰鐯䦃鐲镯鐳镭鐵铁鐶镮鐸铎鐺铛鐿镱鑄铸鑊镬鑌镔鑑鉴鑒鉴鑔镲鑕锧鑞镴鑠铄鑣镳鑭镧鑰钥鑱镵鑲镶鑷镊鑹镩鑼锣鑽钻鑾銮鑿凿钁镢钂镋長长門门閂闩閃闪閆闫閉闭開开閌闶閎闳閏闰閑闲閒闲間间閔闵閘闸閡阂閣阁閤合閥阀閨闺閩闽閫阃閬阆閭闾閱阅閲阅閶阊閹阉閻阎閼阏閽阍閾阈閿阌闃阒闆板闇暗闈闱闊阔闋阕闌阑闍阇闐阗闒阘闓闿闔阖闕阙闖闯關关闞阚闡阐闢辟闥闼陘陉陝陕陞升陣阵陰阴陳陈陸陆陽阳隉陧隊队階阶隕陨際际隨随險险隱隐隴陇隸隶隻只雋隽雖虽雙双雛雏雜杂雞鸡離离難难雲云電电霑沾霧雾霽霁靂雳靄霭靆叇靈灵靉叆靚靓靜静靦腼靨靥鞏巩鞦秋鞽鞒韁缰韃鞑韆千韉鞯韋韦韌韧韍韨韓韩韙韪韜韬韝鞲韞韫韻韵響响頁页頂顶頃顷項项順顺頇顸須须頊顼頌颂頎颀頏颃預预頑顽頒颁頓顿頗颇領领頜颌頡颉頤颐頦颏頭头頰颊頲颋頷颔頸颈頹颓頻频頽颓顆颗題题額额顎颚顏颜顒颙顓颛顔颜願愿顙颡顛颠類类顢颟顥颢顧顾顫颤顯显顰颦顱颅顳颞顴颧風风颭飐颮飑颯飒颱台颳刮颶飓颸飔颺飏颼飕飄飘飆飙飛飞飢饥飩饨飪饪飫饫飭饬飯饭飱飧飲饮飴饴飼饲飽饱飾饰飿饳餃饺餄饸餅饼餈糍餉饷養养餌饵餎饹餏饻餑饽餒馁餓饿餘余餚肴餛馄餜馃餞饯餡馅館馆餬糊餱糇餳饧餵喂餷馇餼饩餾馏餿馊饁馌饃馍饅馒饈馐饉馑饊馓饋馈饌馔饑饥饒饶饗飨饜餍饞馋饢馕馬马馭驭馮冯馱驮馳驰馴驯馹驲駁驳駐驻駑驽駒驹駔驵駕驾駘骀駙驸駛驶駝驼駟驷駡骂駢骈駭骇駰骃駱骆駸骎駿骏騁骋騂骍騅骓騍骒騎骑騏骐騖骛騙骗騤骙騫骞騭骘騮骝騰腾騶驺騷骚騸骟騾骡驀蓦驁骜驂骖驃骠驄骢驅驱驊骅驌骕驍骁驏骣驕骄驗验驚惊驛驿驟骤驢驴驤骧驥骥驦骦驪骊驫骉骯肮髏髅髒脏體体髕髌髖髋髮发鬆松鬍胡鬚须鬢鬓鬥斗鬧闹鬨哄鬩阋鬮阄鬱郁鬹鬶魎魉魘魇魚鱼魛鱽魨鲀魯鲁魴鲂魷鱿鮁鲅鮃鲆鮊鲌鮋鲉鮍鲏鮎鲇鮐鲐鮑鲍鮒鲋鮓鲊鮚鲒鮜鲘鮝鲞鮞鲕鮣䲟鮦鲖鮪鲔鮫鲛鮭鲑鮮鲜鯀鲧鯁鲠鯇鲩鯉鲤鯊鲨鯒鲬鯔鲻鯕鲯鯖鲭鯗鲞鯛鲷鯝鲴鯡鲱鯢鲵鯤鲲鯧鲳鯨鲸鯪鲮鯫鲰鯷鳀鯽鲫鯿鳊鰂鲗鰃鳂鰆䲠鰈鲽鰉鳇鰍鳅鰏鲾鰐鳄鰓鳃鰛鳁鰜鳒鰟鳑鰣鲥鰥鳏鰧䲢鰨鳎鰩鳐鰭鳍鰮鳁鰱鲢鰲鳌鰳鳓鰷鲦鰹鲣鰺鲹鰻鳗鰼鳛鰾鳔鱂鳉鱅鳙鱈鳕鱉鳖鱒鳟鱔鳝鱖鳜鱗鳞鱘鲟鱝鲼鱟鲎鱠鲙鱣鳣鱧鳢鱨鲿鱭鲚鱷鳄鱸鲈鱺鲡鳥鸟鳧凫鳩鸠鳬凫鳲鸤鳳凤鳴鸣鳶鸢鳾䴓鴆鸩鴇鸨鴉鸦鴒鸰鴕鸵鴛鸳鴝鸲鴞鸮鴟鸱鴣鸪鴦鸯鴨鸭鴯鸸鴰鸹鴴鸻鴷䴕鴻鸿鴿鸽鵁䴔鵂鸺鵃鸼鵐鹀鵑鹃鵒鹆鵓鹁鵜鹈鵝鹅鵠鹄鵡鹉鵪鹌鵬鹏鵮鹐鵯鹎鵰雕鵲鹊鵾鹍鶄䴖鶇鸫鶉鹑鶊鹒鶓鹋鶖鹙鶘鹕鶚鹗鶡鹖鶥鹛鶩鹜鶪䴗鶬鸧鶯莺鶲鹟鶴鹤鶹鹠鶺鹡鶻鹘鶼鹣鶿鹚鷀鹚鷁鹢鷂鹞鷄鸡鷉䴘鷊鹝鷓鹧鷗鸥鷙鸷鷚鹨鷥鸶鷦鹪鷫鹔鷯鹩鷲鹫鷳鹇鷸鹬鷹鹰鷺鹭鸇鹯鸊䴙鸌鹱鸏鹲鸕鸬鸘鹴鸚鹦鸛鹳鸝鹂鸞鸾鹵卤鹹咸鹺鹾鹼碱鹽盐麗丽麥麦麩麸麪面麯曲麴曲麵面麼么麽么黃黄黌黉點点黨党黲黪黴霉黶黡黷黩黽黾黿鼋鼉鼍鼕冬鼴鼹齊齐齋斋齎赍齏齑齒齿齔龀齕龁齗龂齙龅齜龇齟龃齠龆齡龄齣出齦龈齧啮齪龊齬龉齲龋齶腭齷龌龍龙龐庞龑䶮龔龚龕龛龜龟";
let _map = null;
function simplifiedOf(ch) {
  if (!_map) {
    _map = /* @__PURE__ */ new Map();
    for (let i = 0; i + 1 < PAIRS.length; i += 2) _map.set(PAIRS[i], PAIRS[i + 1]);
  }
  return _map.get(ch);
}
const isHanzi = (c) => /[一-鿿]/.test(c);
const LYRIC_PUNCT = /[，。、；：！？…—,;:!?]/;
const PUNCT_FULL = { ",": "，", ";": "；", ":": "：", "!": "！", "?": "？", "（": "(", "）": ")" };
const normPunct = (ch) => PUNCT_FULL[ch] ?? ch;
const LYRIC_QUOTE_OPEN = /[“‘"'(（]/;
const LYRIC_QUOTE_CLOSE = /[”’)）]/;
const isLatin = (c) => /[A-Za-z]/.test(c);
const isApostrophe = (c) => /['’]/.test(c);
const isHyphen = (c) => /[-‐‑–—]/.test(c);
const SECTION_MARK_RE = /(intro|verse|chorus|pre-?chorus|bridge|coda|outro|ending|interlude|solo|refrain|tag)\d*/i;
const DYN_TOKEN_RE = /cresc|dim|ppp|pp|p|mp|mf|fff|ff|f/gi;
const CN_SECTION_MARK_RE = /[（(]\s*副\s*歌\s*[)）]|^[\s（(【\[]*副\s*歌[\s)）】\]：:]*$/;
const JUMP_MARK_RE = /(?<![A-Za-z])(D\s*[.,·]\s*[CS]\s*[.,·]?|D\s*[CS](?![A-Za-z])|Fine|To\s*Coda)/i;
const INLINE_JUMP_RE = /(?<![A-Za-z])(D\s*[.,·]\s*[CS]\s*[.,·]?|Fine|To\s*Coda)(?![A-Za-z])/i;
const JUMP_SPAN_RE = /^(D\s*[.,·]?\s*[CS]\s*[.,·]?(?:\s*al\s*[.,·]?\s*(?:Fine|Coda))?|Fine|To\s*Coda)/i;
const normalizeJump = (s) => {
  const t = s.replace(/\s|[.,·]/g, "").toUpperCase();
  if (t === "DC") return "D.C.";
  if (t === "DS") return "D.S.";
  if (t === "FINE") return "Fine";
  return "To Coda";
};
const VERSE_LABEL_RE = /^[\s(（[]*((?:\d[\s.．、,，/]*){1,4})/;
const CN_NUM = "一二三四五六七八九十";
const CN_LABEL_RE = new RegExp(`^[\\s(（[]*([${CN_NUM}])\\s*([、.．])`);
function parseVerseLabel(raw) {
  const cn = CN_LABEL_RE.exec(raw);
  if (cn) return (raw.slice(cn[0].length).match(/[一-鿿]/g) ?? []).length < 2 ? null : [CN_NUM.indexOf(cn[1]) + 1];
  const m = VERSE_LABEL_RE.exec(raw);
  if (!m) return null;
  const nums = [...m[1].replace(/\D/g, "")].map(Number).filter((n) => n >= 1);
  if (!nums.length || (raw.slice(m[0].length).match(/[一-鿿]/g) ?? []).length < 2) return null;
  return nums;
}
const FOOTER_CUE_RE = /(版权|版权所有|制作|团队|原版|音频|音頻|歌谱|歌譜|商业|商業|用途|翻印|请勿|請勿|仅供|僅供)/g;
const NOTE_HEAD_RE = /^[(（]\d{1,4}[)）]/;
const PINYIN_RE = /[(（][a-zü]*[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ][a-zü]*[)）]/;
const GLOSS_RE = /\d[.．、]?[一-鿿]{1,6}[:：]/;
function isFooterNoticeLine(text) {
  const compact = text.replace(/\s/g, "");
  if (NOTE_HEAD_RE.test(compact) || PINYIN_RE.test(compact) && GLOSS_RE.test(compact)) return true;
  if (compact.length < 8) return false;
  const cues = new Set(compact.match(FOOTER_CUE_RE) ?? []);
  return cues.size >= 2;
}
function mergeToChars(line, charH) {
  const sorted = [...line].sort((a, b) => a.bbox.x - b.bbox.x);
  const cells = [];
  const gap = charH * 0.28;
  const maxW = charH * 1.7;
  for (const c of sorted) {
    const b = c.bbox;
    const last = cells[cells.length - 1];
    if (last && b.x <= rright(last) + gap && rright(b) - last.x <= maxW) {
      const x = Math.min(last.x, b.x), y = Math.min(last.y, b.y);
      last.w = Math.max(rright(last), rright(b)) - x;
      last.h = Math.max(rbottom(last), rbottom(b)) - y;
      last.x = x;
      last.y = y;
    } else {
      cells.push({ ...b });
    }
  }
  return cells;
}
const STRIP_H = 48, STRIP_MAXW = 300;
const STRIP_PAD = 4;
function compactSegs(cells, maxGap) {
  const segs = [];
  let cx = 0;
  for (let i = 0; i < cells.length; i++) {
    const w = cells[i].w;
    segs.push({ cx0: cx, cx1: cx + w, sx0: cells[i].x, sw: w });
    cx += w;
    if (i < cells.length - 1) cx += Math.max(0, Math.min(cells[i + 1].x - (cells[i].x + w), maxGap));
  }
  return { segs, contentW: cx };
}
function fracToSrcXOf(cells, maxGap) {
  const { segs, contentW } = compactSegs(cells, maxGap);
  const stripW = contentW + STRIP_PAD * 2;
  return (xFrac) => {
    const cc = xFrac * stripW - STRIP_PAD;
    for (const sg of segs) if (cc <= sg.cx1) {
      const t = Math.max(0, Math.min(1, (cc - sg.cx0) / Math.max(1, sg.cx1 - sg.cx0)));
      return sg.sx0 + t * sg.sw;
    }
    const last = segs[segs.length - 1];
    return last.sx0 + last.sw;
  };
}
function buildStrip(src, cells, H = STRIP_H, maxGap = Infinity) {
  const y0 = Math.min(...cells.map((r) => r.y));
  const y1 = Math.max(...cells.map((r) => r.y + r.h));
  const { segs, contentW } = compactSegs(cells, maxGap);
  const sh = y1 - y0 + STRIP_PAD * 2;
  const sw = contentW + STRIP_PAD * 2;
  const scale = H / sh;
  const W = Math.max(1, Math.round(sw * scale));
  const out = createSurface(W, H);
  for (const sg of segs) {
    blit(
      out,
      src,
      { x: sg.sx0, y: y0 - STRIP_PAD, w: sg.sw, h: sh },
      { x: Math.round((sg.cx0 + STRIP_PAD) * scale), y: 0, w: Math.max(1, Math.round(sg.sw * scale)), h: H }
    );
  }
  return out;
}
function chunkCells(cells, maxGap = Infinity) {
  const n = cells.length;
  if (n <= 1) return n ? [cells] : [];
  const refH = median(cells.map((r) => r.h));
  const widthAtH = (rs) => {
    const y0 = Math.min(...rs.map((r) => r.y)), y1 = Math.max(...rs.map((r) => r.y + r.h));
    return compactSegs(rs, maxGap).contentW * STRIP_H / Math.max(y1 - y0, refH);
  };
  const k = Math.max(1, Math.ceil(widthAtH(cells) / STRIP_MAXW));
  if (k <= 1) return [cells];
  const target = widthAtH(cells) / k;
  const chunks = [];
  let cur = [];
  for (let i = 0; i < n; i++) {
    if (cur.length && widthAtH([...cur, cells[i]]) > STRIP_MAXW) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(cells[i]);
    const remainingChunks = k - chunks.length - 1;
    const remainingCells = n - 1 - i;
    if (remainingChunks > 0 && // 达均匀目标且剩余格够分给剩余块 → 关块；或剩余格数刚够每块留一个 → 必须关
    (widthAtH(cur) >= target && remainingCells > remainingChunks || remainingCells <= remainingChunks)) {
      chunks.push(cur);
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
function globalSlope(staff) {
  const slopes = [];
  for (const row of staff) {
    if (row.nums.length < 2) continue;
    let L = row.nums[0], R = row.nums[0];
    for (const n of row.nums) {
      if (n.bbox.x < L.bbox.x) L = n;
      if (rright(n.bbox) > rright(R.bbox)) R = n;
    }
    const dx = rcx(R.bbox) - rcx(L.bbox);
    if (Math.abs(dx) < 1) continue;
    const s = (rcy(R.bbox) - rcy(L.bbox)) / dx;
    if (Math.abs(s) < 0.5) slopes.push(s);
  }
  return slopes.length ? median(slopes) : 0;
}
function projectLine(bin, line, k, mergeGap, numH) {
  const w = bin.w, h = bin.h, data = bin.data;
  const x0 = Math.max(0, Math.min(...line.map((c) => c.bbox.x)));
  const x1 = Math.min(w - 1, Math.max(...line.map((c) => rright(c.bbox))));
  if (x1 <= x0) return [];
  const dyLo = Math.min(...line.map((c) => c.bbox.y - k * rcx(c.bbox))) - 2;
  const dyHi = Math.max(...line.map((c) => rbottom(c.bbox) - k * rcx(c.bbox))) + 2;
  const n = x1 - x0 + 1;
  const cnt = new Int32Array(n);
  const colTop = new Float64Array(n).fill(Infinity);
  const colBot = new Float64Array(n).fill(-Infinity);
  for (let x = x0; x <= x1; x++) {
    const yLo = Math.max(0, Math.round(dyLo + k * x));
    const yHi = Math.min(h - 1, Math.round(dyHi + k * x));
    const i = x - x0;
    for (let y = yLo; y <= yHi; y++) {
      if (data[y * w + x]) {
        cnt[i]++;
        const dyv = y - k * x;
        if (dyv < colTop[i]) colTop[i] = dyv;
        if (dyv > colBot[i]) colBot[i] = dyv;
      }
    }
  }
  const runs = [];
  let rs = -1;
  for (let i = 0; i < n; i++) {
    if (cnt[i] > 0) {
      if (rs < 0) rs = i;
    } else if (rs >= 0) {
      pushRun(rs, i - 1);
      rs = -1;
    }
  }
  if (rs >= 0) pushRun(rs, n - 1);
  function pushRun(a, b) {
    let t = Infinity, bo = -Infinity, ink = 0;
    for (let i = a; i <= b; i++) {
      ink += cnt[i];
      if (colTop[i] < t) t = colTop[i];
      if (colBot[i] > bo) bo = colBot[i];
    }
    if (b - a + 1 <= 3 && ink < numH * 0.5) return;
    runs.push({ x0: x0 + a, x1: x0 + b, dyTop: t, dyBot: bo });
  }
  const blocks = [];
  for (const r of runs) {
    const last = blocks[blocks.length - 1];
    const gap = last ? r.x0 - last.x1 : Infinity;
    if (last && gap < mergeGap) {
      last.x1 = r.x1;
      last.dyTop = Math.min(last.dyTop, r.dyTop);
      last.dyBot = Math.max(last.dyBot, r.dyBot);
    } else {
      blocks.push({ x0: r.x0, x1: r.x1, dyTop: r.dyTop, dyBot: r.dyBot, gapBefore: gap });
    }
  }
  return blocks;
}
function mergePunctBlocks(blocks, charW, longGap) {
  if (blocks.length < 2) return blocks;
  const out = blocks.map((b) => ({ ...b }));
  for (let i = out.length - 1; i >= 1; i--) {
    const b = out[i];
    if (b.x1 - b.x0 + 1 >= charW * 0.45) continue;
    if (b.gapBefore > longGap) continue;
    if (i !== out.length - 1 && out[i + 1].gapBefore <= longGap) continue;
    const p = out[i - 1];
    p.x1 = Math.max(p.x1, b.x1);
    p.dyTop = Math.min(p.dyTop, b.dyTop);
    p.dyBot = Math.max(p.dyBot, b.dyBot);
    out.splice(i, 1);
  }
  return out;
}
function mergeSplitHalves(blocks, charW, charH) {
  if (blocks.length < 2) return blocks;
  const out = [{ ...blocks[0] }];
  const w = (b) => b.x1 - b.x0 + 1;
  const tall = (b) => b.dyBot - b.dyTop >= charH * 0.8;
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i], p = out[out.length - 1];
    if (b.gapBefore < charW * 0.3 && Math.min(w(p), w(b)) < charW * 0.6 && tall(p) && tall(b) && b.x1 - p.x0 + 1 <= charW * 1.15) {
      probe("lyrics.splitHalves");
      p.x1 = b.x1;
      p.dyTop = Math.min(p.dyTop, b.dyTop);
      p.dyBot = Math.max(p.dyBot, b.dyBot);
    } else out.push({ ...b });
  }
  return out;
}
function mergeSmallTextBlocks(blocks, charW, charH) {
  if (blocks.length < 2) return blocks;
  const out = [{ ...blocks[0] }];
  const isSmall = (b) => b.dyBot - b.dyTop < charH * 0.8;
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i], p = out[out.length - 1];
    if (isSmall(b) && isSmall(p) && b.gapBefore < charW * 0.5) {
      p.x1 = b.x1;
      p.dyTop = Math.min(p.dyTop, b.dyTop);
      p.dyBot = Math.max(p.dyBot, b.dyBot);
    } else out.push({ ...b });
  }
  return out;
}
function blockRect(b, k) {
  const xc = (b.x0 + b.x1) / 2;
  const y = b.dyTop + k * xc, yb = b.dyBot + k * xc;
  return { x: b.x0, y, w: b.x1 - b.x0 + 1, h: Math.max(1, yb - y) };
}
function fillLeadingVerses(staff, copied) {
  const nv = Math.max(0, ...staff.map((r) => Math.max(0, ...r.nums.map((n) => n.lyrics?.length ?? 0))));
  if (nv < 2) return;
  const has = (row, v) => staff[row].nums.some((n) => (n.lyrics?.[v] ?? "") !== "");
  for (let v = 1; v < nv; v++) {
    const first = staff.findIndex((_, r) => has(r, v));
    if (first <= 0) continue;
    if (!has(first, 0)) continue;
    for (let r = 0; r < first; r++) {
      if (has(r, v) || !has(r, 0)) continue;
      for (const n of staff[r].nums) {
        const t = n.lyrics?.[0];
        if (t) {
          (n.lyrics ??= [])[v] = t;
          copied?.(n, 0, v);
        }
      }
    }
  }
}
async function simplifyStrayTraditional(ocr, strips, mainIdx, textOf, setChar) {
  if (!ocr.rankTextChars) return;
  let trad = 0, simp = 0;
  const hits = [];
  for (const s of mainIdx) {
    let any = false;
    for (const ch of textOf(s)) {
      if (!/[\u3400-\u4dbf\u4e00-\u9fff]/.test(ch)) continue;
      if (simplifiedOf(ch)) {
        trad++;
        any = true;
      } else simp++;
    }
    if (any) hits.push(s);
  }
  if (!trad || trad > 2 || simp < trad * 10) return;
  const ranked = await ocr.rankTextChars(hits.map((s) => strips[s]));
  hits.forEach((s, i) => {
    const alt = ranked[i];
    const text = textOf(s);
    if (!alt || alt.length !== [...text].length) return;
    [...text].forEach((ch, k) => {
      const sc = simplifiedOf(ch);
      if (!sc || !alt[k].alts.includes(sc)) return;
      probe("lyrics.tradToSimp");
      setChar(s, k, sc);
    });
  });
}
const noHooks = { rankAlts: async (reqs) => reqs.map(() => null), regionOf: () => void 0 };
async function recognizeLyrics(bin, comps, staff, numH, ocr, headerRegions) {
  const regions = [];
  if (!ocr.recognizeTexts || !staff.length) return { lyrics: regions, chords: [], hooks: noHooks };
  const charMin = numH * 0.5;
  const src = surfaceFromBinary(bin);
  const chunks = [];
  const strips = [];
  const TR = globalThis.__lyricTrace;
  const k = globalSlope(staff);
  const dcy = (c) => c.cy - k * c.cx;
  const dTop = (nums) => Math.min(...nums.map((n) => n.bbox.y - k * rcx(n.bbox)));
  const dBot = (nums) => Math.max(...nums.map((n) => rbottom(n.bbox) - k * rcx(n.bbox)));
  if (TR) {
    TR.numH = numH;
    TR.charMin = charMin;
    TR.slope = k;
    TR.rows = [];
  }
  const rowTops = staff.filter((r) => r.nums.length).map((r) => dTop(r.nums));
  const rowPitch = rowTops.length >= 2 ? median(rowTops.slice(1).map((t, j) => t - rowTops[j])) : 0;
  const noteRules = comps.filter((c) => c.bbox.w >= bin.w * 0.5 && c.bbox.h <= Math.max(3, numH * 0.3)).map((c) => c.bbox.y);
  const capRows = /* @__PURE__ */ new Set();
  for (let i = -1; i < staff.length; i++) {
    const row = staff[Math.max(0, i)];
    if (!row.nums.length) continue;
    const above = i < 0;
    const yTop = above ? Math.max(0, dTop(row.nums) - numH * 3.5) : dBot(row.nums) + numH * 0.15;
    const nextTop = i + 1 < staff.length && staff[i + 1].nums.length ? dTop(staff[i + 1].nums) : void 0;
    const segEnd = row.system === void 0 && nextTop !== void 0 && rowPitch > 0 && nextTop - dTop(row.nums) > rowPitch * 3;
    if (!above && (segEnd || nextTop === void 0)) capRows.add(i);
    const yBot = above ? dTop(row.nums) - numH * 0.15 : nextTop !== void 0 && !segEnd ? nextTop - numH * 0.15 : rowPitch > 0 ? dTop(row.nums) + rowPitch - numH * 0.15 : Infinity;
    const rule = above ? void 0 : noteRules.filter((y) => y > row.bottomY).sort((a, b) => a - b)[0];
    const yBotR = rule !== void 0 && rule < yBot + numH * 3 ? Math.min(yBot, rule - numH * 0.15) : yBot;
    if (yBotR - yTop < charMin) continue;
    const inBand = (c) => {
      const y = dcy(c);
      return y >= yTop && y <= yBotR;
    };
    const barLike = (b) => b.h > numH * 3 || b.h > numH * 1.8 && b.w < b.h * 0.25;
    const band = comps.filter((c) => {
      const b = c.bbox;
      return inBand(c) && b.h >= charMin && b.w >= charMin * 0.4 && !barLike(b);
    });
    if (!band.length) continue;
    const lines = clusterByY(band, dcy, numH * 0.7);
    for (const c of comps) {
      const b = c.bbox;
      if (!inBand(c) || b.h >= charMin || b.h < 2 || b.w < charMin * 0.6) continue;
      const ln = findLineByY(lines, dcy, dcy(c), numH * 0.45);
      if (ln) ln.push(c);
    }
    for (const c of comps) {
      const b = c.bbox;
      if (!inBand(c) || b.h >= charMin || b.h < 3 || b.w >= numH * 0.8) continue;
      const ln = findLineByY(lines, dcy, dcy(c), numH * 0.9);
      if (!ln) continue;
      const lx0 = Math.min(...ln.map((k2) => k2.bbox.x)), lx1 = Math.max(...ln.map((k2) => rright(k2.bbox)));
      if (c.cx > lx1 && c.cx <= lx1 + numH * 1.1 || c.cx < lx0 && c.cx >= lx0 - numH * 1.1) ln.push(c);
    }
    const mergeGap = numH * 0.22;
    const lineBlocks = lines.map((ln) => projectLine(bin, ln, k, mergeGap, numH));
    const allBlocks = lineBlocks.flat();
    const widths = allBlocks.map((b) => b.x1 - b.x0 + 1).filter((w) => w >= numH * 0.4 && w <= numH * 1.8);
    const charW = median(widths) || numH;
    const candH = allBlocks.filter((b) => {
      const w = b.x1 - b.x0 + 1;
      return w >= charW * 0.7 && w <= charW * 1.3;
    }).map((b) => b.dyBot - b.dyTop);
    const charH = median(candH) || charW;
    const longGap = charW * 0.6;
    const maxGap = charW * 0.35;
    const mergedBlocks = lineBlocks.map((blocks) => mergeSmallTextBlocks(mergePunctBlocks(mergeSplitHalves(blocks, charW, charH), charW, longGap), charW, charH));
    if (TR) TR.charW = charW;
    const noteX0 = Math.min(...row.nums.map((n) => n.bbox.x));
    const noteX1 = Math.max(...row.nums.map((n) => rright(n.bbox)));
    const noteSpan = Math.max(1, noteX1 - noteX0);
    const endingSpans = [];
    {
      let s = -1;
      for (const n of row.nums) {
        if (n.endingStart !== void 0) s = n.bbox.x;
        if (n.endingStop !== void 0 && s >= 0) {
          endingSpans.push([s, rright(n.bbox)]);
          s = -1;
        }
      }
    }
    const covOf = (lx0, lx1) => {
      let best = Math.max(0, Math.min(lx1, noteX1) - Math.max(lx0, noteX0)) / noteSpan;
      for (const [a, b] of endingSpans) {
        const ov = Math.min(lx1, b) - Math.max(lx0, a);
        if (ov <= 0 || ov < (lx1 - lx0) * 0.8) continue;
        best = Math.max(best, ov / Math.max(1, b - a));
      }
      return best;
    };
    const tallMin = charH * 0.5;
    const lineInfo = mergedBlocks.map((blocks) => {
      const cells = blocks.map((b) => blockRect(b, k));
      const longGapBefore = blocks.map((b) => b.gapBefore > longGap);
      const lx0 = cells.length ? Math.min(...cells.map((c) => c.x)) : 0;
      const lx1 = cells.length ? Math.max(...cells.map((c) => rright(c))) : 0;
      return {
        cells,
        longGapBefore,
        cov: cells.length ? covOf(lx0, lx1) : 0,
        h: median(cells.map((c) => c.h)),
        tall: cells.filter((c) => c.h >= tallMin).length
      };
    });
    const maxCov = Math.max(0, ...lineInfo.map((L) => L.cov));
    const kept = lineInfo.filter((L) => L.cells.length && L.h >= charH * 0.6 && (L.cov >= maxCov - 1e-9 || L.cov >= 0.35));
    const rowT = TR ? {
      rowIdx: i,
      yTop,
      yBot,
      charH,
      bandBoxes: band.map((c) => c.bbox),
      noteBoxes: row.nums.map((n) => n.bbox),
      verses: []
    } : null;
    if (TR && rowT) TR.rows.push(rowT);
    for (const L of lineInfo) {
      if (kept.includes(L) || !L.cells.length) continue;
      const cells = L.tall >= 2 ? L.cells.filter((c) => c.h >= tallMin) : L.cells.length <= 5 ? L.cells : null;
      if (!cells?.length) continue;
      chunks.push({ rowIdx: i, verse: -1, cells, maxGap, mark: true, above });
      strips.push(buildStrip(src, cells, STRIP_H, maxGap));
      if (TR) {
        const x0 = Math.min(...cells.map((r) => r.x)), y0 = Math.min(...cells.map((r) => r.y));
        const x1 = Math.max(...cells.map((r) => rright(r))), y1 = Math.max(...cells.map((r) => rbottom(r)));
        (TR.chunks ??= []).push({ rowIdx: i, verse: -1, cells, crop: { x: x0 - 4, y: y0 - 4, w: x1 - x0 + 8, h: y1 - y0 + 8 }, maxGap });
      }
    }
    kept.forEach(({ cells, longGapBefore, cov }, verse) => {
      if (rowT) rowT.verses.push({ verse, cells, cov, longGapBefore });
      let body = cells;
      const c0 = cells[0], c1 = cells[1];
      if (!above && c1 && rright(c0) < row.nums[0].bbox.x && c1.x - rright(c0) >= c1.h * 0.5) {
        chunks.push({ rowIdx: i, verse, cells: [c0], maxGap, margin: true });
        strips.push(buildStrip(src, [c0], STRIP_H, maxGap));
        body = cells.slice(1);
      }
      for (const chunkCellsArr of chunkCells(body, maxGap)) {
        chunks.push({ rowIdx: i, verse, cells: chunkCellsArr, maxGap, above });
        strips.push(buildStrip(src, chunkCellsArr, STRIP_H, maxGap));
        if (TR) {
          const x0 = Math.min(...chunkCellsArr.map((r) => r.x)), y0 = Math.min(...chunkCellsArr.map((r) => r.y));
          const x1 = Math.max(...chunkCellsArr.map((r) => rright(r))), y1 = Math.max(...chunkCellsArr.map((r) => rbottom(r)));
          (TR.chunks ??= []).push({ rowIdx: i, verse, cells: chunkCellsArr, crop: { x: x0 - 4, y: y0 - 4, w: x1 - x0 + 8, h: y1 - y0 + 8 }, maxGap });
        }
      }
    });
  }
  if (!strips.length) return { lyrics: regions, chords: [], hooks: noHooks };
  const posMode = !!ocr.recognizeTextsPos;
  const recPos = ocr.recognizeTextsPos?.bind(ocr);
  const mainIdx = [], aboveIdx = [], marginIdx = [];
  chunks.forEach((c, i) => (c.above ? aboveIdx : c.margin ? marginIdx : mainIdx).push(i));
  const textsPos = posMode ? new Array(chunks.length) : null;
  const texts = posMode ? null : new Array(chunks.length);
  for (const idxs of [mainIdx, aboveIdx, marginIdx]) {
    if (!idxs.length) continue;
    const st = idxs.map((i) => strips[i]);
    if (textsPos) {
      const r = await recPos(st);
      idxs.forEach((ci, k2) => {
        textsPos[ci] = r[k2];
      });
    } else {
      const r = await ocr.recognizeTexts(st);
      idxs.forEach((ci, k2) => {
        texts[ci] = r[k2];
      });
    }
  }
  await simplifyStrayTraditional(
    ocr,
    strips,
    mainIdx,
    (s) => textsPos ? textsPos[s].map((c) => c.ch).join("") : texts[s],
    (s, k2, ch) => {
      if (textsPos) textsPos[s][k2].ch = ch;
      else texts[s] = [...texts[s]].map((c, i) => i === k2 ? ch : c).join("");
    }
  );
  if (TR) TR.recPerChunk = textsPos ?? texts.map((s) => [...s].map((ch) => ({ ch, xFrac: 0 })));
  const perLine = /* @__PURE__ */ new Map();
  const rawByKey = /* @__PURE__ */ new Map();
  const lineSeen = /* @__PURE__ */ new Set();
  const marginNote = /* @__PURE__ */ new Set();
  const marginLabel = /* @__PURE__ */ new Map();
  const marginText = (s) => (textsPos ? textsPos[s].map((c) => c.ch).join("") : texts[s]).replace(/[\s()（）]/g, "").replace(/^[-‐‑–—]$/, "一");
  const cnMarginPage = chunks.some((c, s) => c.margin && marginText(s).length === 1 && CN_NUM.includes(marginText(s)));
  const marks = [];
  const dynMarks = [];
  const jumps = [];
  const chordCands = /* @__PURE__ */ new Map();
  const rawTexts = [];
  for (let s = 0; s < chunks.length; s++) {
    const { rowIdx, verse, cells, mark, above } = chunks[s];
    const raw0 = textsPos ? textsPos[s].map((c) => c.ch).join("") : texts[s];
    let rawText = raw0;
    const notes0 = rowIdx >= 0 ? staff[rowIdx].nums : [];
    if (chunks[s].margin) {
      const bare = cnMarginPage && marginText(s) === "1" ? "一" : marginText(s);
      if (/[一-鿿]/.test(bare)) {
        probe("lyrics.marginNote");
        marginNote.add(s);
        if (bare.length === 1 && CN_NUM.includes(bare)) marginLabel.set(`${rowIdx}:${verse}`, bare);
        continue;
      }
    }
    const beforeFirstNote = notes0.length > 0 && rright(cells[cells.length - 1]) < rcx(notes0[0].bbox);
    if (!above && !beforeFirstNote && /^[-‐‑–—1]$/.test(rawText.trim())) {
      rawText = "一";
      if (textsPos) textsPos[s] = textsPos[s].map((c) => ({ ...c, ch: "一" }));
    }
    rawTexts[s] = rawText;
    if (!mark) rawByKey.set(`${rowIdx}:${verse}`, (rawByKey.get(`${rowIdx}:${verse}`) ?? "") + raw0);
  }
  const chordKeys = new Set([...rawByKey.keys()].filter((k2) => isAnnotationLine(rawByKey.get(k2))));
  for (let s = 0; s < chunks.length; s++) {
    if (marginNote.has(s)) continue;
    const { rowIdx, verse, cells, maxGap } = chunks[s];
    const key = `${rowIdx}:${verse}`;
    const isFirstChunk = !lineSeen.has(key);
    lineSeen.add(key);
    const fracToSrcX = fracToSrcXOf(cells, maxGap);
    const rawText = rawTexts[s];
    let labelEnd = 0;
    {
      const cn = isFirstChunk && rowIdx >= 0 ? CN_LABEL_RE.exec(rawText) : null;
      const first = rowIdx >= 0 ? staff[rowIdx].nums[0] : void 0;
      if (cn && first) {
        const lx = textsPos ? fracToSrcX(textsPos[s][0]?.xFrac ?? 0) : cells[0].x;
        if (lx < rcx(first.bbox)) labelEnd = cn[0].length;
      }
      const tp = textsPos?.[s];
      if (!labelEnd && isFirstChunk && first && tp && tp.length >= 2 && CN_NUM.includes(tp[0].ch)) {
        const x0 = fracToSrcX(tp[0].xFrac), x1 = fracToSrcX(tp[1].xFrac);
        if (x0 < first.bbox.x - numH * 0.5 && Math.abs(x1 - first.bbox.x) < numH * 0.8) {
          probe("lyrics.bareCnLabel");
          labelEnd = 1;
        }
      }
    }
    if (!chunks[s].above) {
      {
        const skip = (ch) => !ch.trim() || /[.,·•'`]/.test(ch);
        const t = [...rawText].filter((ch) => !skip(ch)).join("");
        const toks = [...t.matchAll(DYN_TOKEN_RE)];
        if (t && toks.length && toks.reduce((a, m) => a + m[0].length, 0) === t.length) {
          for (const m of toks) {
            let acc = 0, xf = 0;
            if (textsPos) for (const c of textsPos[s]) {
              if (skip(c.ch)) continue;
              if (acc >= m.index) {
                xf = c.xFrac;
                break;
              }
              acc += c.ch.length;
            }
            const name = m[0].toLowerCase();
            dynMarks.push({ rowIdx, name: /^(cresc|dim)/.test(name) ? name + "." : name, x: textsPos ? fracToSrcX(xf) : cells[0].x });
          }
        }
      }
      const cnHit = CN_SECTION_MARK_RE.exec(rawText);
      const hit = cnHit ?? SECTION_MARK_RE.exec(rawText);
      if (hit) {
        let acc = 0, xf = 0;
        if (textsPos) for (const c of textsPos[s]) {
          if (acc >= hit.index) {
            xf = c.xFrac;
            break;
          }
          acc += c.ch.length;
        }
        const word = cnHit ? "(副歌)" : hit[0][0].toUpperCase() + hit[0].slice(1).toLowerCase();
        marks.push({ rowIdx, word, x: textsPos ? fracToSrcX(xf) : cells[0].x });
      }
    }
    let jumpSpan = null;
    if (!chunks[s].above) {
      const hit = (/[一-鿿]/.test(rawText) ? INLINE_JUMP_RE : JUMP_MARK_RE).exec(rawText);
      if (hit) {
        let acc = 0, xf = 0;
        if (textsPos) for (const c of textsPos[s]) {
          if (acc >= hit.index) {
            xf = c.xFrac;
            break;
          }
          acc += c.ch.length;
        }
        const jy = (Math.min(...cells.map((c) => c.y)) + Math.max(...cells.map((c) => rbottom(c)))) / 2;
        if (!chordKeys.has(key)) jumps.push({ rowIdx, word: normalizeJump(hit[0]), x: textsPos ? fracToSrcX(xf) : cells[0].x, y: jy, key });
        const span = JUMP_SPAN_RE.exec(rawText.slice(hit.index));
        jumpSpan = [hit.index, hit.index + (span?.[0].length ?? hit[0].length)];
      }
    }
    const isChordChunk = chordKeys.has(key) || chunks[s].mark === true && !jumpSpan && isAnnotationLine(rawText);
    if (isChordChunk) {
      const by0 = Math.min(...cells.map((c) => c.y)), by1 = Math.max(...cells.map((c) => rbottom(c)));
      const bx0 = Math.min(...cells.map((c) => c.x)), bx1 = Math.max(...cells.map((c) => rright(c)));
      const inHeader = (headerRegions ?? []).some((hr) => {
        const h = hr.bbox;
        return by0 < h.y + h.h && by1 > h.y && bx0 < h.x + h.w && bx1 > h.x;
      });
      const srcXAt = (idx) => {
        if (!textsPos) return cells[0].x;
        let acc = 0;
        for (const c of textsPos[s]) {
          if (acc >= idx) return fracToSrcX(c.xFrac);
          acc += c.ch.length;
        }
        return fracToSrcX(1);
      };
      const cands = inHeader ? [] : chordCandidates(rawText, srcXAt, (x0, x1) => ({ x: x0, y: by0, w: x1 - x0, h: by1 - by0 }));
      if (cands.length) chordCands.set(rowIdx, [...chordCands.get(rowIdx) ?? [], ...cands]);
    }
    if (chunks[s].mark) continue;
    if (rowIdx < 0) continue;
    if (!perLine.has(key)) perLine.set(key, []);
    const placed = perLine.get(key);
    const cy0 = Math.min(...cells.map((c) => c.y)), cy1 = Math.max(...cells.map((c) => rbottom(c)));
    const charW = median(cells.map((c) => c.w)) || cy1 - cy0;
    if (posMode) {
      let lead = "";
      let pend = null;
      const flushLatin = () => {
        if (!pend) return;
        const text = lead + pend.text;
        lead = "";
        const w = Math.max(1, pend.x1 - pend.x0) + (cy1 - cy0) * 0.6;
        const region = { text, bbox: { x: pend.x0, y: cy0, w, h: cy1 - cy0 } };
        placed.push({ x: pend.x0, ch: text, region });
        regions.push(region);
        pend = null;
      };
      let at = 0;
      for (const [ti, { ch, xFrac }] of textsPos[s].entries()) {
        const pos = at;
        at += ch.length;
        if (pos < labelEnd) continue;
        if (jumpSpan && pos >= jumpSpan[0] && pos < jumpSpan[1]) {
          flushLatin();
          continue;
        }
        const sx = fracToSrcX(xFrac);
        if (isHanzi(ch)) {
          flushLatin();
          const text = lead + ch;
          lead = "";
          const region = { text, bbox: { x: sx - charW / 2, y: cy0, w: charW, h: cy1 - cy0 } };
          placed.push({ x: sx, ch: text, region, src: { s, k: ti } });
          regions.push(region);
        } else if (isLatin(ch) || pend && isApostrophe(ch)) {
          if (pend && sx - pend.x1 > charW * 0.5) flushLatin();
          if (!pend) pend = { text: "", x0: sx, x1: sx };
          pend.text += ch;
          pend.x1 = sx;
        } else if (isHyphen(ch)) {
          if (pend) {
            pend.text += "-";
            pend.x1 = sx;
            flushLatin();
          }
        } else if (LYRIC_QUOTE_OPEN.test(ch) && !pend) {
          lead += normPunct(ch);
        } else if (LYRIC_PUNCT.test(ch) || LYRIC_QUOTE_CLOSE.test(ch)) {
          const p = normPunct(ch);
          if (pend) {
            pend.text += p;
            pend.x1 = sx;
          } else if (placed.length) {
            placed[placed.length - 1].ch += p;
            if (regions.length) regions[regions.length - 1].text += p;
          }
        }
      }
      flushLatin();
    } else {
      const toks = [];
      let lead = "";
      let pend = "";
      const flushLatin = () => {
        if (pend) {
          toks.push(lead + pend);
          lead = "";
          pend = "";
        }
      };
      let at = 0;
      for (const ch of texts[s]) {
        const pos = at;
        at += ch.length;
        if (pos < labelEnd) continue;
        if (jumpSpan && pos >= jumpSpan[0] && pos < jumpSpan[1]) {
          flushLatin();
          continue;
        }
        if (isHanzi(ch)) {
          flushLatin();
          toks.push(lead + ch);
          lead = "";
        } else if (isLatin(ch) || pend && isApostrophe(ch)) pend += ch;
        else if (isHyphen(ch)) {
          if (pend) {
            pend += "-";
            flushLatin();
          }
        } else if (LYRIC_QUOTE_OPEN.test(ch) && !pend) lead += normPunct(ch);
        else if (LYRIC_PUNCT.test(ch) || LYRIC_QUOTE_CLOSE.test(ch)) {
          if (pend) pend += normPunct(ch);
          else if (toks.length) toks[toks.length - 1] += normPunct(ch);
        }
      }
      flushLatin();
      if (!toks.length) continue;
      let mapCells = cells;
      const notes0 = staff[rowIdx].nums;
      if (isFirstChunk && cells.length > 1 && notes0.length && rright(cells[0]) < rcx(notes0[0].bbox)) mapCells = cells.slice(1);
      for (let j = 0; j < toks.length; j++) {
        const ci = toks.length === mapCells.length ? j : Math.min(mapCells.length - 1, Math.floor(j * mapCells.length / toks.length));
        const region = { text: toks[j], bbox: mapCells[ci] };
        placed.push({ x: rcx(mapCells[ci]), ch: toks[j], region });
        regions.push(region);
      }
    }
  }
  const dropped = /* @__PURE__ */ new Set();
  {
    const sig = (t) => [...t].filter((c) => isHanzi(c) || /[A-Za-z0-9]/.test(c));
    const allSig = [...rawByKey].filter(([k2]) => !k2.startsWith("-1:") && !chordKeys.has(k2)).flatMap(([, t]) => sig(t));
    const hanPage = allSig.length >= 20 && allSig.filter(isHanzi).length >= allSig.length * 0.6;
    const junkLine = (t) => {
      const cs = sig(t), han = cs.filter((c) => isHanzi(c) && c !== "一").length;
      return cs.length >= 3 && han < cs.length * 0.3 || cs.length >= 1 && cs.length <= 2 && han === 0;
    };
    const LABEL_HEAD = /^[\s/]*[(（]?([一二])[)）]?[.、．]?/;
    const stanzaFrom = /* @__PURE__ */ new Map();
    for (const r of capRows) {
      const nNotes = staff[r]?.nums.filter((n) => n.digit !== 0).length ?? 0;
      const hanN = (t) => [...t].filter(isHanzi).length;
      const labeled0 = LABEL_HEAD.test(rawByKey.get(`${r}:0`) ?? "");
      for (let v = 1; rawByKey.has(`${r}:${v}`); v++) {
        const raw = rawByKey.get(`${r}:${v}`);
        const m = labeled0 ? null : LABEL_HEAD.exec(raw);
        const tooLong = nNotes > 0 && hanN(raw) > Math.max(nNotes * 1.5, hanN(rawByKey.get(`${r}:0`) ?? "") * 1.5);
        const lastOfLast = r === staff.length - 1 && !rawByKey.has(`${r}:${v + 1}`);
        const loneVerse = (staff.length >= 3 || staff.length === 2 && lastOfLast) && hanN(raw) >= 4 && ![...rawByKey.keys()].some((k2) => {
          const [r2, v2] = k2.split(":").map(Number);
          const t2 = rawByKey.get(k2);
          return r2 !== r && r2 >= 0 && v2 === v && !chordKeys.has(k2) && !(hanPage && junkLine(t2)) && sig(t2).length >= 2;
        });
        if (m && m[1] !== "一" || tooLong || loneVerse) {
          stanzaFrom.set(r, v);
          probe(tooLong ? "lyrics.stanzaInBandLong" : loneVerse ? "lyrics.stanzaInBandLone" : "lyrics.stanzaInBand");
          break;
        }
      }
    }
    const inStanza = (k2) => {
      const [r, v] = k2.split(":").map(Number);
      return stanzaFrom.has(r) && v >= stanzaFrom.get(r);
    };
    const dropKeys = [...perLine.keys()].filter((k2) => chordKeys.has(k2) || inStanza(k2) || isFooterNoticeLine(rawByKey.get(k2) ?? "") || hanPage && junkLine(rawByKey.get(k2) ?? "") && (probe("lyrics.junkLine"), true));
    for (const k2 of dropKeys) {
      for (const p of perLine.get(k2)) if (p.region) dropped.add(p.region);
      perLine.delete(k2);
      rawByKey.delete(k2);
    }
    if (dropKeys.length) {
      const byRow = /* @__PURE__ */ new Map();
      for (const k2 of perLine.keys()) {
        const [rowIdx, verse] = k2.split(":").map(Number);
        let vs = byRow.get(rowIdx);
        if (!vs) byRow.set(rowIdx, vs = []);
        vs.push(verse);
      }
      const renamed = /* @__PURE__ */ new Map();
      for (const [rowIdx, verses] of byRow) {
        verses.sort((a, b) => a - b);
        verses.forEach((v, nv) => renamed.set(`${rowIdx}:${nv}`, perLine.get(`${rowIdx}:${v}`)));
      }
      perLine.clear();
      for (const [k2, v] of renamed) perLine.set(k2, v);
    }
  }
  for (const mk of marks) {
    const row = staff[mk.rowIdx + 1];
    if (!row?.nums.length) continue;
    let bi = row.nums.findIndex((nn) => rcx(nn.bbox) >= mk.x - numH * 0.5);
    if (bi < 0) bi = 0;
    const barX = row.barlineXs.filter((x) => x < rcx(row.nums[bi].bbox)).pop() ?? -Infinity;
    while (bi > 0 && rcx(row.nums[bi - 1].bbox) > barX) bi--;
    row.nums[bi].sectionMark = mk.word;
  }
  for (const mk of dynMarks) {
    const row = staff[mk.rowIdx + 1];
    if (!row?.nums.length) continue;
    let best = row.nums[0];
    for (const nn of row.nums) if (Math.abs(rcx(nn.bbox) - mk.x) < Math.abs(rcx(best.bbox) - mk.x)) best = nn;
    probe("lyrics.dynamic");
    (best.dynamics ??= []).push(mk.name);
  }
  const chordRegions = [];
  for (const [rowIdx, cands] of chordCands) {
    const row = staff[rowIdx + 1];
    if (row) placeChords(row, cands, chordRegions);
  }
  {
    const bars = staff.reduce((a, r) => a + r.barlineXs.length, 0);
    const chordN = staff.reduce((a, r) => a + r.nums.filter((n) => n.chord).length, 0);
    if (bars >= 4 && chordN < bars * 0.4) {
      for (const r of staff) for (const n of r.nums) {
        delete n.chord;
        delete n.chordOffset;
        delete n.extraChords;
      }
      chordRegions.length = 0;
    }
  }
  for (const jp of jumps) {
    let rowIdx = jp.rowIdx;
    const cur = staff[rowIdx], next = staff[rowIdx + 1];
    if (cur && next && next.topY - jp.y < jp.y - cur.bottomY) rowIdx += 1;
    const row = staff[rowIdx];
    if (!row?.nums.length) continue;
    let bi = row.nums.length - 1;
    while (bi > 0 && rcx(row.nums[bi].bbox) > jp.x) bi--;
    row.nums[bi].jumpMark = jp.word;
  }
  {
    const rowsWithText = /* @__PURE__ */ new Map();
    for (const [key, placed] of perLine) {
      if (!placed.length) continue;
      const [rowIdx, verse] = key.split(":").map(Number);
      let s = rowsWithText.get(verse);
      if (!s) rowsWithText.set(verse, s = /* @__PURE__ */ new Set());
      s.add(rowIdx);
    }
    const primary = Math.max(0, ...[...rowsWithText.values()].map((s) => s.size));
    const primaryVerse = [...rowsWithText.entries()].sort((a, b) => b[1].size - a[1].size)[0]?.[0] ?? 0;
    const chars = /* @__PURE__ */ new Map();
    for (const [key, placed] of perLine) chars.set(key, placed.reduce((a, p) => a + p.ch.length, 0));
    const real = /* @__PURE__ */ new Set();
    for (const key of perLine.keys()) {
      const [rowIdx, verse] = key.split(":").map(Number);
      if ((rowsWithText.get(verse)?.size ?? 0) * 2 >= primary) {
        real.add(verse);
        continue;
      }
      const ref = chars.get(`${rowIdx}:${primaryVerse}`) ?? 0;
      if (ref > 0 && (chars.get(key) ?? 0) >= ref * 0.6) real.add(verse);
    }
    for (const key of [...perLine.keys()]) {
      if (!real.has(Number(key.split(":")[1]))) perLine.delete(key);
    }
  }
  const verseLabels = /* @__PURE__ */ new Map();
  const filledLabel = /* @__PURE__ */ new Set();
  {
    const seen = /* @__PURE__ */ new Set();
    for (const [key, raw] of rawByKey) {
      const [rowIdx, verse] = key.split(":").map(Number);
      if (rowIdx < 0) continue;
      if (seen.has(verse)) continue;
      seen.add(verse);
      const cnMargin = marginLabel.get(key);
      const nums = parseVerseLabel(raw) ?? (cnMargin ? [CN_NUM.indexOf(cnMargin) + 1] : null);
      if (nums) {
        probe("lyrics.verseLabel");
        verseLabels.set(verse, nums);
      }
    }
    if (verseLabels.size >= 2 && [...verseLabels].every(([v, ns]) => ns.length === 1 && ns[0] === v + 1)) {
      const labelRow = [...rawByKey.keys()].map((k2) => k2.split(":").map(Number)).find(([r, v]) => r >= 0 && verseLabels.has(v))?.[0];
      for (const key of rawByKey.keys()) {
        const [rowIdx, v] = key.split(":").map(Number);
        if (rowIdx !== labelRow || verseLabels.has(v) || !perLine.has(key)) continue;
        probe("lyrics.verseLabelFill");
        verseLabels.set(v, [v + 1]);
        filledLabel.add(key);
      }
    }
    const all = [...verseLabels.values()].flat();
    const ok = verseLabels.size >= 2 && verseLabels.get(0)?.[0] === 1 && new Set(all).size === all.length;
    if (!ok) verseLabels.clear();
    if (globalThis.__omrDebug) {
      console.log(
        "[lyrics/verse-label]",
        ok ? "apply" : "ignore",
        [...verseLabels].map(([v, ns]) => `${v}->${ns.join(",")}`).join(" ")
      );
    }
  }
  const versesOf = (v) => verseLabels.get(v) ?? [v + 1];
  if (verseLabels.size) {
    for (const [key, raw] of rawByKey) {
      const [rowIdx, visual] = key.split(":").map(Number);
      const cnMargin = marginLabel.get(key);
      const filled = filledLabel.has(key);
      if (rowIdx < 0 || !perLine.has(key) || !(parseVerseLabel(raw) || cnMargin || filled)) continue;
      const targets = versesOf(visual);
      const row = staff[rowIdx];
      const cn = filled ? null : CN_LABEL_RE.exec(raw);
      const undotted = (r) => /^\s*\d(?![\d.．、,，])/.test(r);
      const dotted = (filled ? ![...rawByKey].some(([k2, r]) => k2.split(":")[0] === String(rowIdx) && parseVerseLabel(r) && undotted(r)) : !undotted(raw)) || targets.length > 1;
      (row.lyricLabels ??= [])[targets[0] - 1] = cn ? cn[1] + cn[2] : cnMargin ?? targets.map((n) => dotted ? `${n}.` : `${n}`).join("");
    }
  }
  if (TR) {
    TR.placed = {};
    for (const [k2, p] of perLine) TR.placed[k2] = p.map(({ x, ch }) => ({ x, ch }));
  }
  const charSrc = /* @__PURE__ */ new Map();
  const srcsOf = (n, v) => {
    let per = charSrc.get(n);
    if (!per) charSrc.set(n, per = []);
    return per[v] ??= [];
  };
  for (const [key, placed] of perLine) {
    const [rowIdx, visual] = key.split(":").map(Number);
    const targets = versesOf(visual);
    const verse = targets[0] - 1;
    const notes = staff[rowIdx].nums;
    if (!notes.length) continue;
    placed.sort((a, b) => a.x - b.x);
    const M = placed.length;
    let ni = 0;
    const restHits = [];
    for (let k2 = 0; k2 < M; k2++) {
      const { x, ch, src: src2 } = placed[k2];
      const maxNi = Math.max(0, notes.length - (M - k2));
      while (ni + 1 < notes.length && ni + 1 <= maxNi && Math.abs(rcx(notes[ni + 1].bbox) - x) <= Math.abs(rcx(notes[ni].bbox) - x)) ni++;
      if (ni > maxNi) ni = maxNi;
      const nt = notes[ni];
      const isStrayMark = !/[一-鿿]/.test(ch) && /[A-Za-z]/.test(ch) && (nt.tieStop || nt.slurStop) && !nt.tieStart && !nt.slurStart && ni > 0 && !!(notes[ni - 1].lyrics?.[verse] ?? "");
      if (!isStrayMark) {
        if (!nt.lyrics) nt.lyrics = [];
        for (const p of targets) {
          nt.lyrics[p - 1] = (nt.lyrics[p - 1] || "") + ch;
          for (const c of ch) if (isHanzi(c)) srcsOf(nt, p - 1).push(src2 ? { ...src2, region: placed[k2].region } : null);
        }
        if (nt.digit === 0) restHits.push({ ni, x, ch });
      }
      if (ni < notes.length - 1) ni++;
    }
    for (const { ni: ri, x, ch } of restHits) {
      const rest = notes[ri], nx = notes[ri + 1];
      if (!nx || nx.digit === 0) continue;
      if (rcx(nx.bbox) - rcx(rest.bbox) > numH * 1.2) continue;
      if (x < rcx(rest.bbox) + numH * 0.2) continue;
      if (staff[rowIdx].barlineXs.some((bx) => bx > rcx(rest.bbox) && bx < rcx(nx.bbox))) continue;
      if (targets.some((p) => nx.lyrics?.[p - 1])) continue;
      if (targets.some((p) => rest.lyrics?.[p - 1] !== ch)) continue;
      nx.lyrics ??= [];
      for (const p of targets) {
        nx.lyrics[p - 1] = ch;
        rest.lyrics[p - 1] = "";
        srcsOf(nx, p - 1).push(...srcsOf(rest, p - 1).splice(0));
      }
    }
    if (TR) (TR.aligned ??= {})[key] = notes.map((n) => ({ noteX: rcx(n.bbox), noteBox: n.bbox, lyric: n.lyrics?.[verse] || "" }));
  }
  fillLeadingVerses(staff, (n, from, to) => {
    srcsOf(n, to).splice(0, Infinity, ...srcsOf(n, from));
  });
  const rankAlts = async (reqs) => {
    const want = reqs.map(({ n, verse, idx }) => charSrc.get(n)?.[verse]?.[idx] ?? null);
    const ss = [...new Set(want.filter((w) => !!w).map((w) => w.s))];
    if (!ocr.rankTextChars || !ss.length) return reqs.map(() => null);
    const ranked = await ocr.rankTextChars(ss.map((i) => strips[i]), 10);
    const byStrip = new Map(ss.map((i, j) => [i, ranked[j]]));
    return want.map((w) => {
      if (!w) return null;
      const r = byStrip.get(w.s);
      const orig = textsPos?.[w.s];
      if (!r || !orig || r.length !== orig.length) return null;
      const c = r[w.k];
      return c ? { alts: c.alts, scores: c.scores ?? [] } : null;
    });
  };
  return {
    lyrics: dropped.size ? regions.filter((r) => !dropped.has(r)) : regions,
    chords: chordRegions,
    hooks: { rankAlts, regionOf: ({ n, verse, idx }) => charSrc.get(n)?.[verse]?.[idx]?.region }
  };
}
export {
  REJOINED_ARC_ID as A,
  CN_NUM as C,
  LYRIC_QUOTE_OPEN as L,
  RHYTHM_DIGIT as R,
  createSurface as a,
  blankNonChord as b,
  connectedComponents as c,
  blit as d,
  rcx as e,
  rbottom as f,
  surfaceFromBinary as g,
  overlapRatioX as h,
  median as i,
  chunkCells as j,
  buildStrip as k,
  clusterByY as l,
  mergeToChars as m,
  unionRects as n,
  overlapRatioY as o,
  probe as p,
  normPunct as q,
  rright as r,
  simplifiedOf as s,
  LYRIC_PUNCT as t,
  unionRect as u,
  LYRIC_QUOTE_CLOSE as v,
  isRejoinedArc as w,
  rcy as x,
  overlapX as y,
  recognizeLyrics as z
};
