/**
 * ⚠️ 本文件由 `tools/gen-phoneme-data.cjs` 生成 —— **别手改**。
 *
 * 真源 ①（合法性 + 例词）：`knowledge/docs/音素表.json`（官方 Phoneme Reference 抽取）
 * 真源 ②（近似候选分组）：`docs/ref-音素替换.js`（用户写的参考脚本，留档副本；可用 --ref 指到宿主里的活文件）
 *
 * 改真源后重跑：node tools/gen-phoneme-data.cjs（然后 npm --prefix server run build）
 */

export interface PhonemeItem { p: string; cat: string | null; ex: string | null; xs?: string | null; observed?: boolean }
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
        "ex": "_o_n",
        "xs": "A"
      },
      {
        "p": "ae",
        "cat": "Vowel",
        "ex": "c_a_t",
        "xs": "{"
      },
      {
        "p": "ah",
        "cat": "Vowel",
        "ex": "_u_ncle",
        "xs": "V+"
      },
      {
        "p": "ao",
        "cat": "Vowel",
        "ex": "c_augh_t",
        "xs": "O"
      },
      {
        "p": "aw",
        "cat": "Diphthong",
        "ex": "_ou_t",
        "xs": "aU"
      },
      {
        "p": "ax",
        "cat": "Vowel",
        "ex": "_a_rena",
        "xs": "@"
      },
      {
        "p": "ay",
        "cat": "Diphthong",
        "ex": "f_i_ne",
        "xs": "aI"
      },
      {
        "p": "eax",
        "cat": "Diphthong",
        "ex": "sq_uare_ (British)",
        "xs": "e@"
      },
      {
        "p": "eh",
        "cat": "Vowel",
        "ex": "b_e_d",
        "xs": "E"
      },
      {
        "p": "er",
        "cat": "Vowel",
        "ex": "b_ur_g_er_",
        "xs": "@`"
      },
      {
        "p": "ey",
        "cat": "Diphthong",
        "ex": "p_ay_",
        "xs": "eI"
      },
      {
        "p": "iax",
        "cat": "Diphthong",
        "ex": "n_ear_ (British)",
        "xs": "i@"
      },
      {
        "p": "ih",
        "cat": "Vowel",
        "ex": "b_i_t",
        "xs": "I"
      },
      {
        "p": "iy",
        "cat": "Vowel",
        "ex": "fr_ee_",
        "xs": "i"
      },
      {
        "p": "oh",
        "cat": "Vowel",
        "ex": "n_or_th (British)",
        "xs": "o_o"
      },
      {
        "p": "ow",
        "cat": "Diphthong",
        "ex": "r_ow_",
        "xs": "oU"
      },
      {
        "p": "oy",
        "cat": "Diphthong",
        "ex": "b_oy_",
        "xs": "OI"
      },
      {
        "p": "r",
        "cat": "Semivowel",
        "ex": "_r_ed",
        "xs": "r\\"
      },
      {
        "p": "uax",
        "cat": "Diphthong",
        "ex": "c_ure_ (British)",
        "xs": "U@"
      },
      {
        "p": "uh",
        "cat": "Vowel",
        "ex": "h_oo_k",
        "xs": "U"
      },
      {
        "p": "uw",
        "cat": "Vowel",
        "ex": "b_oo_",
        "xs": "u"
      },
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "_w_eep",
        "xs": "w"
      },
      {
        "p": "y",
        "cat": "Semivowel",
        "ex": "_y_ou",
        "xs": "j"
      }
    ],
    "consonants": [
      {
        "p": "b",
        "cat": "Stop",
        "ex": "_b_ack",
        "xs": "b"
      },
      {
        "p": "ch",
        "cat": "Affricate",
        "ex": "bea_ch_",
        "xs": "tS"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "_d_ash",
        "xs": "d"
      },
      {
        "p": "dx",
        "cat": "Liquid",
        "ex": "be_tt_er",
        "xs": "4"
      },
      {
        "p": "dr",
        "cat": "Affricate",
        "ex": "_dr_eam",
        "xs": "dZr\\"
      },
      {
        "p": "dh",
        "cat": "Fricative",
        "ex": "_th_is",
        "xs": "D"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "_f_ill",
        "xs": "f"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "_g_ame",
        "xs": "g"
      },
      {
        "p": "hh",
        "cat": "Fricative",
        "ex": "_h_igh",
        "xs": "h"
      },
      {
        "p": "jh",
        "cat": "Affricate",
        "ex": "_j_eans",
        "xs": "dZ"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "_k_iss",
        "xs": "kh"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "_l_et",
        "xs": "l"
      },
      {
        "p": "ll",
        "cat": "Coda",
        "ex": "fu_ll_",
        "xs": "5"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "_m_usic",
        "xs": "m"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "_n_ice",
        "xs": "n"
      },
      {
        "p": "ng",
        "cat": "Nasal",
        "ex": "si_ng_",
        "xs": "N"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "_p_ack",
        "xs": "ph"
      },
      {
        "p": "q",
        "cat": "Stop",
        "ex": "uh_-_oh",
        "xs": "?"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "_s_it",
        "xs": "s"
      },
      {
        "p": "sh",
        "cat": "Fricative",
        "ex": "_sh_eep",
        "xs": "S"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "_t_all",
        "xs": "th"
      },
      {
        "p": "tr",
        "cat": "Affricate",
        "ex": "_tr_ee",
        "xs": "tSr\\"
      },
      {
        "p": "th",
        "cat": "Fricative",
        "ex": "_th_ink",
        "xs": "T"
      },
      {
        "p": "v",
        "cat": "Fricative",
        "ex": "_v_al_v_e",
        "xs": "v"
      },
      {
        "p": "z",
        "cat": "Fricative",
        "ex": "_z_oo",
        "xs": "z"
      },
      {
        "p": "zh",
        "cat": "Fricative",
        "ex": "vi_s_ion",
        "xs": "Z"
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
        "ex": "あ _a_",
        "xs": "a"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "い _i_",
        "xs": "i"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "う _u_",
        "xs": "M"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "え _e_",
        "xs": "e_o"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "お _o_",
        "xs": "o_o"
      },
      {
        "p": "N",
        "cat": "Vowel",
        "ex": "ん _N_",
        "xs": "N\\"
      },
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "わ _w_ a",
        "xs": "w"
      },
      {
        "p": "y",
        "cat": "Semivowel",
        "ex": "や _y_ a",
        "xs": "j"
      }
    ],
    "consonants": [
      {
        "p": "-i",
        "cat": "Coda",
        "ex": "あい a _-i_",
        "xs": "i^"
      },
      {
        "p": "-u",
        "cat": "Coda",
        "ex": "あう a _-u_",
        "xs": "u^"
      },
      {
        "p": "-N",
        "cat": "Coda",
        "ex": "うん u _-N_",
        "xs": "N\\^"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "た _t_ a",
        "xs": "t"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "だ _d_ a",
        "xs": "d"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "さ _s_ a",
        "xs": "s"
      },
      {
        "p": "sh",
        "cat": "Fricative",
        "ex": "し _sh_ i",
        "xs": "s\\"
      },
      {
        "p": "j",
        "cat": "Affricate",
        "ex": "じ _j_ i",
        "xs": "dz\\"
      },
      {
        "p": "z",
        "cat": "Fricative",
        "ex": "ざ _z_ a",
        "xs": "z"
      },
      {
        "p": "ts",
        "cat": "Affricate",
        "ex": "つ _ts_ u",
        "xs": "ts"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "か _k_ a",
        "xs": "k"
      },
      {
        "p": "kw",
        "cat": "Stop",
        "ex": "くぁ _kw_ a",
        "xs": "kw"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "が _g_ a",
        "xs": "g"
      },
      {
        "p": "gw",
        "cat": "Stop",
        "ex": "ぐぁ _gw_ a",
        "xs": "gw"
      },
      {
        "p": "h",
        "cat": "Fricative",
        "ex": "は _h_ a",
        "xs": "h"
      },
      {
        "p": "b",
        "cat": "Stop",
        "ex": "ば _b_ a",
        "xs": "b"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "ぱ _p_ a",
        "xs": "p"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "ふ _f_ u",
        "xs": "p\\"
      },
      {
        "p": "ch",
        "cat": "Affricate",
        "ex": "ち _ch_ i",
        "xs": "ts\\"
      },
      {
        "p": "ry",
        "cat": "Liquid",
        "ex": "りゃ _ry_ a",
        "xs": "4j"
      },
      {
        "p": "ky",
        "cat": "Stop",
        "ex": "きゃ _ky_ a",
        "xs": "kj"
      },
      {
        "p": "py",
        "cat": "Stop",
        "ex": "ぴゃ _py_ a",
        "xs": "pj"
      },
      {
        "p": "dy",
        "cat": "Stop",
        "ex": "でぃ _dy_ i",
        "xs": "dj"
      },
      {
        "p": "ty",
        "cat": "Stop",
        "ex": "てぃ _ty_ i",
        "xs": "tj"
      },
      {
        "p": "ny",
        "cat": "Nasal",
        "ex": "にゃ _ny_ a",
        "xs": "J"
      },
      {
        "p": "hy",
        "cat": "Fricative",
        "ex": "ひゃ _hy_ a",
        "xs": "C"
      },
      {
        "p": "my",
        "cat": "Nasal",
        "ex": "みゃ _my_ a",
        "xs": "mj"
      },
      {
        "p": "gy",
        "cat": "Stop",
        "ex": "ぎゃ _gy_ a",
        "xs": "gj"
      },
      {
        "p": "by",
        "cat": "Stop",
        "ex": "びゃ _by_ a",
        "xs": "bj"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "な _n_ a",
        "xs": "n"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "ま _m_ a",
        "xs": "m"
      },
      {
        "p": "r",
        "cat": "Liquid",
        "ex": "ら _r_ a",
        "xs": "4"
      },
      {
        "p": "v",
        "cat": "Fricative",
        "ex": "ヴァ _v_ a",
        "xs": "v"
      }
    ]
  },
  "mandarin": {
    "table": "Mandarin Chinese",
    "key": "mandarin",
    "vowels": [
      {
        "p": "a",
        "cat": "Vowel",
        "ex": "大 d _a_",
        "xs": "a"
      },
      {
        "p": "aa",
        "cat": "Vowel",
        "ex": "上 sh _aa_ ng",
        "xs": "A"
      },
      {
        "p": "o/",
        "cat": "Vowel",
        "ex": "喔 _o/_",
        "xs": "O"
      },
      {
        "p": "e/",
        "cat": "Vowel",
        "ex": "声 sh _e/_ ng",
        "xs": "@"
      },
      {
        "p": "ee",
        "cat": "Vowel",
        "ex": "每 m _ee_ -i",
        "xs": "e-"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "地 d _e_",
        "xs": "7"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "中 zh _o_ ng",
        "xs": "U"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "不 b _u_",
        "xs": "u"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "梯 t _i_",
        "xs": "i"
      },
      {
        "p": "iz",
        "cat": "Vowel",
        "ex": "此 c _iz_",
        "xs": "M+"
      },
      {
        "p": "ir",
        "cat": "Vowel",
        "ex": "之 zh _ir_",
        "xs": "r\\`"
      },
      {
        "p": "v",
        "cat": "Vowel",
        "ex": "去 q _v_",
        "xs": "y"
      },
      {
        "p": "ao",
        "cat": "Diphthong",
        "ex": "朝 ch _ao_",
        "xs": "au"
      },
      {
        "p": "ou",
        "cat": "Diphthong",
        "ex": "肉 r _ou_",
        "xs": "ou"
      },
      {
        "p": "ia",
        "cat": "Vowel",
        "ex": "鸭 y _ia_",
        "xs": "ia"
      },
      {
        "p": "iaa",
        "cat": "Vowel",
        "ex": "想 x _iaa_ ng",
        "xs": "iA"
      },
      {
        "p": "iao",
        "cat": "Diphthong",
        "ex": "叫 j _iao_",
        "xs": "iau"
      },
      {
        "p": "ie",
        "cat": "Vowel",
        "ex": "撇 p _ie_",
        "xs": "ie"
      },
      {
        "p": "iae",
        "cat": "Vowel",
        "ex": "千 q _iae_ -n",
        "xs": "iE"
      },
      {
        "p": "io",
        "cat": "Vowel",
        "ex": "永 y _io_ ng",
        "xs": "iU"
      },
      {
        "p": "iu",
        "cat": "Diphthong",
        "ex": "有 y _iu_",
        "xs": "jou"
      },
      {
        "p": "va",
        "cat": "Vowel",
        "ex": "愿 y _va_ -n",
        "xs": "y{"
      },
      {
        "p": "ve",
        "cat": "Vowel",
        "ex": "雪 x _ve_",
        "xs": "yE"
      },
      {
        "p": "ua",
        "cat": "Vowel",
        "ex": "花 h _ua_",
        "xs": "ua"
      },
      {
        "p": "uaa",
        "cat": "Vowel",
        "ex": "望 w _uaa_ ng",
        "xs": "uA"
      },
      {
        "p": "ue/",
        "cat": "Vowel",
        "ex": "春 ch _ue/_ -n",
        "xs": "u@"
      },
      {
        "p": "ue",
        "cat": "Vowel",
        "ex": "最 z _ue_ -i",
        "xs": "ue"
      },
      {
        "p": "uo",
        "cat": "Vowel",
        "ex": "火 h _uo_",
        "xs": "uo"
      },
      {
        "p": "r",
        "cat": "Semivowel",
        "ex": "肉 _r_ ou",
        "xs": "z`"
      },
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "我 _w_ uo",
        "xs": "w"
      },
      {
        "p": "y",
        "cat": "Semivowel",
        "ex": "鸭 _y_ ia",
        "xs": "j"
      }
    ],
    "consonants": [
      {
        "p": "-i",
        "cat": "Coda",
        "ex": "美 m ee _-i_",
        "xs": "i^"
      },
      {
        "p": "-r",
        "cat": "Coda",
        "ex": "尔 a _-r_",
        "xs": "r\\"
      },
      {
        "p": "-n",
        "cat": "Coda",
        "ex": "兰 l a _-n_",
        "xs": ":n"
      },
      {
        "p": "ng",
        "cat": "Coda",
        "ex": "邦 b aa _ng_",
        "xs": ":N"
      },
      {
        "p": "b",
        "cat": "Stop",
        "ex": "邦 _b_ aa ng",
        "xs": "pp"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "旁 _p_ aa ng",
        "xs": "ph"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "地 _d_ e",
        "xs": "tt"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "梯 _t_ i",
        "xs": "th"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "高 _g_ ao",
        "xs": "kk"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "考 _k_ ao",
        "xs": "kh"
      },
      {
        "p": "j",
        "cat": "Affricate",
        "ex": "叫 _j_ iao",
        "xs": "tts\\"
      },
      {
        "p": "z",
        "cat": "Affricate",
        "ex": "在 _z_ a -i",
        "xs": "tts"
      },
      {
        "p": "c",
        "cat": "Affricate",
        "ex": "此 _c_ iz",
        "xs": "tsh"
      },
      {
        "p": "zh",
        "cat": "Affricate",
        "ex": "之 _zh_ ir",
        "xs": "ts`"
      },
      {
        "p": "ch",
        "cat": "Affricate",
        "ex": "吃 _ch_ ir",
        "xs": "ts`h"
      },
      {
        "p": "h",
        "cat": "Fricative",
        "ex": "火 _h_ uo",
        "xs": "x"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "饭 _f_ a -n",
        "xs": "f"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "私 _s_ iz",
        "xs": "s"
      },
      {
        "p": "sh",
        "cat": "Fricative",
        "ex": "石 _sh_ ir",
        "xs": "s`"
      },
      {
        "p": "q",
        "cat": "Affricate",
        "ex": "去 _q_ v",
        "xs": "ts\\h"
      },
      {
        "p": "x",
        "cat": "Fricative",
        "ex": "心 _x_ i -n",
        "xs": "s\\"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "猫 _m_ ao",
        "xs": "m"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "你 _n_ i",
        "xs": "n"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "兰 _l_ a -n",
        "xs": "l"
      }
    ]
  },
  "cantonese": {
    "table": "Cantonese Chinese",
    "key": "cantonese",
    "vowels": [
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "活 _w_ uu -t",
        "xs": "w"
      },
      {
        "p": "j",
        "cat": "Semivowel",
        "ex": "以 _j_ ii",
        "xs": "j"
      },
      {
        "p": "aa",
        "cat": "Vowel",
        "ex": "沙 s _aa_",
        "xs": "a"
      },
      {
        "p": "a",
        "cat": "Vowel",
        "ex": "有 j _a_ -u",
        "xs": "6"
      },
      {
        "p": "ee",
        "cat": "Vowel",
        "ex": "些 s _ee_",
        "xs": "E"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "你 n _e_ -i",
        "xs": "e"
      },
      {
        "p": "ii",
        "cat": "Vowel",
        "ex": "是 s _ii_",
        "xs": "i"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "敬 g _i_ -ng",
        "xs": "I"
      },
      {
        "p": "oo",
        "cat": "Vowel",
        "ex": "愛 _oo_ -y",
        "xs": "O"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "好 h _o_ -u",
        "xs": "o"
      },
      {
        "p": "uu",
        "cat": "Vowel",
        "ex": "夫 f _uu_",
        "xs": "u"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "風 f _u_ -ng",
        "xs": "U"
      },
      {
        "p": "oe",
        "cat": "Vowel",
        "ex": "想 s _oe_ -ng",
        "xs": "9"
      },
      {
        "p": "eo",
        "cat": "Vowel",
        "ex": "水 s _eo_ -y",
        "xs": "8"
      },
      {
        "p": "yu",
        "cat": "Vowel",
        "ex": "書 s _yu_",
        "xs": "y"
      },
      {
        "p": "mm",
        "cat": "Vowel",
        "ex": "唔 _mm_",
        "xs": "m="
      },
      {
        "p": "nng",
        "cat": "Vowel",
        "ex": "五 _nng_",
        "xs": "N="
      }
    ],
    "consonants": [
      {
        "p": "z",
        "cat": "Affricate",
        "ex": "最 _z_ eo -y",
        "xs": "tts"
      },
      {
        "p": "c",
        "cat": "Affricate",
        "ex": "清 _c_ i -ng",
        "xs": "tsh"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "非 _f_ e -i",
        "xs": "f"
      },
      {
        "p": "h",
        "cat": "Fricative",
        "ex": "好 _h_ o -u",
        "xs": "h"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "心 _s_ a -m",
        "xs": "s"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "蘭 _l_ aa -n",
        "xs": "l"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "貓 _m_ aa -u",
        "xs": "m"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "年 _n_ ii -n",
        "xs": "n"
      },
      {
        "p": "ng",
        "cat": "Nasal",
        "ex": "我 _ng_ oo",
        "xs": "N"
      },
      {
        "p": "b",
        "cat": "Stop",
        "ex": "百 _b_ aa -k",
        "xs": "pp"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "拍 _p_ aa -k",
        "xs": "ph"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "大 _d_ aa -i",
        "xs": "tt"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "他 _t_ aa",
        "xs": "th"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "家 _g_ aa",
        "xs": "kk"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "橋 _k_ ii -u",
        "xs": "kh"
      },
      {
        "p": "gw",
        "cat": "Stop",
        "ex": "瓜 _gw_ aa",
        "xs": "kkw"
      },
      {
        "p": "kw",
        "cat": "Stop",
        "ex": "群 _kw_ a -n",
        "xs": "kwh"
      },
      {
        "p": "-i",
        "cat": "Coda",
        "ex": "街 g aa _-i_",
        "xs": ":i"
      },
      {
        "p": "-y",
        "cat": "Coda",
        "ex": "水 s eo _-y_",
        "xs": ":y"
      },
      {
        "p": "-u",
        "cat": "Coda",
        "ex": "教 g aa _-u_",
        "xs": ":u"
      },
      {
        "p": "-m",
        "cat": "Coda",
        "ex": "心 s a _-m_",
        "xs": ":m"
      },
      {
        "p": "-n",
        "cat": "Coda",
        "ex": "山 s aa _-n_",
        "xs": ":n"
      },
      {
        "p": "-ng",
        "cat": "Coda",
        "ex": "送 s u _-ng_",
        "xs": ":N"
      },
      {
        "p": "-p",
        "cat": "Coda",
        "ex": "十 s a _-p_",
        "xs": "p}"
      },
      {
        "p": "-t",
        "cat": "Coda",
        "ex": "一 j a _-t_",
        "xs": "t}"
      },
      {
        "p": "-k",
        "cat": "Coda",
        "ex": "百 b aa _-k_",
        "xs": "k}"
      }
    ]
  },
  "spanish": {
    "table": "Spanish",
    "key": "spanish",
    "vowels": [
      {
        "p": "a",
        "cat": "Vowel",
        "ex": "_a_m_a_r",
        "xs": "a-"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "b_e_b_é_",
        "xs": "e_o"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "t_i_po",
        "xs": "i"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "_o_j_o_",
        "xs": "o_o"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "p_u_ro",
        "xs": "u"
      },
      {
        "p": "W",
        "cat": "Semivowel",
        "ex": "c_u_anto",
        "xs": "w"
      },
      {
        "p": "Y",
        "cat": "Semivowel",
        "ex": "p_i_ano",
        "xs": "j"
      },
      {
        "p": "y",
        "cat": "Semivowel",
        "ex": "_y_o _ll_evo",
        "xs": "j\\"
      }
    ],
    "consonants": [
      {
        "p": "U",
        "cat": "Coda",
        "ex": "ca_u_sa",
        "xs": "u^"
      },
      {
        "p": "I",
        "cat": "Coda",
        "ex": "le_y_",
        "xs": "i^"
      },
      {
        "p": "dj",
        "cat": "Affricate",
        "ex": "_y_o _ll_evo (alt)",
        "xs": "dZ-"
      },
      {
        "p": "b",
        "cat": "Stop",
        "ex": "_v_ivir",
        "xs": "b"
      },
      {
        "p": "B",
        "cat": "Fricative",
        "ex": "vi_v_ir",
        "xs": "B"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "_d_edo",
        "xs": "d"
      },
      {
        "p": "D",
        "cat": "Fricative",
        "ex": "de_d_o",
        "xs": "D"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "_g_riego",
        "xs": "g"
      },
      {
        "p": "G",
        "cat": "Fricative",
        "ex": "grie_g_o",
        "xs": "G"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "_c_asa",
        "xs": "k"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "_p_eso",
        "xs": "p"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "_t_ango",
        "xs": "tt"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "hab_l_ar",
        "xs": "l"
      },
      {
        "p": "rr",
        "cat": "Liquid",
        "ex": "co_rr_o",
        "xs": "r"
      },
      {
        "p": "r",
        "cat": "Liquid",
        "ex": "co_r_o",
        "xs": "4"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "_m_úsica",
        "xs": "m"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "_n_ota",
        "xs": "n"
      },
      {
        "p": "N",
        "cat": "Nasal",
        "ex": "ra_n_go",
        "xs": "N"
      },
      {
        "p": "ny",
        "cat": "Nasal",
        "ex": "espa_ñ_ol",
        "xs": "J"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "_f_lauta",
        "xs": "f"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "_c_ere_z_a",
        "xs": "s"
      },
      {
        "p": "S",
        "cat": "Fricative",
        "ex": "ra_s_go",
        "xs": "z"
      },
      {
        "p": "z",
        "cat": "Fricative",
        "ex": "_c_ere_z_a (alt)",
        "xs": "T"
      },
      {
        "p": "sh",
        "cat": "Fricative",
        "ex": "_sh_ow",
        "xs": "S"
      },
      {
        "p": "ch",
        "cat": "Affricate",
        "ex": "_ch_ispa",
        "xs": "tS"
      },
      {
        "p": "j",
        "cat": "Fricative",
        "ex": "o_j_o",
        "xs": "x"
      },
      {
        "p": "h",
        "cat": "Fricative",
        "ex": "lo_s_ gato_s_ (alt)",
        "xs": "h"
      }
    ]
  },
  "korean": {
    "table": "Korean",
    "key": "korean",
    "vowels": [
      {
        "p": "a",
        "cat": "Vowel",
        "ex": "아 _a_",
        "xs": "6_o"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "애 _e_",
        "xs": "e_o"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "이 _i_",
        "xs": "i-"
      },
      {
        "p": "eu",
        "cat": "Vowel",
        "ex": "으 _eu_",
        "xs": "M"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "오 _o_",
        "xs": "o_o"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "우 _u_",
        "xs": "u"
      },
      {
        "p": "eo",
        "cat": "Vowel",
        "ex": "어 _eo_",
        "xs": "V"
      },
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "와 _w_ a",
        "xs": "w"
      },
      {
        "p": "u/",
        "cat": "Semivowel",
        "ex": "의 _u/_ i",
        "xs": "M\\"
      },
      {
        "p": "y",
        "cat": "Semivowel",
        "ex": "야 _y_ a",
        "xs": "j"
      }
    ],
    "consonants": [
      {
        "p": "r",
        "cat": "Liquid",
        "ex": "라 _r_ a",
        "xs": "4"
      },
      {
        "p": "b",
        "cat": "Stop",
        "ex": "아바 a _b_ a",
        "xs": "b"
      },
      {
        "p": "P",
        "cat": "Stop",
        "ex": "바 _P_ a",
        "xs": "p"
      },
      {
        "p": "pp",
        "cat": "Stop",
        "ex": "빠 _pp_ a",
        "xs": "p_t"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "파 _p_ a",
        "xs": "ph"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "아다 a _d_ a",
        "xs": "d"
      },
      {
        "p": "T",
        "cat": "Stop",
        "ex": "다 _T_ a",
        "xs": "t"
      },
      {
        "p": "tt",
        "cat": "Stop",
        "ex": "따 _tt_ a",
        "xs": "t_t"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "타 _t_ a",
        "xs": "th"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "사 _s_ a",
        "xs": "s"
      },
      {
        "p": "ss",
        "cat": "Fricative",
        "ex": "싸 _ss_ a",
        "xs": "s_t"
      },
      {
        "p": "sh",
        "cat": "Fricative",
        "ex": "시 _sh_ i",
        "xs": "s\\"
      },
      {
        "p": "ssh",
        "cat": "Fricative",
        "ex": "씨 _ssh_ i",
        "xs": "s\\_t"
      },
      {
        "p": "j",
        "cat": "Affricate",
        "ex": "아자 a _j_ a",
        "xs": "dz\\"
      },
      {
        "p": "J",
        "cat": "Affricate",
        "ex": "자 _J_ a",
        "xs": "ts\\"
      },
      {
        "p": "jj",
        "cat": "Affricate",
        "ex": "짜 _jj_ a",
        "xs": "ts\\_t"
      },
      {
        "p": "ch",
        "cat": "Affricate",
        "ex": "차 _ch_ a",
        "xs": "ts\\h"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "아가 a _g_ a",
        "xs": "g"
      },
      {
        "p": "K",
        "cat": "Stop",
        "ex": "가 _K_ a",
        "xs": "k"
      },
      {
        "p": "kk",
        "cat": "Stop",
        "ex": "까 _kk_ a",
        "xs": "k_t"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "카 _k_ a",
        "xs": "kh"
      },
      {
        "p": "h",
        "cat": "Fricative",
        "ex": "하 _h_ a",
        "xs": "h"
      },
      {
        "p": "hy",
        "cat": "Fricative",
        "ex": "햐 _hy_ a",
        "xs": "C"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "알 a _l_",
        "xs": "l"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "마 _m_ a",
        "xs": "m"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "나 _n_ a",
        "xs": "n"
      },
      {
        "p": "ng",
        "cat": "Coda",
        "ex": "앙 a _ng_",
        "xs": ":N"
      },
      {
        "p": "dz\\",
        "cat": "engine-observed",
        "ex": null,
        "observed": true
      }
    ]
  },
  "french": {
    "table": "French",
    "key": "french",
    "vowels": [
      {
        "p": "a",
        "cat": "Vowel",
        "ex": "p_a_s",
        "xs": "a+"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "d_é_jeun_er_",
        "xs": "e"
      },
      {
        "p": "e-",
        "cat": "Vowel",
        "ex": "cl_ai_r_e_tte",
        "xs": "E"
      },
      {
        "p": "x",
        "cat": "Vowel",
        "ex": "c_e_",
        "xs": "@"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "d_î_ner_ie_",
        "xs": "i"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "_au_t_o_",
        "xs": "o"
      },
      {
        "p": "o-",
        "cat": "Vowel",
        "ex": "s_o_tte",
        "xs": "O+"
      },
      {
        "p": "eu-",
        "cat": "Vowel",
        "ex": "j_eu_ne",
        "xs": "9"
      },
      {
        "p": "eu",
        "cat": "Vowel",
        "ex": "y_eux_",
        "xs": "2"
      },
      {
        "p": "ou",
        "cat": "Vowel",
        "ex": "_où_",
        "xs": "u"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "t_u_",
        "xs": "y_o"
      },
      {
        "p": "in",
        "cat": "Vowel",
        "ex": "br_in_",
        "xs": "E~"
      },
      {
        "p": "an",
        "cat": "Vowel",
        "ex": "s_an_s",
        "xs": "A~"
      },
      {
        "p": "on",
        "cat": "Vowel",
        "ex": "s_on_",
        "xs": "O~"
      },
      {
        "p": "y",
        "cat": "Semivowel",
        "ex": "_y_eux",
        "xs": "j"
      },
      {
        "p": "U",
        "cat": "Semivowel",
        "ex": "n_u_ire",
        "xs": "H"
      },
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "_ou_i",
        "xs": "w"
      }
    ],
    "consonants": [
      {
        "p": "b",
        "cat": "Stop",
        "ex": "_b_oue",
        "xs": "b"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "_d_ais",
        "xs": "d"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "_f_ranco_ph_one",
        "xs": "f"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "_g_ain",
        "xs": "g"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "a_c_ousti_qu_e",
        "xs": "k"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "i_l_",
        "xs": "l"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "_m_anger",
        "xs": "m"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "co_nn_exion",
        "xs": "n"
      },
      {
        "p": "gn",
        "cat": "Nasal",
        "ex": "oi_gn_on",
        "xs": "J"
      },
      {
        "p": "N",
        "cat": "Nasal",
        "ex": "campi_ng_",
        "xs": "N"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "_p_omme",
        "xs": "p"
      },
      {
        "p": "R",
        "cat": "Fricative",
        "ex": "_r_ester",
        "xs": "R"
      },
      {
        "p": "r",
        "cat": "Fricative",
        "ex": "t_r_ois",
        "xs": "X"
      },
      {
        "p": "r,",
        "cat": "Liquid",
        "ex": "Pa_r_is (alt)",
        "xs": "R_o"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "re_ss_u_sc_ita_t_ion",
        "xs": "s"
      },
      {
        "p": "ch",
        "cat": "Fricative",
        "ex": "_ch_er",
        "xs": "S"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "es_th_é_t_ique",
        "xs": "t"
      },
      {
        "p": "tch",
        "cat": "Affricate",
        "ex": "caou_tch_ouc",
        "xs": "tS"
      },
      {
        "p": "v",
        "cat": "Fricative",
        "ex": "_v_al_v_e",
        "xs": "v"
      },
      {
        "p": "z",
        "cat": "Fricative",
        "ex": "_z_èbre",
        "xs": "z"
      },
      {
        "p": "j",
        "cat": "Fricative",
        "ex": "_j_u_g_ement",
        "xs": "Z"
      },
      {
        "p": "dj",
        "cat": "Affricate",
        "ex": "a_dj_onction",
        "xs": "dZ"
      }
    ]
  },
  "german": {
    "table": "German",
    "key": "german",
    "vowels": [
      {
        "p": "a",
        "cat": "Vowel",
        "ex": "N_a_chtf_ah_rt",
        "xs": "a"
      },
      {
        "p": "oe",
        "cat": "Vowel",
        "ex": "sch_ö_n",
        "xs": "2"
      },
      {
        "p": "er",
        "cat": "Vowel",
        "ex": "Op_er_",
        "xs": "6"
      },
      {
        "p": "OE",
        "cat": "Vowel",
        "ex": "K_ö_ln",
        "xs": "9"
      },
      {
        "p": "<",
        "cat": "Vowel",
        "ex": "B_e_schlag",
        "xs": "@"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "S_ee_pf_e_rdchen",
        "xs": "e_r"
      },
      {
        "p": "E",
        "cat": "Vowel",
        "ex": "_E_rz_ä_hler",
        "xs": "E"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "L_ie_dt_i_tel",
        "xs": "i"
      },
      {
        "p": "I",
        "cat": "Vowel",
        "ex": "b_i_tte",
        "xs": "I"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "_o_der",
        "xs": "o"
      },
      {
        "p": "O",
        "cat": "Vowel",
        "ex": "v_o_ll",
        "xs": "O"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "F_u_ß",
        "xs": "u"
      },
      {
        "p": "U",
        "cat": "Vowel",
        "ex": "St_u_nde",
        "xs": "U"
      },
      {
        "p": "ue",
        "cat": "Vowel",
        "ex": "_ü_ber",
        "xs": "y"
      },
      {
        "p": "UE",
        "cat": "Vowel",
        "ex": "sch_ü_tzen",
        "xs": "Y"
      },
      {
        "p": "j",
        "cat": "Semivowel",
        "ex": "_J_acke",
        "xs": "j"
      },
      {
        "p": "eu",
        "cat": "Diphthong",
        "ex": "h_eu_te",
        "xs": "Oy"
      },
      {
        "p": "au",
        "cat": "Diphthong",
        "ex": "L_au_t",
        "xs": "aU"
      },
      {
        "p": "ei",
        "cat": "Diphthong",
        "ex": "G_ei_ge",
        "xs": "ai"
      }
    ],
    "consonants": [
      {
        "p": "-r",
        "cat": "Coda",
        "ex": "vo_r_",
        "xs": ":6"
      },
      {
        "p": "b",
        "cat": "Stop",
        "ex": "a_b_er",
        "xs": "b"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "o_d_er",
        "xs": "d"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "Lü_g_e",
        "xs": "g"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "_k_lu_g_",
        "xs": "kh"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "_P_ack",
        "xs": "ph"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "_Th_ea_t_er_t_ag",
        "xs": "th"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "_L_iebe",
        "xs": "l"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "_M_aus",
        "xs": "m"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "fü_n_f",
        "xs": "n"
      },
      {
        "p": "ng",
        "cat": "Nasal",
        "ex": "la_ng_",
        "xs": "N"
      },
      {
        "p": "ch",
        "cat": "Fricative",
        "ex": "ri_ch_ti_g_",
        "xs": "C"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "_f_ade",
        "xs": "f"
      },
      {
        "p": "h",
        "cat": "Fricative",
        "ex": "_H_armonie",
        "xs": "h"
      },
      {
        "p": "R",
        "cat": "Fricative",
        "ex": "_R_ost",
        "xs": "R"
      },
      {
        "p": "r",
        "cat": "Fricative",
        "ex": "T_r_eppe",
        "xs": "X"
      },
      {
        "p": "pf",
        "cat": "Affricate",
        "ex": "_Pf_irsiche",
        "xs": "pf"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "Hau_s_stra_ß_e",
        "xs": "s"
      },
      {
        "p": "S",
        "cat": "Fricative",
        "ex": "_S_par_sch_wein",
        "xs": "Sw"
      },
      {
        "p": "tS",
        "cat": "Affricate",
        "ex": "_Tsch_üss",
        "xs": "tSw"
      },
      {
        "p": "ts",
        "cat": "Affricate",
        "ex": "_Z_usa_tz_",
        "xs": "ts"
      },
      {
        "p": "w",
        "cat": "Fricative",
        "ex": "_W_ächter",
        "xs": "v"
      },
      {
        "p": "kh",
        "cat": "Fricative",
        "ex": "Bu_ch_",
        "xs": "x"
      },
      {
        "p": "Z",
        "cat": "Fricative",
        "ex": "Gara_g_e",
        "xs": "Zw"
      },
      {
        "p": "z",
        "cat": "Fricative",
        "ex": "_s_auber",
        "xs": "z"
      }
    ]
  },
  "italian": {
    "table": "Italian",
    "key": "italian",
    "vowels": [
      {
        "p": "a",
        "cat": "Vowel",
        "ex": "c_a_s_a_",
        "xs": "a"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "stell_e_",
        "xs": "e_r"
      },
      {
        "p": "E",
        "cat": "Vowel",
        "ex": "b_e_ne",
        "xs": "E"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "viol_i_no",
        "xs": "i"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "_o_mbra",
        "xs": "o"
      },
      {
        "p": "O",
        "cat": "Vowel",
        "ex": "par_o_la",
        "xs": "O"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "t_u_tto",
        "xs": "u"
      },
      {
        "p": "j",
        "cat": "Semivowel",
        "ex": "_i_one",
        "xs": "j"
      },
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "_u_omo",
        "xs": "w"
      }
    ],
    "consonants": [
      {
        "p": "b",
        "cat": "Stop",
        "ex": "_b_allata",
        "xs": "b"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "_d_are",
        "xs": "d"
      },
      {
        "p": "dz",
        "cat": "Affricate",
        "ex": "_z_ero",
        "xs": "dz"
      },
      {
        "p": "dZ",
        "cat": "Affricate",
        "ex": "_g_emma",
        "xs": "dZ"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "_f_antasma",
        "xs": "f"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "_g_are",
        "xs": "g"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "_c_asa",
        "xs": "k"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "_l_etto",
        "xs": "l"
      },
      {
        "p": "L",
        "cat": "Liquid",
        "ex": "fi_gl_io",
        "xs": "L"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "_m_a_mm_a",
        "xs": "m"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "i_n_vece",
        "xs": "n"
      },
      {
        "p": "N",
        "cat": "Nasal",
        "ex": "a_n_che",
        "xs": "N"
      },
      {
        "p": "J",
        "cat": "Nasal",
        "ex": "ba_gn_o",
        "xs": "J"
      },
      {
        "p": "p",
        "cat": "Stop",
        "ex": "_p_apà",
        "xs": "p"
      },
      {
        "p": "r",
        "cat": "Liquid",
        "ex": "te_rr_a",
        "xs": "r"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "_s_ali",
        "xs": "s"
      },
      {
        "p": "S",
        "cat": "Fricative",
        "ex": "fa_sc_e",
        "xs": "S"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "_t_ale",
        "xs": "t"
      },
      {
        "p": "ts",
        "cat": "Affricate",
        "ex": "gra_z_ia",
        "xs": "ts"
      },
      {
        "p": "tS",
        "cat": "Affricate",
        "ex": "_ci_ao",
        "xs": "tS"
      },
      {
        "p": "v",
        "cat": "Fricative",
        "ex": "a_v_are",
        "xs": "v"
      },
      {
        "p": "z",
        "cat": "Fricative",
        "ex": "ca_s_o",
        "xs": "z"
      }
    ]
  },
  "portuguese": {
    "table": "Portuguese",
    "key": "portuguese",
    "vowels": [
      {
        "p": "a",
        "cat": "Vowel",
        "ex": "_a_c_á_cia",
        "xs": "a"
      },
      {
        "p": "-a",
        "cat": "Vowel",
        "ex": "aj_a_",
        "xs": "6"
      },
      {
        "p": "eh",
        "cat": "Vowel",
        "ex": "p_é_",
        "xs": "E"
      },
      {
        "p": "e",
        "cat": "Vowel",
        "ex": "_e_xp_e_riência",
        "xs": "e"
      },
      {
        "p": "i",
        "cat": "Vowel",
        "ex": "_i_n_í_c_i_o",
        "xs": "i"
      },
      {
        "p": "oh",
        "cat": "Vowel",
        "ex": "fof_o_ca",
        "xs": "O"
      },
      {
        "p": "o",
        "cat": "Vowel",
        "ex": "d_o_d_ô_",
        "xs": "o"
      },
      {
        "p": "u",
        "cat": "Vowel",
        "ex": "t_u_",
        "xs": "u"
      },
      {
        "p": "an",
        "cat": "Vowel",
        "ex": "am_a_nh_ã_",
        "xs": "6~"
      },
      {
        "p": "en",
        "cat": "Vowel",
        "ex": "_en_tro",
        "xs": "e~"
      },
      {
        "p": "in",
        "cat": "Vowel",
        "ex": "v_im_",
        "xs": "i~"
      },
      {
        "p": "on",
        "cat": "Vowel",
        "ex": "s_om_",
        "xs": "o~"
      },
      {
        "p": "un",
        "cat": "Vowel",
        "ex": "m_un_do",
        "xs": "u~"
      },
      {
        "p": "w",
        "cat": "Semivowel",
        "ex": "qua_l_",
        "xs": "w"
      },
      {
        "p": "y",
        "cat": "Semivowel",
        "ex": "bo_i_a",
        "xs": "j"
      }
    ],
    "consonants": [
      {
        "p": "p",
        "cat": "Stop",
        "ex": "_p_ai",
        "xs": "p"
      },
      {
        "p": "b",
        "cat": "Stop",
        "ex": "_b_ato",
        "xs": "b"
      },
      {
        "p": "t",
        "cat": "Stop",
        "ex": "mon_t_anha",
        "xs": "t"
      },
      {
        "p": "d",
        "cat": "Stop",
        "ex": "_d_ar",
        "xs": "d"
      },
      {
        "p": "k",
        "cat": "Stop",
        "ex": "_c_ava_qu_inho",
        "xs": "k"
      },
      {
        "p": "g",
        "cat": "Stop",
        "ex": "_g_a_gu_eira",
        "xs": "g"
      },
      {
        "p": "kw",
        "cat": "Stop",
        "ex": "_qu_atro",
        "xs": "kw"
      },
      {
        "p": "gw",
        "cat": "Stop",
        "ex": "_gu_axinim",
        "xs": "gw"
      },
      {
        "p": "f",
        "cat": "Fricative",
        "ex": "_f_ala",
        "xs": "f"
      },
      {
        "p": "v",
        "cat": "Fricative",
        "ex": "_v_ila",
        "xs": "v"
      },
      {
        "p": "s",
        "cat": "Fricative",
        "ex": "_s_u_c_e_ss_ão",
        "xs": "s"
      },
      {
        "p": "z",
        "cat": "Fricative",
        "ex": "mú_s_ica",
        "xs": "z"
      },
      {
        "p": "ch",
        "cat": "Fricative",
        "ex": "_ch_uva",
        "xs": "S"
      },
      {
        "p": "j",
        "cat": "Fricative",
        "ex": "lo_j_a",
        "xs": "Z"
      },
      {
        "p": "m",
        "cat": "Nasal",
        "ex": "_m_ato",
        "xs": "m"
      },
      {
        "p": "n",
        "cat": "Nasal",
        "ex": "_n_ari_n_a",
        "xs": "n"
      },
      {
        "p": "-n",
        "cat": "Nasal",
        "ex": "ma_n_ga",
        "xs": "N"
      },
      {
        "p": "nh",
        "cat": "Nasal",
        "ex": "so_nh_o",
        "xs": "j~_r"
      },
      {
        "p": "l",
        "cat": "Liquid",
        "ex": "_l_ero-_l_ero",
        "xs": "l"
      },
      {
        "p": "lh",
        "cat": "Liquid",
        "ex": "a_lh_o",
        "xs": "L"
      },
      {
        "p": "r",
        "cat": "Liquid",
        "ex": "p_r_ato",
        "xs": "4"
      },
      {
        "p": "R",
        "cat": "Fricative",
        "ex": "_r_eco_rr_ente",
        "xs": "h"
      },
      {
        "p": "-r",
        "cat": "Liquid",
        "ex": "amo_r_ (alt)",
        "xs": "r\\"
      },
      {
        "p": "rr",
        "cat": "Liquid",
        "ex": "_r_eco_rr_ente (alt)",
        "xs": "r"
      },
      {
        "p": "H",
        "cat": "Coda",
        "ex": "amo_r_",
        "xs": ":X"
      },
      {
        "p": "wn",
        "cat": "Coda",
        "ex": "sã_o_",
        "xs": "w~"
      },
      {
        "p": "yn",
        "cat": "Coda",
        "ex": "be_m_",
        "xs": "j~"
      },
      {
        "p": "tch",
        "cat": "Affricate",
        "ex": "presen_t_e",
        "xs": "tS"
      },
      {
        "p": "dj",
        "cat": "Affricate",
        "ex": "gran_d_e",
        "xs": "dZ"
      }
    ]
  },
  "common": {
    "table": "Common phonemes",
    "key": "common",
    "vowels": [],
    "consonants": [
      {
        "p": "cl",
        "cat": null,
        "ex": null,
        "xs": null
      },
      {
        "p": "sil",
        "cat": null,
        "ex": null,
        "xs": null
      },
      {
        "p": "br",
        "cat": null,
        "ex": null,
        "xs": null
      },
      {
        "p": "br1",
        "cat": null,
        "ex": null,
        "xs": null
      },
      {
        "p": "br2",
        "cat": null,
        "ex": null,
        "xs": null
      },
      {
        "p": "brl1",
        "cat": null,
        "ex": null,
        "xs": null
      },
      {
        "p": "brl2",
        "cat": null,
        "ex": null,
        "xs": null
      }
    ]
  }
};

/** 语言顺序：参考 JS 的 6 语言在前，其余官方表语种（fr/de/it/pt）在后 */
export const LANG_ORDER: string[] = ["mandarin","english","japanese","cantonese","spanish","korean","french","german","italian","portuguese"];

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
