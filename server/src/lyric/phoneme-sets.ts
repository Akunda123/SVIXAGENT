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
      "example": "_o_n",
      "description": null
    },
    {
      "phoneme": "ae",
      "category": "Vowel",
      "big": "vowel",
      "example": "c_a_t",
      "description": null
    },
    {
      "phoneme": "ah",
      "category": "Vowel",
      "big": "vowel",
      "example": "_u_ncle",
      "description": null
    },
    {
      "phoneme": "ao",
      "category": "Vowel",
      "big": "vowel",
      "example": "c_augh_t",
      "description": null
    },
    {
      "phoneme": "aw",
      "category": "Diphthong",
      "big": "vowel",
      "example": "_ou_t",
      "description": null
    },
    {
      "phoneme": "ax",
      "category": "Vowel",
      "big": "vowel",
      "example": "_a_rena",
      "description": null
    },
    {
      "phoneme": "ay",
      "category": "Diphthong",
      "big": "vowel",
      "example": "f_i_ne",
      "description": null
    },
    {
      "phoneme": "eax",
      "category": "Diphthong",
      "big": "vowel",
      "example": "sq_uare_ (British)",
      "description": null
    },
    {
      "phoneme": "eh",
      "category": "Vowel",
      "big": "vowel",
      "example": "b_e_d",
      "description": null
    },
    {
      "phoneme": "er",
      "category": "Vowel",
      "big": "vowel",
      "example": "b_ur_g_er_",
      "description": null
    },
    {
      "phoneme": "ey",
      "category": "Diphthong",
      "big": "vowel",
      "example": "p_ay_",
      "description": null
    },
    {
      "phoneme": "iax",
      "category": "Diphthong",
      "big": "vowel",
      "example": "n_ear_ (British)",
      "description": null
    },
    {
      "phoneme": "ih",
      "category": "Vowel",
      "big": "vowel",
      "example": "b_i_t",
      "description": null
    },
    {
      "phoneme": "iy",
      "category": "Vowel",
      "big": "vowel",
      "example": "fr_ee_",
      "description": null
    },
    {
      "phoneme": "oh",
      "category": "Vowel",
      "big": "vowel",
      "example": "n_or_th (British)",
      "description": null
    },
    {
      "phoneme": "ow",
      "category": "Diphthong",
      "big": "vowel",
      "example": "r_ow_",
      "description": null
    },
    {
      "phoneme": "oy",
      "category": "Diphthong",
      "big": "vowel",
      "example": "b_oy_",
      "description": null
    },
    {
      "phoneme": "r",
      "category": "Semivowel",
      "big": "glide",
      "example": "_r_ed",
      "description": null
    },
    {
      "phoneme": "uax",
      "category": "Diphthong",
      "big": "vowel",
      "example": "c_ure_ (British)",
      "description": null
    },
    {
      "phoneme": "uh",
      "category": "Vowel",
      "big": "vowel",
      "example": "h_oo_k",
      "description": null
    },
    {
      "phoneme": "uw",
      "category": "Vowel",
      "big": "vowel",
      "example": "b_oo_",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "_w_eep",
      "description": null
    },
    {
      "phoneme": "y",
      "category": "Semivowel",
      "big": "glide",
      "example": "_y_ou",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "_b_ack",
      "description": null
    },
    {
      "phoneme": "ch",
      "category": "Affricate",
      "big": "consonant",
      "example": "bea_ch_",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "_d_ash",
      "description": null
    },
    {
      "phoneme": "dx",
      "category": "Liquid",
      "big": "consonant",
      "example": "be_tt_er",
      "description": null
    },
    {
      "phoneme": "dr",
      "category": "Affricate",
      "big": "consonant",
      "example": "_dr_eam",
      "description": null
    },
    {
      "phoneme": "dh",
      "category": "Fricative",
      "big": "consonant",
      "example": "_th_is",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "_f_ill",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "_g_ame",
      "description": null
    },
    {
      "phoneme": "hh",
      "category": "Fricative",
      "big": "consonant",
      "example": "_h_igh",
      "description": null
    },
    {
      "phoneme": "jh",
      "category": "Affricate",
      "big": "consonant",
      "example": "_j_eans",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "_k_iss",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "_l_et",
      "description": null
    },
    {
      "phoneme": "ll",
      "category": "Coda",
      "big": "coda",
      "example": "fu_ll_",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "_m_usic",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "_n_ice",
      "description": null
    },
    {
      "phoneme": "ng",
      "category": "Nasal",
      "big": "consonant",
      "example": "si_ng_",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "_p_ack",
      "description": null
    },
    {
      "phoneme": "q",
      "category": "Stop",
      "big": "consonant",
      "example": "uh_-_oh",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "_s_it",
      "description": null
    },
    {
      "phoneme": "sh",
      "category": "Fricative",
      "big": "consonant",
      "example": "_sh_eep",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "_t_all",
      "description": null
    },
    {
      "phoneme": "tr",
      "category": "Affricate",
      "big": "consonant",
      "example": "_tr_ee",
      "description": null
    },
    {
      "phoneme": "th",
      "category": "Fricative",
      "big": "consonant",
      "example": "_th_ink",
      "description": null
    },
    {
      "phoneme": "v",
      "category": "Fricative",
      "big": "consonant",
      "example": "_v_al_v_e",
      "description": null
    },
    {
      "phoneme": "z",
      "category": "Fricative",
      "big": "consonant",
      "example": "_z_oo",
      "description": null
    },
    {
      "phoneme": "zh",
      "category": "Fricative",
      "big": "consonant",
      "example": "vi_s_ion",
      "description": null
    }
  ],
  "Japanese - ROMAJI": [
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "あ _a_",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "い _i_",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "う _u_",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "え _e_",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "お _o_",
      "description": null
    },
    {
      "phoneme": "N",
      "category": "Vowel",
      "big": "vowel",
      "example": "ん _N_",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "わ _w_ a",
      "description": null
    },
    {
      "phoneme": "y",
      "category": "Semivowel",
      "big": "glide",
      "example": "や _y_ a",
      "description": null
    },
    {
      "phoneme": "-i",
      "category": "Coda",
      "big": "coda",
      "example": "あい a _-i_",
      "description": null
    },
    {
      "phoneme": "-u",
      "category": "Coda",
      "big": "coda",
      "example": "あう a _-u_",
      "description": null
    },
    {
      "phoneme": "-N",
      "category": "Coda",
      "big": "coda",
      "example": "うん u _-N_",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "た _t_ a",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "だ _d_ a",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "さ _s_ a",
      "description": null
    },
    {
      "phoneme": "sh",
      "category": "Fricative",
      "big": "consonant",
      "example": "し _sh_ i",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Affricate",
      "big": "consonant",
      "example": "じ _j_ i",
      "description": null
    },
    {
      "phoneme": "z",
      "category": "Fricative",
      "big": "consonant",
      "example": "ざ _z_ a",
      "description": null
    },
    {
      "phoneme": "ts",
      "category": "Affricate",
      "big": "consonant",
      "example": "つ _ts_ u",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "か _k_ a",
      "description": null
    },
    {
      "phoneme": "kw",
      "category": "Stop",
      "big": "consonant",
      "example": "くぁ _kw_ a",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "が _g_ a",
      "description": null
    },
    {
      "phoneme": "gw",
      "category": "Stop",
      "big": "consonant",
      "example": "ぐぁ _gw_ a",
      "description": null
    },
    {
      "phoneme": "h",
      "category": "Fricative",
      "big": "consonant",
      "example": "は _h_ a",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "ば _b_ a",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "ぱ _p_ a",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "ふ _f_ u",
      "description": null
    },
    {
      "phoneme": "ch",
      "category": "Affricate",
      "big": "consonant",
      "example": "ち _ch_ i",
      "description": null
    },
    {
      "phoneme": "ry",
      "category": "Liquid",
      "big": "consonant",
      "example": "りゃ _ry_ a",
      "description": null
    },
    {
      "phoneme": "ky",
      "category": "Stop",
      "big": "consonant",
      "example": "きゃ _ky_ a",
      "description": null
    },
    {
      "phoneme": "py",
      "category": "Stop",
      "big": "consonant",
      "example": "ぴゃ _py_ a",
      "description": null
    },
    {
      "phoneme": "dy",
      "category": "Stop",
      "big": "consonant",
      "example": "でぃ _dy_ i",
      "description": null
    },
    {
      "phoneme": "ty",
      "category": "Stop",
      "big": "consonant",
      "example": "てぃ _ty_ i",
      "description": null
    },
    {
      "phoneme": "ny",
      "category": "Nasal",
      "big": "consonant",
      "example": "にゃ _ny_ a",
      "description": null
    },
    {
      "phoneme": "hy",
      "category": "Fricative",
      "big": "consonant",
      "example": "ひゃ _hy_ a",
      "description": null
    },
    {
      "phoneme": "my",
      "category": "Nasal",
      "big": "consonant",
      "example": "みゃ _my_ a",
      "description": null
    },
    {
      "phoneme": "gy",
      "category": "Stop",
      "big": "consonant",
      "example": "ぎゃ _gy_ a",
      "description": null
    },
    {
      "phoneme": "by",
      "category": "Stop",
      "big": "consonant",
      "example": "びゃ _by_ a",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "な _n_ a",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "ま _m_ a",
      "description": null
    },
    {
      "phoneme": "r",
      "category": "Liquid",
      "big": "consonant",
      "example": "ら _r_ a",
      "description": null
    },
    {
      "phoneme": "v",
      "category": "Fricative",
      "big": "consonant",
      "example": "ヴァ _v_ a",
      "description": null
    }
  ],
  "Mandarin Chinese": [
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "大 d _a_",
      "description": null
    },
    {
      "phoneme": "aa",
      "category": "Vowel",
      "big": "vowel",
      "example": "上 sh _aa_ ng",
      "description": null
    },
    {
      "phoneme": "o/",
      "category": "Vowel",
      "big": "vowel",
      "example": "喔 _o/_",
      "description": null
    },
    {
      "phoneme": "e/",
      "category": "Vowel",
      "big": "vowel",
      "example": "声 sh _e/_ ng",
      "description": null
    },
    {
      "phoneme": "ee",
      "category": "Vowel",
      "big": "vowel",
      "example": "每 m _ee_ -i",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "地 d _e_",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "中 zh _o_ ng",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "不 b _u_",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "梯 t _i_",
      "description": null
    },
    {
      "phoneme": "iz",
      "category": "Vowel",
      "big": "vowel",
      "example": "此 c _iz_",
      "description": null
    },
    {
      "phoneme": "ir",
      "category": "Vowel",
      "big": "vowel",
      "example": "之 zh _ir_",
      "description": null
    },
    {
      "phoneme": "v",
      "category": "Vowel",
      "big": "vowel",
      "example": "去 q _v_",
      "description": null
    },
    {
      "phoneme": "ao",
      "category": "Diphthong",
      "big": "vowel",
      "example": "朝 ch _ao_",
      "description": null
    },
    {
      "phoneme": "ou",
      "category": "Diphthong",
      "big": "vowel",
      "example": "肉 r _ou_",
      "description": null
    },
    {
      "phoneme": "ia",
      "category": "Vowel",
      "big": "vowel",
      "example": "鸭 y _ia_",
      "description": null
    },
    {
      "phoneme": "iaa",
      "category": "Vowel",
      "big": "vowel",
      "example": "想 x _iaa_ ng",
      "description": null
    },
    {
      "phoneme": "iao",
      "category": "Diphthong",
      "big": "vowel",
      "example": "叫 j _iao_",
      "description": null
    },
    {
      "phoneme": "ie",
      "category": "Vowel",
      "big": "vowel",
      "example": "撇 p _ie_",
      "description": null
    },
    {
      "phoneme": "iae",
      "category": "Vowel",
      "big": "vowel",
      "example": "千 q _iae_ -n",
      "description": null
    },
    {
      "phoneme": "io",
      "category": "Vowel",
      "big": "vowel",
      "example": "永 y _io_ ng",
      "description": null
    },
    {
      "phoneme": "iu",
      "category": "Diphthong",
      "big": "vowel",
      "example": "有 y _iu_",
      "description": null
    },
    {
      "phoneme": "va",
      "category": "Vowel",
      "big": "vowel",
      "example": "愿 y _va_ -n",
      "description": null
    },
    {
      "phoneme": "ve",
      "category": "Vowel",
      "big": "vowel",
      "example": "雪 x _ve_",
      "description": null
    },
    {
      "phoneme": "ua",
      "category": "Vowel",
      "big": "vowel",
      "example": "花 h _ua_",
      "description": null
    },
    {
      "phoneme": "uaa",
      "category": "Vowel",
      "big": "vowel",
      "example": "望 w _uaa_ ng",
      "description": null
    },
    {
      "phoneme": "ue/",
      "category": "Vowel",
      "big": "vowel",
      "example": "春 ch _ue/_ -n",
      "description": null
    },
    {
      "phoneme": "ue",
      "category": "Vowel",
      "big": "vowel",
      "example": "最 z _ue_ -i",
      "description": null
    },
    {
      "phoneme": "uo",
      "category": "Vowel",
      "big": "vowel",
      "example": "火 h _uo_",
      "description": null
    },
    {
      "phoneme": "r",
      "category": "Semivowel",
      "big": "glide",
      "example": "肉 _r_ ou",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "我 _w_ uo",
      "description": null
    },
    {
      "phoneme": "y",
      "category": "Semivowel",
      "big": "glide",
      "example": "鸭 _y_ ia",
      "description": null
    },
    {
      "phoneme": "-i",
      "category": "Coda",
      "big": "coda",
      "example": "美 m ee _-i_",
      "description": null
    },
    {
      "phoneme": "-r",
      "category": "Coda",
      "big": "coda",
      "example": "尔 a _-r_",
      "description": null
    },
    {
      "phoneme": "-n",
      "category": "Coda",
      "big": "coda",
      "example": "兰 l a _-n_",
      "description": null
    },
    {
      "phoneme": "ng",
      "category": "Coda",
      "big": "coda",
      "example": "邦 b aa _ng_",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "邦 _b_ aa ng",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "旁 _p_ aa ng",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "地 _d_ e",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "梯 _t_ i",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "高 _g_ ao",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "考 _k_ ao",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Affricate",
      "big": "consonant",
      "example": "叫 _j_ iao",
      "description": null
    },
    {
      "phoneme": "z",
      "category": "Affricate",
      "big": "consonant",
      "example": "在 _z_ a -i",
      "description": null
    },
    {
      "phoneme": "c",
      "category": "Affricate",
      "big": "consonant",
      "example": "此 _c_ iz",
      "description": null
    },
    {
      "phoneme": "zh",
      "category": "Affricate",
      "big": "consonant",
      "example": "之 _zh_ ir",
      "description": null
    },
    {
      "phoneme": "ch",
      "category": "Affricate",
      "big": "consonant",
      "example": "吃 _ch_ ir",
      "description": null
    },
    {
      "phoneme": "h",
      "category": "Fricative",
      "big": "consonant",
      "example": "火 _h_ uo",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "饭 _f_ a -n",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "私 _s_ iz",
      "description": null
    },
    {
      "phoneme": "sh",
      "category": "Fricative",
      "big": "consonant",
      "example": "石 _sh_ ir",
      "description": null
    },
    {
      "phoneme": "q",
      "category": "Affricate",
      "big": "consonant",
      "example": "去 _q_ v",
      "description": null
    },
    {
      "phoneme": "x",
      "category": "Fricative",
      "big": "consonant",
      "example": "心 _x_ i -n",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "猫 _m_ ao",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "你 _n_ i",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "兰 _l_ a -n",
      "description": null
    }
  ],
  "Cantonese Chinese": [
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "活 _w_ uu -t",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Semivowel",
      "big": "glide",
      "example": "以 _j_ ii",
      "description": null
    },
    {
      "phoneme": "aa",
      "category": "Vowel",
      "big": "vowel",
      "example": "沙 s _aa_",
      "description": null
    },
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "有 j _a_ -u",
      "description": null
    },
    {
      "phoneme": "ee",
      "category": "Vowel",
      "big": "vowel",
      "example": "些 s _ee_",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "你 n _e_ -i",
      "description": null
    },
    {
      "phoneme": "ii",
      "category": "Vowel",
      "big": "vowel",
      "example": "是 s _ii_",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "敬 g _i_ -ng",
      "description": null
    },
    {
      "phoneme": "oo",
      "category": "Vowel",
      "big": "vowel",
      "example": "愛 _oo_ -y",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "好 h _o_ -u",
      "description": null
    },
    {
      "phoneme": "uu",
      "category": "Vowel",
      "big": "vowel",
      "example": "夫 f _uu_",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "風 f _u_ -ng",
      "description": null
    },
    {
      "phoneme": "oe",
      "category": "Vowel",
      "big": "vowel",
      "example": "想 s _oe_ -ng",
      "description": null
    },
    {
      "phoneme": "eo",
      "category": "Vowel",
      "big": "vowel",
      "example": "水 s _eo_ -y",
      "description": null
    },
    {
      "phoneme": "yu",
      "category": "Vowel",
      "big": "vowel",
      "example": "書 s _yu_",
      "description": null
    },
    {
      "phoneme": "mm",
      "category": "Vowel",
      "big": "vowel",
      "example": "唔 _mm_",
      "description": null
    },
    {
      "phoneme": "nng",
      "category": "Vowel",
      "big": "vowel",
      "example": "五 _nng_",
      "description": null
    },
    {
      "phoneme": "z",
      "category": "Affricate",
      "big": "consonant",
      "example": "最 _z_ eo -y",
      "description": null
    },
    {
      "phoneme": "c",
      "category": "Affricate",
      "big": "consonant",
      "example": "清 _c_ i -ng",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "非 _f_ e -i",
      "description": null
    },
    {
      "phoneme": "h",
      "category": "Fricative",
      "big": "consonant",
      "example": "好 _h_ o -u",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "心 _s_ a -m",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "蘭 _l_ aa -n",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "貓 _m_ aa -u",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "年 _n_ ii -n",
      "description": null
    },
    {
      "phoneme": "ng",
      "category": "Nasal",
      "big": "consonant",
      "example": "我 _ng_ oo",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "百 _b_ aa -k",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "拍 _p_ aa -k",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "大 _d_ aa -i",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "他 _t_ aa",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "家 _g_ aa",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "橋 _k_ ii -u",
      "description": null
    },
    {
      "phoneme": "gw",
      "category": "Stop",
      "big": "consonant",
      "example": "瓜 _gw_ aa",
      "description": null
    },
    {
      "phoneme": "kw",
      "category": "Stop",
      "big": "consonant",
      "example": "群 _kw_ a -n",
      "description": null
    },
    {
      "phoneme": "-i",
      "category": "Coda",
      "big": "coda",
      "example": "街 g aa _-i_",
      "description": null
    },
    {
      "phoneme": "-y",
      "category": "Coda",
      "big": "coda",
      "example": "水 s eo _-y_",
      "description": null
    },
    {
      "phoneme": "-u",
      "category": "Coda",
      "big": "coda",
      "example": "教 g aa _-u_",
      "description": null
    },
    {
      "phoneme": "-m",
      "category": "Coda",
      "big": "coda",
      "example": "心 s a _-m_",
      "description": null
    },
    {
      "phoneme": "-n",
      "category": "Coda",
      "big": "coda",
      "example": "山 s aa _-n_",
      "description": null
    },
    {
      "phoneme": "-ng",
      "category": "Coda",
      "big": "coda",
      "example": "送 s u _-ng_",
      "description": null
    },
    {
      "phoneme": "-p",
      "category": "Coda",
      "big": "coda",
      "example": "十 s a _-p_",
      "description": null
    },
    {
      "phoneme": "-t",
      "category": "Coda",
      "big": "coda",
      "example": "一 j a _-t_",
      "description": null
    },
    {
      "phoneme": "-k",
      "category": "Coda",
      "big": "coda",
      "example": "百 b aa _-k_",
      "description": null
    }
  ],
  "Spanish": [
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "_a_m_a_r",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "b_e_b_é_",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "t_i_po",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "_o_j_o_",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "p_u_ro",
      "description": null
    },
    {
      "phoneme": "W",
      "category": "Semivowel",
      "big": "glide",
      "example": "c_u_anto",
      "description": null
    },
    {
      "phoneme": "Y",
      "category": "Semivowel",
      "big": "glide",
      "example": "p_i_ano",
      "description": null
    },
    {
      "phoneme": "y",
      "category": "Semivowel",
      "big": "glide",
      "example": "_y_o _ll_evo",
      "description": null
    },
    {
      "phoneme": "U",
      "category": "Coda",
      "big": "coda",
      "example": "ca_u_sa",
      "description": null
    },
    {
      "phoneme": "I",
      "category": "Coda",
      "big": "coda",
      "example": "le_y_",
      "description": null
    },
    {
      "phoneme": "dj",
      "category": "Affricate",
      "big": "consonant",
      "example": "_y_o _ll_evo (alt)",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "_v_ivir",
      "description": null
    },
    {
      "phoneme": "B",
      "category": "Fricative",
      "big": "consonant",
      "example": "vi_v_ir",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "_d_edo",
      "description": null
    },
    {
      "phoneme": "D",
      "category": "Fricative",
      "big": "consonant",
      "example": "de_d_o",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "_g_riego",
      "description": null
    },
    {
      "phoneme": "G",
      "category": "Fricative",
      "big": "consonant",
      "example": "grie_g_o",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "_c_asa",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "_p_eso",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "_t_ango",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "hab_l_ar",
      "description": null
    },
    {
      "phoneme": "rr",
      "category": "Liquid",
      "big": "consonant",
      "example": "co_rr_o",
      "description": null
    },
    {
      "phoneme": "r",
      "category": "Liquid",
      "big": "consonant",
      "example": "co_r_o",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "_m_úsica",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "_n_ota",
      "description": null
    },
    {
      "phoneme": "N",
      "category": "Nasal",
      "big": "consonant",
      "example": "ra_n_go",
      "description": null
    },
    {
      "phoneme": "ny",
      "category": "Nasal",
      "big": "consonant",
      "example": "espa_ñ_ol",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "_f_lauta",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "_c_ere_z_a",
      "description": null
    },
    {
      "phoneme": "S",
      "category": "Fricative",
      "big": "consonant",
      "example": "ra_s_go",
      "description": null
    },
    {
      "phoneme": "z",
      "category": "Fricative",
      "big": "consonant",
      "example": "_c_ere_z_a (alt)",
      "description": null
    },
    {
      "phoneme": "sh",
      "category": "Fricative",
      "big": "consonant",
      "example": "_sh_ow",
      "description": null
    },
    {
      "phoneme": "ch",
      "category": "Affricate",
      "big": "consonant",
      "example": "_ch_ispa",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Fricative",
      "big": "consonant",
      "example": "o_j_o",
      "description": null
    },
    {
      "phoneme": "h",
      "category": "Fricative",
      "big": "consonant",
      "example": "lo_s_ gato_s_ (alt)",
      "description": null
    }
  ],
  "Korean": [
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "아 _a_",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "애 _e_",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "이 _i_",
      "description": null
    },
    {
      "phoneme": "eu",
      "category": "Vowel",
      "big": "vowel",
      "example": "으 _eu_",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "오 _o_",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "우 _u_",
      "description": null
    },
    {
      "phoneme": "eo",
      "category": "Vowel",
      "big": "vowel",
      "example": "어 _eo_",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "와 _w_ a",
      "description": null
    },
    {
      "phoneme": "u/",
      "category": "Semivowel",
      "big": "glide",
      "example": "의 _u/_ i",
      "description": null
    },
    {
      "phoneme": "y",
      "category": "Semivowel",
      "big": "glide",
      "example": "야 _y_ a",
      "description": null
    },
    {
      "phoneme": "r",
      "category": "Liquid",
      "big": "consonant",
      "example": "라 _r_ a",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "아바 a _b_ a",
      "description": null
    },
    {
      "phoneme": "P",
      "category": "Stop",
      "big": "consonant",
      "example": "바 _P_ a",
      "description": null
    },
    {
      "phoneme": "pp",
      "category": "Stop",
      "big": "consonant",
      "example": "빠 _pp_ a",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "파 _p_ a",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "아다 a _d_ a",
      "description": null
    },
    {
      "phoneme": "T",
      "category": "Stop",
      "big": "consonant",
      "example": "다 _T_ a",
      "description": null
    },
    {
      "phoneme": "tt",
      "category": "Stop",
      "big": "consonant",
      "example": "따 _tt_ a",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "타 _t_ a",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "사 _s_ a",
      "description": null
    },
    {
      "phoneme": "ss",
      "category": "Fricative",
      "big": "consonant",
      "example": "싸 _ss_ a",
      "description": null
    },
    {
      "phoneme": "sh",
      "category": "Fricative",
      "big": "consonant",
      "example": "시 _sh_ i",
      "description": null
    },
    {
      "phoneme": "ssh",
      "category": "Fricative",
      "big": "consonant",
      "example": "씨 _ssh_ i",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Affricate",
      "big": "consonant",
      "example": "아자 a _j_ a",
      "description": null
    },
    {
      "phoneme": "J",
      "category": "Affricate",
      "big": "consonant",
      "example": "자 _J_ a",
      "description": null
    },
    {
      "phoneme": "jj",
      "category": "Affricate",
      "big": "consonant",
      "example": "짜 _jj_ a",
      "description": null
    },
    {
      "phoneme": "ch",
      "category": "Affricate",
      "big": "consonant",
      "example": "차 _ch_ a",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "아가 a _g_ a",
      "description": null
    },
    {
      "phoneme": "K",
      "category": "Stop",
      "big": "consonant",
      "example": "가 _K_ a",
      "description": null
    },
    {
      "phoneme": "kk",
      "category": "Stop",
      "big": "consonant",
      "example": "까 _kk_ a",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "카 _k_ a",
      "description": null
    },
    {
      "phoneme": "h",
      "category": "Fricative",
      "big": "consonant",
      "example": "하 _h_ a",
      "description": null
    },
    {
      "phoneme": "hy",
      "category": "Fricative",
      "big": "consonant",
      "example": "햐 _hy_ a",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "알 a _l_",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "마 _m_ a",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "나 _n_ a",
      "description": null
    },
    {
      "phoneme": "ng",
      "category": "Coda",
      "big": "coda",
      "example": "앙 a _ng_",
      "description": null
    }
  ],
  "French": [
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "p_a_s",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "d_é_jeun_er_",
      "description": null
    },
    {
      "phoneme": "e-",
      "category": "Vowel",
      "big": "vowel",
      "example": "cl_ai_r_e_tte",
      "description": null
    },
    {
      "phoneme": "x",
      "category": "Vowel",
      "big": "vowel",
      "example": "c_e_",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "d_î_ner_ie_",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "_au_t_o_",
      "description": null
    },
    {
      "phoneme": "o-",
      "category": "Vowel",
      "big": "vowel",
      "example": "s_o_tte",
      "description": null
    },
    {
      "phoneme": "eu-",
      "category": "Vowel",
      "big": "vowel",
      "example": "j_eu_ne",
      "description": null
    },
    {
      "phoneme": "eu",
      "category": "Vowel",
      "big": "vowel",
      "example": "y_eux_",
      "description": null
    },
    {
      "phoneme": "ou",
      "category": "Vowel",
      "big": "vowel",
      "example": "_où_",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "t_u_",
      "description": null
    },
    {
      "phoneme": "in",
      "category": "Vowel",
      "big": "vowel",
      "example": "br_in_",
      "description": null
    },
    {
      "phoneme": "an",
      "category": "Vowel",
      "big": "vowel",
      "example": "s_an_s",
      "description": null
    },
    {
      "phoneme": "on",
      "category": "Vowel",
      "big": "vowel",
      "example": "s_on_",
      "description": null
    },
    {
      "phoneme": "y",
      "category": "Semivowel",
      "big": "glide",
      "example": "_y_eux",
      "description": null
    },
    {
      "phoneme": "U",
      "category": "Semivowel",
      "big": "glide",
      "example": "n_u_ire",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "_ou_i",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "_b_oue",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "_d_ais",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "_f_ranco_ph_one",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "_g_ain",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "a_c_ousti_qu_e",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "i_l_",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "_m_anger",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "co_nn_exion",
      "description": null
    },
    {
      "phoneme": "gn",
      "category": "Nasal",
      "big": "consonant",
      "example": "oi_gn_on",
      "description": null
    },
    {
      "phoneme": "N",
      "category": "Nasal",
      "big": "consonant",
      "example": "campi_ng_",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "_p_omme",
      "description": null
    },
    {
      "phoneme": "R",
      "category": "Fricative",
      "big": "consonant",
      "example": "_r_ester",
      "description": null
    },
    {
      "phoneme": "r",
      "category": "Fricative",
      "big": "consonant",
      "example": "t_r_ois",
      "description": null
    },
    {
      "phoneme": "r,",
      "category": "Liquid",
      "big": "consonant",
      "example": "Pa_r_is (alt)",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "re_ss_u_sc_ita_t_ion",
      "description": null
    },
    {
      "phoneme": "ch",
      "category": "Fricative",
      "big": "consonant",
      "example": "_ch_er",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "es_th_é_t_ique",
      "description": null
    },
    {
      "phoneme": "tch",
      "category": "Affricate",
      "big": "consonant",
      "example": "caou_tch_ouc",
      "description": null
    },
    {
      "phoneme": "v",
      "category": "Fricative",
      "big": "consonant",
      "example": "_v_al_v_e",
      "description": null
    },
    {
      "phoneme": "z",
      "category": "Fricative",
      "big": "consonant",
      "example": "_z_èbre",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Fricative",
      "big": "consonant",
      "example": "_j_u_g_ement",
      "description": null
    },
    {
      "phoneme": "dj",
      "category": "Affricate",
      "big": "consonant",
      "example": "a_dj_onction",
      "description": null
    }
  ],
  "German": [
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "N_a_chtf_ah_rt",
      "description": null
    },
    {
      "phoneme": "oe",
      "category": "Vowel",
      "big": "vowel",
      "example": "sch_ö_n",
      "description": null
    },
    {
      "phoneme": "er",
      "category": "Vowel",
      "big": "vowel",
      "example": "Op_er_",
      "description": null
    },
    {
      "phoneme": "OE",
      "category": "Vowel",
      "big": "vowel",
      "example": "K_ö_ln",
      "description": null
    },
    {
      "phoneme": "<",
      "category": "Vowel",
      "big": "vowel",
      "example": "B_e_schlag",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "S_ee_pf_e_rdchen",
      "description": null
    },
    {
      "phoneme": "E",
      "category": "Vowel",
      "big": "vowel",
      "example": "_E_rz_ä_hler",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "L_ie_dt_i_tel",
      "description": null
    },
    {
      "phoneme": "I",
      "category": "Vowel",
      "big": "vowel",
      "example": "b_i_tte",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "_o_der",
      "description": null
    },
    {
      "phoneme": "O",
      "category": "Vowel",
      "big": "vowel",
      "example": "v_o_ll",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "F_u_ß",
      "description": null
    },
    {
      "phoneme": "U",
      "category": "Vowel",
      "big": "vowel",
      "example": "St_u_nde",
      "description": null
    },
    {
      "phoneme": "ue",
      "category": "Vowel",
      "big": "vowel",
      "example": "_ü_ber",
      "description": null
    },
    {
      "phoneme": "UE",
      "category": "Vowel",
      "big": "vowel",
      "example": "sch_ü_tzen",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Semivowel",
      "big": "glide",
      "example": "_J_acke",
      "description": null
    },
    {
      "phoneme": "eu",
      "category": "Diphthong",
      "big": "vowel",
      "example": "h_eu_te",
      "description": null
    },
    {
      "phoneme": "au",
      "category": "Diphthong",
      "big": "vowel",
      "example": "L_au_t",
      "description": null
    },
    {
      "phoneme": "ei",
      "category": "Diphthong",
      "big": "vowel",
      "example": "G_ei_ge",
      "description": null
    },
    {
      "phoneme": "-r",
      "category": "Coda",
      "big": "coda",
      "example": "vo_r_",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "a_b_er",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "o_d_er",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "Lü_g_e",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "_k_lu_g_",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "_P_ack",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "_Th_ea_t_er_t_ag",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "_L_iebe",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "_M_aus",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "fü_n_f",
      "description": null
    },
    {
      "phoneme": "ng",
      "category": "Nasal",
      "big": "consonant",
      "example": "la_ng_",
      "description": null
    },
    {
      "phoneme": "ch",
      "category": "Fricative",
      "big": "consonant",
      "example": "ri_ch_ti_g_",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "_f_ade",
      "description": null
    },
    {
      "phoneme": "h",
      "category": "Fricative",
      "big": "consonant",
      "example": "_H_armonie",
      "description": null
    },
    {
      "phoneme": "R",
      "category": "Fricative",
      "big": "consonant",
      "example": "_R_ost",
      "description": null
    },
    {
      "phoneme": "r",
      "category": "Fricative",
      "big": "consonant",
      "example": "T_r_eppe",
      "description": null
    },
    {
      "phoneme": "pf",
      "category": "Affricate",
      "big": "consonant",
      "example": "_Pf_irsiche",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "Hau_s_stra_ß_e",
      "description": null
    },
    {
      "phoneme": "S",
      "category": "Fricative",
      "big": "consonant",
      "example": "_S_par_sch_wein",
      "description": null
    },
    {
      "phoneme": "tS",
      "category": "Affricate",
      "big": "consonant",
      "example": "_Tsch_üss",
      "description": null
    },
    {
      "phoneme": "ts",
      "category": "Affricate",
      "big": "consonant",
      "example": "_Z_usa_tz_",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Fricative",
      "big": "consonant",
      "example": "_W_ächter",
      "description": null
    },
    {
      "phoneme": "kh",
      "category": "Fricative",
      "big": "consonant",
      "example": "Bu_ch_",
      "description": null
    },
    {
      "phoneme": "Z",
      "category": "Fricative",
      "big": "consonant",
      "example": "Gara_g_e",
      "description": null
    },
    {
      "phoneme": "z",
      "category": "Fricative",
      "big": "consonant",
      "example": "_s_auber",
      "description": null
    }
  ],
  "Italian": [
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "c_a_s_a_",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "stell_e_",
      "description": null
    },
    {
      "phoneme": "E",
      "category": "Vowel",
      "big": "vowel",
      "example": "b_e_ne",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "viol_i_no",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "_o_mbra",
      "description": null
    },
    {
      "phoneme": "O",
      "category": "Vowel",
      "big": "vowel",
      "example": "par_o_la",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "t_u_tto",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Semivowel",
      "big": "glide",
      "example": "_i_one",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "_u_omo",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "_b_allata",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "_d_are",
      "description": null
    },
    {
      "phoneme": "dz",
      "category": "Affricate",
      "big": "consonant",
      "example": "_z_ero",
      "description": null
    },
    {
      "phoneme": "dZ",
      "category": "Affricate",
      "big": "consonant",
      "example": "_g_emma",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "_f_antasma",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "_g_are",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "_c_asa",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "_l_etto",
      "description": null
    },
    {
      "phoneme": "L",
      "category": "Liquid",
      "big": "consonant",
      "example": "fi_gl_io",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "_m_a_mm_a",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "i_n_vece",
      "description": null
    },
    {
      "phoneme": "N",
      "category": "Nasal",
      "big": "consonant",
      "example": "a_n_che",
      "description": null
    },
    {
      "phoneme": "J",
      "category": "Nasal",
      "big": "consonant",
      "example": "ba_gn_o",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "_p_apà",
      "description": null
    },
    {
      "phoneme": "r",
      "category": "Liquid",
      "big": "consonant",
      "example": "te_rr_a",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "_s_ali",
      "description": null
    },
    {
      "phoneme": "S",
      "category": "Fricative",
      "big": "consonant",
      "example": "fa_sc_e",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "_t_ale",
      "description": null
    },
    {
      "phoneme": "ts",
      "category": "Affricate",
      "big": "consonant",
      "example": "gra_z_ia",
      "description": null
    },
    {
      "phoneme": "tS",
      "category": "Affricate",
      "big": "consonant",
      "example": "_ci_ao",
      "description": null
    },
    {
      "phoneme": "v",
      "category": "Fricative",
      "big": "consonant",
      "example": "a_v_are",
      "description": null
    },
    {
      "phoneme": "z",
      "category": "Fricative",
      "big": "consonant",
      "example": "ca_s_o",
      "description": null
    }
  ],
  "Portuguese": [
    {
      "phoneme": "a",
      "category": "Vowel",
      "big": "vowel",
      "example": "_a_c_á_cia",
      "description": null
    },
    {
      "phoneme": "-a",
      "category": "Vowel",
      "big": "vowel",
      "example": "aj_a_",
      "description": null
    },
    {
      "phoneme": "eh",
      "category": "Vowel",
      "big": "vowel",
      "example": "p_é_",
      "description": null
    },
    {
      "phoneme": "e",
      "category": "Vowel",
      "big": "vowel",
      "example": "_e_xp_e_riência",
      "description": null
    },
    {
      "phoneme": "i",
      "category": "Vowel",
      "big": "vowel",
      "example": "_i_n_í_c_i_o",
      "description": null
    },
    {
      "phoneme": "oh",
      "category": "Vowel",
      "big": "vowel",
      "example": "fof_o_ca",
      "description": null
    },
    {
      "phoneme": "o",
      "category": "Vowel",
      "big": "vowel",
      "example": "d_o_d_ô_",
      "description": null
    },
    {
      "phoneme": "u",
      "category": "Vowel",
      "big": "vowel",
      "example": "t_u_",
      "description": null
    },
    {
      "phoneme": "an",
      "category": "Vowel",
      "big": "vowel",
      "example": "am_a_nh_ã_",
      "description": null
    },
    {
      "phoneme": "en",
      "category": "Vowel",
      "big": "vowel",
      "example": "_en_tro",
      "description": null
    },
    {
      "phoneme": "in",
      "category": "Vowel",
      "big": "vowel",
      "example": "v_im_",
      "description": null
    },
    {
      "phoneme": "on",
      "category": "Vowel",
      "big": "vowel",
      "example": "s_om_",
      "description": null
    },
    {
      "phoneme": "un",
      "category": "Vowel",
      "big": "vowel",
      "example": "m_un_do",
      "description": null
    },
    {
      "phoneme": "w",
      "category": "Semivowel",
      "big": "glide",
      "example": "qua_l_",
      "description": null
    },
    {
      "phoneme": "y",
      "category": "Semivowel",
      "big": "glide",
      "example": "bo_i_a",
      "description": null
    },
    {
      "phoneme": "p",
      "category": "Stop",
      "big": "consonant",
      "example": "_p_ai",
      "description": null
    },
    {
      "phoneme": "b",
      "category": "Stop",
      "big": "consonant",
      "example": "_b_ato",
      "description": null
    },
    {
      "phoneme": "t",
      "category": "Stop",
      "big": "consonant",
      "example": "mon_t_anha",
      "description": null
    },
    {
      "phoneme": "d",
      "category": "Stop",
      "big": "consonant",
      "example": "_d_ar",
      "description": null
    },
    {
      "phoneme": "k",
      "category": "Stop",
      "big": "consonant",
      "example": "_c_ava_qu_inho",
      "description": null
    },
    {
      "phoneme": "g",
      "category": "Stop",
      "big": "consonant",
      "example": "_g_a_gu_eira",
      "description": null
    },
    {
      "phoneme": "kw",
      "category": "Stop",
      "big": "consonant",
      "example": "_qu_atro",
      "description": null
    },
    {
      "phoneme": "gw",
      "category": "Stop",
      "big": "consonant",
      "example": "_gu_axinim",
      "description": null
    },
    {
      "phoneme": "f",
      "category": "Fricative",
      "big": "consonant",
      "example": "_f_ala",
      "description": null
    },
    {
      "phoneme": "v",
      "category": "Fricative",
      "big": "consonant",
      "example": "_v_ila",
      "description": null
    },
    {
      "phoneme": "s",
      "category": "Fricative",
      "big": "consonant",
      "example": "_s_u_c_e_ss_ão",
      "description": null
    },
    {
      "phoneme": "z",
      "category": "Fricative",
      "big": "consonant",
      "example": "mú_s_ica",
      "description": null
    },
    {
      "phoneme": "ch",
      "category": "Fricative",
      "big": "consonant",
      "example": "_ch_uva",
      "description": null
    },
    {
      "phoneme": "j",
      "category": "Fricative",
      "big": "consonant",
      "example": "lo_j_a",
      "description": null
    },
    {
      "phoneme": "m",
      "category": "Nasal",
      "big": "consonant",
      "example": "_m_ato",
      "description": null
    },
    {
      "phoneme": "n",
      "category": "Nasal",
      "big": "consonant",
      "example": "_n_ari_n_a",
      "description": null
    },
    {
      "phoneme": "-n",
      "category": "Nasal",
      "big": "consonant",
      "example": "ma_n_ga",
      "description": null
    },
    {
      "phoneme": "nh",
      "category": "Nasal",
      "big": "consonant",
      "example": "so_nh_o",
      "description": null
    },
    {
      "phoneme": "l",
      "category": "Liquid",
      "big": "consonant",
      "example": "_l_ero-_l_ero",
      "description": null
    },
    {
      "phoneme": "lh",
      "category": "Liquid",
      "big": "consonant",
      "example": "a_lh_o",
      "description": null
    },
    {
      "phoneme": "r",
      "category": "Liquid",
      "big": "consonant",
      "example": "p_r_ato",
      "description": null
    },
    {
      "phoneme": "R",
      "category": "Fricative",
      "big": "consonant",
      "example": "_r_eco_rr_ente",
      "description": null
    },
    {
      "phoneme": "-r",
      "category": "Liquid",
      "big": "consonant",
      "example": "amo_r_ (alt)",
      "description": null
    },
    {
      "phoneme": "rr",
      "category": "Liquid",
      "big": "consonant",
      "example": "_r_eco_rr_ente (alt)",
      "description": null
    },
    {
      "phoneme": "H",
      "category": "Coda",
      "big": "coda",
      "example": "amo_r_",
      "description": null
    },
    {
      "phoneme": "wn",
      "category": "Coda",
      "big": "coda",
      "example": "sã_o_",
      "description": null
    },
    {
      "phoneme": "yn",
      "category": "Coda",
      "big": "coda",
      "example": "be_m_",
      "description": null
    },
    {
      "phoneme": "tch",
      "category": "Affricate",
      "big": "consonant",
      "example": "presen_t_e",
      "description": null
    },
    {
      "phoneme": "dj",
      "category": "Affricate",
      "big": "consonant",
      "example": "gran_d_e",
      "description": null
    }
  ],
  "Common phonemes": [
    {
      "phoneme": "cl",
      "category": null,
      "big": "special",
      "example": null,
      "description": "喉塞音"
    },
    {
      "phoneme": "sil",
      "category": null,
      "big": "special",
      "example": null,
      "description": "停顿音（高度情境依赖）"
    },
    {
      "phoneme": "br",
      "category": null,
      "big": "special",
      "example": null,
      "description": "换气音"
    },
    {
      "phoneme": "br1",
      "category": null,
      "big": "special",
      "example": null,
      "description": "换气音"
    },
    {
      "phoneme": "br2",
      "category": null,
      "big": "special",
      "example": null,
      "description": "换气音"
    },
    {
      "phoneme": "brl1",
      "category": null,
      "big": "special",
      "example": null,
      "description": "长呼吸"
    },
    {
      "phoneme": "brl2",
      "category": null,
      "big": "special",
      "example": null,
      "description": "长呼吸"
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
    "q",
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
    "kw",
    "g",
    "gw",
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
    "r",
    "v"
  ],
  "Mandarin Chinese": [
    "b",
    "p",
    "d",
    "t",
    "g",
    "k",
    "j",
    "z",
    "c",
    "zh",
    "ch",
    "h",
    "f",
    "s",
    "sh",
    "q",
    "x",
    "m",
    "n",
    "l"
  ],
  "Cantonese Chinese": [
    "z",
    "c",
    "f",
    "h",
    "s",
    "l",
    "m",
    "n",
    "ng",
    "b",
    "p",
    "d",
    "t",
    "g",
    "k",
    "gw",
    "kw"
  ],
  "Spanish": [
    "dj",
    "b",
    "B",
    "d",
    "D",
    "g",
    "G",
    "k",
    "p",
    "t",
    "l",
    "rr",
    "r",
    "m",
    "n",
    "N",
    "ny",
    "f",
    "s",
    "S",
    "z",
    "sh",
    "ch",
    "j",
    "h"
  ],
  "Korean": [
    "r",
    "b",
    "P",
    "pp",
    "p",
    "d",
    "T",
    "tt",
    "t",
    "s",
    "ss",
    "sh",
    "ssh",
    "j",
    "J",
    "jj",
    "ch",
    "g",
    "K",
    "kk",
    "k",
    "h",
    "hy",
    "l",
    "m",
    "n"
  ],
  "French": [
    "b",
    "d",
    "f",
    "g",
    "k",
    "l",
    "m",
    "n",
    "gn",
    "N",
    "p",
    "R",
    "r",
    "r,",
    "s",
    "ch",
    "t",
    "tch",
    "v",
    "z",
    "j",
    "dj"
  ],
  "German": [
    "b",
    "d",
    "g",
    "k",
    "p",
    "t",
    "l",
    "m",
    "n",
    "ng",
    "ch",
    "f",
    "h",
    "R",
    "r",
    "pf",
    "s",
    "S",
    "tS",
    "ts",
    "w",
    "kh",
    "Z",
    "z"
  ],
  "Italian": [
    "b",
    "d",
    "dz",
    "dZ",
    "f",
    "g",
    "k",
    "l",
    "L",
    "m",
    "n",
    "N",
    "J",
    "p",
    "r",
    "s",
    "S",
    "t",
    "ts",
    "tS",
    "v",
    "z"
  ],
  "Portuguese": [
    "p",
    "b",
    "t",
    "d",
    "k",
    "g",
    "kw",
    "gw",
    "f",
    "v",
    "s",
    "z",
    "ch",
    "j",
    "m",
    "n",
    "-n",
    "nh",
    "l",
    "lh",
    "r",
    "R",
    "-r",
    "rr",
    "tch",
    "dj"
  ],
  "Common phonemes": []
};

/** 判辅音（按语言；大小写敏感——SV 音素表区分大小写，如 `A` 是元音、`a` 也是元音） */
export function isConsonant(phoneme: string, language?: string): boolean {
  if (language && CONSONANTS_BY_LANGUAGE[language]) return CONSONANTS_BY_LANGUAGE[language].includes(phoneme);
  return Object.values(CONSONANTS_BY_LANGUAGE).some((list) => list.includes(phoneme));
}
