// The Ganj-e Danesh (Treasury of Knowledge) — the persistent research tree bought
// with Kherad. Every node here has a REAL effect today; the T/H phases add deeper
// branches (tower specialization paths, hero mastery) that hang off these disciplines.
//
// Effects are read once per battle into game.research (a Set of node ids) — see
// game.js constructor — and consumed by tower.getStats / the wave-income block.
export const RESEARCH_DISCIPLINES = [
  { id: 'learning', icon: '📖' },
  { id: 'statecraft', icon: '👑' },
  { id: 'war', icon: '⚔️' },
];

export const RESEARCH = [
  // ---- Learning: the houses of wisdom themselves ----
  {
    id: 'learning-archives', disc: 'learning', cost: 15,
    name: 'Royal Archives', faName: 'بایگانی شاهی',
    desc: 'Scribes copy every scroll twice. Libraries bank +1 wisdom per wave.',
    descFa: 'کاتبان هر نسخه را دوبار می‌نویسند. کتابخانه‌ها هر موج +۱ خرد می‌اندوزند.',
  },
  {
    id: 'learning-academy', disc: 'learning', cost: 30, requires: 'learning-archives',
    name: 'Academy of Gondishapur', faName: 'دانشگاه گندی‌شاپور',
    desc: 'Found the great academy: unlocks the Academy building (5 wisdom per wave).',
    descFa: 'بنیاد دانشگاه بزرگ: ساختمان دانشگاه گشوده می‌شود (هر موج ۵ خرد).',
  },
  // ---- Statecraft: the king's purse ----
  {
    id: 'state-provisions', disc: 'statecraft', cost: 12,
    name: 'War Provisions', faName: 'آذوقه‌ی جنگ',
    desc: 'The granaries open before the horns sound: begin every battle with +50 gold.',
    descFa: 'انبارها پیش از شیپور جنگ گشوده می‌شوند: هر نبرد با +۵۰ زر آغاز می‌شود.',
  },
  {
    id: 'state-tribute', disc: 'statecraft', cost: 25, requires: 'state-provisions',
    name: 'Tribute Roads', faName: 'راه‌های باج',
    desc: 'Caravans pay passage even in wartime: wave income +10%.',
    descFa: 'کاروان‌ها حتی در جنگ باج راه می‌پردازند: درآمد هر موج +۱۰٪.',
  },
  // ---- War: the drillmasters ----
  {
    id: 'war-drill', disc: 'war', cost: 20,
    name: 'Drillmasters of Sistan', faName: 'مشق‌داران سیستان',
    desc: 'Veterans drill every garrison: all towers +5% damage.',
    descFa: 'کهنه‌سربازان همه را مشق می‌دهند: همه‌ی برج‌ها +۵٪ آسیب.',
  },
  {
    id: 'war-masons', disc: 'war', cost: 25, requires: 'war-drill',
    name: 'Fortress Masons', faName: 'بنایان دژ',
    desc: 'Kayanian stonework in every wall: towers endure +15% structure.',
    descFa: 'سنگ‌کاری کیانی در هر دیوار: تاب برج‌ها +۱۵٪.',
  },
];

export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));
