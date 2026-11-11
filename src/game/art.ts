// Pixel-art source for every sprite in SPACE SURVIVORS. No external images:
// each sprite is an ASCII grid (left half + centre column, mirrored at build
// time) turned into a canvas with automatic outline and pixel shading.
//
// Legend (overridable per sprite through `pal`):
//  .  transparent      L/M/D  hull light / mid / dark      K  panel line
//  W  white glow       x/X    glass highlight / glass      E  engine nozzle glow
//  C/c cyan / dk cyan  P/p    magenta / dk magenta         Y  amber light
//  O  orange           R/r    red / dk red                 G/g green / dk green
//  B/b blue / dk blue  V/v    violet / dk violet           S/s/d steel light/mid/dark

export interface ArtDef {
  rows: string[];
  pal?: Record<string, string>;
  mirror?: boolean; // mirror horizontally (default true)
  mirrorY?: boolean; // mirror vertically as well
  shade?: boolean; // default true
}

export const BASE_PAL: Record<string, string> = {
  K: "#141e33",
  W: "#f8fafc",
  x: "#6fb7c9",
  X: "#1b2740",
  E: "#d4af5a",
  C: "#6fb7c9",
  c: "#6fb7c9",
  P: "#8a6aa8",
  p: "#7d6fa8",
  Y: "#d4af5a",
  O: "#d4af5a",
  R: "#e06b70",
  r: "#8a6aa8",
  G: "#6cc09a",
  g: "#6cc09a",
  B: "#5b8fd1",
  b: "#5b8fd1",
  V: "#7d6fa8",
  v: "#1b2740",
  S: "#e6edf7",
  s: "#5b8fd1",
  d: "#5b8fd1",
  L: "#e6edf7",
  M: "#5b8fd1",
  D: "#5b8fd1",
};

/** Characters that are emissive (not shaded) */
export const EMISSIVE = new Set(["W", "x", "E", "C", "P", "Y", "G"]);

