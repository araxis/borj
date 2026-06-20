export const BACKDROP_DIRECTIONS = ['n', 'e', 's', 'w'];

const CAMPAIGN_MAP_IDS = [
  'zabulistan', 'sistan', 'kabul', 'samangan', 'dez-sepid',
  'mazandaran', 'alborz', 'damavand', 'siyavash-gate', 'turan',
  'balkh', 'dez-roein', 'manijeh-garden', 'makran', 'estakhr',
  'gordafarid-fort', 'madayen', 'arash-watch', 'dez-bahman', 'gang-dez',
];

export const BACKDROP_CURATED_IDS = CAMPAIGN_MAP_IDS;

const dirFiles = (placeId, layer) => Object.fromEntries(
  BACKDROP_DIRECTIONS.map((dir) => [dir, `assets/backdrops/${placeId}/${layer}_${dir}.webp`]),
);

const placeholder = (placeId) => ({
  id: placeId,
  enabled: false,
  status: 'placeholder',
  artNote: 'Procedural range fallback until a curated backdrop set is promoted.',
  layers: {},
});

const curated = (placeId, cfg) => ({
  id: placeId,
  enabled: true,
  status: 'curated',
  artNote: cfg.artNote,
  fogTint: cfg.fogTint,
  tint: cfg.tint,
  haze: {
    opacity: cfg.hazeOpacity ?? 0.12,
    radius: cfg.hazeRadius ?? 335,
    height: cfg.hazeHeight ?? 78,
    y: cfg.hazeY ?? 8,
  },
  layers: {
    far: {
      files: dirFiles(placeId, 'far'),
      radius: cfg.farRadius ?? 392,
      height: cfg.farHeight ?? 164,
      y: cfg.farY ?? 42,
      opacity: cfg.farOpacity ?? 0.3,
      brightness: cfg.farBrightness ?? 0.92,
      desaturate: cfg.farDesaturate ?? 0.08,
      edgeFade: 0.14,
      bottomFade: 0.38,
      topFade: 0.84,
      renderOrder: -8,
    },
    mid: {
      files: dirFiles(placeId, 'mid'),
      radius: cfg.midRadius ?? 304,
      height: cfg.midHeight ?? 96,
      y: cfg.midY ?? 10,
      opacity: cfg.midOpacity ?? 0.2,
      brightness: cfg.midBrightness ?? 0.82,
      desaturate: cfg.midDesaturate ?? 0.22,
      edgeFade: 0.16,
      bottomFade: 0.3,
      topFade: 0.9,
      renderOrder: -6.4,
    },
  },
});

