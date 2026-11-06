// Controleert de rekenregels in de browser (reken.js) én op de server (Code.gs).
// Gebruik: node tests/reken.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = require('../reken.js');
const gs = {};
vm.createContext(gs);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), gs);

const producten = [
  { product: 'Erwtensoep, 1 liter', prijs: 795, actieAantal: null, actiePrijs: null, actief: true, maxVoorraad: null },
  { product: 'Rookworst', prijs: 350, actieAantal: 3, actiePrijs: 1000, actief: true, maxVoorraad: null },
  { product: 'Twixkoek', prijs: 695, actieAantal: null, actiePrijs: null, actief: true, maxVoorraad: 5 },
  { product: 'Macadamiamix gezouten', prijs: null, actieAantal: null, actiePrijs: null, actief: true, maxVoorraad: null },
  { product: 'Oud product', prijs: 100, actieAantal: null, actiePrijs: null, actief: false, maxVoorraad: null }
];
const rookworst = producten[1];
const klant = { naam: 'Test Klant', contact: '06 12345678' };

let geslaagd = 0;
function test(naam, fn) {
  fn();
  geslaagd++;
  console.log('  ✓ ' + naam);
}

console.log('Actieregel rookworst (3 voor € 10,00, los € 3,50)');
[[1, 350], [2, 700], [3, 1000], [4, 1350], [5, 1700], [6, 2000], [7, 2350]].forEach(([n, verwacht]) => {
  test(`${n} rookworst = ${R.formatEuro(verwacht)}`, () => {
    assert.strictEqual(R.regelBedrag(rookworst, n), verwacht);
    assert.strictEqual(gs.regelBedrag(rookworst, n), verwacht);
  });
});

console.log('Totalen');
test('ontwerpvoorbeeld: 2 erwtensoep + 3 rookworst = € 25,90', () => {
  assert.strictEqual(R.bereken(producten, { 'Erwtensoep, 1 liter': 2, Rookworst: 3 }).totaal, 2590);
  const s = gs.valideerEnBereken(producten, {}, { ...klant, items: [
    { product: 'Erwtensoep, 1 liter', aantal: 2 }, { product: 'Rookworst', aantal: 3 }] });
  assert.strictEqual(s.totaal, 2590);
  assert.strictEqual(gs.regelsAlsTekst(s.regels), '2× Erwtensoep, 1 liter; 3× Rookworst');
});
test('gemengd: 1 erwtensoep + 4 rookworst + 2 twixkoek = € 35,35', () => {
  const aantallen = { 'Erwtensoep, 1 liter': 1, Rookworst: 4, Twixkoek: 2 };
  assert.strictEqual(R.bereken(producten, aantallen).totaal, 795 + 1350 + 1390);
  const s = gs.valideerEnBereken(producten, {}, { ...klant, items: Object.entries(aantallen).map(([product, aantal]) => ({ product, aantal })) });
  assert.strictEqual(s.totaal, 3535);
});
test('server negeert bedragen uit de browser', () => {
  const s = gs.valideerEnBereken(producten, {}, { ...klant, totaal: 1, items: [{ product: 'Rookworst', aantal: 4, bedrag: 1, prijs: 1 }] });
  assert.strictEqual(s.totaal, 1350);
});
test('dubbel aangeleverd product wordt opgeteld (2 + 2 rookworst = 4)', () => {
  const s = gs.valideerEnBereken(producten, {}, { ...klant, items: [{ product: 'Rookworst', aantal: 2 }, { product: 'Rookworst', aantal: 2 }] });
  assert.strictEqual(s.totaal, 1350);
});

