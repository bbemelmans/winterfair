/*
 * Rekenregels voor het bestelformulier. Alle bedragen zijn in centen.
 * Dezelfde regels staan in apps-script/Code.gs; de server rekent altijd
 * zelf opnieuw. Deze kopie is alleen voor het live totaal in de browser.
 */
(function (root) {
  'use strict';

  // Actieregel: per volledige set van actieAantal geldt actiePrijs,
  // de rest kost de stukprijs. 4 rookworsten = 1000 + 350.
  function regelBedrag(product, aantal) {
    if (!aantal || product.prijs == null) return 0;
    if (product.actieAantal > 1 && product.actiePrijs != null) {
      var sets = Math.floor(aantal / product.actieAantal);
      var rest = aantal % product.actieAantal;
      return sets * product.actiePrijs + rest * product.prijs;
    }
    return aantal * product.prijs;
  }

  // producten: lijst uit de server; aantallen: { productnaam: aantal }
  function bereken(producten, aantallen) {
    var regels = [];
    var totaal = 0;
    producten.forEach(function (p) {
      var aantal = aantallen[p.product] || 0;
      if (aantal > 0 && p.prijs != null) {
        var bedrag = regelBedrag(p, aantal);
        regels.push({ product: p.product, aantal: aantal, bedrag: bedrag });
        totaal += bedrag;
      }
    });
    return { regels: regels, totaal: totaal };
  }

  function formatEuro(cent) {
    var negatief = cent < 0;
    var abs = Math.abs(Math.round(cent));
    var euro = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var centen = String(abs % 100).padStart(2, '0');
    return (negatief ? '− ' : '') + '€ ' + euro + ',' + centen;
  }

  // 10 tot 15 cijfers; spaties, +, -, haakjes en punten mogen.
  function telefoonGeldig(waarde) {
    var v = String(waarde || '').trim();
    var cijfers = (v.match(/\d/g) || []).length;
    return /^[\d\s()+\-.]+$/.test(v) && cijfers >= 10 && cijfers <= 15;
  }

  var api = {
    regelBedrag: regelBedrag,
    bereken: bereken,
    formatEuro: formatEuro,
    telefoonGeldig: telefoonGeldig
  };
  root.WinterfairReken = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