const CURATED_BACKDROPS = {
  zabulistan: curated('zabulistan', {
    artNote: 'Sistani highland depth, pahlavan scale, dry ridges, distant champion country.',
    tint: 0xf0d7a7,
    fogTint: 0xd6c9a5,
    farOpacity: 0.32,
    midOpacity: 0.2,
    hazeOpacity: 0.1,
  }),
  sistan: curated('sistan', {
    artNote: 'Sistan reedland frontier with water channels, watch posts, and the rugged Sistani line.',
    tint: 0xcfd0a2,
    fogTint: 0xb8c9b0,
    farOpacity: 0.29,
    midOpacity: 0.21,
    hazeOpacity: 0.15,
    farBrightness: 0.88,
  }),
  kabul: curated('kabul', {
    artNote: 'Kabul valley air with palace-garden distance for the Zal and Rudabeh setting.',
    tint: 0xe9d8b7,
    fogTint: 0xc5d1bd,
    farOpacity: 0.3,
    midOpacity: 0.19,
    hazeOpacity: 0.11,
  }),
  samangan: curated('samangan', {
    artNote: 'Samangan steppe palace warmth, night-court distance, and the shadow of the Sohrab tragedy.',
    tint: 0xd8c0a0,
    fogTint: 0xc5b99d,
    farOpacity: 0.3,
    midOpacity: 0.21,
    hazeOpacity: 0.11,
  }),
  'dez-sepid': curated('dez-sepid', {
    artNote: 'White Fortress highland walls, spear defense, and the first pressure of Sohrab at the gate.',
    tint: 0xdad5c7,
    fogTint: 0xcdd2cd,
    farOpacity: 0.3,
    midOpacity: 0.22,
    hazeOpacity: 0.12,
  }),
  mazandaran: curated('mazandaran', {
    artNote: 'Fog-haunted Mazandaran forest horizon for the Seven Labours and Div-e Sepid.',
    tint: 0xaec7b5,
    fogTint: 0xb8cec3,
    farOpacity: 0.26,
    midOpacity: 0.23,
    hazeOpacity: 0.18,
    farBrightness: 0.86,
    midBrightness: 0.74,
  }),
  alborz: curated('alborz', {
    artNote: 'Alborz sacred height, unreachable ridges, and Simurgh-nest distance around Zal story.',
    tint: 0xd7e5ea,
    fogTint: 0xc0d2dc,
    farOpacity: 0.32,
    midOpacity: 0.22,
    hazeOpacity: 0.13,
    farRadius: 408,
    farHeight: 174,
    midHeight: 104,
  }),
  damavand: curated('damavand', {
    artNote: 'Damavand prison mountain, snow, stone, and the restrained threat of Zahhak.',
    tint: 0xe6f0fb,
    fogTint: 0xc7d9e7,
    farOpacity: 0.34,
    midOpacity: 0.22,
    hazeOpacity: 0.13,
    farRadius: 404,
    farHeight: 176,
    midHeight: 104,
  }),
  'siyavash-gate': curated('siyavash-gate', {
    artNote: 'Siyavash fire-trial valley with ritual flame distance, purity, and tragic judgment.',
    tint: 0xf0c88c,
    fogTint: 0xd9b58f,
    farOpacity: 0.3,
    midOpacity: 0.22,
    hazeOpacity: 0.11,
    farBrightness: 0.9,
  }),
  turan: curated('turan', {
    artNote: 'Turan war-court city with steppe cavalry distance and royal tension, not a crude wasteland.',
    tint: 0xd8bd8b,
    fogTint: 0xc0b290,
    farOpacity: 0.31,
    midOpacity: 0.22,
    hazeOpacity: 0.11,
  }),
  balkh: curated('balkh', {
    artNote: 'Balkh old royal city depth, gates, courtly power, and vulnerability in the Arjasp wars.',
    tint: 0xe5c89a,
    fogTint: 0xc8bea0,
    farOpacity: 0.31,
    midOpacity: 0.21,
    hazeOpacity: 0.11,
  }),
  'dez-roein': curated('dez-roein', {
    artNote: 'Iron Fortress horizon with hard metal defensive imagery and bronze-gray military weight.',
    tint: 0xb8bcc2,
    fogTint: 0xb9c0c6,
    farOpacity: 0.3,
    midOpacity: 0.22,
    hazeOpacity: 0.1,
    farBrightness: 0.86,
    farDesaturate: 0.16,
    midBrightness: 0.75,
    midDesaturate: 0.3,
  }),
  'manijeh-garden': curated('manijeh-garden', {
    artNote: 'Hidden Manijeh garden, forest secrecy, compassion under risk, and the route toward Bijan.',
    tint: 0xa8c49e,
    fogTint: 0xaec7b5,
    farOpacity: 0.26,
    midOpacity: 0.22,
    hazeOpacity: 0.16,
    farBrightness: 0.86,
  }),
  makran: curated('makran', {
    artNote: 'Makran frontier heat, rock, wind, and campaign hardship at the far edge of royal roads.',
    tint: 0xf0bc73,
    fogTint: 0xd4ab75,
    farOpacity: 0.32,
    midOpacity: 0.24,
    hazeOpacity: 0.1,
    farBrightness: 0.9,
  }),
  estakhr: curated('estakhr', {
    artNote: 'Estakhr stone terraces, dynastic ceremony, and Sasanian royal continuity in desert light.',
    tint: 0xe0c096,
    fogTint: 0xc9b086,
    farOpacity: 0.33,
    midOpacity: 0.22,
    hazeOpacity: 0.11,
  }),
  'gordafarid-fort': curated('gordafarid-fort', {
    artNote: 'Gordafarid spear-fort highlands, watchful courage, riding paths, and siege pressure.',
    tint: 0xd4c8a8,
    fogTint: 0xc8c0a8,
    farOpacity: 0.3,
    midOpacity: 0.22,
    hazeOpacity: 0.12,
  }),
  madayen: curated('madayen', {
    artNote: 'Madayen imperial river capital, great arch distance, court ceremony, and Sasanian scale.',
    tint: 0xd6c2a4,
    fogTint: 0xb7c2bb,
    farOpacity: 0.3,
    midOpacity: 0.2,
    hazeOpacity: 0.14,
  }),
  'arash-watch': curated('arash-watch', {
    artNote: 'Vast border horizon and mountain watch distance for the Iran and Turan divide.',
    tint: 0xded5b5,
    fogTint: 0xc5ced1,
    farOpacity: 0.31,
    midOpacity: 0.21,
    hazeOpacity: 0.12,
    farRadius: 410,
  }),
  'dez-bahman': curated('dez-bahman', {
    artNote: 'Cold Kayanian royal-fortress horizon with stone, banners, and dynastic pressure.',
    tint: 0xd8e2ee,
    fogTint: 0xc1cedc,
    farOpacity: 0.31,
    midOpacity: 0.21,
    hazeOpacity: 0.12,
    farRadius: 404,
    farHeight: 170,
  }),
  'gang-dez': curated('gang-dez', {
    artNote: 'Distant royal fortress-city of Turan, fortified and almost unreachable.',
    tint: 0xe1bd86,
    fogTint: 0xc4ad88,
    farOpacity: 0.33,
    midOpacity: 0.23,
    hazeOpacity: 0.13,
    midRadius: 314,
  }),
};

export const BACKDROPS = Object.fromEntries(
  CAMPAIGN_MAP_IDS.map((id) => [id, CURATED_BACKDROPS[id] || placeholder(id)]),
);

export function getBackdropConfig(placeId) {
  return BACKDROPS[placeId] || null;
}

export function backdropManifestReport() {
  return Object.values(BACKDROPS).map((cfg) => ({
    id: cfg.id,
    enabled: !!cfg.enabled,
    status: cfg.status,
    layers: Object.keys(cfg.layers || {}),
    artNote: cfg.artNote,
  }));
}
