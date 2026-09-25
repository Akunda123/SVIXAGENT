/**
 * **按语言的音素类别表 / 辅音集**（自动生成，别手改）
 *
 * 生成：`node tools/gen-phoneme-sets.cjs`（源 = `knowledge/docs/音素表.json` = 官方 *Phoneme Reference* 页面抽取）
 * 用途：① 判"某个音素是不是辅音"（**按语言**，比跨语种粗集准）
 *      ② A（短音符的辅音抢前一个音符）里定位"要压 dur 的那一项"
 *      ⚠️ 优先用宿主的计算属性判辅音（SV2 `activity` 非 null），**这张表是回退依据**（尤其 SV1）。
 */
export interface PhonemeEntry {
  phoneme: string;
  /** 官方 Category（Vowel / Diphthong / Stop / Affricate / Fricative / Aspirate / Nasal / Liquid / Semivowel / Coda） */
  category: string | null;
  /** 归并后的大类：vowel · glide · coda · consonant · other · special */
  big: 'vowel' | 'glide' | 'coda' | 'consonant' | 'other' | 'special';
  example: string | null;
  description: string | null;
}

/** 语言（phoneset）→ 音素条目。键与官方表一致：English - ARPABET / Japanese - ROMAJI / Mandarin Chinese - XSAMPA … */
export const PHONEME_TABLES: Record<string, PhonemeEntry[]> = {
  "English - ARPABET": [
    {
      "phoneme": "aa",
      "category": "Vowel",
      "big": "vowel",
      "example": "far",
      "description": null
    },
    {
      "phoneme": "ae",
      "category": "Vowel",
      "big": "vowel",
      "example": "bat",
      "description": null
    },
    {
      "phoneme": "ah",
      "category": "Vowel",
      "big": "vowel",
      "example": "duck",
      "description": null
    },
    {
      "phoneme": "ao",
      "category": "Vowel",
      "big": "vowel",
      "example": "fought",
      "description": null
    },
    {
      "phoneme": "aw",
      "category": "Diphthong",
      "big": "vowel",
      "example": "about",
      "description": null
    },
    {
      "phoneme": "ax",
      "category": "Vowel",
      "big": "vowel",
      "example": "replica",
      "description": null
    },
    {
      "phoneme": "ay",
      "category": "Diphthong",
      "big": "vowel",
      "example": "dye",
      "description": null
    },
    {
      "phoneme": "eh",
      "category": "Vowel",
      "big": "vowel",
      "example": "bed",
      "description": null
    },
    {
      "phoneme": "er",
      "category": "Vowel",
      "big": "vowel",
      "example": "river",
      "description": null
    },
    {
      "phoneme": "ey",
      "category": "Diphthong",
      "big": "vowel",
      "example": "day",
      "description": null
    },
    {
      "phoneme": "ih",
      "category": "Vowel",
      "big": "vowel",
      "example": "sick",
      "description": null
    },
    {
      "phoneme": "iy",
      "category": "Vowel",
      "big": "vowel",
      "example": "peak",
      "description": null
    },
    {
      "phoneme": "ow",
      "category": "Diphthong",
      "big": "vowel",
      "example": "low",
      "description": null
    },
    {
      "phoneme": "oy",
      "category": "Diphthong",
      "big": "vowel",
      "example": "toy",
      "description": null
    },
    {
      "phoneme": "uh",
      "category": "Vowel",
      "big": "vowel",
      "example": "full",
      "description": null
    },
    {
      "phoneme": "uw",
      "category": "Vowel",
      "big": "vowel",
      "example": "due",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "back",
      "description": null
    },
    {
      "phoneme": "ch",
      "category": "Affricate",
      "big": "consonant",
      "example": "chalk",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "day",
      "description": null
    },
    {
      "phoneme": "dx",
      "category": "Stop",
      "big": "consonant",
      "example": "stutter",
      "description": null
    },
    {
      "phoneme": "dr",
      "category": "Affricate",
      "big": "consonant",
      "example": "drive",
      "description": null
    },
    {
      "phoneme": "dh",
      "category": "Fricative",
      "big": "consonant",
      "example": "rhythm",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "fright",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "glock",
      "description": null
    },
    {
      "phoneme": "hh",
      "category": "Aspirate",
      "big": "consonant",
      "example": "hay",
      "description": null
    },
    {
      "phoneme": "jh",
      "category": "Affricate",
      "big": "consonant",
      "example": "just",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "rock",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "life",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "might",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "night",
      "description": null
    },
    {
      "phoneme": "ng",
      "category": "Nasal",
      "big": "consonant",
      "example": "singer",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "pen",
      "description": null
    },
    {
      "phoneme": "r",
      "category": "Semivowel",
      "big": "glide",
      "example": "road",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "steel",
      "description": null
    },
    {
      "phoneme": "sh",
      "category": "Fricative",
      "big": "consonant",
      "example": "shrimp",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "time",
      "description": null
    },
    {
      "phoneme": "tr",
      "category": "Affricate",
      "big": "consonant",
      "example": "try",
      "description": null
    },
    {
      "phoneme": "th",
      "category": "Fricative",
      "big": "consonant",
      "example": "truth",
      "description": null
    },
    {
      "phoneme": "v",
      "category": "Fricative",
      "big": "consonant",
      "example": "valve",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "wool",
      "description": null
    },
    {
      "phoneme": "y",
      "category": "Semivowel",
      "big": "glide",
      "example": "yacht",
      "description": null
    },
    {
      "phoneme": "z",
      "category": "Fricative",
      "big": "consonant",
      "example": "zebra",
      "description": null
    },
    {
      "phoneme": "zh",
      "category": "Fricative",
      "big": "consonant",
      "example": "vision",
      "description": null
    }
  ],
  "Japanese - ROMAJI": [
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "あ a",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "い i",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "う u",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "え e",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "お o",
      "description": null
    },
    {
      "phoneme": "N",
      "category": "Vowel",
      "big": "vowel",
      "example": "ん n",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "わ wa",
      "description": null
    },
    {
      "phoneme": "v",
      "category": "Semivowel",
      "big": "glide",
      "example": "ヴァ va",
      "description": null
    },
    {
      "phoneme": "y",
      "category": "Semivowel",
      "big": "glide",
      "example": "や ya",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "た ta",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "だ da",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "さ sa",
      "description": null
    },
    {
      "phoneme": "sh",
      "category": "Fricative",
      "big": "consonant",
      "example": "しゃ sha",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Affricate",
      "big": "consonant",
      "example": "じゃ ja",
      "description": null
    },
    {
      "phoneme": "z",
      "category": "Affricate",
      "big": "consonant",
      "example": "ざ za",
      "description": null
    },
    {
      "phoneme": "ts",
      "category": "Affricate",
      "big": "consonant",
      "example": "つ tsu",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "か ka",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "が ga",
      "description": null
    },
    {
      "phoneme": "h",
      "category": "Aspirate",
      "big": "consonant",
      "example": "ハ ha",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "ば ba",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "ぱ pa",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "ふぁ fa",
      "description": null
    },
    {
      "phoneme": "ch",
      "category": "Affricate",
      "big": "consonant",
      "example": "ちゃ cha",
      "description": null
    },
    {
      "phoneme": "ry",
      "category": "Liquid",
      "big": "consonant",
      "example": "りゃ rya",
      "description": null
    },
    {
      "phoneme": "ky",
      "category": "Stop",
      "big": "consonant",
      "example": "きゃ kya",
      "description": null
    },
    {
      "phoneme": "py",
      "category": "Stop",
      "big": "consonant",
      "example": "ぴゃ pya",
      "description": null
    },
    {
      "phoneme": "dy",
      "category": "Stop",
      "big": "consonant",
      "example": "でゃ dya",
      "description": null
    },
    {
      "phoneme": "ty",
      "category": "Stop",
      "big": "consonant",
      "example": "てゃ tya",
      "description": null
    },
    {
      "phoneme": "ny",
      "category": "Nasal",
      "big": "consonant",
      "example": "にゃ nya",
      "description": null
    },
    {
      "phoneme": "hy",
      "category": "Aspirate",
      "big": "consonant",
      "example": "ひゃ hya",
      "description": null
    },
    {
      "phoneme": "my",
      "category": "Nasal",
      "big": "consonant",
      "example": "みゃ mya",
      "description": null
    },
    {
      "phoneme": "gy",
      "category": "Stop",
      "big": "consonant",
      "example": "ぎゃ gya",
      "description": null
    },
    {
      "phoneme": "by",
      "category": "Stop",
      "big": "consonant",
      "example": "びゃ bya",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "な na",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "ま ma",
      "description": null
    },
    {
      "phoneme": "r",
      "category": "Liquid",
      "big": "consonant",
      "example": "ら ra/la",
      "description": null
    }
  ],
  "Mandarin Chinese - XSAMPA": [
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "他 ta 而 er",
      "description": null
    },
    {
      "phoneme": "A",
      "category": "Vowel",
      "big": "vowel",
      "example": "狼 lang",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "我 wo",
      "description": null
    },
    {
      "phoneme": "@",
      "category": "Vowel",
      "big": "vowel",
      "example": "碰 peng",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "黑 hei",
      "description": null
    },
    {
      "phoneme": "7",
      "category": "Vowel",
      "big": "vowel",
      "example": "的 de",
      "description": null
    },
    {
      "phoneme": "U",
      "category": "Vowel",
      "big": "vowel",
      "example": "从 cong",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "无 wu",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "伊 yi",
      "description": null
    },
    {
      "phoneme": "i\\",
      "category": "Vowel",
      "big": "vowel",
      "example": "丝 si",
      "description": null
    },
    {
      "phoneme": "i`",
      "category": "Vowel",
      "big": "vowel",
      "example": "是 shi",
      "description": null
    },
    {
      "phoneme": "y",
      "category": "Vowel",
      "big": "vowel",
      "example": "雨 yu",
      "description": null
    },
    {
      "phoneme": "AU",
      "category": "Diphthong",
      "big": "vowel",
      "example": "好 hao",
      "description": null
    },
    {
      "phoneme": "@U",
      "category": "Diphthong",
      "big": "vowel",
      "example": "都 dou",
      "description": null
    },
    {
      "phoneme": "ia",
      "category": "Diphthong",
      "big": "vowel",
      "example": "家 jia",
      "description": null
    },
    {
      "phoneme": "iA",
      "category": "Diphthong",
      "big": "vowel",
      "example": "将 jiang",
      "description": null
    },
    {
      "phoneme": "iAU",
      "category": "Diphthong",
      "big": "vowel",
      "example": "小 xiao",
      "description": null
    },
    {
      "phoneme": "ie",
      "category": "Diphthong",
      "big": "vowel",
      "example": "谢 xie",
      "description": null
    },
    {
      "phoneme": "iE",
      "category": "Diphthong",
      "big": "vowel",
      "example": "先 xian",
      "description": null
    },
    {
      "phoneme": "iU",
      "category": "Diphthong",
      "big": "vowel",
      "example": "穹 qiong",
      "description": null
    },
    {
      "phoneme": "i@U",
      "category": "Diphthong",
      "big": "vowel",
      "example": "袖 xiu",
      "description": null
    },
    {
      "phoneme": "y{",
      "category": "Diphthong",
      "big": "vowel",
      "example": "元 yuan",
      "description": null
    },
    {
      "phoneme": "yE",
      "category": "Diphthong",
      "big": "vowel",
      "example": "学 xue",
      "description": null
    },
    {
      "phoneme": "ua",
      "category": "Diphthong",
      "big": "vowel",
      "example": "花 hua",
      "description": null
    },
    {
      "phoneme": "uA",
      "category": "Diphthong",
      "big": "vowel",
      "example": "黄 huang",
      "description": null
    },
    {
      "phoneme": "u@",
      "category": "Diphthong",
      "big": "vowel",
      "example": "顺 shun",
      "description": null
    },
    {
      "phoneme": "ue",
      "category": "Diphthong",
      "big": "vowel",
      "example": "对 dui",
      "description": null
    },
    {
      "phoneme": "uo",
      "category": "Diphthong",
      "big": "vowel",
      "example": "多 duo",
      "description": null
    },
    {
      "phoneme": "z`",
      "category": "Semivowel",
      "big": "glide",
      "example": "日 ri",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "网 wang",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Semivowel",
      "big": "glide",
      "example": "用 yong",
      "description": null
    },
    {
      "phoneme": ":\\i",
      "category": "Coda",
      "big": "coda",
      "example": "还 hai",
      "description": null
    },
    {
      "phoneme": "r\\`",
      "category": "Coda",
      "big": "coda",
      "example": "而 er",
      "description": null
    },
    {
      "phoneme": ":n",
      "category": "Coda",
      "big": "coda",
      "example": "岸 an",
      "description": null
    },
    {
      "phoneme": "N",
      "category": "Coda",
      "big": "coda",
      "example": "从 cong",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "并 bing",
      "description": null
    },
    {
      "phoneme": "ph",
      "category": "Stop",
      "big": "consonant",
      "example": "平 ping",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "带 dai",
      "description": null
    },
    {
      "phoneme": "th",
      "category": "Stop",
      "big": "consonant",
      "example": "同 tong",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "给 gei",
      "description": null
    },
    {
      "phoneme": "kh",
      "category": "Stop",
      "big": "consonant",
      "example": "开 kai",
      "description": null
    },
    {
      "phoneme": "ts\\",
      "category": "Affricate",
      "big": "consonant",
      "example": "几 ji",
      "description": null
    },
    {
      "phoneme": "ts",
      "category": "Affricate",
      "big": "consonant",
      "example": "子 zi",
      "description": null
    },
    {
      "phoneme": "tsh",
      "category": "Affricate",
      "big": "consonant",
      "example": "从 cong",
      "description": null
    },
    {
      "phoneme": "ts`",
      "category": "Affricate",
      "big": "consonant",
      "example": "只 zhi",
      "description": null
    },
    {
      "phoneme": "ts`h",
      "category": "Affricate",
      "big": "consonant",
      "example": "尘 chen",
      "description": null
    },
    {
      "phoneme": "x",
      "category": "Aspirate",
      "big": "consonant",
      "example": "好 hao",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "风 feng",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "三 san",
      "description": null
    },
    {
      "phoneme": "s`",
      "category": "Fricative",
      "big": "consonant",
      "example": "是 shi",
      "description": null
    },
    {
      "phoneme": "ts\\h",
      "category": "Fricative",
      "big": "consonant",
      "example": "七 qi",
      "description": null
    },
    {
      "phoneme": "s\\",
      "category": "Fricative",
      "big": "consonant",
      "example": "星 xing",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "吗 ma",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "女 nv",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "来 lai",
      "description": null
    }
  ],
  "Cantonese Chinese - XSAMPA": [
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "责 zaak",
      "description": null
    },
    {
      "phoneme": "6",
      "category": "Vowel",
      "big": "vowel",
      "example": "周 zau",
      "description": null
    },
    {
      "phoneme": "E",
      "category": "Vowel",
      "big": "vowel",
      "example": "些 se",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "伾 pei",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "兒 ji",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Vowel",
      "big": "vowel",
      "example": "升 sing",
      "description": null
    },
    {
      "phoneme": "O",
      "category": "Vowel",
      "big": "vowel",
      "example": "开 hoi",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "數 sou",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "潰 kui",
      "description": null
    },
    {
      "phoneme": "U",
      "category": "Vowel",
      "big": "vowel",
      "example": "用 jung",
      "description": null
    },
    {
      "phoneme": "9",
      "category": "Vowel",
      "big": "vowel",
      "example": "约 joek",
      "description": null
    },
    {
      "phoneme": "8",
      "category": "Vowel",
      "big": "vowel",
      "example": "摔 seot",
      "description": null
    },
    {
      "phoneme": "y",
      "category": "Vowel",
      "big": "vowel",
      "example": "雪 syut",
      "description": null
    },
    {
      "phoneme": "m=",
      "category": "Vowel",
      "big": "vowel",
      "example": "唔 m",
      "description": null
    },
    {
      "phoneme": "N=",
      "category": "Vowel",
      "big": "vowel",
      "example": "五 ng",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "泳 wing",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Semivowel",
      "big": "glide",
      "example": "一 jat",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "不 bat",
      "description": null
    },
    {
      "phoneme": "ph",
      "category": "Stop",
      "big": "consonant",
      "example": "伾 pei",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "代 doi",
      "description": null
    },
    {
      "phoneme": "th",
      "category": "Stop",
      "big": "consonant",
      "example": "秃 tuk",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "九 gau",
      "description": null
    },
    {
      "phoneme": "kh",
      "category": "Stop",
      "big": "consonant",
      "example": "期 kei",
      "description": null
    },
    {
      "phoneme": "kw",
      "category": "Stop",
      "big": "consonant",
      "example": "瓜 gwaa",
      "description": null
    },
    {
      "phoneme": "kwh",
      "category": "Stop",
      "big": "consonant",
      "example": "夸 kwaa",
      "description": null
    },
    {
      "phoneme": "ts",
      "category": "Affricate",
      "big": "consonant",
      "example": "自 zi",
      "description": null
    },
    {
      "phoneme": "tsh",
      "category": "Affricate",
      "big": "consonant",
      "example": "次 ci",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "风 fung",
      "description": null
    },
    {
      "phoneme": "h",
      "category": "Fricative",
      "big": "consonant",
      "example": "可 ho",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "雪 syut",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "哩 le",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "茗 ming",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "年 nin",
      "description": null
    },
    {
      "phoneme": "N",
      "category": "Nasal",
      "big": "consonant",
      "example": "外 ngoi",
      "description": null
    },
    {
      "phoneme": ":i",
      "category": "Coda",
      "big": "coda",
      "example": "女 neoi",
      "description": null
    },
    {
      "phoneme": ":u",
      "category": "Coda",
      "big": "coda",
      "example": "好 hou",
      "description": null
    },
    {
      "phoneme": ":m",
      "category": "Coda",
      "big": "coda",
      "example": "闪 sim",
      "description": null
    },
    {
      "phoneme": ":n",
      "category": "Coda",
      "big": "coda",
      "example": "新 san",
      "description": null
    },
    {
      "phoneme": ":N",
      "category": "Coda",
      "big": "coda",
      "example": "风 fung",
      "description": null
    },
    {
      "phoneme": ":p_}",
      "category": "Coda",
      "big": "coda",
      "example": "汁 zap",
      "description": null
    },
    {
      "phoneme": ":t_}",
      "category": "Coda",
      "big": "coda",
      "example": "雪 syut",
      "description": null
    },
    {
      "phoneme": ":k_}",
      "category": "Coda",
      "big": "coda",
      "example": "责 zaak",
      "description": null
    }
  ],
  "Spanish - XSAMPA": [
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "paz",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "que",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "sin",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "voz",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "uno",
      "description": null
    },
    {
      "phoneme": "I",
      "category": "Semivowel",
      "big": "glide",
      "example": "hoy",
      "description": null
    },
    {
      "phoneme": "U",
      "category": "Semivowel",
      "big": "glide",
      "example": "aula",
      "description": null
    },
    {
      "phoneme": "ll",
      "category": "Semivowel",
      "big": "glide",
      "example": "lluvia",
      "description": null
    },
    {
      "phoneme": "y",
      "category": "Semivowel",
      "big": "glide",
      "example": "ayuno",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "vidrio",
      "description": null
    },
    {
      "phoneme": "B",
      "category": "Stop",
      "big": "consonant",
      "example": "obtuso",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "día",
      "description": null
    },
    {
      "phoneme": "D",
      "category": "Stop",
      "big": "consonant",
      "example": "cada",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "gato",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "cada",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "por",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "tarde",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "lona",
      "description": null
    },
    {
      "phoneme": "rr",
      "category": "Liquid",
      "big": "consonant",
      "example": "ratón",
      "description": null
    },
    {
      "phoneme": "r",
      "category": "Liquid",
      "big": "consonant",
      "example": "tener",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "música",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "no",
      "description": null
    },
    {
      "phoneme": "N",
      "category": "Nasal",
      "big": "consonant",
      "example": "cinco",
      "description": null
    },
    {
      "phoneme": "J",
      "category": "Nasal",
      "big": "consonant",
      "example": "año",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "foto",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "sol",
      "description": null
    },
    {
      "phoneme": "C",
      "category": "Fricative",
      "big": "consonant",
      "example": "canción*  *European Pronunciation",
      "description": null
    },
    {
      "phoneme": "sh",
      "category": "Fricative",
      "big": "consonant",
      "example": "Xela",
      "description": null
    },
    {
      "phoneme": "ch",
      "category": "Affricate",
      "big": "consonant",
      "example": "chica",
      "description": null
    },
    {
      "phoneme": "x",
      "category": "Fricative",
      "big": "consonant",
      "example": "jamón",
      "description": null
    }
  ],
  "Korean - XSAMPA": [
    {
      "phoneme": "6",
      "category": "Vowel",
      "big": "vowel",
      "example": "사랑 Sarang",
      "description": null
    },
    {
      "phoneme": "e_o",
      "category": "Vowel",
      "big": "vowel",
      "example": "세상 Sesang",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "기쁨 gippeum",
      "description": null
    },
    {
      "phoneme": "M",
      "category": "Vowel",
      "big": "vowel",
      "example": "그림 geurim",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "소리 sori",
      "description": null
    },
    {
      "phoneme": "V",
      "category": "Vowel",
      "big": "vowel",
      "example": "머리 meori",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "좌석 jwaseok",
      "description": null
    },
    {
      "phoneme": "M_",
      "category": "Semivowel",
      "big": "glide",
      "example": "의리 uiri",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Semivowel",
      "big": "glide",
      "example": "유리 yuri",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "조심 josim",
      "description": null
    },
    {
      "phoneme": "4",
      "category": "Liquid",
      "big": "consonant",
      "example": "라면 ramyeon",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "박자 bakja",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "다리 dari",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "국자 gukja",
      "description": null
    },
    {
      "phoneme": "h",
      "category": "Fricative",
      "big": "consonant",
      "example": "하나 hana",
      "description": null
    },
    {
      "phoneme": "ts\\h",
      "category": "Affricate",
      "big": "consonant",
      "example": "찐빵 jjinppang",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "코 ko",
      "description": null
    },
    {
      "phoneme": "k_t",
      "category": "Stop",
      "big": "consonant",
      "example": "꼬리 kkori",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "물 mul",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "마음 maeum",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "나비 nabi",
      "description": null
    },
    {
      "phoneme": "N",
      "category": "Coda",
      "big": "coda",
      "example": "빵 ppang",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "파도 pado",
      "description": null
    },
    {
      "phoneme": "p_t",
      "category": "Stop",
      "big": "consonant",
      "example": "뿌리 ppuri",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "선물 seonmul",
      "description": null
    },
    {
      "phoneme": "s_t",
      "category": "Fricative",
      "big": "consonant",
      "example": "쓰다 sseuda",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "통 tong",
      "description": null
    },
    {
      "phoneme": "t_t",
      "category": "Stop",
      "big": "consonant",
      "example": "똑딱 ttokttak",
      "description": null
    },
    {
      "phoneme": "ts\\_h",
      "category": "Affricate",
      "big": "consonant",
      "example": "추위 chuwi",
      "description": null
    },
    {
      "phoneme": "dz\\h",
      "category": "Affricate",
      "big": "consonant",
      "example": "우주 uju",
      "description": null
    }
  ],
  "Common Phonemes": [
    {
      "phoneme": "cl",
      "category": null,
      "big": "special",
      "example": null,
      "description": "glottal stop"
    },
    {
      "phoneme": "sil",
      "category": null,
      "big": "special",
      "example": null,
      "description": "silence (highly situative)"
    },
    {
      "phoneme": "br",
      "category": null,
      "big": "special",
      "example": null,
      "description": "breath"
    }
  ]
};

