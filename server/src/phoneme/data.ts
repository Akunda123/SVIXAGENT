/**
 * ⚠️ 本文件由 `tools/gen-phoneme-data.cjs` 生成 —— **别手改**。
 *
 * 真源 ①（合法性 + 例词）：`knowledge/docs/音素表.json`（官方 Phoneme Reference 抽取）
 * 真源 ②（近似候选分组）：`docs/ref-音素替换.js`（用户写的参考脚本，留档副本；可用 --ref 指到宿主里的活文件）
 *
 * 改真源后重跑：node tools/gen-phoneme-data.cjs（然后 npm --prefix server run build）
 */

export interface PhonemeItem { p: string; cat: string | null; ex: string | null; observed?: boolean }
export interface LangTable { table: string; key: string; vowels: PhonemeItem[]; consonants: PhonemeItem[] }
export interface NearGroup { vowelClasses: string[][]; vowelOrder: string[]; consonants: string[] }

/** 官方表：语言键 → { 官方表名, 元音(含例词), 辅音(含例词) } */
export const LANG_TABLES: Record<string, LangTable> = {
  "english": {
    "table": "English - ARPABET",
    "key": "english",
    "vowels": [
      {
        "p": "aa",
        "cat": "Vowel",
        "ex": "far"
      },
      {
        "p": "ae",
        "cat": "Vowel",
        "ex": "bat"
      },
      {
        "p": "ah",
        "cat": "Vowel",
        "ex": "duck"
      },
      {
        "p": "ao",
        "cat": "Vowel",
        "ex": "fought"
      },
      {
        "p": "aw",
        "cat": "Diphthong",
        "ex": "about"
      },
      {
        "p": "ax",
        "cat": "Vowel",
        "ex": "replica"
      },
      {
        "p": "ay",
        "cat": "Diphthong",
        "ex": "dye"
      },
      {
        "p": "eh",
        "cat": "Vowel",
        "ex": "bed"
      },
      {
        "p": "er",
        "cat": "Vowel",
        "ex": "river"
      },
      {
        "p": "ey",
        "cat": "Diphthong",
        "ex": "day"
      },
      {
        "p": "ih",
        "cat": "Vowel",
        "ex": "sick"
      },
      {
        "p": "iy",
        "cat": "Vowel",
        "ex": "peak"
      },
      {
        "p": "ow",
        "cat": "Diphthong",
        "ex": "low"
      },
      {
        "p": "oy",
        "cat": "Diphthong",
        "ex": "toy"
      },
      {
        "p": "uh",
        "cat": "Vowel",
        "ex": "full"
      },
      {
        "p": "uw",
        "cat": "Vowel",
        "ex": "due"
      }
    ],
    "consonants": [
      {
        "p": "b",
        "cat": "Stop",
        "ex": "back"
      },
      {
        "p": "ch",
        "cat": "Affricate",
        "ex": "chalk"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "day"
      },
      {
        "p": "dx",
        "cat": "Stop",
        "ex": "stutter"
      },
      {
        "p": "dr",
        "cat": "Affricate",
        "ex": "drive"
      },
      {
        "p": "dh",
        "cat": "Fricative",
        "ex": "rhythm"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "fright"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "glock"
      },
      {
        "p": "hh",
        "cat": "Aspirate",
        "ex": "hay"
      },
      {
        "p": "jh",
        "cat": "Affricate",
        "ex": "just"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "rock"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "life"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "might"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "night"
      },
      {
        "p": "ng",
        "cat": "Nasal",
        "ex": "singer"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "pen"
      },
      {
        "p": "r",
        "cat": "Semivowel",
        "ex": "road"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "steel"
      },
      {
        "p": "sh",
        "cat": "Fricative",
        "ex": "shrimp"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "time"
      },
      {
        "p": "tr",
        "cat": "Affricate",
        "ex": "try"
      },
      {
        "p": "th",
        "cat": "Fricative",
        "ex": "truth"
      },
      {
        "p": "v",
        "cat": "Fricative",
        "ex": "valve"
      },
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "wool"
      },
      {
        "p": "y",
        "cat": "Semivowel",
        "ex": "yacht"
      },
      {
        "p": "z",
        "cat": "Fricative",
        "ex": "zebra"
      },
      {
        "p": "zh",
        "cat": "Fricative",
        "ex": "vision"
      }
    ]
  },
  "japanese": {
    "table": "Japanese - ROMAJI",
    "key": "japanese",
    "vowels": [
      {
        "p": "a",
        "cat": "Vowel",
        "ex": "あ a"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "い i"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "う u"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "え e"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "お o"
      },
      {
        "p": "N",
        "cat": "Vowel",
        "ex": "ん n"
      },
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "わ wa"
      },
      {
        "p": "v",
        "cat": "Semivowel",
        "ex": "ヴァ va"
      },
      {
        "p": "y",
        "cat": "Semivowel",
        "ex": "や ya"
      }
    ],
    "consonants": [
      {
        "p": "t",
        "cat": "Stop",
        "ex": "た ta"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "だ da"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "さ sa"
      },
      {
        "p": "sh",
        "cat": "Fricative",
        "ex": "しゃ sha"
      },
      {
        "p": "j",
        "cat": "Affricate",
        "ex": "じゃ ja"
      },
      {
        "p": "z",
        "cat": "Affricate",
        "ex": "ざ za"
      },
      {
        "p": "ts",
        "cat": "Affricate",
        "ex": "つ tsu"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "か ka"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "が ga"
      },
      {
        "p": "h",
        "cat": "Aspirate",
        "ex": "ハ ha"
      },
      {
        "p": "b",
        "cat": "Stop",
        "ex": "ば ba"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "ぱ pa"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "ふぁ fa"
      },
      {
        "p": "ch",
        "cat": "Affricate",
        "ex": "ちゃ cha"
      },
      {
        "p": "ry",
        "cat": "Liquid",
        "ex": "りゃ rya"
      },
      {
        "p": "ky",
        "cat": "Stop",
        "ex": "きゃ kya"
      },
      {
        "p": "py",
        "cat": "Stop",
        "ex": "ぴゃ pya"
      },
      {
        "p": "dy",
        "cat": "Stop",
        "ex": "でゃ dya"
      },
      {
        "p": "ty",
        "cat": "Stop",
        "ex": "てゃ tya"
      },
      {
        "p": "ny",
        "cat": "Nasal",
        "ex": "にゃ nya"
      },
      {
        "p": "hy",
        "cat": "Aspirate",
        "ex": "ひゃ hya"
      },
      {
        "p": "my",
        "cat": "Nasal",
        "ex": "みゃ mya"
      },
      {
        "p": "gy",
        "cat": "Stop",
        "ex": "ぎゃ gya"
      },
      {
        "p": "by",
        "cat": "Stop",
        "ex": "びゃ bya"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "な na"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "ま ma"
      },
      {
        "p": "r",
        "cat": "Liquid",
        "ex": "ら ra/la"
      }
    ]
  },
  "mandarin": {
    "table": "Mandarin Chinese - XSAMPA",
    "key": "mandarin",
    "vowels": [
      {
        "p": "a",
        "cat": "Vowel",
        "ex": "他 ta 而 er"
      },
      {
        "p": "A",
        "cat": "Vowel",
        "ex": "狼 lang"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "我 wo"
      },
      {
        "p": "@",
        "cat": "Vowel",
        "ex": "碰 peng"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "黑 hei"
      },
      {
        "p": "7",
        "cat": "Vowel",
        "ex": "的 de"
      },
      {
        "p": "U",
        "cat": "Vowel",
        "ex": "从 cong"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "无 wu"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "伊 yi"
      },
      {
        "p": "i\\",
        "cat": "Vowel",
        "ex": "丝 si"
      },
      {
        "p": "i`",
        "cat": "Vowel",
        "ex": "是 shi"
      },
      {
        "p": "y",
        "cat": "Vowel",
        "ex": "雨 yu"
      },
      {
        "p": "AU",
        "cat": "Diphthong",
        "ex": "好 hao"
      },
      {
        "p": "@U",
        "cat": "Diphthong",
        "ex": "都 dou"
      },
      {
        "p": "ia",
        "cat": "Diphthong",
        "ex": "家 jia"
      },
      {
        "p": "iA",
        "cat": "Diphthong",
        "ex": "将 jiang"
      },
      {
        "p": "iAU",
        "cat": "Diphthong",
        "ex": "小 xiao"
      },
      {
        "p": "ie",
        "cat": "Diphthong",
        "ex": "谢 xie"
      },
      {
        "p": "iE",
        "cat": "Diphthong",
        "ex": "先 xian"
      },
      {
        "p": "iU",
        "cat": "Diphthong",
        "ex": "穹 qiong"
      },
      {
        "p": "i@U",
        "cat": "Diphthong",
        "ex": "袖 xiu"
      },
      {
        "p": "y{",
        "cat": "Diphthong",
        "ex": "元 yuan"
      },
      {
        "p": "yE",
        "cat": "Diphthong",
        "ex": "学 xue"
      },
      {
        "p": "ua",
        "cat": "Diphthong",
        "ex": "花 hua"
      },
      {
        "p": "uA",
        "cat": "Diphthong",
        "ex": "黄 huang"
      },
      {
        "p": "u@",
        "cat": "Diphthong",
        "ex": "顺 shun"
      },
      {
        "p": "ue",
        "cat": "Diphthong",
        "ex": "对 dui"
      },
      {
        "p": "uo",
        "cat": "Diphthong",
        "ex": "多 duo"
      },
      {
        "p": "z`",
        "cat": "Semivowel",
        "ex": "日 ri"
      },
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "网 wang"
      },
      {
        "p": "j",
        "cat": "Semivowel",
        "ex": "用 yong"
      }
    ],
    "consonants": [
      {
        "p": ":\\i",
        "cat": "Coda",
        "ex": "还 hai"
      },
      {
        "p": "r\\`",
        "cat": "Coda",
        "ex": "而 er"
      },
      {
        "p": ":n",
        "cat": "Coda",
        "ex": "岸 an"
      },
      {
        "p": "N",
        "cat": "Coda",
        "ex": "从 cong"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "并 bing"
      },
      {
        "p": "ph",
        "cat": "Stop",
        "ex": "平 ping"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "带 dai"
      },
      {
        "p": "th",
        "cat": "Stop",
        "ex": "同 tong"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "给 gei"
      },
      {
        "p": "kh",
        "cat": "Stop",
        "ex": "开 kai"
      },
      {
        "p": "ts\\",
        "cat": "Affricate",
        "ex": "几 ji"
      },
      {
        "p": "ts",
        "cat": "Affricate",
        "ex": "子 zi"
      },
      {
        "p": "tsh",
        "cat": "Affricate",
        "ex": "从 cong"
      },
      {
        "p": "ts`",
        "cat": "Affricate",
        "ex": "只 zhi"
      },
      {
        "p": "ts`h",
        "cat": "Affricate",
        "ex": "尘 chen"
      },
      {
        "p": "x",
        "cat": "Aspirate",
        "ex": "好 hao"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "风 feng"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "三 san"
      },
      {
        "p": "s`",
        "cat": "Fricative",
        "ex": "是 shi"
      },
      {
        "p": "ts\\h",
        "cat": "Fricative",
        "ex": "七 qi"
      },
      {
        "p": "s\\",
        "cat": "Fricative",
        "ex": "星 xing"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "吗 ma"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "女 nv"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "来 lai"
      }
    ]
  },
  "cantonese": {
    "table": "Cantonese Chinese - XSAMPA",
    "key": "cantonese",
    "vowels": [
      {
        "p": "a",
        "cat": "Vowel",
        "ex": "责 zaak"
      },
      {
        "p": "6",
        "cat": "Vowel",
        "ex": "周 zau"
      },
      {
        "p": "E",
        "cat": "Vowel",
        "ex": "些 se"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "伾 pei"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "兒 ji"
      },
      {
        "p": "l",
        "cat": "Vowel",
        "ex": "升 sing"
      },
      {
        "p": "O",
        "cat": "Vowel",
        "ex": "开 hoi"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "數 sou"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "潰 kui"
      },
      {
        "p": "U",
        "cat": "Vowel",
        "ex": "用 jung"
      },
      {
        "p": "9",
        "cat": "Vowel",
        "ex": "约 joek"
      },
      {
        "p": "8",
        "cat": "Vowel",
        "ex": "摔 seot"
      },
      {
        "p": "y",
        "cat": "Vowel",
        "ex": "雪 syut"
      },
      {
        "p": "m=",
        "cat": "Vowel",
        "ex": "唔 m"
      },
      {
        "p": "N=",
        "cat": "Vowel",
        "ex": "五 ng"
      },
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "泳 wing"
      },
      {
        "p": "j",
        "cat": "Semivowel",
        "ex": "一 jat"
      }
    ],
    "consonants": [
      {
        "p": "p",
        "cat": "Stop",
        "ex": "不 bat"
      },
      {
        "p": "ph",
        "cat": "Stop",
        "ex": "伾 pei"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "代 doi"
      },
      {
        "p": "th",
        "cat": "Stop",
        "ex": "秃 tuk"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "九 gau"
      },
      {
        "p": "kh",
        "cat": "Stop",
        "ex": "期 kei"
      },
      {
        "p": "kw",
        "cat": "Stop",
        "ex": "瓜 gwaa"
      },
      {
        "p": "kwh",
        "cat": "Stop",
        "ex": "夸 kwaa"
      },
      {
        "p": "ts",
        "cat": "Affricate",
        "ex": "自 zi"
      },
      {
        "p": "tsh",
        "cat": "Affricate",
        "ex": "次 ci"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "风 fung"
      },
      {
        "p": "h",
        "cat": "Fricative",
        "ex": "可 ho"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "雪 syut"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "哩 le"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "茗 ming"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "年 nin"
      },
      {
        "p": "N",
        "cat": "Nasal",
        "ex": "外 ngoi"
      },
      {
        "p": ":i",
        "cat": "Coda",
        "ex": "女 neoi"
      },
      {
        "p": ":u",
        "cat": "Coda",
        "ex": "好 hou"
      },
      {
        "p": ":m",
        "cat": "Coda",
        "ex": "闪 sim"
      },
      {
        "p": ":n",
        "cat": "Coda",
        "ex": "新 san"
      },
      {
        "p": ":N",
        "cat": "Coda",
        "ex": "风 fung"
      },
      {
        "p": ":p_}",
        "cat": "Coda",
        "ex": "汁 zap"
      },
      {
        "p": ":t_}",
        "cat": "Coda",
        "ex": "雪 syut"
      },
      {
        "p": ":k_}",
        "cat": "Coda",
        "ex": "责 zaak"
      }
    ]
  },
  "spanish": {
    "table": "Spanish - XSAMPA",
    "key": "spanish",
    "vowels": [
      {
        "p": "a",
        "cat": "Vowel",
        "ex": "paz"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "que"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "sin"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "voz"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "uno"
      },
      {
        "p": "I",
        "cat": "Semivowel",
        "ex": "hoy"
      },
      {
        "p": "U",
        "cat": "Semivowel",
        "ex": "aula"
      },
      {
        "p": "ll",
        "cat": "Semivowel",
        "ex": "lluvia"
      },
      {
        "p": "y",
        "cat": "Semivowel",
        "ex": "ayuno"
      }
    ],
    "consonants": [
      {
        "p": "b",
        "cat": "Stop",
        "ex": "vidrio"
      },
      {
        "p": "B",
        "cat": "Stop",
        "ex": "obtuso"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "día"
      },
      {
        "p": "D",
        "cat": "Stop",
        "ex": "cada"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "gato"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "cada"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "por"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "tarde"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "lona"
      },
      {
        "p": "rr",
        "cat": "Liquid",
        "ex": "ratón"
      },
      {
        "p": "r",
        "cat": "Liquid",
        "ex": "tener"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "música"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "no"
      },
      {
        "p": "N",
        "cat": "Nasal",
        "ex": "cinco"
      },
      {
        "p": "J",
        "cat": "Nasal",
        "ex": "año"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "foto"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "sol"
      },
      {
        "p": "C",
        "cat": "Fricative",
        "ex": "canción*  *European Pronunciation"
      },
      {
        "p": "sh",
        "cat": "Fricative",
        "ex": "Xela"
      },
      {
        "p": "ch",
        "cat": "Affricate",
        "ex": "chica"
      },
      {
        "p": "x",
        "cat": "Fricative",
        "ex": "jamón"
      }
    ]
  },
  "korean": {
    "table": "Korean - XSAMPA",
    "key": "korean",
    "vowels": [
      {
        "p": "6",
        "cat": "Vowel",
        "ex": "사랑 Sarang"
      },
      {
        "p": "e_o",
        "cat": "Vowel",
        "ex": "세상 Sesang"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "기쁨 gippeum"
      },
      {
        "p": "M",
        "cat": "Vowel",
        "ex": "그림 geurim"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "소리 sori"
      },
      {
        "p": "V",
        "cat": "Vowel",
        "ex": "머리 meori"
      },
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "좌석 jwaseok"
      },
      {
        "p": "M_",
        "cat": "Semivowel",
        "ex": "의리 uiri"
      },
      {
        "p": "j",
        "cat": "Semivowel",
        "ex": "유리 yuri"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "조심 josim"
      }
    ],
    "consonants": [
      {
        "p": "4",
        "cat": "Liquid",
        "ex": "라면 ramyeon"
      },
      {
        "p": "b",
        "cat": "Stop",
        "ex": "박자 bakja"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "다리 dari"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "국자 gukja"
      },
      {
        "p": "h",
        "cat": "Fricative",
        "ex": "하나 hana"
      },
      {
        "p": "ts\\h",
        "cat": "Affricate",
        "ex": "찐빵 jjinppang"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "코 ko"
      },
      {
        "p": "k_t",
        "cat": "Stop",
        "ex": "꼬리 kkori"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "물 mul"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "마음 maeum"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "나비 nabi"
      },
      {
        "p": "N",
        "cat": "Coda",
        "ex": "빵 ppang"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "파도 pado"
      },
      {
        "p": "p_t",
        "cat": "Stop",
        "ex": "뿌리 ppuri"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "선물 seonmul"
      },
      {
        "p": "s_t",
        "cat": "Fricative",
        "ex": "쓰다 sseuda"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "통 tong"
      },
      {
        "p": "t_t",
        "cat": "Stop",
        "ex": "똑딱 ttokttak"
      },
      {
        "p": "ts\\_h",
        "cat": "Affricate",
        "ex": "추위 chuwi"
      },
      {
        "p": "dz\\h",
        "cat": "Affricate",
        "ex": "우주 uju"
      },
      {
        "p": "dz\\",
        "cat": "engine-observed",
        "ex": null,
        "observed": true
      }
    ]
  },
  "common": {
    "table": "Common Phonemes",
    "key": "common",
    "vowels": [],
    "consonants": [
      {
        "p": "cl",
        "cat": null,
        "ex": null
      },
      {
        "p": "sil",
        "cat": null,
        "ex": null
      },
      {
        "p": "br",
        "cat": null,
        "ex": null
      }
    ]
  }
};

