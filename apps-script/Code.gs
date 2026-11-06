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

// Indeling van tabblad Bestellingen: deze kolommen vooraan, dan één kolom per product
// (in de volgorde van tabblad Producten), dan deze kolommen achteraan.
var KOLOMMEN_VOOR = ['datum', 'bestelnummer', 'naam', 'telefoonnummer', 'opmerking', 'regels'];
var KOLOMMEN_NA = ['totaal', 'afgerond', 'Opmerkingen Marianne'];
// Kolomnamen uit eerdere versies; die worden vanzelf hernoemd.
var OUDE_KOPPEN = { tijdstip: 'datum', contact: 'telefoonnummer' };

var DATUM_FORMAAT = 'dd-mm-yyyy';
var EURO_FORMAAT = '"€" #,##0.00';
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
// Geeft { fout } of { naam, telefoon, opmerking, regels, totaal }.
function valideerEnBereken(producten, verkocht, invoer) {
  var naam = schoon(invoer.naam, 100);
  // "contact" is de veldnaam van de vorige versie van het formulier.
  var telefoon = schoon(invoer.telefoon != null ? invoer.telefoon : invoer.contact, 30);
  var opmerking = schoon(invoer.opmerking, 500, true);

  if (!naam) return { fout: 'Vul je naam in.' };
  if (!telefoonGeldig(telefoon)) return { fout: 'Vul een geldig telefoonnummer in.' };
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
  return { naam: naam, telefoon: telefoon, opmerking: opmerking, regels: regels, totaal: totaal };
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

// 10 tot 15 cijfers; spaties, +, -, haakjes en punten mogen.
function telefoonGeldig(waarde) {
  var v = String(waarde || '').trim();
  var cijfers = (v.match(/\d/g) || []).length;
  return /^[\d\s()+\-.]+$/.test(v) && cijfers >= 10 && cijfers <= 15;
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

// Vaste kolommen herkennen we hoofdletterongevoelig, productkolommen precies.
function isVasteKolom(naam) {
  var laag = String(naam).trim().toLowerCase();
  return KOLOMMEN_VOOR.concat(KOLOMMEN_NA).some(function (k) { return k.toLowerCase() === laag; }) ||
    OUDE_KOPPEN.hasOwnProperty(laag);
}

function kolomSleutel(naam) {
  var tekst = String(naam).trim();
  return isVasteKolom(tekst) ? tekst.toLowerCase() : tekst;
}

// Gewenste kopregel van Bestellingen: vaste kolommen vooraan, producten in de volgorde
// van tabblad Producten, kolommen van verdwenen producten, en de vaste kolommen achteraan.
function gewensteKolommen(huidigeKop, productNamen) {
  var producten = productNamen.filter(function (n, i) { return n && productNamen.indexOf(n) === i; });
  var overig = huidigeKop.map(function (h) { return String(h).trim(); }).filter(function (h, i, alle) {
    return h && !isVasteKolom(h) && producten.indexOf(h) === -1 && alle.indexOf(h) === i;
  });
  return KOLOMMEN_VOOR.concat(producten, overig, KOLOMMEN_NA);
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

function leesKop(sheet) {
  if (sheet.getLastColumn() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
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
    if (!naam || isVasteKolom(naam)) continue;
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

// Zet de kolommen van Bestellingen in de juiste indeling (zie KOLOMMEN_VOOR / KOLOMMEN_NA).
// Hele kolommen worden verschoven, dus aantallen, vinkjes en opmerkingen gaan mee.
function ordenKolommen(sheet, producten) {
  sheet = sheet || tabblad(TAB_BESTELLINGEN);
  producten = producten || leesProducten();
  var kop = leesKop(sheet);

  // Oude kolomnamen hernoemen (alleen als de nieuwe naam nog niet bestaat).
  kop.forEach(function (h, i) {
    var nieuw = OUDE_KOPPEN[h.toLowerCase()];
    if (nieuw && kop.map(function (x) { return x.toLowerCase(); }).indexOf(nieuw) === -1) {
      sheet.getRange(1, i + 1).setValue(nieuw);
      kop[i] = nieuw;
    }
  });

  var doel = gewensteKolommen(kop, producten.map(function (p) { return p.product; }));
  var huidig = kop.map(kolomSleutel);

  for (var i = 0; i < doel.length; i++) {
    var sleutel = kolomSleutel(doel[i]);
    var j = huidig.indexOf(sleutel, i);
    if (j === i) continue;
    if (j === -1) {
      if (i < huidig.length) {
        sheet.insertColumnBefore(i + 1);
      } else if (i + 1 > sheet.getMaxColumns()) {
        sheet.insertColumnAfter(sheet.getMaxColumns());
      }
      sheet.getRange(1, i + 1).setValue(veilig(doel[i])).setFontWeight('bold');
      huidig.splice(i, 0, sleutel);
    } else {
      sheet.moveColumns(sheet.getRange(1, j + 1), i + 1);
      huidig.splice(i, 0, huidig.splice(j, 1)[0]);
    }
  }

  // Opmaak van de vaste kolommen.
  var k = kopIndex(leesKop(sheet));
  var rijen = sheet.getMaxRows() - 1;
  if (rijen > 0) {
    sheet.getRange(2, k.datum + 1, rijen, 1).setNumberFormat(DATUM_FORMAAT);
    sheet.getRange(2, k.totaal + 1, rijen, 1).setNumberFormat(EURO_FORMAAT);
  }
  ruimLegeRijenOp(sheet);
}

// Rijen zonder bestelnummer horen leeg te zijn. Een vroegere versie zette in de hele
// kolom afgerond vinkjes; daardoor kwamen nieuwe bestellingen helemaal onderaan.
// Dit schuift bestellingen onder lege rijen omhoog en haalt losse vinkjes weg.
function ruimLegeRijenOp(sheet) {
  var k = kopIndex(leesKop(sheet));
  var n = sheet.getLastRow();
  if (n < 2 || k.bestelnummer == null || k.afgerond == null) return;

  var nummers = sheet.getRange(2, k.bestelnummer + 1, n - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); });
  var laatste = nummers.length - 1;
  while (laatste >= 0 && !nummers[laatste]) laatste--;
  var heeftGat = nummers.slice(0, laatste + 1).some(function (x) { return !x; });
  if (heeftGat) {
    sheet.getRange(2, 1, n - 1, sheet.getLastColumn()).sort({ column: k.bestelnummer + 1, ascending: true });
  }

  var aantal = nummers.filter(Boolean).length;
  if (n - 1 > aantal) {
    sheet.getRange(2 + aantal, k.afgerond + 1, n - 1 - aantal, 1).clearContent().clearDataValidations();
  }
}

// Laatste rij met een bestelnummer (1 als er nog geen bestellingen zijn).
function laatsteBestelRij(sheet, kolom) {
  var n = sheet.getLastRow();
  if (n < 2) return 1;
  var waarden = sheet.getRange(2, kolom, n - 1, 1).getValues();
  for (var i = waarden.length - 1; i >= 0; i--) {
    if (String(waarden[i][0]).trim() !== '') return i + 2;
  }
  return 1;
}

function schrijfBestelling(b, producten) {
  var sheet = tabblad(TAB_BESTELLINGEN);
  ordenKolommen(sheet, producten);
  var kop = leesKop(sheet);

  var k = kopIndex(kop);
  var bestelnummer = volgendBestelnummer(sheet, k.bestelnummer + 1);
  var rij = kop.map(function () { return ''; });
  rij[k.datum] = new Date();
  rij[k.bestelnummer] = bestelnummer;
  rij[k.naam] = veilig(b.naam);
  rij[k.telefoonnummer] = veilig(b.telefoon);
  rij[k.opmerking] = veilig(b.opmerking);
  rij[k.regels] = regelsAlsTekst(b.regels);
  rij[k.totaal] = b.totaal / 100;
  b.regels.forEach(function (r) { rij[kop.indexOf(r.product)] = r.aantal; });

  var rijNummer = laatsteBestelRij(sheet, k.bestelnummer + 1) + 1;
  if (rijNummer > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
  sheet.getRange(rijNummer, 1, 1, rij.length).setValues([rij]);
  sheet.getRange(rijNummer, k.datum + 1).setNumberFormat(DATUM_FORMAAT);
  sheet.getRange(rijNummer, k.totaal + 1).setNumberFormat(EURO_FORMAAT);
  sheet.getRange(rijNummer, k.afgerond + 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  return bestelnummer;
}


/* ---------- Beheer ---------- */

// Voegt in de Sheet een menu "Winterfair" toe.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Winterfair')
    .addItem('Tabbladen aanmaken (setup)', 'setup')
    .addItem('Kolommen van Bestellingen ordenen', 'ordenKolommen')
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
    ordenKolommen();
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
    bestellingen.getRange(1, 1, 1, KOLOMMEN_VOOR.length).setValues([KOLOMMEN_VOOR]).setFontWeight('bold');
    bestellingen.setFrozenRows(1);
  }
  ordenKolommen(bestellingen);

  var instellingen = ss.getSheetByName(TAB_INSTELLINGEN) || ss.insertSheet(TAB_INSTELLINGEN);
  if (instellingen.getLastRow() === 0) {
    var sluit = Utilities.parseDate('2026-12-03 23:59:59', TIJDZONE, 'yyyy-MM-dd HH:mm:ss');
    instellingen.getRange(1, 1, 2, 2).setValues([['instelling', 'waarde'], ['sluitdatum', sluit]]);
    instellingen.getRange(1, 1, 1, 2).setFontWeight('bold');
    instellingen.getRange(2, 2).setNumberFormat('d-m-yyyy hh:mm:ss');
    instellingen.autoResizeColumns(1, 2);
  }
}

// Na de Winterfair: maakt naam, telefoonnummer en beide opmerkingenkolommen leeg.
// Bestelnummers, producten en aantallen blijven staan.
// Draai dit via het menu Winterfair in de Sheet (dan krijg je eerst een vraag).
function verwijderPersoonsgegevens() {
  var ui = SpreadsheetApp.getUi();
  var antwoord = ui.alert(
    'Persoonsgegevens verwijderen',
    'Naam, telefoonnummer en opmerkingen worden bij alle bestellingen leeggemaakt. Dit kun je niet ongedaan maken (behalve via Versiegeschiedenis). Doorgaan?',
    ui.ButtonSet.YES_NO
  );
  if (antwoord !== ui.Button.YES) return;

  var sheet = tabblad(TAB_BESTELLINGEN);
  var aantalRijen = sheet.getLastRow() - 1;
  if (aantalRijen < 1) return;
  var k = kopIndex(leesKop(sheet));
  ['naam', 'telefoonnummer', 'contact', 'opmerking', 'opmerkingen marianne'].forEach(function (kolom) {
    if (k[kolom] != null) sheet.getRange(2, k[kolom] + 1, aantalRijen, 1).clearContent();
  });
  ui.alert('Klaar. De persoonsgegevens zijn verwijderd.');
}