/** 各语言的**辅音集**（Stop / Affricate / Fricative / Aspirate / Nasal / Liquid） */
export const CONSONANTS_BY_LANGUAGE: Record<string, string[]> = {
  "English - ARPABET": [
    "b",
    "ch",
    "d",
    "dx",
    "dr",
    "dh",
    "f",
    "g",
    "hh",
    "jh",
    "k",
    "l",
    "m",
    "n",
    "ng",
    "p",
    "s",
    "sh",
    "t",
    "tr",
    "th",
    "v",
    "z",
    "zh"
  ],
  "Japanese - ROMAJI": [
    "t",
    "d",
    "s",
    "sh",
    "j",
    "z",
    "ts",
    "k",
    "g",
    "h",
    "b",
    "p",
    "f",
    "ch",
    "ry",
    "ky",
    "py",
    "dy",
    "ty",
    "ny",
    "hy",
    "my",
    "gy",
    "by",
    "n",
    "m",
    "r"
  ],
  "Mandarin Chinese - XSAMPA": [
    "p",
    "ph",
    "t",
    "th",
    "k",
    "kh",
    "ts\\",
    "ts",
    "tsh",
    "ts`",
    "ts`h",
    "x",
    "f",
    "s",
    "s`",
    "ts\\h",
    "s\\",
    "m",
    "n",
    "l"
  ],
  "Cantonese Chinese - XSAMPA": [
    "p",
    "ph",
    "t",
    "th",
    "k",
    "kh",
    "kw",
    "kwh",
    "ts",
    "tsh",
    "f",
    "h",
    "s",
    "l",
    "m",
    "n",
    "N"
  ],
  "Spanish - XSAMPA": [
    "b",
    "B",
    "d",
    "D",
    "g",
    "k",
    "p",
    "t",
    "l",
    "rr",
    "r",
    "m",
    "n",
    "N",
    "J",
    "f",
    "s",
    "C",
    "sh",
    "ch",
    "x"
  ],
  "Korean - XSAMPA": [
    "4",
    "b",
    "d",
    "g",
    "h",
    "ts\\h",
    "k",
    "k_t",
    "l",
    "m",
    "n",
    "p",
    "p_t",
    "s",
    "s_t",
    "t",
    "t_t",
    "ts\\_h",
    "dz\\h"
  ],
  "Common Phonemes": []
};

/** 判辅音（按语言；大小写敏感——SV 音素表区分大小写，如 `A` 是元音、`a` 也是元音） */
export function isConsonant(phoneme: string, language?: string): boolean {
  if (language && CONSONANTS_BY_LANGUAGE[language]) return CONSONANTS_BY_LANGUAGE[language].includes(phoneme);
  return Object.values(CONSONANTS_BY_LANGUAGE).some((list) => list.includes(phoneme));
}
