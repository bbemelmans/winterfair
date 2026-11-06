/**
 * @OnlyCurrentDoc  Script krijgt alleen toegang tot deze ene Sheet.
 */

/**
 * Winterfair – bestellingen via Google Sheet.
 *
 * Plak dit hele bestand in Extensies → Apps Script van de Sheet.
 * Zie README.md voor de stappen (setup draaien, implementeren als webapp).
 *
 * doGet  → productlijst, sluitdatum en of bestellen open is (JSON)
 * doPost → bestelling controleren, opnieuw doorrekenen en opslaan (JSON)
 *
 * Bedragen zijn intern in centen, zodat er geen afrondingsfouten ontstaan.
 */

var TAB_PRODUCTEN = 'Producten';
var TAB_BESTELLINGEN = 'Bestellingen';
var TAB_INSTELLINGEN = 'Instellingen';
var TIJDZONE = 'Europe/Amsterdam';

var PRODUCT_KOLOMMEN = ['volgorde', 'product', 'prijs', 'actie_aantal', 'actie_prijs', 'actief', 'max_voorraad', 'foto', 'omschrijving'];
var VASTE_KOLOMMEN = ['tijdstip', 'bestelnummer', 'naam', 'contact', 'opmerking', 'regels', 'totaal'];
var MAX_PER_PRODUCT = 50;

var STARTLIJST = [
  [1, 'Erwtensoep, 1 liter', 7.95, '', '', 'ja', '', '', ''],
  [2, 'Rookworst', 3.50, 3, 10.00, 'ja', '', '', ''],
  [3, 'Panettone cake', 5.95, '', '', 'ja', '', '', ''],
  [4, 'Twixkoek', 6.95, '', '', 'ja', '', '', ''],
  [5, 'Speculaasbrokken', 4.95, '', '', 'ja', '', '', ''],
  [6, 'Eieren, 10 stuks', 3.50, '', '', 'ja', '', '', ''],
  [7, 'Granola, 500 g', 6.95, '', '', 'ja', '', '', ''],
  [8, 'Macadamiamix gezouten', '[PRIJS]', '', '', 'ja', '', '', ''],
  [9, 'Macadamiamix ongezouten', '[PRIJS]', '', '', 'ja', '', '', '']
];


/* ---------- Webapp ---------- */

function doGet() {
  try {
    var producten = leesProducten();
    var verkocht = leesVerkocht();
    var sluitdatum = leesSluitdatum();
    return json({
      ok: true,
      open: isOpen(sluitdatum, new Date()),
      sluitdatum: sluitdatum ? sluitdatum.toISOString() : null,
      producten: producten.filter(function (p) { return p.actief; }).map(function (p) {
        return {
          product: p.product,
          prijs: p.prijs,
          actieAantal: p.actieAantal,
          actiePrijs: p.actiePrijs,
          beschikbaar: p.maxVoorraad == null ? null : Math.max(0, p.maxVoorraad - (verkocht[p.product] || 0)),
          foto: p.foto,
          omschrijving: p.omschrijving
        };
      })
    });
  } catch (err) {
    console.error(err);
    return json({ ok: false, fout: 'De productlijst kon niet worden geladen.' });
  }
}

function doPost(e) {
  var invoer;
  try {
    invoer = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, fout: 'De bestelling kon niet worden gelezen.' });
  }
  // Honeypot: mensen zien dit veld niet, spambots vullen het wel in.
  if (!invoer || typeof invoer !== 'object' || invoer.website) {
    return json({ ok: false, fout: 'De bestelling kon niet worden verwerkt.' });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json({ ok: false, fout: 'Het is even erg druk. Probeer het over een minuut opnieuw.' });
  }

  try {
    if (!isOpen(leesSluitdatum(), new Date())) {
      return json({ ok: false, gesloten: true, fout: 'Bestellen is gesloten.' });
    }
    var producten = leesProducten();
    var bestelling = valideerEnBereken(producten, leesVerkocht(), invoer);
    if (bestelling.fout) return json({ ok: false, fout: bestelling.fout });

    var bestelnummer = schrijfBestelling(bestelling, producten);
    SpreadsheetApp.flush();
    return json({
      ok: true,
      bestelnummer: bestelnummer,
      regels: bestelling.regels,
      totaal: bestelling.totaal
    });
  } catch (err) {
    console.error(err);
    return json({ ok: false, fout: 'Er ging iets mis bij het opslaan. Probeer het opnieuw.' });
  } finally {
    lock.releaseLock();
  }
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ---------- Controleren en rekenen (geen Sheet-toegang, los te testen) ---------- */