export const ART: Record<string, ArtDef> = {
  /* ======================= PLAYER SHIPS ======================= */
  // HALCÓN NOVA — balanced interceptor, white hull with cyan/magenta trim
  ship_falcon: {
    rows: [
      ".........C",
      ".........L",
      "........LL",
      "........LW",
      ".......MLx",
      ".......MXx",
      ".......MXX",
      "......DMXX",
      "......DMLL",
      "..c...DMLW",
      "..C..DMMLW",
      "..D..DMPLL",
      "..D.DMMPML",
      ".DDDMMMPML",
      ".DMMMLLMML",
      "DMMLLLLMDL",
      "DMLLPPMMDM",
      "DDMPP.DMKD",
      ".DD...DKKD",
      "......DKEK",
      ".......E.E",
    ],
  },
  // ESPECTRO — forward-swept stealth striker, violet/magenta
  ship_spectre: {
    pal: { L: "#e6edf7", M: "#7d6fa8", D: "#1b2740" },
    rows: [
      "........P",
      "........L",
      "........L",
      ".......ML",
      ".......Mx",
      "..P....XX",
      "..L...MXX",
      "..LM..MLL",
      "...LM.MLW",
      "...LMMMLW",
      "....LMMLL",
      "..DDMMMPL",
      ".DMMMDDPM",
      "DMMDD.DMM",
      "DMD...DKD",
      "DD....DKE",
      "........E",
    ],
  },
  // BASTIÓN — heavy gunship, amber steel with twin cannons
  ship_bastion: {
    pal: { L: "#e6edf7", M: "#d4af5a", D: "#1b2740" },
    rows: [
      "..........L",
      ".........LL",
      ".........LW",
      "........MLW",
      "....s...MXx",
      "....S..DMXX",
      "...dSd.DMXX",
      "...dSd.DMLL",
      "..ddSddDMLL",
      ".dMMMMMMMYL",
      "dMLLLLLMMYL",
      "dMLYYLLMMLL",
      "dMLLLLLMDML",
      "dMMMMMMMDMM",
      "ddMDDDMMDKM",
      ".dDKKKDMDKD",
      ".dKEEKD.DKD",
      "..K..K..DED",
      "..........E",
    ],
  },
  // QUIMERA — bio-tech crescent, green/cyan
  ship_chimera: {
    pal: { L: "#e6edf7", M: "#6cc09a", D: "#1b2740" },
    rows: [
      ".........G",
      "........GL",
      "........LL",
      ".......MLx",
      ".G.....MXx",
      ".LG...DMXX",
      ".DLG..DMXX",
      "..DLGDMMLL",
      "..DMLMMMLW",
      "...DMMMCLW",
      "...DMMCCML",
      "..DMMDMCML",
      ".DMMD.DMML",
      "DMMD..DMDL",
      "DMD...DKKD",
      "DD....DKEK",
      ".......E..",
    ],
  },

  /* ======================= ENEMIES ======================= */
  // INTERCEPTOR — small amber dart
  en_interceptor: {
    pal: { L: "#d4af5a", M: "#d4af5a", D: "#d4af5a", X: "#141e33", x: "#e6edf7" },
    rows: [
      ".....O",
      ".....Y",
      "....OY",
      "....Mx",
      ".O..MX",
      ".M.MML",
      "MMMMML",
      "MD.DMM",
      "D...DK",
      "....KE",
    ],
  },
  // CAZADOR — crimson claw hunter
  en_hunter: {
    pal: { L: "#e06b70", M: "#e06b70", D: "#1b2740", X: "#0c1222", x: "#e6edf7" },
    rows: [
      ".W.....",
      ".LR....",
      ".DL..ML",
      ".DL..Mx",
      "..DL.MX",
      "..DLMMR",
      "...DMMR",
      "..DMMLL",
      ".DMMDML",
      "DMMD.DM",
      "DD...DK",
      ".....KE",
    ],
  },
  // DESTRUCTOR — heavy steel-blue cruiser with violet lights
  en_destroyer: {
    pal: { S: "#5b8fd1", s: "#5b8fd1", d: "#1b2740" },
    rows: [
      ".........dS",
      "........dSS",
      "........dSs",
      ".......dSsV",
      ".......dSsV",
      "......ddSss",
      "..d...dSSsK",
      "..S..ddSSsK",
      "..S.dSSSssV",
      "..SdSSSsssV",
      ".dSSSSsssss",
      "dSSSVSssdsd",
      "dSSSSssddsd",
      "dssssssdKsK",
      "dssddssdKKK",
      "ddVd.dsdKVK",
      ".dd...ddKKK",
      "......dKEEK",
      ".......K.E.",
    ],
  },
  // BOMBARDERO — magenta flying wing with cyan bomb-bay lights
  en_bomber: {
    pal: { L: "#8a6aa8", M: "#7d6fa8", D: "#1b2740", P: "#6fb7c9", X: "#141e33", x: "#e6edf7" },
    rows: [
      ".........L",
      "........LL",
      ".......MLx",
      "......MMXX",
      "....MMMMXX",
      "..MMMLLMML",
      ".MMLLPPMML",
      "MMLPPDDMMP",
      "MLPDD.DMDP",
      "DMDD..DMDp",
      ".DD...DKDK",
      "......DKEK",
      "........E.",
    ],
  },
  // NAVE PARASITARIA — bulbous bio-organism with an eye and trailing tendrils
  en_parasite: {
    pal: { G: "#6cc09a", g: "#6cc09a", L: "#6cc09a", X: "#1b2740", x: "#8a6aa8" },
    rows: [
      "......gG",
      "....gGGL",
      "...gGLLL",
      "..gGLGGG",
      ".gGLGXXG",
      ".gGGXxXG",
      "gGGGXXXG",
      "gGgGGGGG",
      "gGgggGgG",
      ".gG.gGg.",
      ".g..gG..",
      "....g...",
      "...g....",
      "..g.....",
    ],
  },
  // Larva released by parasites
  en_spawnling: {
    pal: { G: "#6cc09a", g: "#6cc09a", L: "#e6edf7", x: "#8a6aa8" },
    rows: ["...G", "..GL", ".gGx", "gGGG", "g.gG", "...g"],
  },
  // Coloso shield generator node
  en_generator: {
    pal: {},
    rows: ["....C", "...CW", "..cCC", ".cCxC", "dcCCC", ".dcCc", "..dcc", "...dc", "....d"],
  },

  /* ======================= BOSSES ======================= */
  // LEVIATÁN — gigantic carrier with hangar bays and turret mounts
  boss_leviathan: {
    pal: { L: "#7d6fa8", M: "#7d6fa8", D: "#1b2740", v: "#141e33", K: "#0c1222", E: "#8a6aa8" },
    rows: [
      "..................vV",
      ".................vLL",
      "................vMLL",
      "................vMLW",
      "...............vMMLL",
      "...............vMMXx",
      "..............vMMMXX",
      "..............vMMMXX",
      ".............vMMMMLL",
      ".............vMMPMML",
      "............vMMMPMML",
      "............vMMMPMML",
      "...........vMMMMMMML",
      "..........vvMMKKKMML",
      ".........vvMMMKYKMML",
      "........vvMMMMKKKMML",
      ".......vvMMMMMMMMMML",
      "......vvMMLLLLMMMMMM",
      ".....vvMMLLLLLLMMDMM",
      "....vvMMLLPPPLLMMDMM",
      "...vvMMMLLLLLLLMMDMM",
      "..vvMMMMMMMMMMMMMDKM",
      ".vvMMDDDDDDDDMMMMDKM",
      "vvMMDKYKKKKYKDMMMDKM",
      "vMMDKKKKKKKKKKDMMDKM",
      "vMMDDDDDDDDDDDDMMDKM",
      "vMMMMMMMMMMMMMMMMDMM",
      "vMLLLLLLLLLLLLLMMDMM",
      "vMMPMMMPMMMPMMMMMDMM",
      ".vMMMMMMMMMMMMMMMDMM",
      "..vvvMMMMMMMMMMMMDMM",
      "....vvMMMDDDDMMMMDMM",
      ".....vMMDKKKKDMMMDMM",
      ".....vMMDKEEKDMMMMMM",
      ".....vMMDKKKKDMMMMML",
      ".....vvMMDDDDMMMMMLL",
      "......vvMMMMMMMMMMDD",
      ".......vMMDKKKDMMDKK",
      ".......vMDKEEEKDMDKE",
      ".......vMDKKKKKDMDKE",
      "........vDD...DDvDKK",
    ],
  },
  boss_leviathan_turret: {
    pal: { S: "#7d6fa8", s: "#7d6fa8", d: "#1b2740" },
    rows: ["...Y", "...K", "..dK", ".dSS", "dSPS", "dSSS", ".dSS", "..dd"],
  },
  // NÉMESIS — razor-winged crimson interceptor
  boss_nemesis: {
    pal: { L: "#e06b70", M: "#e06b70", D: "#141e33", K: "#0c1222", X: "#0c1222", x: "#e6edf7" },
    rows: [
      "...............R",
      "...............W",
      "..............RW",
      "..............LW",
      ".............RLL",
      ".............MLx",
      "............RMXx",
      "............MMXX",
      "...........RMMXX",
      "...........MMDXX",
      "..........RMMDLL",
      "..R.......MMDDML",
      "..LR.....RMDKDML",
      "..DLR....MMDRDML",
      "...DLR..RMMDKDML",
      "...DDLR.MMDDDDML",
      "....DDLRMMMMMMML",
      "....DDDLMMRRMMML",
      ".....DDDMMMRRMML",
      "....DDDDMMMMRMMM",
      "...DDMMDDMMMMMDM",
      "..DDMMRDDDMMMDDM",
      ".DDMMR..DDDMMDKD",
      "DDMMR....DDMDKKD",
      "DMMR......DDDKEK",
      "DMR........DDKEK",
      "DR..........DKKD",
      "R............DE.",
      "..............E.",
    ],
  },
  // COLOSO — armoured orbital fortress with a magenta reactor core
  boss_colossus: {
    mirrorY: true,
    pal: { S: "#5b8fd1", s: "#5b8fd1", d: "#1b2740" },
    rows: [
      "..............dddddddd",
      "...........dddSSSSSSSS",
      ".........ddSSSSSSSSSSS",
      "........dSSSsssssssssY",
      ".......dSSsssddddddddd",
      "......dSSssdKKKKKKKKKK",
      ".....dSSssdKccccccccCC",
      "....dSSssdKcCCCCCCCCCC",
      "...dSSssdKcCddddddddds",
      "...dSssdKcCdSSSSSSSSSS",
      "..dSSsdKcCdSssssssssss",
      "..dSsdKcCdSsdKKKKKKKKK",
      ".dSSsdKcCdSsdKpppppppp",
      ".dSsdKcCdSssdKpPPPPPPP",
      ".dSsdKcCdSsdKpPPxxxxxx",
      "dSSsdKcCdSsdKpPxWWWWWW",
      "dSsdKcCdSsdKpPxWWWWWWW",
      "dSsdKcCdSsdKpPxWWWWWWW",
      "dYsdKcCdSsdKpPxWWWWWWW",
      "dSsdKcCdSsdKpPxWWWWWWW",
      "dSsdKcCdSsdKpPxWWWWWWW",
    ],
  },

  /* ======================= PICKUPS ======================= */
  cell_s: { pal: {}, rows: ["..C", ".CW", "CCW", ".cC", "..c"] },
  cell_m: { pal: {}, rows: ["...P", "..PW", ".PPW", "PPPW", ".pPP", "..pP", "...p"] },
  cell_l: {
    pal: { p: "#d4af5a" },
    rows: ["...Y", "..YW", ".YYW", "YYYW", "OYYW", ".OYY", "..pO", "...p"],
  },
  cell_xl: {
    pal: {},
    rows: ["....W", "...CW", "..CxW", ".CxWW", "CxWWW", ".CxWW", "..CxW", "...CW", "....W"],
  },
  pk_repair: {
    pal: { s: "#5b8fd1" },
    rows: [".sSSS", "sSGGG", "SGGWG", "SGWWW", "SGGWG", "sSGGG", ".sSSS"],
  },
  pk_magnet: {
    pal: {},
    rows: ["SS...", "PP...", "PP...", "PP...", "PP...", ".PP..", "..PPP", "...PP"],
  },
  pk_emp: {
    pal: {},
    rows: ["..BBB", ".BBCC", "BBCWY", "BCWYW", "BCYWW", "BBCWY", ".BBCC", "..BBB"],
  },

  /* ======================= ICONS (9x9) ======================= */
  ic_laser: {
    rows: ["....C", "...CW", "...CW", "..cCW", "..cCW", "...CW", "...CW", "....C", "....."],
  },
  ic_spread: {
    rows: ["Y...Y", ".Y..Y", "..Y.Y", "...YW", "....W", "...OO", "..OOO", "...O.", "....."],
  },
  ic_missile: {
    pal: { S: "#e6edf7" },
    rows: ["....R", "...RW", "...SS", "...SS", "...SS", "..dSS", ".d.ss", "...OY", "....O"],
  },
  ic_drones: {
    rows: [".C...", "CWC..", ".C...", "....L", "...LL", "..MLL", ".....", ".C...", "CWC.."],
  },
  ic_plasma: {
    rows: [".....", "..VVV", ".VPPP", ".VPWW", "VPPWW", ".VPPP", "..VVV", ".....", "....."],
  },
  ic_field: {
    mirror: false,
    rows: [
      "..BBBBB..",
      ".B.....B.",
      "B..C....B",
      "B...CC..B",
      "B..CC...B",
      "B....C..B",
      ".B.....B.",
      "..BBBBB..",
      ".........",
    ],
  },
  ic_shield: {
    rows: ["..CCC", ".CxxW", "CxCCC", "CxCWC", "CxCWC", ".CxCC", "..CxC", "...CC", "....C"],
  },
  ic_nova: {
    rows: ["..YYY", ".Y...", "Y..OO", "Y.O..", "Y.O.W", "Y.O..", "Y..OO", ".Y...", "..YYY"],
  },
  ic_arc: {
    mirror: false,
    rows: [
      ".V.......",
      ".VV......",
      "..VV.....",
      "...VVVV..",
      "......VV.",
      ".....VV..",
      "....VVVV.",
      ".......VV",
      "........V",
    ],
  },
  ic_damage: {
    rows: ["....R", "...RR", "..RYR", ".RYWY", "RRYWW", ".RYWY", "..RYR", "...RR", "....R"],
  },
  ic_rate: {
    rows: ["....C", ".C..C", "..C.C", "...CW", "CCCWW", "...CW", "..C.C", ".C..C", "....C"],
  },
  ic_speed: {
    rows: ["....G", "...GG", "..G.G", ".G..G", "....G", "...GG", "..G.G", ".G..G", "....."],
  },
  ic_maxhp: {
    rows: ["SSSSS", "SsssR", "SssRR", "SsRRR", "SssRR", ".SssR", "..Sss", "...SS", "....S"],
  },
  ic_armor: {
    rows: ["dSSSS", "dSsss", "dSsKK", "dSsKS", "dSsKS", ".dSsK", "..dSs", "...dS", "....d"],
  },
  ic_regen: {
    rows: [".....", "...GG", "...GW", ".GGGW", ".GWWW", ".GGGW", "...GW", "...GG", "....."],
  },
  ic_magnet: {
    rows: ["SS...", "PP...", "PP...", "PP...", "PP...", "PP...", ".PP..", "..PPP", "...PP"],
  },
  ic_xp: {
    rows: ["....Y", "...YY", "YYYYW", ".YYWW", "..YYY", "..YYY", ".YY.Y", ".Y...", "....."],
  },
  ic_crit: {
    rows: ["....R", "..RRR", ".R..R", ".R...", "RRR.W", ".R...", ".R..R", "..RRR", "....R"],
  },
  ic_heal: {
    rows: [".....", "...RR", "...RW", ".RRRW", ".RWWW", ".RRRW", "...RW", "...RR", "....."],
  },
  ic_credits: {
    rows: ["..YYY", ".YOOO", "YOYYY", "YOYOO", "YOYOY", "YOYOO", "YOYYY", ".YOOO", "..YYY"],
  },
  ic_evo: {
    rows: ["....P", "...PW", "P..PW", "PP.PW", ".PPWW", "..PWW", "..PPW", ".PP.P", "PP..."],
  },
  ic_engine: {
    rows: ["..SSS", ".SsKK", ".SsKO", ".SsKY", ".SsKO", "..SKK", "...O.", "..OY.", "...O."],
  },
  ic_salvage: {
    rows: ["....Y", "...YO", "..YOY", ".dSSS", "dSsss", "dSsKK", "dSsss", ".dSSS", "....."],
  },
  ic_reroll: {
    rows: ["..CCC", ".C...", "C....", "C..C.", "C.CCC", "C....", ".C..W", "..CCC", "....."],
  },
  ic_lock: {
    rows: ["..sss", ".s...", ".s...", "SSSSS", "SsssS", "Sss.K", "SsssS", "SSSSS", "....."],
  },
};
