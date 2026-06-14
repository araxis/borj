// FusionRecipe data — merging two compatible towers creates a hybrid with inherited powers.
// Both towers must be built and within `maxDist` of each other; the result replaces tower A
// and tower B's pad is freed. Lore reason is mandatory — fusions are story-grounded.

export const FUSIONS = [
  {
    id: 'kaviani-uprising', a: 'kaveh-forge', b: 'derafsh-hall',
    name: 'Kaviani Uprising Forge', faName: 'کوره‌ی خیزش کاویانی',
    cost: 300, maxDist: 14,
    loreReason: 'The forge that birthed the standard and the hall that raised it are one revolt: Kaveh\'s hammer beneath the Derafsh-e Kaviani.',
    loreReasonFa: 'کوره‌ای که درفش از آن زاده شد و تالاری که آن را برافراشت، یک خیزش‌اند: پتک کاوه زیر درفش کاویانی.',
    inherit: { damage: 1.3, repair: true, aura: { damageBonus: 0.15, soldierBonus: 0.3, fearImmunity: true }, garrison: { soldier: 'forge-workers', count: 4 } },
    vfx: 'bannerForge',
  },
  {
    id: 'simurgh-alborz', a: 'simurgh-nest', b: 'alborz-aerie',
    name: 'Alborz Aerie of the Simurgh', faName: 'آشیان سیمرغ بر البرز',
    cost: 320, maxDist: 14,
    loreReason: 'The nest returns to its mountain: Simurgh\'s healing joined to the heights where she raised Zal.',
    loreReasonFa: 'آشیان به کوه خود بازمی‌گردد: درمان سیمرغ با بلندایی که زال را در آن پرورد یکی می‌شود.',
    inherit: { damage: 1.4, vsFlying: 2.5, heal: { hps: 22, radius: 13 }, reveal: true },
    vfx: 'featherStorm',
  },
  {
    id: 'binding-damavand', a: 'fereydun-mace', b: 'damavand-chains',
    name: 'Binding of Damavand', faName: 'بندِ دماوند',
    cost: 380, maxDist: 14,
    loreReason: 'The ox-headed mace and the mountain chains re-enact Fereydun\'s judgment: tyrants struck down, then bound.',
    loreReasonFa: 'گرز گاوسر و زنجیرهای کوه، داوری فریدون را بازمی‌سازند: ستمگران نخست کوبیده و سپس بسته می‌شوند.',
    inherit: { damage: 1.5, vsBoss: 2.0, stunChance: 0.3, chainSlow: { factor: 0.4, dur: 3.0 } },
    vfx: 'chainShock',
  },
  {
    id: 'farsighted-court', a: 'arash-watch', b: 'khosrow-hall',
    name: 'Farsighted Border Court', faName: 'دیوان دوربینِ مرز',
    cost: 400, maxDist: 16,
    loreReason: 'Arash\'s horizon and Kay Khosrow\'s world-seeing cup: the border defended by sight beyond ordinary rule.',
    loreReasonFa: 'افق آرش و جام جهان‌بین کیخسرو: مرزی که با بینشی فراتر از فرمانروایی پاس داشته می‌شود.',
    inherit: { damage: 1.4, range: 1.3, pierce: 4, aura: { rangeBonus: 0.2, markDamage: 0.15 }, reveal: true },
    vfx: 'horizonBeam',
  },
  {
    id: 'sacred-judgment', a: 'siyavash-gate', b: 'fire-altar',
    name: 'Sacred Flame Judgment Gate', faName: 'دروازه‌ی داوری شعله‌ی مقدس',
    cost: 360, maxDist: 12,
    loreReason: 'Hushang\'s first fire feeds Siyavash\'s trial: the oldest flame burning in the purest ordeal.',
    loreReasonFa: 'آتش نخستین هوشنگ، آزمون سیاوش را برمی‌افروزد: کهن‌ترین شعله در پاک‌ترین آزمون.',
    inherit: { damage: 1.5, burn: { dps: 22, dur: 3.5 }, cone: 0.9, vsDiv: 1.6 },
    vfx: 'sacredInferno',
  },
  {
    id: 'sortie-stables', a: 'gordafarid-fort', b: 'rakhsh-stable',
    name: 'White Fortress Sortie Stables', faName: 'اصطبل تاخت دژ سپید',
    cost: 380, maxDist: 14,
    loreReason: 'Gordafarid rode out to meet Sohrab; with Rakhsh-line horses beneath her riders, the sortie becomes a storm.',
    loreReasonFa: 'گردآفرید برای رویارویی با سهراب بیرون تاخت؛ با اسبانی از تبار رخش، تاختن به توفان بدل می‌شود.',
    inherit: { garrison: { soldier: 'spear-maidens', count: 2, extra: { soldier: 'cavalry-lancers', count: 2 } }, damage: 1.2 },
    vfx: 'cavalryDust',
  },
  {
    id: 'brazen-citadel', a: 'white-fortress', b: 'esfandiyar-bastion',
    name: 'Brazen White Citadel', faName: 'دژ سپیدِ رویین',
    cost: 360, maxDist: 14,
    loreReason: 'The White Fortress armored in Esfandiyar\'s brazen plate: the gate Hojir held, now nearly invulnerable.',
    loreReasonFa: 'دژ سپید در زرهِ رویین اسفندیار: دروازه‌ای که هجیر نگه داشت، اکنون تقریباً نفوذناپذیر.',
    inherit: { damage: 1.4, hpBonus: 3.0, garrison: { soldier: 'spear-levy', count: 4 } },
    vfx: 'bronzeGleam',
  },
  {
    id: 'imperial-radiance', a: 'jamshid-court', b: 'madayen-arch',
    name: 'Imperial Radiance Court', faName: 'بارگاه فرّ امپراتوری',
    cost: 450, maxDist: 16,
    loreReason: 'Jamshid\'s farr beneath Madayen\'s arch: the glory of the first order joined to the last empire\'s ceremony.',
    loreReasonFa: 'فرّ جمشید زیر طاق مداین: شکوه نظم نخستین با آیین واپسین امپراتوری.',
    inherit: { income: 60, damage: 1.3, aura: { damageBonus: 0.12, moraleBonus: 0.2 } },
    vfx: 'goldenAura',
  },
  {
    id: 'davazdah-muster', a: 'goodarz-barracks', b: 'tus-camp',
    name: 'Davazdah Rokh Muster', faName: 'گردهمایی دوازده‌رخ',
    cost: 400, maxDist: 14,
    loreReason: 'Goodarz and Tus commanded the climactic wars side by side; their joined muster fields an army of veterans.',
    loreReasonFa: 'گودرز و توس در جنگ‌های فرجامین دوشادوش فرمان راندند؛ گردهمایی‌شان سپاهی از کهنه‌سربازان می‌آراید.',
    inherit: { garrison: { soldier: 'veteran-guard', count: 3, extra: { soldier: 'war-drummers', count: 1 } } },
    vfx: 'musterBanners',
  },
  {
    id: 'siege-works', a: 'estakhr-terrace', b: 'gang-dez',
    name: 'Imperial Siege Works', faName: 'کارگاه محاصره‌ی امپراتوری',
    cost: 420, maxDist: 16,
    loreReason: 'Sasanian masonry and far-fortress engineering: stone shaped, weighed, and sent farther than any single tradition could throw.',
    loreReasonFa: 'سنگ‌تراشی ساسانی و مهندسی دژ دوردست: سنگی تراشیده و سنجیده که از هر سنت تنها، دورتر می‌رود.',
    inherit: { damage: 1.5, range: 1.2, splash: 5.0, rolling: true },
    vfx: 'siegeRumble',
  },
  {
    id: 'champions-watch', a: 'zabul-watch', b: 'babr-ward',
    name: "Champion's Watch of Zabul", faName: 'دیدبان پهلوان زابل',
    cost: 280, maxDist: 12,
    loreReason: 'The homeland tower wearing the trial-earned armor: Zabulistan watched over by Babr-e Bayan itself.',
    loreReasonFa: 'برج زادبوم در جامه‌ی رزم آزمون‌یافته: زابلستان زیر نگاه خودِ ببر بیان.',
    inherit: { damage: 1.6, hpBonus: 2.0, aura: { armorBonus: 0.15 } },
    vfx: 'tigerBanner',
  },
  {
    id: 'just-seal', a: 'tahmuras-seal', b: 'khosrow-hall',
    name: 'Seal of the Just King', faName: 'مهر شاه دادگر',
    cost: 420, maxDist: 16,
    loreReason: 'Tahmuras bound the divs; Kay Khosrow judged the guilty. Together the seal both binds and sentences.',
    loreReasonFa: 'تهمورث دیوان را بست؛ کیخسرو گناهکار را داوری کرد. مهرشان هم می‌بندد و هم حکم می‌راند.',
    inherit: { damage: 1.4, vsDiv: 2.4, bind: { dur: 1.8, cd: 5 }, aura: { markDamage: 0.15 }, reveal: true },
    vfx: 'sealLight',
  },
];

export const FUSIONS_BY_ID = Object.fromEntries(FUSIONS.map((f) => [f.id, f]));

export function findFusion(idA, idB) {
  return FUSIONS.find((f) => (f.a === idA && f.b === idB) || (f.a === idB && f.b === idA)) || null;
}
