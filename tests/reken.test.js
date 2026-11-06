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
test('naam en telefoonnummer verplicht, e-mail telt niet', () => {
  const rw = [{ product: 'Rookworst', aantal: 1 }];
  assert.ok(fout(rw, { naam: '  ' }));
  assert.ok(fout(rw, { telefoon: 'abc' }));
  assert.ok(fout(rw, { telefoon: '0612' }));
  assert.ok(fout(rw, { telefoon: 'iemand@voorbeeld.nl' }));
  assert.strictEqual(fout(rw, { telefoon: '+31 6 1234 5678' }), undefined);
  assert.strictEqual(fout(rw, { telefoon: '06-12345678' }), undefined);
  assert.strictEqual(R.telefoonGeldig('06 12345678'), true);
  assert.strictEqual(R.telefoonGeldig('iemand@voorbeeld.nl'), false);
});
test('oud formulier stuurt "contact": wordt als telefoonnummer gebruikt', () => {
  const s = gs.valideerEnBereken(producten, {}, { naam: 'A', contact: '0612345678', items: [{ product: 'Rookworst', aantal: 1 }] });
  assert.strictEqual(s.telefoon, '0612345678');
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

console.log('Kolommen van Bestellingen (nagebootst tabblad)');

// Minimale nabootsing van een Google Sheets-tabblad: genoeg voor ordenKolommen en schrijfBestelling.
function nepTabblad(rijen, maxKolommen = 30, maxRijen = 20) {
  const grid = Array.from({ length: maxRijen }, (_, r) =>
    Array.from({ length: maxKolommen }, (_, c) => (rijen[r] && rijen[r][c] !== undefined ? rijen[r][c] : '')));
  const leeg = v => v === '' || v == null;
  const sheet = {
    grid,
    getMaxRows: () => grid.length,
    getMaxColumns: () => grid[0].length,
    getLastColumn: () => { let m = 0; grid.forEach(rij => rij.forEach((v, c) => { if (!leeg(v)) m = Math.max(m, c + 1); })); return m; },
    getLastRow: () => { let m = 0; grid.forEach((rij, r) => { if (rij.some(v => !leeg(v))) m = r + 1; }); return m; },
    getRange: (r, c, nr = 1, nc = 1) => {
      const bereik = {
        col: c,
        getValues: () => grid.slice(r - 1, r - 1 + nr).map(rij => rij.slice(c - 1, c - 1 + nc)),
        setValue: v => { grid[r - 1][c - 1] = v; return bereik; },
        setValues: w => { w.forEach((rij, i) => rij.forEach((v, j) => { grid[r - 1 + i][c - 1 + j] = v; })); return bereik; },
        setFontWeight: () => bereik, setNumberFormat: () => bereik, setDataValidation: () => bereik,
        clearDataValidations: () => bereik,
        clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) grid[r - 1 + i][c - 1 + j] = ''; return bereik; },
        // Zoals Sheets: oplopend, lege cellen onderaan, verder volgorde behouden.
        sort: ({ column, ascending }) => {
          const blok = grid.slice(r - 1, r - 1 + nr);
          const sleutel = rij => rij[column - 1];
          blok.sort((a, b) => {
            const la = leeg(sleutel(a)), lb = leeg(sleutel(b));
            if (la || lb) return la - lb;
            return (sleutel(a) > sleutel(b) ? 1 : sleutel(a) < sleutel(b) ? -1 : 0) * (ascending ? 1 : -1);
          });
          blok.forEach((rij, i) => { grid[r - 1 + i] = rij; });
          return bereik;
        }
      };
      return bereik;
    },
    insertRowsAfter: (n, aantal) => grid.splice(n, 0, ...Array.from({ length: aantal }, () => Array(grid[0].length).fill(''))),
    insertColumnBefore: n => grid.forEach(rij => rij.splice(n - 1, 0, '')),
    insertColumnAfter: n => grid.forEach(rij => rij.splice(n, 0, '')),
    deleteColumn: n => grid.forEach(rij => { rij.splice(n - 1, 1); rij.push(''); }),
    moveColumns: (bereik, doel) => grid.forEach(rij => {
      const [v] = rij.splice(bereik.col - 1, 1);
      rij.splice(doel > bereik.col ? doel - 2 : doel - 1, 0, v);
    })
  };
  return sheet;
}
gs.SpreadsheetApp = { newDataValidation: () => ({ requireCheckbox() { return this; }, build: () => ({}) }) };
const kopVan = sheet => sheet.grid[0].slice(0, sheet.getLastColumn());
const rijVan = (sheet, r) => { const k = kopVan(sheet); const o = {}; k.forEach((h, c) => { if (sheet.grid[r][c] !== '') o[h] = sheet.grid[r][c]; }); return o; };
const prod = namen => namen.map(product => ({ product }));

