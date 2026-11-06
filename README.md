# Winterfair – campagnepagina

De pagina voor de Winterfair van zaterdag 12 december 2026 (10.00–14.00 uur, Nieuweweg 215, Veenendaal).

- De **pagina** staat op GitHub Pages.
- **Producten en bestellingen** staan in één Google Sheet. Een klein Google Apps Script verbindt de pagina met die Sheet.

Je hoeft geen programmeur te zijn. Volg de stappen hieronder in volgorde. Reken op ongeveer een half uur.

---

## Wat staat waar

| Bestand | Waarvoor |
| --- | --- |
| `index.html`, `style.css`, `app.js`, `reken.js` | De pagina zelf. Hoef je niet aan te komen. |
| `config.js` | Hier plak je één keer de webapp-URL (stap 3). |
| `sponsors.json` + `img/sponsors/` | De sponsors (zie "Sponsor toevoegen"). |
| `apps-script/Code.gs` | Het script dat je in de Google Sheet plakt. |
| `mock/`, `tools/`, `tests/` | Alleen voor testen op je eigen computer. |

---

## Stap 1 – Google Sheet aanmaken

1. Ga naar [sheets.new](https://sheets.new) (ingelogd met het Google-account dat de bestellingen mag zien).
2. Geef de Sheet een naam, bijvoorbeeld **Winterfair bestellingen 2026**.

## Stap 2 – Script plakken en `setup()` draaien

1. Kies in de Sheet het menu **Extensies → Apps Script**. Er opent een nieuw tabblad met een editor.
2. Klik links op het tandwiel **Projectinstellingen**. Zet **Tijdzone** op **(GMT+01:00) Amsterdam**.
3. Ga terug naar **Editor** (het `< >`-icoon). Klik op `Code.gs` en haal alle tekst die er staat weg.
4. Open `apps-script/Code.gs` uit deze map, kopieer **alles** en plak het in de editor.
5. Klik op het diskette-icoon (**Opslaan**).
6. Kies bovenaan in de keuzelijst naast **Uitvoeren** de functie **`setup`** en klik op **Uitvoeren**.
7. Google vraagt om toestemming:
   - **Toestemming controleren** → kies je account.
   - Zie je "Google heeft deze app niet geverifieerd"? Klik op **Geavanceerd** → **Ga naar … (onveilig)**. Dat is normaal voor een eigen script.
   - Klik op **Toestaan**.
8. Ga terug naar de Sheet. Er zijn nu drie tabbladen:
   - **Producten**: de startlijst met prijzen.
   - **Bestellingen**: nog leeg, met kopregels.
   - **Instellingen**: de sluitdatum (3-12-2026 23:59:59).

   Het lege tabblad "Blad1" mag je verwijderen.
9. Herlaad de Sheet. Er staat nu ook een menu **Winterfair** bovenin.

## Stap 3 – Implementeren als webapp

1. Klik in de Apps Script-editor rechtsboven op **Implementeren → Nieuwe implementatie**.
2. Klik op het tandwiel naast "Type selecteren" en kies **Web-app**.
3. Vul in:
   - **Beschrijving**: bijvoorbeeld `versie 1`
   - **Uitvoeren als**: **Ik** (jouw e-mailadres)
   - **Wie heeft toegang**: **Iedereen**
4. Klik op **Implementeren** en geef zo nodig weer toestemming.
5. Kopieer de **Web-app-URL**. Die eindigt op `/exec`.
6. Open `config.js` en plak de URL tussen de aanhalingstekens:

   ```js
   window.WINTERFAIR_CONFIG = {
     webappUrl: 'https://script.google.com/macros/s/……/exec'
   };
   ```

7. Controle: plak de URL in je browser. Je ziet dan een stuk tekst dat begint met `{"ok":true,"open":true,…`.

> **Let op – na elke wijziging aan het script:** opslaan alleen is niet genoeg. Kies **Implementeren → Implementaties beheren**, klik op het potlood, zet **Versie** op **Nieuwe versie** en klik op **Implementeren**. Anders blijft de oude code actief. De URL blijft dan hetzelfde. Kies dus **niet** "Nieuwe implementatie", want dan krijg je een nieuwe URL.
>
> Producten en prijzen aanpassen in de Sheet is géén scriptwijziging. Daarvoor hoef je niets opnieuw te implementeren.

## Stap 4 – GitHub Pages aanzetten

De pagina komt op het gratis GitHub Pages-adres te staan: `https://<gebruikersnaam>.github.io/winterfair/`. Op jaapvdkamp.nl zet je daarna een doorverwijzing naar dat adres (stap 5).

1. Maak een gratis account op [github.com](https://github.com/signup) als je dat nog niet hebt. Maak daarna een nieuwe **openbare** repository met de naam **`winterfair`**.
2. Upload alle bestanden uit deze map:
   - op de repo-pagina: **Add file → Upload files**;
   - sleep alles erin, inclusief de mappen `img`, `apps-script`, `mock`, `tools` en `tests`;
   - klik op **Commit changes**.
3. Ga naar **Settings → Pages**. Kies onder **Build and deployment**:
   - **Source**: Deploy from a branch;
   - **Branch**: `main`, map `/ (root)`;
   - klik op **Save**.
4. Wacht een paar minuten. Bovenaan **Settings → Pages** staat dan het adres, bijvoorbeeld **https://gebruikersnaam.github.io/winterfair/**.
5. Test de pagina. Plaats een proefbestelling en kijk of die in het tabblad **Bestellingen** verschijnt. Verwijder die rij daarna weer.

## Stap 5 – Doorverwijzing op jaapvdkamp.nl

De bestelflyer noemt **jaapvdkamp.nl/winterfair**. Stel in het beheer van jaapvdkamp.nl een doorverwijzing (redirect) in:

- **van**: `/winterfair`
- **naar**: het adres uit stap 4, bijvoorbeeld `https://gebruikersnaam.github.io/winterfair/`

Hoe dat gaat, hangt af van waar de site draait. In WordPress kan het bijvoorbeeld met de plugin **Redirection**; bij veel webhosters staat het onder "Doorverwijzingen". Kies een **tijdelijke (302)** doorverwijzing, dan kun je hem na de campagne makkelijk weer weghalen of ergens anders naartoe laten wijzen.

Test daarna op je telefoon of jaapvdkamp.nl/winterfair op de campagnepagina uitkomt.

---

## Producten aanpassen tijdens de campagne

Alles gaat via het tabblad **Producten**. Je hoeft geen code te wijzigen en niets opnieuw te implementeren. Herlaad daarna de pagina om het resultaat te zien.

| Kolom | Betekenis |
| --- | --- |
| `volgorde` | Volgorde op de pagina (1 bovenaan). |
| `product` | Naam zoals bezoekers die zien. **Wijzig de naam liever niet meer** als er al bestellingen voor zijn, want de aantallen in Bestellingen worden per naam bijgehouden. |
| `prijs` | Stukprijs, bijvoorbeeld `7,95`. Leeg of `[PRIJS]` = product staat wel op de pagina, maar is nog niet te bestellen. |
| `actie_aantal` / `actie_prijs` | Bijvoorbeeld `3` en `10,00`: per volle set van 3 betaal je € 10,00, de rest kost de stukprijs. Leeg = geen actie. |
| `actief` | `ja` = op de pagina, `nee` = verborgen. |
| `max_voorraad` | Optioneel. Hoeveel er in totaal verkocht mag worden. Bij 0 over staat er "Uitverkocht". Leeg = onbeperkt. |
| `foto` | Optioneel. Bestandsnaam van de productfoto in de map `img/producten/`, bijvoorbeeld `advocaat.jpg`. Leeg = geen foto. |
| `omschrijving` | Optioneel. Korte regel onder de prijs, bijvoorbeeld `Huisgemaakt door Jaap en zijn ouders`. |

### Productfoto toevoegen

1. Zet de foto (jpg, png of webp) op GitHub in de map `img/producten/`: open die map in de repo en kies **Add file → Upload files**. Gebruik een korte naam zonder spaties, bijvoorbeeld `rookworst.jpg`.
2. Typ in de Sheet bij dat product in de kolom `foto` precies die naam.
3. Herlaad de pagina. De foto staat als rondje links van het product; wie erop tikt, ziet hem groot.

Staat de naam in de Sheet maar is de foto er (nog) niet, dan toont de pagina een rondje met "foto volgt".

Gebruik alleen eigen foto's, of foto's waarvan je zeker weet dat je ze mag gebruiken. Een foto van een andere website (vaak te herkennen aan een naam of watermerk erop) mag meestal niet.

> **Al een Sheet van vóór de productfoto's?** Typ in tabblad **Producten** in de eerste lege kolommen de koppen `foto` en `omschrijving`. Plak daarna de nieuwe `apps-script/Code.gs` in de editor en implementeer een **nieuwe versie** (zie de Let op bij stap 3).

- **Prijs van de macadamiamixen invullen:** typ de prijs in de kolom `prijs` (in plaats van `[PRIJS]`). Daarna zijn ze meteen te bestellen.
- **Nieuw product:** voeg een rij toe. Bij de eerste bestelling krijgt het vanzelf een eigen kolom in Bestellingen.
- **Sluitdatum wijzigen:** pas in tabblad **Instellingen** de datum naast `sluitdatum` aan. Na die datum toont de pagina "Bestellen is gesloten" en weigert het script nieuwe bestellingen.

## Bestellingen bekijken

Elke bestelling is één rij in **Bestellingen**, met deze kolommen van links naar rechts:

| Kolom | Inhoud |
| --- | --- |
| `bestelnummer` | WF-0001, WF-0002, … (oplopend, dus ook de volgorde van binnenkomst). |
| `naam`, `telefoonnummer` | Zoals ingevuld door de besteller. |
| `opmerking` | Opmerking van de besteller (optioneel). |
| één kolom per product | Het aantal, in dezelfde volgorde als tabblad **Producten**. |
| `totaal` | Totaalbedrag, door het script uitgerekend. |
| `betaalwijze` | `Betaalverzoek` (wil direct betalen) of `Op de Winterfair` (betaalt bij het afhalen). |
| `afgerond` | Vinkje voor Marianne als de bestelling is afgehandeld. |
| `Opmerkingen Marianne` | Vrij veld voor wie de bestelling afhandelt, bijv. "betaald" of "belt nog terug". |

De kolommen `afgerond` en `Opmerkingen Marianne` vult het script nooit in; die zijn voor Marianne.

De productkolommen volgen altijd tabblad **Producten** (kolom `volgorde`). Pas je daar de volgorde aan of voeg je een product toe, dan schuiven de kolommen in Bestellingen vanzelf mee. Hele kolommen schuiven, dus aantallen, vinkjes en opmerkingen blijven bij de juiste bestelling. Gebeurt dat een keer niet, kies dan **Winterfair → Kolommen van Bestellingen ordenen**. Voeg zelf geen kolommen toe in Bestellingen; maak voor overzichten liever een apart tabblad.

Alleen de nog niet afgeronde bestellingen zien? Klik op **Gegevens → Filterweergaven → Nieuwe filterweergave** en filter de kolom `afgerond` op "ONWAAR". Anderen die de Sheet tegelijk open hebben, merken niets van jouw filter.

Voor de afhaallijst: sorteer op naam en print. Wil je weten hoeveel je van een product nodig hebt? Klik op de kolomletter van dat product; Sheets toont de som rechtsonder.

Het script rekent prijzen en totaal zelf uit met de prijzen in de Sheet. Wat de browser stuurt aan bedragen, wordt niet gebruikt.

## Sponsor toevoegen

1. Zet de advertentie (jpg of png) in de map `img/sponsors/`, bijvoorbeeld `img/sponsors/bakkerij-jansen.jpg`.
2. Open `sponsors.json` en voeg een blok toe. Let op de komma tussen de blokken:

   ```json
   {
     "naam": "Bakkerij Jansen",
     "afbeelding": "img/sponsors/bakkerij-jansen.jpg",
     "url": "https://www.bakkerijjansen.nl",
     "formaat": "staand",
     "alt": "Advertentie Bakkerij Jansen, brood en banket"
   }
   ```

   - `formaat`: `breed` (over de hele breedte) of `staand` (half, twee naast elkaar).
   - `url`: laat leeg (`""`) als er geen website is. De advertentie is dan niet klikbaar.
   - `alt`: korte beschrijving voor mensen die de afbeelding niet zien. Mag je weglaten; dan wordt het "Advertentie" + naam.
3. Upload beide bestanden naar GitHub. Na een paar minuten staat de sponsor op de pagina.

Nog in te vullen: de link van **Jaap Pijpelink**. Zet die bij `"url"` in `sponsors.json`.

## Na de fair: persoonsgegevens verwijderen

Op de pagina beloven we: *"We gebruiken je gegevens alleen voor deze bestelling en verwijderen ze na de Winterfair."*

1. Open de Sheet en kies **Winterfair → Persoonsgegevens verwijderen (na de fair)**. Bevestig met **Ja**.
2. Naam, telefoonnummer, opmerking en Opmerkingen Marianne zijn nu bij alle bestellingen leeg. Bestelnummers, aantallen en totalen blijven staan, zodat je de opbrengst nog kunt zien.
3. Google bewaart oude versies in **Bestand → Versiegeschiedenis**, en daarin staan de gegevens nog. Wil je ze echt helemaal kwijt?
   - Maak via **Bestand → Kopie maken** een kopie. Een kopie heeft geen oude versies.
   - Verwijder de oorspronkelijke Sheet en leeg de prullenbak van Google Drive.
   - Let op: het script zit niet aan de kopie vast op dezelfde URL. Doe dit dus pas als bestellen echt voorbij is.
4. Zet daarna de webapp uit: **Implementeren → Implementaties beheren → Archiveren**.

---

## Nog open (staat als placeholder op de pagina)

- `[PRIJS]`: prijzen van de macadamiamixen. Invullen in de Sheet.
- **Link naar het betaalverzoek.** Staat nu op een nep-adres (`https://example.com/betaalverzoek-winterfair`). Zet de echte link in `config.js` bij `betaalverzoekUrl` en verhoog daarna het `?v=`-nummer (zie hieronder).

## Betalen

Bestellers kiezen in het formulier tussen **direct betalen via een betaalverzoek** en **betalen op de Winterfair** bij het afhalen. Na het bestellen zien ze:

- bij betaalverzoek: het bedrag, hun bestelnummer (om bij de omschrijving te zetten) en een knop **Naar het betaalverzoek**;
- bij de Winterfair: dat ze het bedrag bij het afhalen betalen.

De keuze staat in de kolom `betaalwijze` van Bestellingen. Of iemand echt betaald heeft, ziet het script niet; dat kan Marianne bijhouden in **Opmerkingen Marianne** of met het vinkje **afgerond**.

Gebruik een betaalverzoek waarbij de besteller zelf het bedrag invult (bijvoorbeeld een Tikkie of bankverzoek zonder vast bedrag), want elke bestelling heeft een ander totaal.

**Na een wijziging in `app.js`, `reken.js`, `style.css` of `config.js`:** verhoog in `index.html` het nummer achter `?v=` bij alle vier de bestanden (bijv. `?v=4` → `?v=5`). Anders kunnen bezoekers nog even de oude versie uit hun browsergeheugen zien.

## Testen op je eigen computer (optioneel)

Hiervoor heb je [Node.js](https://nodejs.org) nodig.

```bash
node tools/serve.js
```

Open daarna http://localhost:8080/?mock. De pagina gebruikt dan nepgegevens uit `mock/mock-products.json`, er gaat niets naar de Sheet en een bestelling krijgt nummer `WF-TEST`.

Je kunt ook deze varianten openen:
- `?mock=gesloten`: zo ziet het eruit na de sluitdatum.
- `?mock=fout`: zo ziet een mislukte bestelling eruit.

De rekenregels controleer je met:

```bash
node tests/reken.test.js
```
