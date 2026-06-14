// Campaign map definitions. Each map anchors a PlaceDef (lore/intro comes from places.js),
// authors real road paths as control-point polylines (Catmull-Rom smoothed into road meshes),
// and themes its waves with specific ledger enemies. Hero unlocks are derived from
// heroes.js (unlock.map === this map id) — single source of truth.
//
// Path points are [x, z] in world units; world is ~120x120 centered at origin.
// Multiple paths = multiple attack lanes. exit is the defended end (the citadel).

export const MAPS = [
  {
    id: 'zabulistan', order: 1, waves: 8, startGold: 320, lives: 20,
    paths: [
      [[-58, -40], [-38, -34], [-22, -38], [-8, -28], [2, -12], [-4, 6], [4, 24], [18, 34], [34, 38]],
    ],
    themes: ['barman', 'lahhak', 'nastihan', 'mazandaran-lion'], boss: null,
    introKey: 'intro.zabulistan',
  },
  {
    id: 'sistan', order: 2, waves: 9, startGold: 340, lives: 20,
    paths: [
      [[-60, 10], [-42, 4], [-28, 12], [-14, 4], [0, 10], [14, 2], [28, 10], [42, 4], [56, 10]],
      [[-60, -30], [-40, -24], [-24, -28], [-10, -18], [2, -4], [14, 2], [28, 10], [42, 4], [56, 10]],
    ],
    themes: ['barman', 'lahhak', 'farshidvard', 'mazandaran-lion', 'olad-div'], boss: null,
    introKey: 'intro.sistan',
  },
  {
    id: 'kabul', order: 3, waves: 9, startGold: 360, lives: 20,
    paths: [
      [[-55, 45], [-40, 30], [-38, 12], [-26, -2], [-10, -8], [6, -2], [12, 14], [26, 24], [44, 28]],
    ],
    themes: ['barman', 'nastihan', 'lahhak', 'gorgin', 'houman'], boss: 'houman', bossWave: 9,
    introKey: 'intro.kabul',
  },
  {
    id: 'samangan', order: 4, waves: 10, startGold: 380, lives: 20,
    paths: [
      [[-60, -5], [-44, -12], [-30, -4], [-16, -14], [-2, -8], [10, -16], [24, -8], [38, -14], [54, -8]],
      [[54, 40], [40, 30], [28, 20], [24, -8], [38, -14], [54, -8]],
    ],
    themes: ['barman', 'farshidvard', 'nastihan', 'houman', 'white-elephant'], boss: null,
    introKey: 'intro.samangan',
  },
  {
    id: 'dez-sepid', order: 5, waves: 10, startGold: 400, lives: 20,
    paths: [
      [[-62, 0], [-46, -6], [-32, 2], [-20, -8], [-8, -2], [2, 8], [10, 20], [22, 30], [38, 34]],
    ],
    themes: ['barman', 'houman', 'biderafsh', 'farshidvard', 'lahhak'], boss: 'biderafsh', bossWave: 10,
    introKey: 'intro.dez-sepid',
  },
  {
    id: 'mazandaran', order: 6, waves: 11, startGold: 420, lives: 18,
    paths: [
      [[-58, -45], [-44, -30], [-46, -12], [-34, 0], [-20, 6], [-10, 18], [4, 26], [20, 30], [36, 36]],
      [[-58, 30], [-40, 26], [-26, 30], [-12, 24], [-2, 28], [10, 24], [20, 30], [36, 36]],
    ],
    themes: ['olad-div', 'kharvazan-div', 'arzhang-div', 'mazandaran-lion', 'mazandaran-sorceress', 'akvan-div'],
    boss: 'div-e-sepid', bossWave: 11,
    introKey: 'intro.mazandaran',
  },
  {
    id: 'alborz', order: 7, waves: 11, startGold: 420, lives: 18,
    paths: [
      [[-50, -52], [-36, -40], [-38, -22], [-26, -10], [-30, 8], [-18, 18], [-4, 22], [8, 30], [22, 38], [38, 42]],
    ],
    themes: ['akvan-div', 'olad-div', 'kharvazan-div', 'mazandaran-sorceress', 'arzhang-div'],
    boss: 'azhdaha', bossWave: 11,
    introKey: 'intro.alborz',
  },
  {
    id: 'damavand', order: 8, waves: 12, startGold: 450, lives: 18,
    paths: [
      [[-60, -20], [-44, -14], [-30, -20], [-18, -10], [-8, 2], [-2, 16], [8, 26], [22, 32], [38, 30]],
      [[-60, 35], [-44, 30], [-30, 34], [-16, 26], [-2, 16], [8, 26], [22, 32], [38, 30]],
    ],
    themes: ['zahhak-serpents', 'barman', 'kharvazan-div', 'lahhak', 'farshidvard', 'mazandaran-sorceress'],
    boss: 'zahhak', bossWave: 12,
    introKey: 'intro.damavand',
  },
  {
    id: 'siyavash-gate', order: 9, waves: 11, startGold: 450, lives: 18,
    paths: [
      [[-58, 8], [-44, 2], [-30, 8], [-18, 2], [-6, 8], [6, 2], [18, 8], [30, 2], [44, 8], [56, 2]],
    ],
    themes: ['garsivaz', 'houman', 'barman', 'lahhak', 'nastihan', 'biderafsh'],
    boss: 'garsivaz', bossWave: 11,
    introKey: 'intro.siyavash-gate',
  },
  {
    id: 'turan', order: 10, waves: 12, startGold: 480, lives: 18,
    paths: [
      [[-62, -35], [-46, -28], [-34, -34], [-20, -26], [-8, -30], [4, -22], [14, -10], [22, 4], [30, 18], [40, 30]],
      [[-62, 25], [-46, 20], [-32, 26], [-18, 18], [-6, 22], [6, 14], [14, -10], [22, 4], [30, 18], [40, 30]],
    ],
    themes: ['houman', 'barman', 'nastihan', 'lahhak', 'farshidvard', 'viseh', 'pashang'],
    boss: 'shideh', bossWave: 12,
    introKey: 'intro.turan',
  },
  {
    id: 'balkh', order: 11, waves: 12, startGold: 480, lives: 18,
    paths: [
      [[-60, 0], [-44, -8], [-28, 0], [-14, -8], [0, 0], [12, 10], [26, 16], [42, 14], [56, 18]],
      [[-30, -50], [-24, -34], [-16, -20], [-14, -8], [0, 0], [12, 10], [26, 16], [42, 14], [56, 18]],
    ],
    themes: ['houman', 'biderafsh', 'barman', 'puladwand', 'white-elephant', 'farshidvard'],
    boss: 'arjasp', bossWave: 12,
    introKey: 'intro.balkh',
  },
  {
    id: 'dez-roein', order: 12, waves: 12, startGold: 500, lives: 16,
    paths: [
      [[-58, -30], [-42, -22], [-30, -28], [-16, -20], [-4, -10], [2, 4], [10, 18], [22, 28], [36, 32]],
    ],
    themes: ['puladwand', 'houman', 'biderafsh', 'barman', 'kharvazan-div'],
    boss: 'puladwand', bossWave: 12,
    introKey: 'intro.dez-roein',
  },
  {
    id: 'manijeh-garden', order: 13, waves: 11, startGold: 480, lives: 16,
    paths: [
      [[-56, 40], [-42, 28], [-44, 10], [-32, 0], [-20, -6], [-8, -14], [6, -18], [20, -14], [34, -18], [48, -14]],
    ],
    themes: ['gorgin', 'nastihan', 'lahhak', 'houman', 'mazandaran-sorceress'],
    boss: 'gorgin', bossWave: 11,
    introKey: 'intro.manijeh-garden',
  },
  {
    id: 'makran', order: 14, waves: 12, startGold: 500, lives: 16,
    paths: [
      [[-62, 15], [-46, 8], [-30, 14], [-16, 6], [-2, 12], [12, 4], [26, 10], [40, 2], [54, 8]],
      [[-62, -25], [-46, -18], [-30, -24], [-16, -16], [-2, -10], [12, 4], [26, 10], [40, 2], [54, 8]],
    ],
    themes: ['mazandaran-lion', 'white-elephant', 'kharvazan-div', 'barman', 'azhdaha'],
    boss: 'haftvad-worm', bossWave: 12,
    introKey: 'intro.makran',
  },
  {
    id: 'estakhr', order: 15, waves: 12, startGold: 520, lives: 16,
    paths: [
      [[-58, -10], [-42, -16], [-28, -8], [-14, -16], [0, -10], [14, -16], [28, -8], [42, -14], [56, -8]],
    ],
    themes: ['barman', 'houman', 'puladwand', 'white-elephant', 'biderafsh', 'lahhak'],
    boss: 'kamus', bossWave: 12,
    introKey: 'intro.estakhr',
  },
  {
    id: 'gordafarid-fort', order: 16, waves: 12, startGold: 520, lives: 16,
    paths: [
      [[-60, -40], [-46, -28], [-36, -14], [-28, 0], [-18, 12], [-6, 20], [8, 26], [24, 30], [40, 32]],
      [[40, -45], [30, -32], [22, -18], [12, -6], [2, 6], [-6, 20], [8, 26], [24, 30], [40, 32]],
    ],
    themes: ['houman', 'biderafsh', 'barman', 'nastihan', 'puladwand', 'shideh'],
    boss: 'kamus', bossWave: 12,
    introKey: 'intro.gordafarid-fort',
  },
  {
    id: 'madayen', order: 17, waves: 13, startGold: 550, lives: 15,
    paths: [
      [[-62, 0], [-48, 6], [-34, 0], [-20, 6], [-6, 0], [8, 6], [22, 0], [36, 6], [50, 0], [60, 6]],
      [[-62, -35], [-48, -28], [-34, -34], [-20, -26], [-6, -20], [0, -10], [8, 6], [22, 0], [36, 6], [50, 0], [60, 6]],
    ],
    themes: ['puladwand', 'biderafsh', 'houman', 'white-elephant', 'haftvad-worm', 'shideh'],
    boss: 'kamus', bossWave: 13,
    introKey: 'intro.madayen',
  },
  {
    id: 'arash-watch', order: 18, waves: 13, startGold: 550, lives: 15,
    paths: [
      [[-62, -15], [-48, -8], [-36, -14], [-24, -6], [-12, -12], [0, -6], [10, 4], [18, 16], [28, 26], [42, 30]],
      [[-62, 35], [-48, 30], [-36, 36], [-22, 28], [-10, 32], [0, 24], [10, 4], [18, 16], [28, 26], [42, 30]],
    ],
    themes: ['salm', 'tur', 'barman', 'houman', 'lahhak', 'farshidvard', 'biderafsh'],
    boss: 'tur', bossWave: 13, twinBoss: 'salm',
    introKey: 'intro.arash-watch',
  },
  {
    id: 'dez-bahman', order: 19, waves: 13, startGold: 560, lives: 15,
    paths: [
      [[-56, -45], [-44, -32], [-46, -16], [-36, -4], [-38, 12], [-26, 22], [-12, 26], [2, 32], [18, 36], [34, 40]],
    ],
    themes: ['puladwand', 'kharvazan-div', 'arzhang-div', 'biderafsh', 'shideh', 'akvan-div'],
    boss: 'arjasp', bossWave: 13,
    introKey: 'intro.dez-bahman',
  },
  {
    id: 'gang-dez', order: 20, waves: 14, startGold: 600, lives: 15,
    paths: [
      [[-62, -30], [-48, -22], [-36, -28], [-22, -20], [-10, -24], [2, -16], [10, -4], [16, 10], [24, 22], [36, 28], [50, 30]],
      [[-62, 30], [-48, 24], [-36, 30], [-22, 22], [-10, 26], [2, 18], [10, -4], [16, 10], [24, 22], [36, 28], [50, 30]],
      [[20, -50], [16, -36], [12, -22], [10, -4], [16, 10], [24, 22], [36, 28], [50, 30]],
    ],
    themes: ['houman', 'shideh', 'lahhak', 'farshidvard', 'biderafsh', 'puladwand', 'viseh', 'pashang', 'garsivaz'],
    boss: 'afrasiab', bossWave: 14,
    introKey: 'intro.gang-dez',
  },
];

export const MAPS_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m]));