/** 参考 JS 的 6 语言顺序（mandarin/english/japanese/cantonese/spanish/korean） */
export const LANG_ORDER: string[] = ["mandarin","english","japanese","cantonese","spanish","korean"];

/** 经验近似分组：语言键 → { 元音 6 类(同 JS), 元音参考顺序, 辅音全集 } */
export const NEAR_GROUPS: Record<string, NearGroup> = {
  "mandarin": {
    "vowelClasses": [
      [
        "a",
        "A",
        "AU",
        "@U",
        "ia",
        "iA",
        "iAU",
        "ua",
        "uA"
      ],
      [
        "@",
        "e",
        "7",
        "iA"
      ],
      [
        "i",
        "i\\",
        "i`",
        "y",
        "y{",
        "yE",
        "r\\`",
        "j"
      ],
      [
        "ie",
        "iE",
        "y{",
        "yE",
        "ue",
        ":\\i"
      ],
      [
        "A",
        "o",
        "AU",
        "@U",
        "iAU",
        "iU",
        "i@U",
        "uA",
        "uo",
        "z`"
      ],
      [
        "U",
        "u",
        "i\\",
        "ua",
        "uA",
        "u@",
        "ue",
        "uo",
        "z`",
        "w"
      ]
    ],
    "vowelOrder": [
      "a",
      "A",
      "o",
      "@",
      "e",
      "7",
      "U",
      "u",
      "i",
      "i\\",
      "i`",
      "y",
      "AU",
      "@U",
      "ia",
      "iA",
      "iAU",
      "ie",
      "iE",
      "iU",
      "i@U",
      "y{",
      "yE",
      "ua",
      "uA",
      "u@",
      "ue",
      "uo",
      "z`",
      "w",
      "j",
      ":\\i",
      "r\\`"
    ],
    "consonants": [
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
      "l",
      ":n",
      "N"
    ]
  },
  "english": {
    "vowelClasses": [
      [
        "ae",
        "ah",
        "ao"
      ],
      [
        "aw",
        "ax",
        "er"
      ],
      [
        "ey",
        "ih",
        "iy"
      ],
      [
        "ae",
        "ay",
        "eh",
        "er",
        "ey"
      ],
      [
        "ah",
        "ao",
        "aw",
        "ax",
        "ow",
        "oy"
      ],
      [
        "uh",
        "uw"
      ]
    ],
    "vowelOrder": [
      "ae",
      "ah",
      "ao",
      "aw",
      "ax",
      "ay",
      "eh",
      "er",
      "ey",
      "ih",
      "iy",
      "ow",
      "oy",
      "uh",
      "uw"
    ],
    "consonants": [
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
      "r",
      "s",
      "sh",
      "t",
      "tr",
      "th",
      "v",
      "w",
      "y",
      "z",
      "zh"
    ]
  },
  "japanese": {
    "vowelClasses": [
      [
        "a"
      ],
      [],
      [
        "i",
        "y"
      ],
      [
        "e"
      ],
      [
        "o"
      ],
      [
        "N",
        "w",
        "v",
        "u"
      ]
    ],
    "vowelOrder": [
      "a",
      "i",
      "u",
      "e",
      "o",
      "N",
      "w",
      "v",
      "y"
    ],
    "consonants": [
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
    ]
  },
  "cantonese": {
    "vowelClasses": [
      [
        "a",
        "6",
        "O",
        "o",
        "U",
        "9",
        "8"
      ],
      [],
      [
        "i",
        "l",
        "j",
        ":i",
        "y"
      ],
      [
        "E",
        "e"
      ],
      [
        "O",
        "o",
        "U",
        "9",
        "8"
      ],
      [
        "u",
        "U",
        "m=",
        "N=",
        "w",
        ":u"
      ]
    ],
    "vowelOrder": [
      "a",
      "6",
      "E",
      "e",
      "i",
      "l",
      "O",
      "o",
      "u",
      "U",
      "9",
      "8",
      "y",
      "m=",
      "N=",
      "w",
      "j",
      ":i",
      ":u"
    ],
    "consonants": [
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
      "N",
      ":m",
      ":n",
      ":N",
      ":p_}",
      ":t_}",
      ":k_}"
    ]
  },
  "spanish": {
    "vowelClasses": [
      [
        "a"
      ],
      [],
      [
        "i",
        "I",
        "ll",
        "y"
      ],
      [
        "e"
      ],
      [
        "o"
      ],
      [
        "u",
        "U"
      ]
    ],
    "vowelOrder": [
      "a",
      "e",
      "i",
      "o",
      "u",
      "I",
      "U",
      "ll",
      "y"
    ],
    "consonants": [
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
    ]
  },
  "korean": {
    "vowelClasses": [
      [
        "6",
        "V"
      ],
      [],
      [
        "i",
        "j"
      ],
      [
        "e_o"
      ],
      [
        "M",
        "o",
        "V"
      ],
      [
        "w",
        "M_"
      ]
    ],
    "vowelOrder": [
      "6",
      "e_o",
      "i",
      "M",
      "o",
      "V",
      "w",
      "M_",
      "j"
    ],
    "consonants": [
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
      "N",
      "p",
      "pp",
      "s",
      "s_t",
      "t",
      "tt",
      "ts\\_h"
    ]
  }
};