console.log('Weigeren');
const fout = (items, extra = {}, verkocht = {}) => gs.valideerEnBereken(producten, verkocht, { ...klant, ...extra, items }).fout;
test('geen producten', () => assert.ok(fout([])));
test('product zonder prijs', () => assert.match(fout([{ product: 'Macadamiamix gezouten', aantal: 1 }]), /geen prijs/));
test('inactief product', () => assert.ok(fout([{ product: 'Oud product', aantal: 1 }])));
test('onbekend product', () => assert.ok(fout([{ product: 'Kaviaar', aantal: 1 }])));
test('negatief of gebroken aantal', () => {
  assert.ok(fout([{ product: 'Rookworst', aantal: -1 }]));
  assert.ok(fout([{ product: 'Rookworst', aantal: 1.5 }]));
  assert.ok(fout([{ product: 'Rookworst', aantal: 51 }]));
});
test('voorraad: 5 max, 3 verkocht → 3 bestellen geweigerd, 2 mag', () => {
  assert.match(fout([{ product: 'Twixkoek', aantal: 3 }], {}, { Twixkoek: 3 }), /nog maar 2/);
  assert.strictEqual(fout([{ product: 'Twixkoek', aantal: 2 }], {}, { Twixkoek: 3 }), undefined);
  assert.match(fout([{ product: 'Twixkoek', aantal: 1 }], {}, { Twixkoek: 5 }), /uitverkocht/);
});
test('naam en contact verplicht', () => {
  assert.ok(fout([{ product: 'Rookworst', aantal: 1 }], { naam: '  ' }));
  assert.ok(fout([{ product: 'Rookworst', aantal: 1 }], { contact: 'abc' }));
  assert.ok(fout([{ product: 'Rookworst', aantal: 1 }], { contact: '0612' }));
  assert.strictEqual(fout([{ product: 'Rookworst', aantal: 1 }], { contact: 'iemand@voorbeeld.nl' }), undefined);
  assert.strictEqual(fout([{ product: 'Rookworst', aantal: 1 }], { contact: '+31 6 1234 5678' }), undefined);
});

console.log('Hulpfuncties');
test('prijzen uit de Sheet', () => {
  assert.strictEqual(gs.prijsInCenten(7.95), 795);
  assert.strictEqual(gs.prijsInCenten('7,95'), 795);
  assert.strictEqual(gs.prijsInCenten('€ 10'), 1000);
  assert.strictEqual(gs.prijsInCenten('[PRIJS]'), null);
  assert.strictEqual(gs.prijsInCenten(''), null);
});
test('formules in tekstvelden worden onschadelijk', () => {
  assert.strictEqual(gs.veilig('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  assert.strictEqual(gs.veilig('+31 6 12345678'), "'+31 6 12345678");
  assert.strictEqual(gs.veilig('Jan'), 'Jan');
});
test('sluitdatum: t/m 3 december 23.59 uur', () => {
  const sluit = new Date('2026-12-03T23:59:59+01:00');
  assert.strictEqual(gs.isOpen(sluit, new Date('2026-12-03T23:59:00+01:00')), true);
  assert.strictEqual(gs.isOpen(sluit, new Date('2026-12-04T00:00:00+01:00')), false);
});
test('bedragen netjes in euro', () => {
  assert.strictEqual(R.formatEuro(2590), '€ 25,90');
  assert.strictEqual(R.formatEuro(123456), '€ 1.234,56');
});

console.log('Kolommen van Bestellingen');
// vm-arrays komen uit een andere context; via JSON vergelijken.
const orden = (blok, namen) => JSON.parse(JSON.stringify(gs.herordenProductBlok(blok, namen)));
test('kolommen volgen de volgorde van Producten, aantallen schuiven mee', () => {
  const blok = [['Erwtensoep', 'Rookworst', 'Advocaat'], [2, '', 1], ['', 4, '']];
  assert.deepStrictEqual(orden(blok, ['Advocaat', 'Erwtensoep', 'Rookworst']),
    [['Advocaat', 'Erwtensoep', 'Rookworst'], [1, 2, ''], ['', '', 4]]);
});
test('volgorde klopt al → niets doen', () => {
  assert.strictEqual(gs.herordenProductBlok([['A', 'B'], [1, 2]], ['A', 'B']), null);
});
test('nieuw product krijgt een lege kolom op zijn plek', () => {
  assert.deepStrictEqual(orden([['A', 'B'], [1, 2]], ['A', 'Nieuw', 'B']), [['A', 'Nieuw', 'B'], [1, '', 2]]);
});
test('kolom van verwijderd product blijft achteraan bewaard', () => {
  assert.deepStrictEqual(orden([['Oud', 'A'], [3, 1]], ['A']), [['A', 'Oud'], [1, 3]]);
});
test('lege kolom zonder kop verdwijnt, met gegevens blijft hij', () => {
  assert.deepStrictEqual(orden([['A', '', ''], [1, '', 7]], ['A']), [['A', ''], [1, 7]]);
});
test('nog geen productkolommen → alle producten erbij', () => {
  assert.deepStrictEqual(orden([[], []], ['A', 'B']), [['A', 'B'], ['', '']]);
});

console.log(`\nAlle ${geslaagd} tests geslaagd.`);