// producten: uit leesProducten(); verkocht: { productnaam: aantal }
// Geeft { fout } of { naam, contact, opmerking, regels, totaal }.
function valideerEnBereken(producten, verkocht, invoer) {
  var naam = schoon(invoer.naam, 100);
  var contact = schoon(invoer.contact, 100);
  var opmerking = schoon(invoer.opmerking, 500, true);

  if (!naam) return { fout: 'Vul je naam in.' };
  if (!contactGeldig(contact)) return { fout: 'Vul een geldig telefoonnummer of e-mailadres in.' };
  if (!Array.isArray(invoer.items)) return { fout: 'Kies minstens één product.' };

  var perNaam = {};
  producten.forEach(function (p) { perNaam[p.product] = p; });

  // Aantallen per product optellen (voor het geval een product dubbel binnenkomt).
  var gevraagd = {};
  for (var i = 0; i < invoer.items.length; i++) {
    var item = invoer.items[i] || {};
    var aantal = Number(item.aantal);
    if (!Number.isInteger(aantal) || aantal < 0 || aantal > MAX_PER_PRODUCT) {
      return { fout: 'Ongeldig aantal. Per product kun je maximaal ' + MAX_PER_PRODUCT + ' stuks bestellen.' };
    }
    if (aantal === 0) continue;
    var productNaam = String(item.product || '');
    var p = perNaam[productNaam];
    if (!p || !p.actief) return { fout: '"' + productNaam + '" is niet (meer) te bestellen. Ververs de pagina.' };
    if (p.prijs == null) return { fout: 'Voor "' + p.product + '" is nog geen prijs bekend.' };
    gevraagd[p.product] = (gevraagd[p.product] || 0) + aantal;
  }

  var regels = [];
  var totaal = 0;
  for (var j = 0; j < producten.length; j++) {
    var prod = producten[j];
    var n = gevraagd[prod.product];
    if (!n) continue;
    if (n > MAX_PER_PRODUCT) {
      return { fout: 'Per product kun je maximaal ' + MAX_PER_PRODUCT + ' stuks bestellen.' };
    }
    if (prod.maxVoorraad != null) {
      var over = Math.max(0, prod.maxVoorraad - (verkocht[prod.product] || 0));
      if (n > over) {
        return { fout: over === 0
          ? '"' + prod.product + '" is uitverkocht.'
          : 'Van "' + prod.product + '" zijn er nog maar ' + over + ' beschikbaar.' };
      }
    }
    var bedrag = regelBedrag(prod, n);
    regels.push({ product: prod.product, aantal: n, bedrag: bedrag });
    totaal += bedrag;
  }

  if (!regels.length) return { fout: 'Kies minstens één product.' };
  return { naam: naam, contact: contact, opmerking: opmerking, regels: regels, totaal: totaal };
}

// Per volledige set van actieAantal geldt actiePrijs, de rest kost de stukprijs.
function regelBedrag(product, aantal) {
  if (product.actieAantal > 1 && product.actiePrijs != null) {
    var sets = Math.floor(aantal / product.actieAantal);
    var rest = aantal % product.actieAantal;
    return sets * product.actiePrijs + rest * product.prijs;
  }
  return aantal * product.prijs;
}

// 7.95, "7,95", "€ 7,95" → 795. Leeg of "[PRIJS]" → null (nog geen prijs).
function prijsInCenten(waarde) {
  if (typeof waarde === 'number') return isFinite(waarde) && waarde >= 0 ? Math.round(waarde * 100) : null;
  var tekst = String(waarde == null ? '' : waarde).replace(/€/g, '').replace(/\s/g, '');
  if (!/^\d+([.,]\d{1,2})?$/.test(tekst)) return null;
  return Math.round(Number(tekst.replace(',', '.')) * 100);
}