test('oud tabblad wordt omgezet: zonder datum en regels, met telefoonnummer en opmerking achteraan', () => {
  const sheet = nepTabblad([
    ['tijdstip', 'bestelnummer', 'naam', 'contact', 'opmerking', 'regels', 'totaal', 'Erwtensoep', 'Rookworst', 'Advocaat'],
    ['d1', 'WF-0001', 'An', '0611111111', '', '2× Erwtensoep', 15.9, 2, '', ''],
    ['d2', 'WF-0002', 'Bo', '0622222222', 'graag vroeg', '1× Advocaat; 4× Rookworst', 23.75, '', 4, 1]
  ]);
  gs.ordenKolommen(sheet, prod(['Advocaat', 'Erwtensoep', 'Rookworst']));
  assert.deepStrictEqual(kopVan(sheet), ['bestelnummer', 'naam', 'telefoonnummer',
    'Advocaat', 'Erwtensoep', 'Rookworst', 'totaal', 'betaalwijze', 'afgerond', 'opmerking']);
  assert.deepStrictEqual(rijVan(sheet, 1), { bestelnummer: 'WF-0001', naam: 'An', telefoonnummer: '0611111111',
    Erwtensoep: 2, totaal: 15.9 });
  assert.deepStrictEqual(rijVan(sheet, 2), { bestelnummer: 'WF-0002', naam: 'Bo', telefoonnummer: '0622222222',
    opmerking: 'graag vroeg', Advocaat: 1, Rookworst: 4, totaal: 23.75 });
});
test('huidige indeling: datum, regels en Opmerkingen Marianne verdwijnen, opmerking gaat naar het eind', () => {
  const sheet = nepTabblad([
    ['datum', 'bestelnummer', 'naam', 'telefoonnummer', 'opmerking', 'regels', 'Rookworst', 'totaal', 'afgerond', 'Opmerkingen Marianne'],
    ['d1', 'WF-0001', 'An', '0611111111', 'graag vroeg', '1× Rookworst', 1, 3.5, true, 'betaald']
  ]);
  gs.ordenKolommen(sheet, prod(['Rookworst']));
  assert.deepStrictEqual(kopVan(sheet), ['bestelnummer', 'naam', 'telefoonnummer', 'Rookworst', 'totaal', 'betaalwijze', 'afgerond', 'opmerking']);
  assert.deepStrictEqual(rijVan(sheet, 1), { bestelnummer: 'WF-0001', naam: 'An', telefoonnummer: '0611111111',
    opmerking: 'graag vroeg', Rookworst: 1, totaal: 3.5, afgerond: true });
});
test('nieuw product en andere volgorde: vinkjes en opmerkingen blijven bij de juiste bestelling', () => {
  const sheet = nepTabblad([
    ['datum', 'bestelnummer', 'naam', 'telefoonnummer', 'opmerking', 'regels', 'Advocaat', 'Rookworst', 'totaal', 'afgerond', 'Opmerkingen Marianne'],
    ['d1', 'WF-0001', 'An', '0611111111', 'graag vroeg', '1× Advocaat', 1, '', 9.25, true, 'betaald'],
    ['d2', 'WF-0002', 'Bo', '0622222222', '', '3× Rookworst', '', 3, 10.5, '', 'belt nog']
  ]);
  gs.ordenKolommen(sheet, prod(['Rookworst', 'Groenstuk', 'Advocaat']));
  assert.deepStrictEqual(kopVan(sheet).slice(3), ['Rookworst', 'Groenstuk', 'Advocaat', 'totaal', 'betaalwijze', 'afgerond', 'opmerking']);
  assert.strictEqual(rijVan(sheet, 1).opmerking, 'graag vroeg');
  assert.strictEqual(rijVan(sheet, 1).afgerond, true);
  assert.strictEqual(rijVan(sheet, 1).Advocaat, 1);
  assert.strictEqual(rijVan(sheet, 2).opmerking, undefined);
  assert.strictEqual(rijVan(sheet, 2).Rookworst, 3);
});
test('verwijderd product: kolom blijft bewaard vóór totaal', () => {
  const sheet = nepTabblad([
    ['datum', 'bestelnummer', 'naam', 'telefoonnummer', 'opmerking', 'regels', 'Oud', 'A', 'totaal', 'afgerond', 'Opmerkingen Marianne'],
    ['d1', 'WF-0001', 'An', '0611111111', '', '', 3, 1, 5, '', '']
  ]);
  gs.ordenKolommen(sheet, prod(['A']));
  assert.deepStrictEqual(kopVan(sheet).slice(3), ['A', 'Oud', 'totaal', 'betaalwijze', 'afgerond', 'opmerking']);
  assert.deepStrictEqual([rijVan(sheet, 1).A, rijVan(sheet, 1).Oud], [1, 3]);
});
test('telefoonnummers die Sheets als getal zag krijgen hun 0 terug', () => {
  const sheet = nepTabblad([
    ['bestelnummer', 'naam', 'telefoonnummer', 'totaal', 'betaalwijze', 'afgerond', 'opmerking'],
    ['WF-0001', 'An', 612345678, 3.5, '', '', ''],
    ['WF-0002', 'Bo', '06 22 22 22 22', 3.5, '', '', '']
  ]);
  gs.ordenKolommen(sheet, prod([]));
  assert.strictEqual(rijVan(sheet, 1).telefoonnummer, '0612345678');
  assert.strictEqual(rijVan(sheet, 2).telefoonnummer, '06 22 22 22 22');
});
test('tweede keer ordenen verandert niets', () => {
  const sheet = nepTabblad([['tijdstip', 'bestelnummer', 'naam', 'contact', 'opmerking', 'regels', 'totaal', 'B', 'A']]);
  gs.ordenKolommen(sheet, prod(['A', 'B']));
  const eerste = JSON.stringify(sheet.grid);
  gs.ordenKolommen(sheet, prod(['A', 'B']));
  assert.strictEqual(JSON.stringify(sheet.grid), eerste);
});
test('losse vinkjes in lege rijen: bestellingen schuiven omhoog, nieuwe komt eronder', () => {
  const kop = ['datum', 'bestelnummer', 'naam', 'telefoonnummer', 'opmerking', 'regels', 'Rookworst', 'Advocaat, groot', 'totaal', 'afgerond', 'Opmerkingen Marianne'];
  const leegMetVinkje = ['', '', '', '', '', '', '', '', '', false, ''];
  const rijen = [kop];
  for (let i = 0; i < 15; i++) rijen.push(leegMetVinkje.slice());
  rijen.push(['d', 'WF-0001', 'An', '0611111111', '', '1× Rookworst', 1, '', 3.5, true, 'betaald']);
  rijen.push(['d', 'WF-0002', 'TEST', '0600000000', '', '1× Rookworst', 1, '', 3.5, false, '']);
  const sheet = nepTabblad(rijen, 30, 18);
  gs.tabblad = () => sheet;
  const b = gs.valideerEnBereken(producten, {}, { naam: 'Cas', telefoon: '0633333333', items: [{ product: 'Rookworst', aantal: 1 }] });
  const nummer = gs.schrijfBestelling(b, [{ product: 'Rookworst' }, { product: 'Advocaat, groot' }]);
  assert.strictEqual(nummer, 'WF-0003');
  assert.deepStrictEqual([1, 2, 3].map(r => rijVan(sheet, r).bestelnummer), ['WF-0001', 'WF-0002', 'WF-0003']);
  assert.strictEqual(rijVan(sheet, 1).afgerond, true);
  assert.ok(!kopVan(sheet).includes('Opmerkingen Marianne'));
  assert.strictEqual(sheet.getLastRow(), 4);
});
test('nieuwe bestelling komt in de juiste kolommen', () => {
  const sheet = nepTabblad([['tijdstip', 'bestelnummer', 'naam', 'contact', 'opmerking', 'regels', 'totaal', 'Rookworst', 'Advocaat']]);
  gs.tabblad = () => sheet;
  const b = gs.valideerEnBereken(producten, {}, { naam: 'Cas', telefoon: '0633333333', betaalwijze: 'betaalverzoek', items: [{ product: 'Rookworst', aantal: 4 }] });
  const nummer = gs.schrijfBestelling(b, producten);
  assert.strictEqual(nummer, 'WF-0001');
  const rij = rijVan(sheet, 1);
  assert.strictEqual(rij.telefoonnummer, '0633333333');
  assert.strictEqual(rij.Rookworst, 4);
  assert.strictEqual(rij.totaal, 13.5);
  assert.strictEqual(rij.betaalwijze, 'Betaalverzoek');
  assert.ok(!('datum' in rij) && !('regels' in rij));
  assert.deepStrictEqual(kopVan(sheet).slice(-4), ['totaal', 'betaalwijze', 'afgerond', 'opmerking']);

  const b2 = gs.valideerEnBereken(producten, {}, { naam: 'Dirk', telefoon: '0644444444', betaalwijze: 'winterfair', items: [{ product: 'Rookworst', aantal: 1 }] });
  gs.schrijfBestelling(b2, producten);
  assert.strictEqual(rijVan(sheet, 2).betaalwijze, 'Op de Winterfair');
});
test('betaalwijze: alleen betaalverzoek of winterfair (leeg mag nog voor oude pagina)', () => {
  const rw = [{ product: 'Rookworst', aantal: 1 }];
  assert.match(fout(rw, { betaalwijze: 'contant' }), /betalen/);
  assert.strictEqual(fout(rw, { betaalwijze: 'betaalverzoek' }), undefined);
  assert.strictEqual(fout(rw, { betaalwijze: 'winterfair' }), undefined);
  assert.strictEqual(fout(rw, {}), undefined);
});

console.log(`\nAlle ${geslaagd} tests geslaagd.`);
