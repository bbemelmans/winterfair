/*
 * Winterfair – bestelformulier en sponsors.
 *
 * Lokaal testen zonder Apps Script: open de pagina met ?mock in de URL.
 *   ?mock          producten uit mock/mock-products.json, nep-bestelling
 *   ?mock=gesloten formulier na de sluitdatum
 *   ?mock=fout     verzenden mislukt
 */
(function () {
  'use strict';

  var R = window.WinterfairReken;
  var CONTACT = 'app Marianne via 06 57 25 56 74';
  var WHATSAPP = 'https://wa.me/31657255674';
  var MAX_PER_PRODUCT = 50;
  var WEBAPP_URL = (window.WINTERFAIR_CONFIG && window.WINTERFAIR_CONFIG.webappUrl) || '';
  var BETAALVERZOEK_URL = (window.WINTERFAIR_CONFIG && window.WINTERFAIR_CONFIG.betaalverzoekUrl) || '';

  var params = new URLSearchParams(location.search);
  var MOCK = params.has('mock');
  var mockModus = params.get('mock');

  var producten = [];
  var aantallen = {};

  var el = {
    laadstatus: document.getElementById('laadstatus'),
    formulier: document.getElementById('bestelformulier'),
    lijst: document.getElementById('productlijst'),
    totaal: document.getElementById('totaal'),
    fout: document.getElementById('formulierfout'),
    knop: document.getElementById('verzendknop'),
    gesloten: document.getElementById('gesloten'),
    bevestiging: document.getElementById('bevestiging'),
    naam: document.getElementById('naam'),
    telefoon: document.getElementById('telefoon'),
    opmerking: document.getElementById('opmerking'),
    sponsors: document.getElementById('sponsorlijst')
  };

  function maak(tag, klasse, tekst) {
    var node = document.createElement(tag);
    if (klasse) node.className = klasse;
    if (tekst != null) node.textContent = tekst;
    return node;
  }

  function wacht(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /* ---------- Gegevens ophalen en versturen ---------- */

  function haalProductenOp() {
    if (MOCK) {
      return fetch('mock/mock-products.json', { cache: 'no-store' })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (mockModus === 'gesloten') data.open = false;
          return data;
        });
    }
    if (!WEBAPP_URL) return Promise.reject(new Error('Geen webapp-URL ingesteld in config.js.'));
    return fetch(WEBAPP_URL, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('Server antwoordde met ' + res.status);
      return res.json();
    });
  }

  function verstuur(bestelling) {
    if (MOCK) {
      return wacht(700).then(function () {
        if (mockModus === 'fout') return { ok: false, fout: 'Testfout: de bestelling kon niet worden opgeslagen.' };
        var b = R.bereken(producten, aantallen);
        return { ok: true, bestelnummer: 'WF-TEST', regels: b.regels, totaal: b.totaal };
      });
    }
    // text/plain voorkomt een CORS-preflight, die Apps Script niet ondersteunt.
    return fetch(WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(bestelling)
    }).then(function (res) {
      if (!res.ok) throw new Error('Server antwoordde met ' + res.status);
      return res.json();
    });
  }

  /* ---------- Productlijst ---------- */

  function maxAantal(p) {
    if (p.prijs == null) return 0;
    return p.beschikbaar == null ? MAX_PER_PRODUCT : Math.min(MAX_PER_PRODUCT, p.beschikbaar);
  }

  function prijsTekst(p) {
    if (p.prijs == null) return '[PRIJS]';
    var tekst = R.formatEuro(p.prijs);
    if (p.actieAantal && p.actiePrijs != null) {
      tekst += ' · ' + p.actieAantal + ' voor ' + R.formatEuro(p.actiePrijs);
    }
    return tekst;
  }

  // Alleen een gewone bestandsnaam uit de Sheet, bijv. "advocaat.jpg" of "panettone cake.jpeg"
  // (spaties mogen; mappen en vreemde tekens niet).
  function fotoPad(p) {
    var naam = String(p.foto || '').trim();
    return /^[\w\-. ]+\.(jpe?g|png|webp)$/i.test(naam) ? 'img/producten/' + encodeURIComponent(naam) : '';
  }

  function legeFoto(tekst) {
    var leeg = maak('span', 'product__foto product__foto--leeg', tekst);
    leeg.setAttribute('aria-hidden', 'true');
    return leeg;
  }

  function fotoElement(p) {
    var pad = fotoPad(p);
    if (!pad) return null;

    var knop = maak('button', 'product__foto');
    knop.type = 'button';
    knop.setAttribute('aria-label', 'Foto van ' + p.product + ' vergroten');
    var img = maak('img');
    img.src = pad;
    img.alt = '';
    img.width = 48;
    img.height = 48;
    img.loading = 'lazy';
    // Bestandsnaam staat in de Sheet maar de foto is er (nog) niet.
    img.addEventListener('error', function () { knop.replaceWith(legeFoto('foto volgt')); });
    knop.appendChild(img);
    knop.addEventListener('click', function () { toonFoto(pad, p); });
    return knop;
  }

  function toonFoto(pad, p) {
    var venster = document.getElementById('fotovenster');
    var img = document.getElementById('fotovenster-img');
    img.src = pad;
    img.alt = 'Foto van ' + p.product;
    document.getElementById('fotovenster-titel').textContent = p.product;
    document.getElementById('fotovenster-tekst').textContent = p.omschrijving || '';
    venster.showModal();
  }

  function toonProducten() {
    el.lijst.textContent = '';
    producten.forEach(function (p) {
      aantallen[p.product] = 0;
      var max = maxAantal(p);

      var li = maak('li', 'product');
      var foto = fotoElement(p);
      if (foto) li.appendChild(foto);
      var info = maak('div', 'product__info');
      info.appendChild(maak('div', 'product__naam', p.product));
      info.appendChild(maak('div', 'product__prijs', prijsTekst(p)));
      if (p.omschrijving) info.appendChild(maak('div', 'product__omschrijving', p.omschrijving));
      if (p.prijs != null && p.beschikbaar === 0) {
        info.appendChild(maak('div', 'product__let', 'Uitverkocht'));
      } else if (p.prijs != null && p.beschikbaar != null && p.beschikbaar <= 10) {
        info.appendChild(maak('div', 'product__let', 'Nog ' + p.beschikbaar + ' beschikbaar'));
      }

      var teller = maak('div', 'teller');
      var min = maak('button', null, '−');
      min.type = 'button';
      min.setAttribute('aria-label', 'Minder ' + p.product);
      var aantal = maak('span', 'teller__aantal', '0');
      aantal.setAttribute('aria-live', 'polite');
      var plus = maak('button', null, '+');
      plus.type = 'button';
      plus.setAttribute('aria-label', 'Meer ' + p.product);

      function bijwerken(nieuw) {
        aantallen[p.product] = nieuw;
        aantal.textContent = String(nieuw);
        min.disabled = nieuw <= 0;
        plus.disabled = nieuw >= max;
        toonTotaal();
      }
      min.addEventListener('click', function () { bijwerken(Math.max(0, aantallen[p.product] - 1)); });
      plus.addEventListener('click', function () { bijwerken(Math.min(max, aantallen[p.product] + 1)); });

      teller.appendChild(min);
      teller.appendChild(aantal);
      teller.appendChild(plus);
      li.appendChild(info);
      li.appendChild(teller);
      el.lijst.appendChild(li);
      bijwerken(0);
    });
  }

  function toonTotaal() {
    el.totaal.textContent = R.formatEuro(R.bereken(producten, aantallen).totaal);
  }

  /* ---------- Formulier ---------- */

  function zetVeldfout(input, tekst) {
    document.getElementById(input.id + '-fout').textContent = tekst;
    if (tekst) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function toonFout(tekst) {
    el.fout.textContent = tekst;
    el.fout.hidden = !tekst;
  }

  function controleer() {
    var eerste = null;
    var naamOk = el.naam.value.trim() !== '';
    zetVeldfout(el.naam, naamOk ? '' : 'Vul je naam in.');
    if (!naamOk) eerste = eerste || el.naam;

    var telefoonOk = R.telefoonGeldig(el.telefoon.value);
    zetVeldfout(el.telefoon, telefoonOk ? '' : 'Vul een telefoonnummer van 10 cijfers in, bijvoorbeeld 06 12345678.');
    if (!telefoonOk) eerste = eerste || el.telefoon;

    var betaalwijze = gekozenBetaalwijze();
    var betaalFout = document.getElementById('betaalwijze-fout');
    betaalFout.textContent = betaalwijze ? '' : 'Kies hoe je wilt betalen.';
    if (!betaalwijze) eerste = eerste || el.formulier.querySelector('input[name="betaalwijze"]');

    var heeftProducten = R.bereken(producten, aantallen).regels.length > 0;
    if (!heeftProducten) {
      toonFout('Kies minstens één product met de plus-knop.');
    } else if (eerste) {
      toonFout('Controleer de gemarkeerde velden.');
    } else {
      toonFout('');
    }
    if (eerste) eerste.focus();
    else if (!heeftProducten) el.fout.scrollIntoView({ block: 'center' });
    return !eerste && heeftProducten;
  }

  function gekozenBetaalwijze() {
    var gekozen = el.formulier.querySelector('input[name="betaalwijze"]:checked');
    return gekozen ? gekozen.value : '';
  }

  function betaalBlok(antwoord, betaalwijze) {
    var blok = maak('div', 'betalen');
    if (betaalwijze === 'betaalverzoek') {
      blok.appendChild(maak('p', null, 'Je hebt gekozen om direct te betalen. Maak ' + R.formatEuro(antwoord.totaal) +
        ' over via het betaalverzoek.'));
      var knop = maak('a', 'knop betalen__knop', 'Naar het betaalverzoek');
      knop.href = BETAALVERZOEK_URL;
      knop.target = '_blank';
      knop.rel = 'noopener';
      knop.appendChild(maak('span', 'sr-only', ' (opent in nieuw tabblad)'));
      blok.appendChild(knop);
    } else {
      blok.appendChild(maak('p', null, 'Je betaalt ' + R.formatEuro(antwoord.totaal) + ' op de Winterfair, bij het afhalen.'));
    }
    return blok;
  }

  function toonGesloten() {
    el.formulier.hidden = true;
    el.gesloten.hidden = false;
  }

  function toonBevestiging(antwoord, betaalwijze) {
    var b = el.bevestiging;
    b.textContent = '';
    b.appendChild(maak('h3', null, 'Bedankt voor je bestelling!'));

    var nummer = maak('p', 'bevestiging__nummer', 'Bestelnummer: ');
    nummer.appendChild(maak('strong', null, antwoord.bestelnummer));
    b.appendChild(nummer);

    var ul = maak('ul');
    (antwoord.regels || []).forEach(function (r) {
      var li = maak('li');
      li.appendChild(maak('span', null, r.aantal + '× ' + r.product));
      li.appendChild(maak('span', null, R.formatEuro(r.bedrag)));
      ul.appendChild(li);
    });
    b.appendChild(ul);

    var totaal = maak('p', 'bevestiging__totaal');
    totaal.appendChild(maak('span', null, 'Totaal'));
    totaal.appendChild(maak('span', null, R.formatEuro(antwoord.totaal)));
    b.appendChild(totaal);

    b.appendChild(maak('p', null, 'Je haalt je bestelling op tijdens de Winterfair: zaterdag 12 december, 10.00 – 14.00 uur, Nieuweweg 215 in Veenendaal.'));
    b.appendChild(betaalBlok(antwoord, betaalwijze));

    var wijzigen = maak('p', null, 'Wil je je bestelling wijzigen? ');
    var app = maak('a', null, 'Stuur Marianne een berichtje via WhatsApp');
    app.href = WHATSAPP + '?text=' + encodeURIComponent('Hoi Marianne, ik wil mijn Winterfair-bestelling ' + antwoord.bestelnummer + ' wijzigen.');
    app.target = '_blank';
    app.rel = 'noopener';
    app.appendChild(maak('span', 'sr-only', ' (opent in nieuw tabblad)'));
    wijzigen.appendChild(app);
    b.appendChild(wijzigen);

    el.formulier.hidden = true;
    b.hidden = false;
    // Het formulier verdwijnt, waardoor de pagina korter wordt; zet de bedankkop bovenaan in beeld.
    b.focus({ preventScroll: true });
    var top = b.getBoundingClientRect().top + window.pageYOffset - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
  }

  el.formulier.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!controleer()) return;

    var items = producten
      .filter(function (p) { return aantallen[p.product] > 0; })
      .map(function (p) { return { product: p.product, aantal: aantallen[p.product] }; });

    var bestelling = {
      naam: el.naam.value.trim(),
      telefoon: el.telefoon.value.trim(),
      contact: el.telefoon.value.trim(), // voor het script van vóór november; kan later weg
      opmerking: el.opmerking.value.trim(),
      betaalwijze: gekozenBetaalwijze(),
      website: el.formulier.elements.website.value,
      items: items
    };

    el.knop.disabled = true;
    el.knop.textContent = 'Bezig met versturen…';
    toonFout('');

    verstuur(bestelling)
      .then(function (antwoord) {
        if (antwoord && antwoord.ok) {
          toonBevestiging(antwoord, bestelling.betaalwijze);
        } else if (antwoord && antwoord.gesloten) {
          toonGesloten();
        } else {
          toonFout('Je bestelling is niet geplaatst. ' + ((antwoord && antwoord.fout) || 'Onbekende fout.') + ' Lukt het niet? Probeer het opnieuw of ' + CONTACT + '.');
        }
      })
      .catch(function () {
        toonFout('Je bestelling is niet geplaatst: er is geen verbinding met de server. Probeer het opnieuw of ' + CONTACT + '.');
      })
      .then(function () {
        el.knop.disabled = false;
        el.knop.textContent = 'Bestelling plaatsen';
        if (!el.fout.hidden) el.fout.scrollIntoView({ block: 'center' });
      });
  });

  function laadFormulier() {
    el.laadstatus.className = 'melding';
    el.laadstatus.textContent = 'Producten laden…';
    el.laadstatus.hidden = false;

    // Apps Script moet na een stille periode even opstarten; dat kan 20 seconden duren.
    var traag = setTimeout(function () {
      el.laadstatus.textContent = 'Even geduld, de producten worden opgehaald. Dit kan tot 20 seconden duren.';
    }, 4000);

    haalProductenOp()
      .finally(function () { clearTimeout(traag); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.fout) || 'Ongeldig antwoord');
        el.laadstatus.hidden = true;
        var voorbij = data.sluitdatum && Date.now() > Date.parse(data.sluitdatum);
        if (!data.open || voorbij) {
          toonGesloten();
          return;
        }
        producten = data.producten || [];
        toonProducten();
        el.formulier.hidden = false;
      })
      .catch(function (err) {
        console.error(err);
        el.laadstatus.className = 'melding melding--fout';
        el.laadstatus.textContent = 'De producten konden niet worden geladen. Probeer het later opnieuw of ' + CONTACT + '.';
        var opnieuw = maak('button', 'knop', 'Opnieuw proberen');
        opnieuw.type = 'button';
        opnieuw.addEventListener('click', laadFormulier);
        el.laadstatus.appendChild(opnieuw);
      });
  }

  /* ---------- Sponsors ---------- */

  function laadSponsors() {
    fetch('sponsors.json', { cache: 'no-cache' })
      .then(function (res) { return res.json(); })
      .then(function (sponsors) {
        sponsors.forEach(function (s) {
          var url = (s.url || '').trim();
          var formaat = /^(breed|midden)$/.test(s.formaat) ? ' sponsor--' + s.formaat : '';
          var kaart = maak(url ? 'a' : 'div', 'sponsor' + formaat);
          var img = maak('img');
          img.src = s.afbeelding;
          img.alt = s.alt || ('Advertentie ' + s.naam);
          img.loading = 'lazy';
          kaart.appendChild(img);
          if (url) {
            kaart.href = url;
            kaart.target = '_blank';
            kaart.rel = 'noopener';
            var host = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
            var label = maak('span', 'sponsor__link', host + ' ↗');
            label.appendChild(maak('span', 'sr-only', ' (opent in nieuw tabblad)'));
            kaart.appendChild(label);
          }
          el.sponsors.appendChild(kaart);
        });
      })
      .catch(function (err) { console.error('Sponsors laden mislukt', err); });
  }

  // Fotovenster sluit ook bij een tik naast de foto.
  document.getElementById('fotovenster').addEventListener('click', function (event) {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });

  laadFormulier();
  laadSponsors();
})();