function geheelGetal(waarde) {
  if (waarde === '' || waarde == null) return null;
  var n = Number(waarde);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function isActief(waarde) {
  if (waarde === true) return true;
  return /^(ja|j|yes|y|true|1)$/i.test(String(waarde).trim());
}

function isOpen(sluitdatum, nu) {
  return !sluitdatum || nu.getTime() <= sluitdatum.getTime();
}

function contactGeldig(waarde) {
  var v = String(waarde || '').trim();
  if (v.indexOf('@') !== -1) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  return (v.match(/\d/g) || []).length >= 10 && /^[\d\s()+\-.]+$/.test(v);
}

function schoon(waarde, max, regelsToegestaan) {
  var tekst = String(waarde == null ? '' : waarde);
  tekst = regelsToegestaan
    ? tekst.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    : tekst.replace(/[\u0000-\u001F\u007F]/g, ' ');
  return tekst.trim().slice(0, max);
}

// Voorkomt dat tekst die met =, +, - of @ begint als formule wordt gelezen.
function veilig(tekst) {
  return /^[=+\-@]/.test(tekst) ? "'" + tekst : tekst;
}

function regelsAlsTekst(regels) {
  return regels.map(function (r) { return r.aantal + '× ' + r.product; }).join('; ');
}

// blok: de productkolommen van Bestellingen (rij 0 = kopregel).
// Geeft het blok terug met de kolommen in de volgorde van productNamen,
// of null als de volgorde al klopt. Producten zonder kolom krijgen een lege kolom;
// kolommen van producten die niet meer in Producten staan, schuiven naar achteren.
function herordenProductBlok(blok, productNamen) {
  var oudeKop = blok[0].map(function (h) { return String(h).trim(); });
  var gebruikt = {};
  var volgorde = [];
  productNamen.forEach(function (naam) {
    if (volgorde.some(function (v) { return v.naam === naam; })) return;
    var index = -1;
    for (var j = 0; j < oudeKop.length; j++) {
      if (oudeKop[j] === naam && !gebruikt[j]) { index = j; break; }
    }
    if (index !== -1) gebruikt[index] = true;
    volgorde.push({ naam: naam, index: index });
  });
  oudeKop.forEach(function (naam, j) {
    if (gebruikt[j]) return;
    var heeftData = blok.some(function (rij, r) { return r > 0 && rij[j] !== '' && rij[j] != null; });
    if (naam || heeftData) volgorde.push({ naam: naam, index: j });
  });

  var ongewijzigd = volgorde.length === oudeKop.length &&
    volgorde.every(function (v, j) { return v.index === j; });
  if (ongewijzigd) return null;

  return blok.map(function (rij, r) {
    return volgorde.map(function (v) {
      if (r === 0) return v.naam;
      return v.index === -1 ? '' : rij[v.index];
    });
  });
}


/* ---------- Sheet lezen en schrijven ---------- */

function tabblad(naam) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(naam);
  if (!sheet) throw new Error('Tabblad "' + naam + '" ontbreekt. Draai eerst setup().');
  return sheet;
}

function kopIndex(kopregel) {
  var index = {};
  kopregel.forEach(function (kop, i) { index[String(kop).trim().toLowerCase()] = i; });
  return index;
}

function leesProducten() {
  var waarden = tabblad(TAB_PRODUCTEN).getDataRange().getValues();
  var k = kopIndex(waarden[0]);
  var producten = [];
  for (var r = 1; r < waarden.length; r++) {
    var rij = waarden[r];
    var naam = String(rij[k.product] || '').trim();
    if (!naam) continue;
    var actieAantal = geheelGetal(rij[k.actie_aantal]);
    var actiePrijs = prijsInCenten(rij[k.actie_prijs]);
    producten.push({
      volgorde: Number(rij[k.volgorde]) || 999,
      product: naam,
      prijs: prijsInCenten(rij[k.prijs]),
      actieAantal: actieAantal > 1 && actiePrijs != null ? actieAantal : null,
      actiePrijs: actieAantal > 1 && actiePrijs != null ? actiePrijs : null,
      actief: isActief(rij[k.actief]),
      maxVoorraad: k.max_voorraad == null ? null : geheelGetal(rij[k.max_voorraad]),
      foto: k.foto == null ? '' : String(rij[k.foto] || '').trim(),
      omschrijving: k.omschrijving == null ? '' : String(rij[k.omschrijving] || '').trim()
    });
  }
  producten.sort(function (a, b) { return a.volgorde - b.volgorde; });
  return producten;
}

// Telt per product hoeveel er al besteld is (uit de productkolommen van Bestellingen).
function leesVerkocht() {
  var waarden = tabblad(TAB_BESTELLINGEN).getDataRange().getValues();
  var kop = waarden[0];
  var verkocht = {};
  for (var c = 0; c < kop.length; c++) {
    var naam = String(kop[c]).trim();
    if (!naam || VASTE_KOLOMMEN.indexOf(naam.toLowerCase()) !== -1) continue;
    var som = 0;
    for (var r = 1; r < waarden.length; r++) som += Number(waarden[r][c]) || 0;
    verkocht[naam] = som;
  }
  return verkocht;
}

function leesSluitdatum() {
  var waarden = tabblad(TAB_INSTELLINGEN).getDataRange().getValues();
  for (var r = 0; r < waarden.length; r++) {
    if (String(waarden[r][0]).trim().toLowerCase() === 'sluitdatum') {
      var w = waarden[r][1];
      if (w instanceof Date) return w;
      if (w === '' || w == null) return null;
      var d = new Date(w);
      if (isNaN(d.getTime())) throw new Error('Sluitdatum in tabblad Instellingen is geen geldige datum.');
      return d;
    }
  }
  return null;
}

function volgendBestelnummer(sheet, kolom) {
  var hoogste = 0;
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, kolom, sheet.getLastRow() - 1, 1).getValues().forEach(function (rij) {
      var m = /^WF-(\d+)$/.exec(String(rij[0]));
      if (m) hoogste = Math.max(hoogste, Number(m[1]));
    });
  }
  return 'WF-' + String(hoogste + 1).padStart(4, '0');
}

// Zet de productkolommen in Bestellingen in dezelfde volgorde als tabblad Producten.
// Ieder product krijgt een kolom; de vaste kolommen (tijdstip t/m totaal) blijven vooraan.
function ordenProductKolommen(sheet, producten) {
  sheet = sheet || tabblad(TAB_BESTELLINGEN);
  producten = producten || leesProducten();
  var vast = VASTE_KOLOMMEN.length;

  var kop = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), vast)).getValues()[0];
  for (var i = 0; i < vast; i++) {
    if (String(kop[i]).trim().toLowerCase() !== VASTE_KOLOMMEN[i]) {
      throw new Error('De eerste kolommen van Bestellingen moeten zijn: ' + VASTE_KOLOMMEN.join(', ') + '.');
    }
  }

  var rijen = Math.max(sheet.getLastRow(), 1);
  var breedte = sheet.getLastColumn() - vast;
  var blok = [];
  if (breedte > 0) {
    var bereik = sheet.getRange(1, vast + 1, rijen, breedte);
    var waarden = bereik.getValues();
    var formules = bereik.getFormulas();
    blok = waarden.map(function (rij, r) {
      return rij.map(function (w, c) { return formules[r][c] || w; });
    });
  } else {
    for (var r = 0; r < rijen; r++) blok.push([]);
  }

  var nieuw = herordenProductBlok(blok, producten.map(function (p) { return p.product; }));
  if (!nieuw) return;

  nieuw[0] = nieuw[0].map(veilig);
  if (breedte > 0) sheet.getRange(1, vast + 1, rijen, breedte).clearContent();
  sheet.getRange(1, vast + 1, rijen, nieuw[0].length).setValues(nieuw);
  sheet.getRange(1, vast + 1, 1, nieuw[0].length).setFontWeight('bold');
}

function schrijfBestelling(b, producten) {
  var sheet = tabblad(TAB_BESTELLINGEN);
  ordenProductKolommen(sheet, producten);
  var kop = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });

  var k = kopIndex(kop);
  var bestelnummer = volgendBestelnummer(sheet, k.bestelnummer + 1);
  var rij = kop.map(function () { return ''; });
  rij[k.tijdstip] = new Date();
  rij[k.bestelnummer] = bestelnummer;
  rij[k.naam] = veilig(b.naam);
  rij[k.contact] = veilig(b.contact);
  rij[k.opmerking] = veilig(b.opmerking);
  rij[k.regels] = regelsAlsTekst(b.regels);
  rij[k.totaal] = b.totaal / 100;
  b.regels.forEach(function (r) { rij[kop.indexOf(r.product)] = r.aantal; });

  var rijNummer = sheet.getLastRow() + 1;
  sheet.getRange(rijNummer, 1, 1, rij.length).setValues([rij]);
  sheet.getRange(rijNummer, k.tijdstip + 1).setNumberFormat('dd-mm-yyyy hh:mm');
  sheet.getRange(rijNummer, k.totaal + 1).setNumberFormat('"€" #,##0.00');
  return bestelnummer;
}


/* ---------- Beheer ---------- */

// Voegt in de Sheet een menu "Winterfair" toe.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Winterfair')
    .addItem('Tabbladen aanmaken (setup)', 'setup')
    .addItem('Kolommen van Bestellingen ordenen', 'ordenProductKolommen')
    .addSeparator()
    .addItem('Persoonsgegevens verwijderen (na de fair)', 'verwijderPersoonsgegevens')
    .addToUi();
}

// Na elke wijziging in tabblad Producten de kolommen van Bestellingen meeschuiven.
function onEdit(e) {
  if (!e || e.range.getSheet().getName() !== TAB_PRODUCTEN) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; // Lukt het nu niet, dan gebeurt het bij de volgende bestelling.
  try {
    ordenProductKolommen();
  } catch (err) {
    console.error(err);
  } finally {
    lock.releaseLock();
  }
}

// Maakt de tabbladen met kopregels en de startlijst aan.
// Veilig om opnieuw te draaien: bestaande gegevens blijven staan.
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TIJDZONE);

  var producten = ss.getSheetByName(TAB_PRODUCTEN) || ss.insertSheet(TAB_PRODUCTEN);
  if (producten.getLastRow() === 0) {
    producten.getRange(1, 1, 1, PRODUCT_KOLOMMEN.length).setValues([PRODUCT_KOLOMMEN]).setFontWeight('bold');
    producten.getRange(2, 1, STARTLIJST.length, PRODUCT_KOLOMMEN.length).setValues(STARTLIJST);
    producten.getRange(2, 3, STARTLIJST.length, 1).setNumberFormat('0.00');
    producten.getRange(2, 5, STARTLIJST.length, 1).setNumberFormat('0.00');
    producten.setFrozenRows(1);
    producten.autoResizeColumns(1, PRODUCT_KOLOMMEN.length);
  }

  var bestellingen = ss.getSheetByName(TAB_BESTELLINGEN) || ss.insertSheet(TAB_BESTELLINGEN);
  if (bestellingen.getLastRow() === 0) {
    var kop = VASTE_KOLOMMEN.concat(STARTLIJST.map(function (r) { return r[1]; }));
    bestellingen.getRange(1, 1, 1, kop.length).setValues([kop]).setFontWeight('bold');
    bestellingen.setFrozenRows(1);
  }

  var instellingen = ss.getSheetByName(TAB_INSTELLINGEN) || ss.insertSheet(TAB_INSTELLINGEN);
  if (instellingen.getLastRow() === 0) {
    var sluit = Utilities.parseDate('2026-12-03 23:59:59', TIJDZONE, 'yyyy-MM-dd HH:mm:ss');
    instellingen.getRange(1, 1, 2, 2).setValues([['instelling', 'waarde'], ['sluitdatum', sluit]]);
    instellingen.getRange(1, 1, 1, 2).setFontWeight('bold');
    instellingen.getRange(2, 2).setNumberFormat('d-m-yyyy hh:mm:ss');
    instellingen.autoResizeColumns(1, 2);
  }
}

// Na de Winterfair: maakt naam, contact en opmerking leeg.
// Bestelnummers, producten en aantallen blijven staan.
// Draai dit via het menu Winterfair in de Sheet (dan krijg je eerst een vraag).
function verwijderPersoonsgegevens() {
  var ui = SpreadsheetApp.getUi();
  var antwoord = ui.alert(
    'Persoonsgegevens verwijderen',
    'Naam, contact en opmerking worden bij alle bestellingen leeggemaakt. Dit kun je niet ongedaan maken (behalve via Versiegeschiedenis). Doorgaan?',
    ui.ButtonSet.YES_NO
  );
  if (antwoord !== ui.Button.YES) return;

  var sheet = tabblad(TAB_BESTELLINGEN);
  var aantalRijen = sheet.getLastRow() - 1;
  if (aantalRijen < 1) return;
  var k = kopIndex(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]);
  ['naam', 'contact', 'opmerking'].forEach(function (kolom) {
    sheet.getRange(2, k[kolom] + 1, aantalRijen, 1).clearContent();
  });
  ui.alert('Klaar. De persoonsgegevens zijn verwijderd.');
}
