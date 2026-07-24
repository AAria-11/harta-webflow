// Replace these placeholders with your own public tokens before using this file.
mapboxgl.accessToken = 'YOUR_MAPBOX_ACCESS_TOKEN';

var transformRequest = (url, resourceType) => {
    var isMapboxRequest =
      url.slice(8, 22) === "api.mapbox.com" ||
      url.slice(10, 26) === "tiles.mapbox.com";
    return {
      url: isMapboxRequest
        ? url.replace("?", "?pluginName=sheetMapper&")
        : url
    };
};

// Bucharest coordinates
const bucharestCoordinates = [26.1025, 44.4268]; // [lng, lat]

// Initialize the map with minimum and maximum zoom levels
var map = new mapboxgl.Map({
    container: 'map', // container ID
    center: bucharestCoordinates, // starting position [lng, lat]
    zoom: 12, // starting zoom
    minZoom: 11,
    maxZoom: 16,
    maxBounds: [
      [20.261, 43.618], // SW coordinates
      [29.699, 48.265]  // NE coordinates
    ], // Sets the geographical bounds as the whole world
    style: 'mapbox://styles/alexandrucm/cls9a4yni009a01qz96zm6mh5',
    transformRequest: transformRequest,
    doubleClickZoom: false,
});

// Add geolocate control to the map.

const geolocateControl = new mapboxgl.GeolocateControl({
  positionOptions: {
      enableHighAccuracy: true
  },
  // When active the map will receive updates to the device's location as it changes.
  trackUserLocation: true,
  fitBoundsOptions: {maxZoom:map.getZoom()},
  showUserHeading: window.matchMedia("(max-width: 550px)").matches ? true : false,
})
map.addControl(geolocateControl);

if (!window.matchMedia("(max-width: 550px)").matches) {
  // Disable camera change
  geolocateControl._updateCamera = function(position) { };
}

document.addEventListener('DOMContentLoaded', function () {
  // --- Baserow config: fill these in with your own values ---
  // Table ID: open your Baserow table, look at the URL - .../database/123/table/456 - 456 is the table ID.
  // Token: Baserow workspace settings > API tokens > create a token scoped to this
  // database with READ-ONLY permission (this token is publicly visible in the page source).
  const BASEROW_TABLE_ID = '1095357';
  const BASEROW_TOKEN = 'tlDHa3fX95jlnbXdMPaInXjBDu3I09xl';
  const BASEROW_API_URL = `https://api.baserow.io/api/database/rows/table/${BASEROW_TABLE_ID}/?user_field_names=true&size=200`;

  const maxRetries = 5;
  const retryDelay = 500;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function fetchAllBaserowRows(url) {
    let rows = [];
    let nextUrl = url;

    while (nextUrl) {
      let response = null;
      let lastError = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          response = await fetch(nextUrl, {
            headers: { 'Authorization': `Token ${BASEROW_TOKEN}` }
          });
          if (!response.ok) throw new Error(`Baserow request failed: ${response.status}`);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries) await sleep(retryDelay);
        }
      }

      if (lastError) throw lastError;

      const page = await response.json();
      rows = rows.concat(page.results);
      nextUrl = page.next;
    }

    return rows;
  }

  function rowsToGeoJSON(rows) {
    return {
      type: 'FeatureCollection',
      features: rows
        .filter(row => row.Latitude && row.Longitude)
        .map(row => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [parseFloat(row.Longitude), parseFloat(row.Latitude)]
          },
          properties: {
            Name: row.Name || '',
            Categories_ro: row.Categories_ro || '',
            Categories_en: row.Categories_en || '',
            Orgs_ro: row.Orgs_ro || '',
            Orgs_en: row.Orgs_en || '',
            Classification_ro: row.Classification_ro || '',
            Classification_en: row.Classification_en || '',
            Period_ro: row.Period_ro || '',
            Period_en: row.Period_en || '',
            Style_ro: row.Style_ro || '',
            Style_en: row.Style_en || '',
            Descriere_ro: row.Descriere_ro || '',
            Descriere_en: row.Descriere_en || '',
            Address: row.Address || '',
            FB: row.FB || '',
            Site: row.Site || '',
            Insta: row.Insta || '',
            Gmaps: row.Gmaps || ''
          }
        }))
    };
  }

  function processBaserowData(rows) {
    const data = rowsToGeoJSON(rows);

    let loadedImg = {}
    // Load icons into Mapbox, considering normal and clicked states
    Object.keys(iconPaths).forEach(category => {
      const baseName = iconPaths[category];  // Directly use the simplified name from iconPaths
      if (baseName in loadedImg) {
        return;
      }
      ['normal', 'clicked'].forEach(state => {
          const iconName = `${baseName}_${state}`;  // Construct the icon name using baseName and state
          const path = `pins/${iconName}.png`;  // Construct the file path in the 'pins/' directory
          map.loadImage(path, function(error, image) {
              if (error) throw error;
              map.addImage(iconName, image);
          });
      });
      loadedImg[baseName] = true;
    });

    initializeMapWithFeatures(data);
  }

  fetchAllBaserowRows(BASEROW_API_URL)
    .then(processBaserowData)
    .catch(error => console.error('Failed to load locations from Baserow:', error));

  setupArticleHeaderScroll();
});

var uniqueCategories;
var geojsonData;
var picsDirToNum = {};
var categoryToData = {
  ro : {},
  en : {}
};
var nameToCoordinates = {};
var nameToFeature = {};
var linkNameToTitle = {};
var titleToLinkName = {};
var isPanelHidden = false;
var numTotalCategories = 0;
const customLinks = {
  "Casa Memorială Tudor Arghezi — Mărțișor": "casa-memoriala-tudor-arghezi"
};

function openPin(clickedFeature) {
  refreshIconState(clickedFeature);
  createAndDisplayCard(clickedFeature);
}

function decodeStringIfNecessary(inputString) {
  try {
    return decodeURIComponent(inputString);
  } catch (e) {
    return inputString;
  }
}

function initializeMapWithFeatures(data) {
  map.on('load', function () {
      uniqueCategories = setupCategoryLayersAndFilters(data);
      numTotalCategories = uniqueCategories.size;
      populateObjectiveList(uniqueCategories);
      populateGalleryContainer();


      const iconBtn1El = document.getElementById('iconBtn1');
      if (iconBtn1El) iconBtn1El.addEventListener('click', showObiective);
      const iconBtn2El = document.getElementById('iconBtn2');
      if (iconBtn2El) iconBtn2El.addEventListener('click', showFiltre);
      const iconBtn3El = document.getElementById('iconBtn3');
      if (iconBtn3El) iconBtn3El.addEventListener('click', toggleSidePanel);
      const selectAllCheckboxEl = document.getElementById('selectAllCheckbox');
      if (selectAllCheckboxEl) selectAllCheckboxEl.style.display = '';

      const hash = window.location.hash.substring(1);
      if (hash) {
        const isMobile = window.matchMedia("(max-width: 550px)").matches; // Check if on mobile

        if (hash.startsWith('event-')) {
          const eventSlug = hash.substring('event-'.length);
          handleEventHash(eventSlug);
          if (isMobile) {
            updateToolbarActiveState('mobile-toolbar-events');
          }
        } else if (hash === 'events') {
          const eventsLink = document.getElementById('events-link');
          if (eventsLink) {
              const eventsContainer = document.getElementById('events-container');
              if (eventsContainer.style.display === 'none' || eventsContainer.style.display === '') {
                  toggleEvents({ preventDefault: () => {} });
              }
          }
          if (isMobile) {
            updateToolbarActiveState('mobile-toolbar-events');
          }
        }
        else if (decodeStringIfNecessary(hash) in linkNameToTitle) {
          clickedFeature = nameToFeature[linkNameToTitle[decodeStringIfNecessary(hash)]];
          openPin(clickedFeature);
          const cardReadMore = document.getElementById('card-read-more');
          if (clickedFeature.properties.Name === "Suprainfinit Gallery" ||
              clickedFeature.properties.Name === "Centrul de Resurse în Fotografie"
              || clickedFeature.properties.Name === "Atelierele Scânteia"
              || clickedFeature.properties.Name === "Paper Traffic"
              || clickedFeature.properties.Name === "Teatrul Masca"
              || clickedFeature.properties.Name === "Casa Memorială Tudor Arghezi — Mărțișor") {
            openArticle(null, clickedFeature.properties.Name);
            if (isMobile) {
              openMobileArticlesPage();
              updateToolbarActiveState('mobile-toolbar-articles');
            }
          } else {
            cardReadMore.onclick();
          }
        } else if (hash === "about-us") {
          if (isMobile) {
            openAboutUsMobile(false);
          } else {
            openAboutUs();
          }
        } else if (hash === "archive") {
          toggleArchive({ preventDefault: () => {} });
        }
      }
      geolocateControl.on('error', function(e) {
        console.log('Geolocation failed');
      });
      geolocateControl.trigger();
  });
}

async function handleEventHash(eventSlug) {
  // Ensure the Events panel is open
  const eventsContainer = document.getElementById('events-container');
  if (eventsContainer.style.display === 'none') {
      const eventsLink = document.getElementById('events-link');
      if (eventsLink) {
          toggleEvents({ preventDefault: () => {} }); // Pass a dummy event object
      }
  }

  // Wait for masterEventList to be populated
  if (!initialEventsFetchPromise) { // This promise is from fetchAndPrepareInitialEventData
      console.warn("Initial event fetch promise not available for hash handling.");
      // Attempt to initiate it if not already, though ideally toggleEvents would handle this.
      initialEventsFetchPromise = fetchAndPrepareInitialEventData();
  }

  try {
      await initialEventsFetchPromise; // Wait for events to be loaded

      if (masterEventList && masterEventList.length > 0) {
          const eventToOpen = masterEventList.find(event => slugify(event.title) === eventSlug);
          if (eventToOpen) {
              openEventDetailPanel(eventToOpen.title);
          } else {
              console.warn(`Event with slug "${eventSlug}" not found.`);
              // Fallback: Just ensure the events list is open
              applyAllEventsFiltersAndPopulate(); // Ensure list is shown
          }
      } else {
          console.warn("Master event list is empty or not loaded for hash handling.");
      }
  } catch (error) {
      console.error("Error handling event hash:", error);
  }
}

const iconPaths = {
  'Teatre': 'teatre',
  'Cinematografe': 'cinematografe',
  'Muzică': 'muzica',
  'Inițiative pentru comunitate': 'initiative_pentru_comunitate',
  'Instituții culturale': 'institutii_culturale',
  'Industrie creativă': 'industrie_creativa',
  'Muzee și case memoriale': 'muzee_si_case_memoriale',
  'Biblioteci': 'biblioteci',
  'Spații dedicate artiștilor': 'spatii_dedicate_artistilor',
  'Galerii': 'galerii',
  'Spații dedicate copiilor': 'copii',
  'Educație culturală': 'edcult',

  'Theatres': 'teatre',
  'Cinema': 'cinematografe',
  'Music' : 'muzica',
  'Community initiatives' : 'initiative_pentru_comunitate',
  'Cultural institutions': 'institutii_culturale',
  'Creative industry' : 'industrie_creativa',
  'Museums and memorial houses': 'muzee_si_case_memoriale',
  'Libraries': 'biblioteci',
  'Artist spaces': 'spatii_dedicate_artistilor',
  'Galleries': 'galerii',
  'Culture for children' : 'copii',
  'Cultural education': 'edcult'
};

const categoryTranslation = {
  ro : {
    'Teatre' : 'Theatres',
    'Cinematografe' : 'Cinema',
    'Muzică' : 'Music',
    'Inițiative pentru comunitate' : 'Community initiatives',
    'Instituții culturale': 'Cultural institutions',
    'Industrie creativă': 'Creative industry',
    'Muzee și case memoriale' : 'Museums and memorial houses',
    'Biblioteci' : 'Libraries',
    'Spații dedicate artiștilor' : 'Artist spaces',
    'Galerii' : 'Galleries',
    'Spații dedicate copiilor': 'Culture for children',
    'Educație culturală': 'Cultural education'
  },
  en : {
    'Theatres' : 'Teatre',
    'Cinema' : 'Cinematografe',
    'Music' : 'Muzică',
    'Community initiatives' : 'Inițiative pentru comunitate',
    'Cultural institutions' : 'Instituții culturale',
    'Creative industry' : 'Industrie creativă',
    'Museums and memorial houses' : 'Muzee și case memoriale',
    'Libraries' : 'Biblioteci',
    'Artist spaces' : 'Spații dedicate artiștilor',
    'Galleries' : 'Galerii',
    'Culture for children' : 'Spații dedicate copiilor',
    'Cultural education': 'Educație culturală'
  }
}

const labelTranslation = {
  ro : {
    "Fundație" : "Foundation",
    "Inițiativă privată" : "Private institution",
    "Instituție publică" : "Public institution",
    "ONG" : "NGO",
    "Monument istoric" : "Listed historical monument",
    "Neclasat" : "Unlisted"
  },
  en : {
    "Foundation" : "Fundație",
    "Private institution" : "Inițiativă privată",
    "Public institution" : "Instituție publică",
    "NGO" : "ONG",
    "Listed historical monument" : "Monument istoric",
    "Unlisted" : "Neclasat"
  }
}

const articleTitleTranslation = {
  ro : {
    "Suprainfinit Gallery" : "Suprainfinit Gallery",
    "Centrul de Resurse în Fotografie" : "Photography Resource Centre",
    "Atelierele Scânteia" : "Scânteia Workshops",
    "Paper Traffic" : "Paper Traffic",
    "Teatrul Masca" : "Masca Theater",
    "Casa Memorială Tudor Arghezi — Mărțișor" : "The “Tudor Arghezi” Memorial House",
    "Centrul de Resurse în Fotografie (CdRF)" : "Photography Resource Centre (CdRF)",
  },
  en : {
    "Photography Resource Centre" : "Centrul de Resurse în Fotografie",
    "Suprainfinit Gallery" : "Suprainfinit Gallery",
    "Scânteia Workshops" : "Atelierele Scânteia",
    "Paper Traffic" : "Paper Traffic",
    "The “Tudor Arghezi” Memorial House" : "Casa Memorială Tudor Arghezi — Mărțișor",
    "Masca Theater" : "Teatrul Masca",
    "Photography Resource Centre (CdRF)" : "Centrul de Resurse în Fotografie (CdRF)",
  }
}

const categoryColors = {
  'Teatre': '#F28B40',
  'Cinematografe': '#6E406D',
  'Muzică': '#CB211D',
  'Inițiative pentru comunitate': '#479B66',
  'Instituții culturale' : '#B0507B',
  'Industrie creativă' : '#0D90AE',
  'Muzee și case memoriale' : '#5553E0',
  'Biblioteci' : '#F96781',
  'Spații dedicate artiștilor' : '#3E665A',
  'Galerii' : '#A5882A',
  'Spații dedicate copiilor' : '#6078FF',
  'Educație culturală': '#EB6200',

  'Theatres': '#F28B40',
  'Cinema': '#6E406D',
  'Music' : '#CB211D',
  'Community initiatives' : '#479B66',
  'Cultural institutions': '#B0507B',
  'Creative industry' : '#0D90AE',
  'Museums and memorial houses': '#5553E0',
  'Libraries': '#F96781',
  'Artist spaces': '#3E665A',
  'Galleries': '#A5882A',
  'Culture for children' : '#6078FF',
  'Cultural education': '#EB6200'
};

const clasareToId = {
  "Monument istoric": "historicalMonument",
  "Listed historical monument" : "historicalMonument",
  "Unlisted" : "unclassified",
  "Neclasat" : "unclassified"
};

const periodTranslation = {
  ro: {
    "1401-1500": "1401-1500",
    "1701-1800": "1701-1800",
    "1801-1866": "1801-1866",
    "1867-1918": "1867-1918",
    "1919-1947": "1919-1947",
    "1948-1989": "1948-1989",
    "1990-prezent": "1990-present",
    "1401 - 1500": "1401 - 1500",
    "1701 - 1800": "1701 - 1800",
    "1801 - 1866": "1801 - 1866",
    "1867 - 1918": "1867 - 1918",
    "1919 - 1947": "1919 - 1947",
    "1948 - 1989": "1948 - 1989",
    "1990 - prezent": "1990 - present"
  },
  en: {
    "1401-1500": "1401-1500",
    "1701-1800": "1701-1800",
    "1801-1866": "1801-1866",
    "1867-1918": "1867-1918",
    "1919-1947": "1919-1947",
    "1948-1989": "1948-1989",
    "1990-present": "1990-prezent",
    "1401 - 1500": "1401 - 1500",
    "1701 - 1800": "1701 - 1800",
    "1801 - 1866": "1801 - 1866",
    "1867 - 1918": "1867 - 1918",
    "1919 - 1947": "1919 - 1947",
    "1948 - 1989": "1948 - 1989",
    "1990 - present": "1990 - prezent"
  }
};

const styleTranslation = {
  ro: {
    "Neogotic": "Gothic Revival",
    "Neoclasic": "Neoclassic",
    "Art Nouveau/ Secession": "Art Nouveau/ Secession",
    "Eclectic": "Eclectic",
    "Neoromânesc": "Romanian Revival",
    "Arhitectură industrială": "Industrial architecture",
    "Modernism": "Modernism",
    "Art-Deco": "Art Deco",
    "Pitoresc mediteraneean": "Picturesque Mediterranean",
    "Realism Socialist": "Socialist Realism",
    "Modernism socialist": "Socialist Modernism",
    "Brutalism": "Brutalist",
    "Contemporan": "Contemporary",
    "Postmodern": "Postmodern",
    "Altele": "Other"
  },
  en: {
    "Gothic Revival": "Neogotic",
    "Neoclassic": "Neoclasic",
    "Art Nouveau/ Secession": "Art Nouveau/ Secession",
    "Eclectic": "Eclectic",
    "Romanian Revival": "Neoromânesc",
    "Industrial architecture": "Arhitectură industrială",
    "Modernism": "Modernism",
    "Art Deco": "Art-Deco",
    "Picturesque Mediterranean": "Pitoresc mediteraneean",
    "Socialist Realism": "Realism Socialist",
    "Socialist Modernism": "Modernism socialist",
    "Brutalist": "Brutalism",
    "Contemporary": "Contemporan",
    "Postmodern": "Postmodern",
    "Other": "Altele"
  }
};

function getCategoryColor(category) {
  return categoryColors[category] || '#000000'; // Default color
}

function fixLinkIfNeeded(link) {
  let trimLink = link.trim()
  return trimLink.startsWith("https") || trimLink.startsWith("http") ? trimLink : trimLink === "" ? "#" : "https://" + trimLink;
}

function preventDefaultAction(event) {
  event.preventDefault();
}

function createAndDisplayCard(clickedFeature, adjustMap = true) {
    const card = document.querySelector('.card');
    card.classList.add('hidden-element');

    let cardWidth, cardHeight, heightAdjustment;
    if (window.matchMedia("(max-width: 550px)").matches) {
      cardWidth = 310;
      cardHeight = 226;
      heightAdjustment = 11;
    } else {
      cardWidth = 332;
      cardHeight = 336;
      heightAdjustment = 9;
    }
    card.style.width = `${cardWidth}px`;
    card.style.height = `${cardHeight}px`;

    const cardCategory = document.querySelector('.card-category');
    const categoriesKey = `Categories_${currentLang}`;
    const category = clickedFeature.properties[categoriesKey].split(/[,;]+/).map(s => s.trim())[0];
    cardCategory.style.color = `${getCategoryColor(category)}`;
    // TODO just one category
    cardCategory.textContent = category;

    const descriereKey = `Descriere_${currentLang}`;
    let contentArr = clickedFeature.properties[descriereKey].split('\n').filter(l => l.length > 0 && l.trim() !== '');

    const cardTitle = document.querySelector('.card-title');
    cardTitle.textContent = clickedFeature.properties.Name;

    const addressTextContent = document.getElementById('address-text-content');
    addressTextContent.textContent = clickedFeature.properties.Address;

    const addressIcon = document.getElementById('card-address-icon');
    addressIcon.src = `pins/${iconPaths[category]}_normal.png`;

    const links = [
        { id: 'fb-link', property: 'FB' },
        { id: 'site-link', property: 'Site' },
        { id: 'insta-link', property: 'Insta' },
        { id: 'maps-link', property: 'Gmaps' }
    ];

    // Loop through each link and set the attributes
    links.forEach(link => {
        const element = document.getElementById(link.id);
        if (element) {
            element.removeEventListener('click', preventDefaultAction, true);
            const fixedLink = fixLinkIfNeeded(clickedFeature.properties[link.property]);
            element.href = fixedLink;
            if (fixedLink !== "#") {
              element.setAttribute('target', '_blank');
              element.setAttribute('rel', 'noopener noreferrer');
            } else {
              element.removeAttribute('target');
              element.removeAttribute('rel');
              element.addEventListener('click', preventDefaultAction, true);
            }
        }
    });

    // Instead of setting a fixed height, we calculate exactly how much
    // extra height the title takes up and add that to the base height.
    if (!window.matchMedia("(max-width: 550px)").matches) {
      if (cardTitle.offsetHeight > 29 || addressTextContent.offsetHeight > 19) {
        cardWidth = 337;
        const extraTitleHeight = Math.max(0, cardTitle.offsetHeight - 29);
        // Base height + extra title space + small buffer
        cardHeight = 336 + extraTitleHeight;
      }
    } else {
      if (cardTitle.offsetHeight > 24 || addressTextContent.offsetHeight > 19) {
        cardWidth = 317;
        const extraTitleHeight = Math.max(0, cardTitle.offsetHeight - 24);
        cardHeight = 226 + extraTitleHeight;
      }
    }

    card.style.width = `${cardWidth}px`;
    card.style.height = `${cardHeight}px`;

    // Edge case where the title no longer requires two rows, so revert to initial height.
    if (!window.matchMedia("(max-width: 550px)").matches) {
      if (cardTitle.offsetHeight <= 29) {
        card.style.height = `336px`;
      }
    } else {
      if (cardTitle.offsetHeight <= 24) {
        card.style.height = `226px`;
      }
    }

    var point = map.project(clickedFeature.geometry.coordinates, map.zoom);
    card.style.left = `${point.x}px`;
    card.style.top = `${point.y - heightAdjustment}px`;
    card.style.transform = 'translate(-50%, -100%)'; // Adjusts for the width and height of the card

    // Calculate the expected position of the card edges
    const cardLeft = point.x - cardWidth / 2;
    const cardRight = cardLeft + cardWidth;
    const cardTop = point.y - cardHeight + 27;
    const cardBottom = point.y;

    // Get the map container's dimensions
    const mapRect = map.getContainer().getBoundingClientRect();

    // Determine how much to adjust the map's center
    let deltaX = 0, deltaY = 0;

    let panelLeft, panelRight, panelTop;
    if (!window.matchMedia("(max-width: 550px)").matches) {
        panelRight = 110;
        panelTop = 75;
        if (isPanelHidden) {
          panelLeft = 55;
       } else {
          panelLeft = 375;
       }
    }

    // Check boundaries and calculate needed adjustments
    if (cardLeft < mapRect.left + panelLeft) {
        deltaX = cardLeft - mapRect.left - panelLeft;
    } else if (cardRight > mapRect.right - panelRight) {
        deltaX = cardRight - mapRect.right + panelRight;
    }
    if (cardTop < mapRect.top + panelTop) {
        deltaY = cardTop - mapRect.top - panelTop;
    } else if (cardBottom > mapRect.bottom) {
        deltaY = cardBottom - mapRect.bottom;
    }

    let pov;
    if (window.matchMedia("(max-width: 550px)").matches) {
      deltaX = 0;
      if (window.matchMedia("(max-width: 400px)").matches) {
        deltaY = -105;
      } else {
        deltaY = -70;
      }
      pov = nameToCoordinates[cardTitle.textContent];
    } else {
      pov = map.getCenter();
    }

    // Adjust the map's center if necessary
    if (adjustMap && (deltaX !== 0 || deltaY !== 0)) {
      const centerPixel = map.project(pov, map.zoom);
      const newCenter = map.unproject([centerPixel.x + deltaX, centerPixel.y + deltaY], map.zoom);

        map.once('moveend', function() {
          point = map.project(clickedFeature.geometry.coordinates, map.zoom);
          card.style.left = `${point.x}px`;
          card.style.top = `${point.y - heightAdjustment}px`;
          card.style.transform = 'translate(-50%, -100%)'; // Adjusts for the width and height of the card
          card.classList.remove('hidden-element');
          const cardText = document.querySelector('.card-text');
          if (contentArr.length === 0) {
            const readMoreBtn = document.querySelector('.card-read-more');
            if (cardTitle.textContent === "Suprainfinit Gallery" ||
                cardTitle.textContent === "Centrul de Resurse în Fotografie" ||
                cardTitle.textContent === "Atelierele Scânteia") {
              readMoreBtn.onclick = function() { openArticle(null, cardTitle.textContent); };
              cardText.textContent = getArticleDescr(cardTitle.textContent);
            } else {
              readMoreBtn.onclick = function() { };
              cardText.textContent = currentLang === 'ro' ? "Mai multe detalii în curând." : "More details soon.";
            }
          } else {
            if (cardTitle.textContent === "Paper Traffic" ||
                cardTitle.textContent === "Teatrul Masca" ||
                cardTitle.textContent === "Casa Memorială Tudor Arghezi — Mărțișor") {
              const readMoreBtn = document.querySelector('.card-read-more');
              readMoreBtn.onclick = function() { openArticle(null, cardTitle.textContent); };
              cardText.textContent = getArticleDescr(cardTitle.textContent);
            } else {
              const readMoreBtn = document.querySelector('.card-read-more');
              readMoreBtn.onclick = function() { openReadMore(readMoreBtn); };
              cardText.textContent = contentArr[0];
            }
          }
        });

        map.easeTo({
            center: newCenter,
            essential: true // this ensures the movement is considered user-driven
        });
    } else {
        card.classList.remove('hidden-element');
        const cardText = document.querySelector('.card-text');
        if (contentArr.length === 0) {
          const readMoreBtn = document.querySelector('.card-read-more');
          if (cardTitle.textContent === "Suprainfinit Gallery" ||
              cardTitle.textContent === "Centrul de Resurse în Fotografie" ||
              cardTitle.textContent === "Atelierele Scânteia") {
            readMoreBtn.onclick = function() { openArticle(null, cardTitle.textContent); };
            cardText.textContent = getArticleDescr(cardTitle.textContent);
          } else {
            readMoreBtn.onclick = function() { };
            cardText.textContent = currentLang === 'ro' ? "Mai multe detalii în curând." : "More details soon.";
          }
        } else {
          if (cardTitle.textContent === "Paper Traffic" ||
              cardTitle.textContent === "Teatrul Masca" || 
              cardTitle.textContent === "Casa Memorială Tudor Arghezi — Mărțișor") {
            const readMoreBtn = document.querySelector('.card-read-more');
            readMoreBtn.onclick = function() { openArticle(null, cardTitle.textContent); };
            cardText.textContent = getArticleDescr(cardTitle.textContent);
          } else {
            const readMoreBtn = document.querySelector('.card-read-more');
            readMoreBtn.onclick = function() { openReadMore(readMoreBtn); };
            cardText.textContent = contentArr[0];
          }
        }
    }
}

var lastClickedFeatureName = null;
var lastClickedFeatureCategory = null;

function updateIconState(featureName, newState) {
  for (let i = 0; i < geojsonData.features.length; i++) {
    if (geojsonData.features[i].properties.Name === featureName) {
        geojsonData.features[i].properties.IconState = newState;
        break;
    }
  }
  // Set the updated data back on the source
  updateLayerWithFilters();
}

function refreshIconState(clickedFeature) {
  const category = clickedFeature.properties.PrimaryCategory;
  if (lastClickedFeatureName === null) {
    // Activate the only one
    updateIconState(clickedFeature.properties.Name, `${iconPaths[category]}_clicked`);
  } else if (lastClickedFeatureName !== clickedFeature.properties.Name) {
      // Deactivate the old one
      updateIconState(lastClickedFeatureName, `${iconPaths[lastClickedFeatureCategory]}_normal`);
      // Activate the new one
      updateIconState(clickedFeature.properties.Name, `${iconPaths[category]}_clicked`);
  } else {
    // lastClickedFeatureName == clickedFeature.properties.Name
    // The same one has been clicked - don't do anything
  }
  lastClickedFeatureName = clickedFeature.properties.Name;
  lastClickedFeatureCategory = category;
}

function setupCategoryLayersAndFilters(data) {
  let uniqueCategories = new Set();

  let categoriesKey = `Categories_${currentLang}`;
  data.features.forEach(feature => {
      let categories = feature.properties[categoriesKey].split(/[,;]+/).map(s => s.trim());
      categories.forEach(category => uniqueCategories.add(category));
      feature.properties.PrimaryCategory = categories[0];
      feature.properties.IconState = iconPaths[categories[0]] + '_normal';
      // TODO adapt for two languages if needed
      nameToCoordinates[feature.properties.Name] = feature.geometry.coordinates;
      nameToFeature[feature.properties.Name] = feature;
      linkNameToTitle[titleToLink(feature.properties.Name)] = feature.properties.Name;
      titleToLinkName[feature.properties.Name] = titleToLink(feature.properties.Name);
  });

  geojsonData = data;

  const jsonScript = document.getElementById('picsJsonData');
  picsDirToNum = jsonScript ? JSON.parse(jsonScript.textContent) : {};

  map.addSource('dynamic-source', {
    type: 'geojson',
    data: data // Start with all data
  });

  map.addLayer({
    id: 'dynamic-layer',
    type: 'symbol',
    source: 'dynamic-source',
    layout: {
      'visibility' : 'visible',
      'icon-image': ['get', 'IconState'],
      'icon-size': 0.25,
      'icon-ignore-placement': true,  // Ignores the automatic placement algorithm
      'icon-allow-overlap': true, // Allows icons to overlap other map elements
    }
  });

  map.on('click', `dynamic-layer`, function(e) {
      const card = document.querySelector('.card');
      card.classList.add('hidden-element');
      // e.features[0] contains the clicked feature information
      if (e.features.length > 0) {
          const clickedFeature = e.features[0];
          closeReadMore();
          if (!window.matchMedia("(max-width: 550px)").matches) {
            closeArticlesHeader();
            closeEngage();
          }
          refreshIconState(clickedFeature);
          createAndDisplayCard(clickedFeature);
      }
  });

  map.on('resize', function() {
    const card = document.querySelector('.card');
    card.classList.add('hidden-element');
    if (lastClickedFeatureCategory && lastClickedFeatureName) {
      updateIconState(lastClickedFeatureName, `${iconPaths[lastClickedFeatureCategory]}_normal`);
      lastClickedFeatureName = null;
      lastClickedFeatureCategory = null;
    }
  });

  map.on('zoom', function() {
    const card = document.querySelector('.card');
    card.classList.add('hidden-element');
    if (lastClickedFeatureCategory && lastClickedFeatureName) {
      updateIconState(lastClickedFeatureName, `${iconPaths[lastClickedFeatureCategory]}_normal`);
      lastClickedFeatureName = null;
      lastClickedFeatureCategory = null;
    }
  });

  map.on('drag', function() {
    const card = document.querySelector('.card');
    card.classList.add('hidden-element');
    if (lastClickedFeatureCategory && lastClickedFeatureName) {
      updateIconState(lastClickedFeatureName, `${iconPaths[lastClickedFeatureCategory]}_normal`);
      lastClickedFeatureName = null;
      lastClickedFeatureCategory = null;
    }
  });

  map.on('click', function(e) {
      const features = map.queryRenderedFeatures(e.point, { layers: ['dynamic-layer'] });
      if (features.length === 0) {
          const card = document.querySelector('.card');
          card.classList.add('hidden-element');
          if (lastClickedFeatureCategory && lastClickedFeatureName) {
            updateIconState(lastClickedFeatureName, `${iconPaths[lastClickedFeatureCategory]}_normal`);
            lastClickedFeatureName = null;
            lastClickedFeatureCategory = null;
          }
      }
  });

  uniqueCategories.forEach(category => {
      let categoryData = {
        type: 'FeatureCollection',
        features: data.features.filter(feature => feature.properties[categoriesKey].split(/[,;]+/).includes(category))
      };

      categoryToData[currentLang][category] = categoryData;
  });

  uniqueCatTranslated = [];
  uniqueCategories.forEach(cat => uniqueCatTranslated.push(categoryTranslation[currentLang][cat]));
  const otherLang = Object.keys(translations).filter(l => l !== currentLang)[0];
  categoriesKey = `Categories_${otherLang}`;
  uniqueCatTranslated.forEach(category => {
    let catDataOtherLang = {
      type: 'FeatureCollection',
      features: data.features.filter(feature => feature.properties[categoriesKey].split(/[,;]+/).includes(category))
    };
    categoryToData[otherLang][category] = catDataOtherLang;
  });

  return uniqueCategories;
}


function filterFunc(feature) {
    const categoriesKey = `Categories_${currentLang}`;
    const featureCategories = feature.properties[categoriesKey].split(/[,;]+/).map(s => s.trim());
    const isInSelectedCategories = selectedCategories.length == 0 ? true : featureCategories.some(fc => selectedCategories.includes(fc));

    const orgsKey = `Orgs_${currentLang}`;
    const featureOrgs = feature.properties[orgsKey].split(/[,;]+/).map(s => s.trim());
    const isInSelectedOrgs = orgs.length == 0 ? true : featureOrgs.some(fsc => orgs.includes(fsc));

    let monumentType = true
    if (clasare !== '') {
        const classifyKey = `Classification_${currentLang}`;
        monumentType = feature.properties[classifyKey].trim().toLowerCase() == clasare.toLowerCase();
    }

    const periodKey = `Period_${currentLang}`; 
    const styleKey = `Style_${currentLang}`;

    const featurePeriods = feature.properties[periodKey] ? feature.properties[periodKey].split(/[,;]+/).map(s => s.trim().replace(/\s/g, '')) : [];
    const isInSelectedPeriods = periods.length == 0 ? true : featurePeriods.some(fp => periods.includes(fp));

    const featureStyles = feature.properties[styleKey] ? feature.properties[styleKey].split(/[,;]+/).map(s => s.trim()) : [];
    const isInSelectedStyles = styles.length == 0 ? true : featureStyles.some(fs => styles.includes(fs));

    return isInSelectedCategories && isInSelectedOrgs && monumentType && isInSelectedPeriods && isInSelectedStyles;
}

let selectedCategories = []; // Tracks the currently selected categories

function updateLayerWithFilters() {
  let filteredData;
  if (selectedCategories.length > 0 || orgs.length > 0 || clasare !== '' || periods.length > 0 || styles.length > 0) {
      // Filter features based on selected categories
      filteredData = {
          type: 'FeatureCollection',
          features: geojsonData.features.filter(feature => filterFunc(feature))
      };
  } else {
      // If no categories are selected, use all data
      filteredData = geojsonData;
  }

  // Update the data source for the dynamic layer
  map.getSource('dynamic-source').setData(filteredData);
}

function updateObjectiveListAppearance() {
  const isMobile = window.matchMedia("(max-width: 550px)").matches;
  const listId = isMobile ? '#mobileCustomBulletedList li' : '#custom-bulleted-list li';
  const selectAllId = isMobile ? 'mobileSelectAllInput' : 'selectAllInput';
  const listItems = document.querySelectorAll(listId);
  const selectAllCheckbox = document.getElementById(selectAllId);

  if (selectedCategories.length == 0) {
    if (selectAllCheckbox) selectAllCheckbox.checked = true;
    listItems.forEach(li => {
        const categoryName = li.getAttribute('data-category-name');
        li.style.setProperty("--bullet-color", getCategoryColor(categoryName));
    });
  } else {
      listItems.forEach(li => {
          const categoryName = li.getAttribute('data-category-name');
          if (selectedCategories.includes(categoryName)) {
            li.style.setProperty("--bullet-color", getCategoryColor(categoryName));
          } else {
            li.style.setProperty("--bullet-color", "#D3D3D3");
          }
      });
  }
  updateLayerWithFilters();
}

function populateObjectiveList(categoriesList) {
    const isMobile = window.matchMedia("(max-width: 550px)").matches;
    const ulId = isMobile ? "mobileCustomBulletedList" : "custom-bulleted-list";
    const ul = document.getElementById(ulId);
    if (!ul) return;

    ul.innerHTML = '';

    let childrenList = [];
    categoriesList.forEach(categoryName => {
        const li = document.createElement("li");
        li.textContent = categoryName;
        li.setAttribute('data-category-name', categoryName);
        li.style.setProperty("--bullet-color", getCategoryColor(categoryName));

        li.addEventListener("click", function() {
          const selectAllId = isMobile ? 'mobileSelectAllInput' : 'selectAllInput';
          const index = selectedCategories.indexOf(li.textContent);
          var selectAllBox = document.getElementById(selectAllId);
          if (index > -1) {
            selectedCategories.splice(index, 1);
          } else {
            selectedCategories.push(li.textContent);
            if (selectAllBox) selectAllBox.checked = false;
            if (selectedCategories.length === numTotalCategories) {
              selectedCategories = [];
              if (selectAllBox) selectAllBox.checked = true;
            }
          }
          const card = document.querySelector('.card');
          card.classList.add('hidden-element');

          if (lastClickedFeatureCategory && lastClickedFeatureName) {
            updateIconState(lastClickedFeatureName, `${iconPaths[lastClickedFeatureCategory]}_normal`);
            lastClickedFeatureName = null;
            lastClickedFeatureCategory = null;
          }
          updateObjectiveListAppearance();
          populateGalleryContainer();
        });
        childrenList.push(li);    
    });

    childrenList.sort((a, b) => a.textContent.localeCompare(b.textContent));
    childrenList.forEach(child => {
        ul.appendChild(child);
    });
}

function handleSearch(searchValue) {
  const isMobile = window.matchMedia("(max-width: 550px)").matches;
  const galleryContainerId = isMobile ? 'mobileGalleryContainer' : 'gallery-container';
  const objListId = isMobile ? 'mobileObjList' : 'objList';

  const lowercasedFilter = replaceDiacritics(searchValue.toLowerCase());
  const galleryItems = document.querySelectorAll(`#${galleryContainerId} .gallery-item`);
  let countDisplayed = 0;

  galleryItems.forEach(item => {
    const titleText = item.querySelector('.gallery-item-title').textContent.toLowerCase();
    if (replaceDiacritics(titleText).includes(lowercasedFilter)) {
        item.style.display = '';
        countDisplayed++;
    } else {
        item.style.display = 'none';
    }
  });

  const objList = document.getElementById(objListId);
  if (objList) {
    if (currentLang === 'ro') {
      objList.textContent = `Listă obiective (${countDisplayed})`;
    } else {
      objList.textContent = `List of landmarks (${countDisplayed})`;
    }
  }
}

// Function to create a gallery item
function createGalleryItem(item) {
    const galleryItem = document.createElement('div');
    galleryItem.classList.add('gallery-item');

    const title = document.createElement('div');
    title.className = 'gallery-item-title';
    title.textContent = item.title;

    const labelContainer = document.createElement('div');
    labelContainer.classList.add('label-container');

    item.labels.forEach(labelText => {
      const label = document.createElement('span');
      label.textContent = labelText;
      label.classList.add('label');
      labelContainer.appendChild(label);
    });

    galleryItem.appendChild(title);
    galleryItem.appendChild(labelContainer);

    galleryItem.addEventListener('mouseover', () => {
        galleryItem.classList.add('active');
    });

    galleryItem.addEventListener('mouseout', () => {
        galleryItem.classList.remove('active');
    });

    galleryItem.addEventListener('click', () => {
      const card = document.querySelector('.card');
      card.classList.add('hidden-element');

      if (window.matchMedia("(max-width: 550px)").matches) {
        closeMobilePanel();
      }

      if (window.matchMedia("(max-width: 550px)").matches) {
        createAndDisplayCard(nameToFeature[item.title], adjustMap = true);
        refreshIconState(nameToFeature[item.title]);
      } else {
        map.once('moveend', function() {
          refreshIconState(nameToFeature[item.title]);
          createAndDisplayCard(nameToFeature[item.title], adjustMap = false);
        });

        map.flyTo({
          center: nameToCoordinates[item.title], // [lng, lat]
          zoom: 14, // Optional: set the zoom level
          speed: 0.6
        });
      }
    });

    return galleryItem;
}

function populateGalleryContainer() {
  const isMobile = window.matchMedia("(max-width: 550px)").matches;
  const galleryContainerId = isMobile ? 'mobileGalleryContainer' : 'gallery-container';
  const objListId = isMobile ? 'mobileObjList' : 'objList';

  const galleryContainer = document.getElementById(galleryContainerId);
  if (!galleryContainer) return;
  galleryContainer.innerHTML = '';

  let categoriesToUse = selectedCategories.length == 0 ? uniqueCategories : selectedCategories;

  const categoriesKey = `Categories_${currentLang}`;
  let items = [];
  categoriesToUse.forEach(category => {
      if (!categoryToData[currentLang][category]) return;
      let filteredFeatures = categoryToData[currentLang][category].features.filter(f => filterFunc(f));
      filteredFeatures.forEach(feature => {
          items.push({ title: feature.properties.Name,
                       labels: feature.properties[categoriesKey].split(/[,;]+/).map(s => s.trim())
                     });
      });
  });

  let uniqueItems = Array.from(new Set(items.map(JSON.stringify))).map(JSON.parse);
  uniqueItems.sort((a, b) => a.title.localeCompare(b.title));

  uniqueItems.forEach(item => {
      const galleryItem = createGalleryItem(item);
      galleryContainer.appendChild(galleryItem);
      const titleElement = galleryItem.querySelectorAll('.gallery-item-title')[0];
      if (titleElement.offsetHeight > 20) {
        galleryItem.style.height = '88px';
      }

      if (isMobile && titleElement.textContent.length >= 34) {
        galleryItem.style.height = '88px';
      }
  });

  const objList = document.getElementById(objListId);
  if (objList) {
    if (currentLang === 'ro') {
      objList.textContent = `Listă obiective (${uniqueItems.length})`;
    } else {
      objList.textContent = `List of landmarks (${uniqueItems.length})`;
    }
  }
}

function showObiective() {
  if (window.matchMedia("(max-width: 550px)").matches) {
    cleanupMobilePanels();
    document.getElementById('mobile-filters-panel').style.display = 'none';
    document.getElementById('mobile-discover-panel').style.display = 'flex';
    document.getElementById('sidePanel').style.display = 'flex';
  } else {
    showSidePanel();
    var obiectiveButton = document.getElementById('iconBtn1');
    if (!obiectiveButton.classList.contains('icon-btn-active')) {
      var img1 = document.getElementById('iconBtn1Image');
      img1.src = 'Stairs.svg';
      obiectiveButton.classList.toggle('icon-btn-active');
      var img2 = document.getElementById('iconBtn2Image');
      img2.src = 'Sliders.svg';
      document.getElementById('iconBtn2').classList.toggle('icon-btn-active');
      document.getElementById('obiective-panel').style.display = '';
      document.getElementById('filtre-panel').style.display = 'none';
    }
  }
}

function showFiltre() {
  if (window.matchMedia("(max-width: 550px)").matches) {
    cleanupMobilePanels();
    document.getElementById('mobile-discover-panel').style.display = 'none';
    document.getElementById('mobile-filters-panel').style.display = 'flex';
    document.getElementById('sidePanel').style.display = 'flex';
  } else {
    showSidePanel();
    var filtreButton = document.getElementById('iconBtn2');
    if (!filtreButton.classList.contains('icon-btn-active')) {
      var img1 = document.getElementById('iconBtn1Image');
      img1.src = 'StairsBlack.svg';
      document.getElementById('iconBtn1').classList.toggle('icon-btn-active');
      var img2 = document.getElementById('iconBtn2Image');
      img2.src = 'SlidersWhite.svg';
      filtreButton.classList.toggle('icon-btn-active');
      document.getElementById('obiective-panel').style.display = 'none';
      document.getElementById('filtre-panel').style.display = '';
    }
  }
}


function showSidePanel() {
  var panel = document.getElementById('sidePanel');
  const currentLeft = parseInt(window.getComputedStyle(panel).left, 10) || 0;
  var img3 = document.getElementById('iconBtn3Image');
  var btn =  document.getElementById('iconBtn3');
  if (currentLeft < 0) {
    panel.style.left = '0px';
    btn.style.left = '320px';
    img3.src = 'CaretLeft.svg';
    var dynamicLabelContainer = document.getElementById("dynamicLabelContainer");
    dynamicLabelContainer.style.left = '420px';
    isPanelHidden = false;
    if (!window.matchMedia("(max-width: 550px)").matches) {
      closeArticlesHeader();
    }
    const card = document.querySelector('.card');
    if (!card.classList.contains('hidden-element')) {
       const leftLimit = 375;
       const cardLeft = parseInt(window.getComputedStyle(card).left, 10) || 0;
       if (cardLeft <= leftLimit) {
          card.classList.add('hidden-element');
          if (lastClickedFeatureCategory && lastClickedFeatureName) {
            updateIconState(lastClickedFeatureName, `${iconPaths[lastClickedFeatureCategory]}_normal`);
            lastClickedFeatureName = null;
            lastClickedFeatureCategory = null;
          }
       }
    }
    return true;
  }
  return false;
}

function toggleSidePanel() {
  var panel = document.getElementById('sidePanel');
  var img3 = document.getElementById('iconBtn3Image');
  var btn = document.getElementById('iconBtn3');
  if (!showSidePanel()) {
    panel.style.left = '-320px';
    btn.style.left = '0px';
    img3.src = 'CaretRight.svg';
    var dynamicLabelContainer = document.getElementById("dynamicLabelContainer");
    dynamicLabelContainer.style.left = '120px';
    isPanelHidden = true;
    if (!window.matchMedia("(max-width: 550px)").matches) {
      wasSidePanelClosedArticles = true;
      wasSidePanelClosedEngage = true;
    }
  } else {
    if (!window.matchMedia("(max-width: 550px)").matches) {
      wasSidePanelClosedArticles = false;
      wasSidePanelClosedEngage = false;
    }
  }
}

function activateOrDeactivateCancelButton() {
  const cancelBtn = document.getElementById('cancelbtn');

  var checkboxes = Array.from(document.querySelectorAll('.custom-checkbox input[type="checkbox"]'))
                        .filter(checkbox => checkbox.id !== 'selectAllInput' && checkbox.id !== 'mobileSelectAllInput');
  const isAnyChecked = checkboxes.some(cb => cb.checked);

  if (document.querySelector('.button-clasare-active') || isAnyChecked) {
      if (cancelBtn) cancelBtn.classList.add('anuleaza-button-active');

      if (window.matchMedia("(max-width: 550px)").matches) {
        const filtersButton = document.getElementById('mobile-toolbar-filters');
        if (filtersButton) {
          filtersButton.classList.add('active');
        }
      }
  } else {
      if (cancelBtn) cancelBtn.classList.remove('anuleaza-button-active');

      if (window.matchMedia("(max-width: 550px)").matches) {
        const filtersButton = document.getElementById('mobile-toolbar-filters');
        if (filtersButton) {
          filtersButton.classList.remove('active');
        }
      }
  }
}

var clasare = '';

function buttonClasareClicked(element) {
  const currentlyActive = document.querySelector('.button-clasare-active');
  let idToToggle;
  if (currentlyActive && currentlyActive.id !== element.id) {
      idToToggle = currentlyActive.id;
      currentlyActive.classList.remove('button-clasare-active');
  }

  let oldClasare = clasare;
  if (element.classList.contains('button-clasare-active')) {
    clasare = '';
    idToToggle = element.id;
  } else {
    clasare = element.textContent;
    idToToggle = clasareToId[clasare];
  }

  element.classList.toggle('button-clasare-active');

  toggleClasareLabel(idToToggle, oldClasare, clasare);

  activateOrDeactivateCancelButton();
  updateLayerWithFilters();
  populateGalleryContainer();
}

function toggleClasareLabel(clasareId, oldClasare, newClasare) {
  let container = document.getElementById("dynamicLabelContainer");

  const clasareToOposite = {
    "historicalMonument" : "unclassified",
    "unclassified" : "historicalMonument",
  };

  if (oldClasare !== '') {
    const index = Array.from(container.children)
                       .findIndex(child => child.id == ((newClasare !== '' && oldClasare !== newClasare ? clasareToOposite[clasareId] : clasareId) + "Label" ));
    container.removeChild(container.children[index]);
    if (container.children.length == 0) {
      container.style.display = 'none';
    }
  }

  if (newClasare === '') {
    return;
  }

  let label = document.createElement("div");
  label.id = clasareId + "Label";
  label.classList.add("dynamic-label");
  label.innerHTML = `<span class="dynamic-label-text">${newClasare}</span> <span class="dynamic-label-close-btn" onclick="removeClasareLabel('${clasareId}')"></span>`;
  container.appendChild(label);
  if (container.children.length > 0) {
    container.style.display = 'flex';
  }
}

function removeClasareLabel(clasareId) {
  let container = document.getElementById("dynamicLabelContainer");

  const index = Array.from(container.children)
                      .findIndex(child => child.id == clasareId + "Label");

  container.removeChild(Array.from(container.children)[index]);

  if (container.children.length == 0) {
    container.style.display = 'none';
  }

  clasare = '';

  let btn = document.querySelector('.button-clasare-active');
  btn.classList.toggle('button-clasare-active');

  activateOrDeactivateCancelButton();
  updateLayerWithFilters();
  populateGalleryContainer();
}

var orgs = []
var periods = []
var styles = []
document.addEventListener('DOMContentLoaded', function() {
  // Select all checkbox inputs within labels having the class 'custom-checkbox'
  var checkboxes = Array.from(document.querySelectorAll('.custom-checkbox input[type="checkbox"]'))
                        .filter(checkbox => checkbox.id !== 'selectAllInput' && checkbox.id !== 'mobileSelectAllInput');

  // Add an event listener to each checkbox
  checkboxes.forEach(function(checkbox) {
      checkbox.addEventListener('change', function() {
          const labelText = this.parentNode.textContent.trim();
          let targetArray;
          let valueToStore = labelText;

          if (checkbox.id.startsWith('period-') || checkbox.id.startsWith('mobile-period-')) {
              targetArray = periods;
              valueToStore = labelText.replace(/\s/g, '');
          } else if (checkbox.id.startsWith('style-') || checkbox.id.startsWith('mobile-style-')) {
              targetArray = styles;
          } else {
              targetArray = orgs;
          }

          if (this.checked) {
              if (!targetArray.includes(valueToStore)) {
                  targetArray.push(valueToStore);
              }
          } else {
              const index = targetArray.indexOf(valueToStore);
              if (index > -1) {
                  targetArray.splice(index, 1);
              }
          }

          const card = document.querySelector('.card');
          card.classList.add('hidden-element');
          if (lastClickedFeatureCategory && lastClickedFeatureName) {
            updateIconState(lastClickedFeatureName, `${iconPaths[lastClickedFeatureCategory]}_normal`);
            lastClickedFeatureName = null;
            lastClickedFeatureCategory = null;
          }
          toggleDynamicCheckboxLabel(this); // TODO PHONE

          activateOrDeactivateCancelButton();
          updateLayerWithFilters();
          populateGalleryContainer();
      });
  });
  if (!initialEventsFetchPromise) { // Ensure it's only called once
    initialEventsFetchPromise = fetchAndPrepareInitialEventData();
  }
  if (!initialEventTypesFetchPromise) {
    initialEventTypesFetchPromise = fetchAndPrepareEventsFilterData('Evtype', dynamicEventTypes, "Name", false);
  }
  if (!initialKeywordsFetchPromise) {
    initialKeywordsFetchPromise = fetchAndPrepareEventsFilterData('Keywords', dynamicKeywords, "Name", true);
  }
});

function onAnuleazaClick(element) {
  if (element.classList.contains('anuleaza-button-active')) {
    var checkboxes = Array.from(document.querySelectorAll('.custom-checkbox input[type="checkbox"]'))
                          .filter(checkbox => checkbox.id !== 'selectAllInput' && checkbox.id !== 'mobileSelectAllInput');
    checkboxes.forEach(cb => cb.checked = false);

    checkboxes.forEach(cb => toggleDynamicCheckboxLabel(cb)); // TODO PHONE

    // Just for Desktop
    // var clasareButtons = document.querySelectorAll('.button-clasare-active');
    // clasareButtons.forEach(cb => cb.classList.remove('button-clasare-active'));

    element.classList.remove('anuleaza-button-active');

    if (clasare !== '') {
      removeClasareLabel(clasareToId[clasare]); // TODO PHONE
    }

    orgs = [];
    periods = [];
    styles = [];
    clasare = '';

    updateLayerWithFilters();
    populateGalleryContainer();
  }
}

function toggleDynamicCheckboxLabel(checkbox) {
  const labelId = checkbox.id + "Label";
  let label = document.getElementById(labelId);

  if (checkbox.checked) {
    if (!label) {
      // Create the label element if it doesn't exist
      label = document.createElement("div");
      label.id = labelId;
      label.classList.add("dynamic-label");
      const labelText = checkbox.parentNode.textContent.trim(); // Get text from the custom-checkbox
      label.innerHTML = `<span class="dynamic-label-text">${labelText}</span> <span class="dynamic-label-close-btn" onclick="removeDynamicLabel('${checkbox.id}')"></span>`;
      const container = document.getElementById("dynamicLabelContainer")
      container.appendChild(label);
      if (container.children.length > 0) {
        container.style.display = 'flex';
      }
    }
  } else if (label) {
      if (label.parentNode.children.length == 1) {
        label.parentNode.style.display = 'none';
      }
      label.parentNode.removeChild(label);
  }
}

function removeDynamicLabel(checkboxId) {
  const checkbox = document.getElementById(checkboxId);
  const label = document.getElementById(checkboxId + "Label");

  if (checkbox && label) {
    checkbox.checked = false; // Uncheck the checkbox
    if (label.parentNode.children.length == 1) {
      label.parentNode.style.display = 'none';
    }
    label.parentNode.removeChild(label);

    const labelText = checkbox.parentNode.textContent.trim();
    let valueToRemove = labelText;
    let targetArray;

    if (checkbox.id.startsWith('period-') || checkbox.id.startsWith('mobile-period-')) {
        targetArray = periods;
        valueToRemove = labelText.replace(/\s/g, ''); // "1701 - 1800" -> "1701-1800"
    } else if (checkbox.id.startsWith('style-') || checkbox.id.startsWith('mobile-style-')) {
        targetArray = styles;
    } else {
        targetArray = orgs;
    }

    const index = targetArray.indexOf(valueToRemove);
    if (index > -1) {
        targetArray.splice(index, 1);
    }

    activateOrDeactivateCancelButton();
    updateLayerWithFilters();
    populateGalleryContainer();
    const card = document.querySelector('.card');
    card.classList.add('hidden-element');
    if (lastClickedFeatureCategory && lastClickedFeatureName) {
      updateIconState(lastClickedFeatureName, `${iconPaths[lastClickedFeatureCategory]}_normal`);
      lastClickedFeatureName = null;
      lastClickedFeatureCategory = null;
    }
  }
}

function mapZoomIn() {
  map.zoomIn();
}

function mapZoomOut() {
  map.zoomOut();
}

function replaceDiacritics(str) {
  const diacriticsMap = {
    'ă': 'a', 'Ă': 'A',
    'â': 'a', 'Â': 'A',
    'î': 'i', 'Î': 'I',
    'ș': 's', 'Ș': 'S',
    'ț': 't', 'Ț': 'T',
  };
  return str.split('').map(char => diacriticsMap[char] || char).join('');
}

function titleToPicsDir(title) {
  title = title.trim();
  // Replace diacritics
  let result = replaceDiacritics(title);

  // Replace spaces with underscores
  result = result.replace(/-/g, '').replace(/\s+/g, ' ').replace(/ /g, '_').replace(/\//g, '').replace(/'/g, '');

  // Drop a trailing "+" from the final string
  if (result.endsWith('+')) {
    result = result.slice(0, -1);
  }

  // Convert the result to lowercase
  return result.toLowerCase();
}

function titleToLink(title) {
  if (customLinks.hasOwnProperty(title)) {
    return customLinks[title];
  }

  title = title.trim();

  let result = replaceDiacritics(title);

  result = result.replace(/\s+/g, '-');

  result = result.replace(/[^a-zA-Z0-9-]/g, '');

  return result.toLowerCase();
}

var currentImageIndex = 0;
var currentImageDir = '';

function buildPicPath(subDir, picNum) {
  const mainPicsDir = "pics";
  return mainPicsDir + '/' + subDir + '/' + picNum + '.jpg';
}

function openReadMore(elementOrFeatureName) {
  let feature;
  let title, categoryName, address, fbLink, siteLink, instaLink, mapsLink;
  let featurePicsDir, numFeaturePics;

  if (typeof elementOrFeatureName === 'string') {
      // Called with a feature name (e.g., from event detail panel)
      const featureName = elementOrFeatureName;
      feature = nameToFeature[featureName];
      if (!feature) {
          console.error("Feature not found for Read More:", featureName);
          return;
      }
      title = feature.properties.Name;
      const categoriesKey = `Categories_${currentLang}`;
      categoryName = feature.properties[categoriesKey].split(/[,;]+/).map(s => s.trim())[0];
      address = feature.properties.Address;
      fbLink = fixLinkIfNeeded(feature.properties.FB);
      siteLink = fixLinkIfNeeded(feature.properties.Site);
      instaLink = fixLinkIfNeeded(feature.properties.Insta);
      mapsLink = fixLinkIfNeeded(feature.properties.Gmaps);

      const defaultPicsDir = 'cinema_union'; // Default if no specific pics
      const featurePicsDirName = titleToPicsDir(title);
      featurePicsDir = featurePicsDirName in picsDirToNum ? featurePicsDirName : defaultPicsDir;
      numFeaturePics = picsDirToNum[featurePicsDir] || 0;

  } else if (elementOrFeatureName && elementOrFeatureName.parentNode) {
      const card = elementOrFeatureName.parentNode;
      title = card.querySelector('.card-title').textContent;
      categoryName = card.querySelector('.card-category').textContent;
      // For address and links, it's better to get them from the feature object via title
      feature = nameToFeature[title];
      if (!feature) {
           console.error("Feature not found for Read More from card element:", title);
           return;
      }
      address = feature.properties.Address; // Get from feature for consistency
      fbLink = fixLinkIfNeeded(feature.properties.FB);
      siteLink = fixLinkIfNeeded(feature.properties.Site);
      instaLink = fixLinkIfNeeded(feature.properties.Insta);
      mapsLink = fixLinkIfNeeded(feature.properties.Gmaps);

      const defaultPicsDir = 'cinema_union';
      const featurePicsDirName = titleToPicsDir(title);
      featurePicsDir = featurePicsDirName in picsDirToNum ? featurePicsDirName : defaultPicsDir;
      numFeaturePics = picsDirToNum[featurePicsDir] || 0;
  } else {
      console.error("Invalid argument passed to openReadMore:", elementOrFeatureName);
      return;
  }

  let readMoreContainer;
  if (window.matchMedia("(max-width: 550px)").matches) {
      readMoreContainer = document.querySelector('.read-more-container-mobile');
  } else {
      readMoreContainer = document.querySelector('.read-more-container');
  }

  readMoreContainer.querySelector(".read-more-title").textContent = title;
  readMoreContainer.querySelector(".read-more-address-text-content").textContent = address;

  let addressIconReadMore;
  if (window.matchMedia("(max-width: 550px)").matches) {
      addressIconReadMore = document.getElementById('read-more-address-icon-mobile');
  } else {
      addressIconReadMore = document.getElementById('read-more-address-icon');
  }
  // Use categoryName to get the icon path
  addressIconReadMore.src = `pins/${iconPaths[categoryName]}_normal.png`;

  const linksData = [ // Use the 'linksData' naming to avoid conflict with 'links' in createAndDisplayCard
      { id: '#fb-link', propertyValue: fbLink },
      { id: '#site-link', propertyValue: siteLink },
      { id: '#insta-link', propertyValue: instaLink },
      { id: '#maps-link', propertyValue: mapsLink }
  ];

  linksData.forEach(linkInfo => {
      const element = readMoreContainer.querySelector(linkInfo.id);
      if (element) {
          element.removeEventListener('click', preventDefaultAction, true);
          element.href = linkInfo.propertyValue; // Use the value derived above
          if (element.href && !element.href.includes("localhost") && !element.href.includes("harta-buc") && !element.href.includes("filtru") && element.href !== "#") {
            element.setAttribute('target', '_blank');
            element.setAttribute('rel', 'noopener noreferrer');
          } else {
            element.removeAttribute('target');
            element.removeAttribute('rel');
            if (element.href === "#" || (element.href && (element.href.includes("localhost") || element.href.includes("harta-buc")))) {
                element.addEventListener('click', preventDefaultAction, true);
            }
          }
      }
  });

  currentImageIndex = 0;
  currentImageDir = featurePicsDir;

  let imageContainer = readMoreContainer.querySelector('.image-gallery-container');
  let mainImage = imageContainer.querySelector('.main-image');
  var mainImgElement = mainImage.querySelector('img');

  if (numFeaturePics > 0) {
      mainImgElement.src = buildPicPath(featurePicsDir, 0);
      if (!window.matchMedia("(max-width: 550px)").matches) {
          mainImgElement.setAttribute('onclick', `openLightbox('${buildPicPath(featurePicsDir, 0)}', 0)`);
      } else {
          mainImgElement.setAttribute('onclick', `openLightboxMobile('${featurePicsDir}')`);
          mainImage.querySelector('.num-pics-label').textContent = '1 / ' + numFeaturePics;
      }
  } else { // Handle case with no pictures
      mainImgElement.src = ''; // Clear image or set placeholder
      if (window.matchMedia("(max-width: 550px)").matches) {
           mainImage.querySelector('.num-pics-label').textContent = '';
      }
  }

  if (!window.matchMedia("(max-width: 550px)").matches) {
      var thumbnailsList = document.querySelectorAll('.thumbnails .thumbnail');
      var thumbnails = Array.from(thumbnailsList);

      thumbnails.sort(function(a, b) {
        let idA = a.id.toUpperCase();
        let idB = b.id.toUpperCase();
        if (idA < idB) {
            return -1;
        }
        if (idA > idB) {
            return 1;
        }
        return 0;
      });

      for (let i = 0; i < 4; i++) { // for thumb0 to thumb3
          var imgElement = thumbnails[i].querySelector('img'); // thumbnails are 0-indexed
          if (i < numFeaturePics - 1) { // -1 because main image is pic 0, thumbs start from pic 1
              imgElement.src = buildPicPath(featurePicsDir, i + 1);
              imgElement.setAttribute('onclick', `openLightbox('${buildPicPath(featurePicsDir, i + 1)}', ${i + 1})`);
              imgElement.classList.remove('hidden');
          } else {
              imgElement.src = ''; // Clear src
              imgElement.removeAttribute('onclick');
              imgElement.classList.add('hidden');
          }
      }
      document.querySelector('.thumbnails').style.display = (numFeaturePics > 1) ? 'flex' : 'none';
      document.getElementById('sidePanel').style.display = 'none';
  }

  readMoreContainer.style.display = '';
  refreshOrFillReadMore(feature);

  readMoreContainer.scrollTop = 0;
  if (window.matchMedia("(max-width: 550px)").matches) {
      let readMoreContainerMobileFixed = document.querySelector('.read-more-container-mobile-fixed');
      if (readMoreContainerMobileFixed) readMoreContainerMobileFixed.scrollTop = 0;
  } else {
      let readMoreContainerContent = document.querySelector('.read-more-content-container');
      if (readMoreContainerContent) readMoreContainerContent.scrollTop = 0;
  }

  window.location.hash = titleToLinkName[title]; // title is already defined

  if (window.matchMedia("(max-width: 550px)").matches) {
    document.getElementById('fb-share-read-more-mobile').href = encodeURIComponent(window.location.href);
  } else {
    document.getElementById('fb-share-read-more-desktop').href = encodeURIComponent(window.location.href);
  }
}

function refreshOrFillReadMore(featureToRefresh) {
  let readMoreContainer;
  const isMobile = window.matchMedia("(max-width: 550px)").matches;
  if (isMobile) {
    readMoreContainer = document.querySelector('.read-more-container-mobile');
  } else {
    readMoreContainer = document.querySelector('.read-more-container');
  }

  // If the read-more container isn't visible, there's nothing to refresh.
  if (!readMoreContainer || readMoreContainer.style.display === 'none') {
    return;
  }

  let feature = featureToRefresh;
  let currentFeatureName; // Use this variable to store the name

  if (!feature) {
      // Try to get the feature name from the currently displayed title in the Read More panel
      const titleElement = readMoreContainer.querySelector(".read-more-title");
      if (titleElement && titleElement.textContent) {
          currentFeatureName = titleElement.textContent;
          feature = nameToFeature[currentFeatureName];
      }
  } else {
      // If a feature is passed in, use its name
      currentFeatureName = feature.properties.Name;
  }

  if (!feature) {
      console.error("Feature not found in refreshOrFillReadMore. Cannot determine current feature name.");
      return;
  }

  const orgsKey = `Orgs_${currentLang}`;
  let orgType = feature.properties[orgsKey].split(/[,;]+/).map(s => s.trim())[0];
  readMoreContainer.querySelector(".read-more-org").textContent = orgType;

  const categoriesKey = `Categories_${currentLang}`;
  const category = feature.properties[categoriesKey].split(/[,;]+/).map(s => s.trim())[0];
  let readMoreCategory = readMoreContainer.querySelector(".read-more-category");
  readMoreCategory.textContent = category;
  readMoreCategory.style.color = `${getCategoryColor(category)}`;

  const descriereKey = `Descriere_${currentLang}`;
  let contentArr = feature.properties[descriereKey].split('\n').filter(l => l.length > 0 && l.trim() !== '');
  let readMoreDesr, readMoreOffer, readMoreUploaded, photosBy;
  if (!isMobile) {
    readMoreDesr = document.getElementById("read-more-description");
    readMoreOffer = document.getElementById("read-more-offer");
    readMoreUploaded = document.getElementById("read-more-uploaded");
    photosBy = document.getElementById("photosby-desktop");
  } else {
    readMoreDesr = document.getElementById("read-more-description-mobile");
    readMoreOffer = document.getElementById("read-more-offer-mobile");
    readMoreUploaded = document.getElementById("read-more-uploaded-mobile");
    photosBy = document.getElementById("photosby-mobile");
  }

  let moreToFollowTxt = currentLang === 'ro' ? "Mai multe detalii în curând." : "More details soon.";
  readMoreDesr.textContent = contentArr.length > 0 ? contentArr[0] : moreToFollowTxt;
  readMoreOffer.textContent = contentArr.length > 1 ? contentArr[1] : moreToFollowTxt;

  let articleByTxt = currentLang === 'ro' ? "Articol încărcat de " : "Article uploaded by ";
  let photoTxt = currentLang === 'ro' ? "Fotografii: " : "Photos: ";

  if (contentArr.length == 3) {
    readMoreUploaded.style.display = '';
    readMoreUploaded.innerHTML = "<i>" + articleByTxt + contentArr[2] + ".</i>";
    photosBy.textContent = photoTxt + contentArr[2];
  } else {
    readMoreUploaded.style.display = 'none';
    photosBy.textContent = photoTxt + "Rareș Toma";
  }
  if (currentFeatureName) {
      populateRelatedEventsForReadMore(currentFeatureName);
      const currentCategoriesKey = `Categories_${currentLang}`;
      const currentFeaturePrimaryCategory = feature.properties[currentCategoriesKey] ? feature.properties[currentCategoriesKey].split(/[,;]+/)[0].trim() : null;
      const currentFeatureCoords = feature.geometry.coordinates; // Ensure feature has geometry.coordinates

      if (currentFeaturePrimaryCategory && currentFeatureCoords) {
          populateRelatedFeaturesByCategory(currentFeatureName, currentFeaturePrimaryCategory, currentFeatureCoords);
      } else {
          // Hide the section if critical data is missing for this refresh
          const isMobileContext = window.matchMedia("(max-width: 550px)").matches;
          const wrapperId = isMobileContext ? 'categoryRelatedFeaturesWrapperMobile' : 'categoryRelatedFeaturesWrapperDesktop';
          const relatedCatWrapper = document.getElementById(wrapperId);
          if(relatedCatWrapper) relatedCatWrapper.style.display = 'none';
          console.warn("Missing category or coords in refreshOrFillReadMore for related features by category.");
      }
  }
}

function closeReadMore() {
  let readMoreContainer;
  if (window.matchMedia("(max-width: 550px)").matches) {
    readMoreContainer = document.querySelector('.read-more-container-mobile');
  } else {
    readMoreContainer = document.querySelector('.read-more-container');
    if (readMoreContainer.style.display !== 'none') {
      var thumbnailsList = document.querySelectorAll('.thumbnails .thumbnail');
      var thumbnails = Array.from(thumbnailsList);

      thumbnails.sort(function(a, b) {
          let idA = a.id.toUpperCase();
          let idB = b.id.toUpperCase();
          if (idA < idB) {
              return -1;
          }
          if (idA > idB) {
              return 1;
          }
          return 0;
      });

      thumbnails.forEach(function(thumbnail, index) {
        var imgElement = thumbnail.querySelector('img');
        imgElement.src = '';
        imgElement.onclick = null;
        imgElement.classList.remove('hidden');
      });

      document.querySelector('.thumbnails').style.display = 'flex';

      document.getElementById('sidePanel').style.display = 'flex';
    }
  }

  let imageContainer = readMoreContainer.querySelector('.image-gallery-container');
  let mainImage = imageContainer.querySelector('.main-image');
  var mainImgElement = mainImage.querySelector('img');
  mainImgElement.onclick = null;
  mainImgElement.src = '';

  const desktopRelatedWrapper = document.getElementById('readMoreRelatedEventsWrapperDesktop');
  if (desktopRelatedWrapper) desktopRelatedWrapper.style.display = 'none';
  const mobileRelatedWrapper = document.getElementById('readMoreRelatedEventsWrapperMobile');
  if (mobileRelatedWrapper) mobileRelatedWrapper.style.display = 'none';

  const desktopRelatedContainer = document.getElementById('readMoreRelatedEventsContainerDesktop');
  if (desktopRelatedContainer) desktopRelatedContainer.innerHTML = ''; // Clear cards
  const mobileRelatedContainer = document.getElementById('readMoreRelatedEventsContainerMobile');
  if (mobileRelatedContainer) mobileRelatedContainer.innerHTML = ''; // Clear cards

  const desktopCatRelatedWrapper = document.getElementById('categoryRelatedFeaturesWrapperDesktop');
  if (desktopCatRelatedWrapper) desktopCatRelatedWrapper.style.display = 'none';
  const mobileCatRelatedWrapper = document.getElementById('categoryRelatedFeaturesWrapperMobile');
  if (mobileCatRelatedWrapper) mobileCatRelatedWrapper.style.display = 'none';

  const desktopCatRelatedContainer = document.getElementById('categoryRelatedFeaturesContainerDesktop');
  if (desktopCatRelatedContainer) desktopCatRelatedContainer.innerHTML = '';
  const mobileCatRelatedContainer = document.getElementById('categoryRelatedFeaturesContainerMobile');
  if (mobileCatRelatedContainer) mobileCatRelatedContainer.innerHTML = '';

  history.replaceState(null, null, ' ');
  readMoreContainer.style.display = 'none';
}

function addLightboxKeyboardControls() {
  document.addEventListener('keydown', lightboxKeydownFunction);
}

function removeLightboxKeyboardControls() {
  document.removeEventListener('keydown', lightboxKeydownFunction);
}

function openLightbox(src, index, totalImages = null) {
  const lightbox = document.getElementById('lightbox');
  const imgEl = document.getElementById('lightbox-img');
  const prevArrow = lightbox.querySelector('.lightbox-prev');
  const nextArrow = lightbox.querySelector('.lightbox-next');
  const counter = lightbox.querySelector('.lightbox-counter');

  imgEl.src = src;
  lightbox.style.display = 'flex';
  currentImageIndex = index;

  if (totalImages === 1) {
    // Single image mode: Set counter to "1 / 1" and hide navigation arrows.
    counter.textContent = '1 / 1';
    if (prevArrow) prevArrow.style.display = 'none';
    if (nextArrow) nextArrow.style.display = 'none';
  } else {
    // Gallery mode (original behavior)
    counter.textContent = (currentImageIndex + 1) + ' / ' + picsDirToNum[currentImageDir];
    if (prevArrow) prevArrow.style.display = 'block';
    if (nextArrow) nextArrow.style.display = 'block';
  }

  addLightboxKeyboardControls();
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  const prevArrow = lightbox.querySelector('.lightbox-prev');
  const nextArrow = lightbox.querySelector('.lightbox-next');

  lightbox.style.display = 'none';
  currentImageIndex = 0; // Reset index

  // IMPORTANT: Reset arrow visibility for the next time a gallery is opened
  if (prevArrow) prevArrow.style.display = 'block';
  if (nextArrow) nextArrow.style.display = 'block';

  removeLightboxKeyboardControls();
}

function lightboxKeydownFunction(event) {
  const prevArrow = document.querySelector('#lightbox .lightbox-prev');

  switch (event.key) {
    case 'ArrowLeft':
      // Only change image if arrows are visible (i.e., not in single-image mode)
      if (prevArrow && prevArrow.style.display !== 'none') {
        changeImage(-1);
      }
      break;
    case 'ArrowRight':
      // Only change image if arrows are visible
      if (prevArrow && prevArrow.style.display !== 'none') {
        changeImage(1);
      }
      break;
    case 'Escape':
      closeLightbox();
      break;
    default:
      break;
  }
}

function changeImage(step) {
  currentImageIndex += step;
  const totalImages = picsDirToNum[currentImageDir];
  if (currentImageIndex >= totalImages) {
    currentImageIndex = currentImageIndex % totalImages;
  } else if (currentImageIndex < 0) {
    currentImageIndex = totalImages - 1;
  }

  document.getElementById('lightbox-img').src = buildPicPath(currentImageDir, currentImageIndex);
  // Update the counter
  document.querySelector('.lightbox-counter').textContent = (currentImageIndex + 1) + ' / ' + totalImages;
}

function resetEventFiltersSimple() {
  const cancelAllPill = filterLabelsContainer.querySelector('.dynamic-label[data-cancel-all]');
  if (cancelAllPill && filterLabelsContainer.style.display !== 'none') {
    const cancelAllCloseButton = cancelAllPill.querySelector('.dynamic-label-close-btn');
    if (cancelAllCloseButton) {
        cancelAllCloseButton.click();
    } else {
        cancelAllPill.click(); // Fallback
    }
  }

  const calendarClearButton = document.querySelector('#calendar-btn .calendar-clear-btn');
  if (calendarClearButton && calendarClearButton.style.display !== 'none') {
    calendarClearButton.click();
  }

  const desktopSearchInput = document.querySelector('.filter-bar .search-bar-events input[type="search"]');
  if (desktopSearchInput) {
    desktopSearchInput.value = '';
  }

  const mobileSearchInput = document.querySelector('#search-bar-events-mobile input[type="search"]');
  if (mobileSearchInput) {
    mobileSearchInput.value = '';
  }

  currentSearchQuery = '';
  applyAllEventsFiltersAndPopulate();
}

function closeEvents() {
    document.getElementById('events-container').style.display = 'none';
    resetEventFiltersSimple();
    window.location.hash = '';
    if (window.matchMedia("(max-width: 550px)").matches) {
      resetToolbarToMapView();
    }
}

let masterEventList = [];
let dynamicEventTypes = [];
let dynamicKeywords = [];
let currentlyDisplayedEventsForCount = [];
let initialEventsFetchPromise = null;
let initialEventTypesFetchPromise = null;
let initialKeywordsFetchPromise = null;
let currentOpenEventData = null;
let currentSearchQuery = '';

// Public values may be kept here, but secret API keys should not be committed.
const AIRTABLE_API_KEY = 'YOUR_AIRTABLE_API_KEY';
const AIRTABLE_BASE_ID = 'appz7cGVGynDa0R4z';

function formatEventDateTime(isoStartDate, isoEndDate) {
  if (!isoStartDate) return "Dată neprecizată";

  const startDate = new Date(isoStartDate);
  const endDate = isoEndDate ? new Date(isoEndDate) : null;

  // Language-specific arrays (ensure currentLang is globally available or passed)
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'ro';
  const daysOfWeek = {
    ro: ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"],
    en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  };
  const months = {
    ro: ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Noi", "Dec"],
    en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  };

  const startDay = startDate.getDate();
  const startMonthIndex = startDate.getMonth();
  const startYear = startDate.getFullYear();
  const startHours = String(startDate.getHours()).padStart(2, '0');
  const startMinutes = String(startDate.getMinutes()).padStart(2, '0');
  const startDayName = daysOfWeek[lang][startDate.getDay()];
  const startMonthName = months[lang][startMonthIndex];

  const startTime = `${startHours}:${startMinutes}`;

  // Case 1: No isoEndDate (current behavior)
  if (!endDate) {
    return `${startDayName}, ${startDay} ${startMonthName} ${startYear} • ${startTime}`;
  }

  // With isoEndDate
  const endDay = endDate.getDate();
  const endMonthIndex = endDate.getMonth();
  const endYear = endDate.getFullYear();
  const endHours = String(endDate.getHours()).padStart(2, '0');
  const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
  const endMonthName = months[lang][endMonthIndex];
  const endTime = `${endHours}:${endMinutes}`;

  // Case 2: Same day event
  if (startYear === endYear && startMonthIndex === endMonthIndex && startDay === endDay) {
    return `${startDayName}, ${startDay} ${startMonthName} ${startYear} • ${startTime} - ${endTime}`;
  }

  // Case 3: Different day, same month and year
  if (startYear === endYear && startMonthIndex === endMonthIndex) {
    return `${startDay} - ${endDay} ${startMonthName} ${startYear} • ${startTime} - ${endTime}`;
  }

  // Case 4: Different month, same year
  if (startYear === endYear) {
    return `${startDay} ${startMonthName} - ${endDay} ${endMonthName} ${startYear} • ${startTime} - ${endTime}`;
  }

  // Case 5: Different year (implies different month and day as well)
  return `${startDay} ${startMonthName} ${startYear} - ${endDay} ${endMonthName} ${endYear} • ${startTime} - ${endTime}`;
}

async function fetchAllAirtableRecords(apiKey, baseId, tableNameOrId, options = {}) {
  let allRecords = [];
  let offset = null; // For pagination

  // Construct the base URL
  let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableNameOrId)}`;

  // Add any specified options to the URL as query parameters
  const queryParams = new URLSearchParams();
  for (const key in options) {
    if (options.hasOwnProperty(key)) {
      // If 'fields' or 'sort' is an array, Airtable expects them as repeated parameters
      if ((key === 'fields' || key === 'sort') && Array.isArray(options[key])) {
        // For sort, Airtable expects sort[i][field] and sort[i][direction]
        if (key === 'sort') {
          options[key].forEach((sortObject, index) => {
              queryParams.append(`sort[${index}][field]`, sortObject.field);
              if (sortObject.direction) {
                  queryParams.append(`sort[${index}][direction]`, sortObject.direction);
              }
          });
        } else { // For fields
          options[key].forEach(value => queryParams.append(`${key}[]`, value));
        }
      } else {
        queryParams.append(key, options[key]);
      }
    }
  }

  do {
    // Create a new URLSearchParams object for the current request to handle offset correctly
    const currentQueryParams = new URLSearchParams(queryParams.toString());
    if (offset) {
      currentQueryParams.append('offset', offset);
    }

    const requestUrl = `${url}${currentQueryParams.toString() ? '?' + currentQueryParams.toString() : ''}`;

    try {
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Airtable API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      allRecords = allRecords.concat(data.records);
      offset = data.offset; // Get the offset for the next page, if it exists

    } catch (error) {
      console.error('Error fetching page from Airtable:', error);
      throw error; // Re-throw the error to be caught by the caller
    }
  } while (offset); // Continue if Airtable provides an offset (meaning more records)

  return allRecords;
}

async function fetchAndPrepareInitialEventData() {
  try {
    const fetchOptions = {
      sort: [{field: "Start", direction: "asc"}] // Sort by Start date/time ascending
    };
    const airtableRecords = await fetchAllAirtableRecords(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, 'Events', fetchOptions);

    masterEventList = airtableRecords.map(record => {
      const fields = record.fields;
      // Basic safety checks for fields
      const imageUrl = (fields.Picture && fields.Picture.length > 0 && fields.Picture[0].url)
                       ? fields.Picture[0].url
                       : 'https://placehold.co/284x180/EAAAC8/EAAAC8'; // Default placeholder

      const eventTypeArray = fields.Event_type || [];
      let categoryString = eventTypeArray.join(' • ');
      if (!categoryString) categoryString = "Necategorisit"; // Default category

      return {
        image: imageUrl,
        category: categoryString,
        title: fields.Title || "Eveniment fără titlu",
        eventTypes: eventTypeArray,
        address: fields.Location || "Locație neprecizată", // Assuming 'Location' field holds address-like info
        time: formatEventDateTime(fields.Start, fields.End), // Use the new formatting function
        airtableFields: fields
      };
    });
  } catch (error) {
    console.error("Failed to load events from Airtable. Falling back to example events.", error);
  }
}

async function fetchAndPrepareEventsFilterData(tableName, targetArray, fieldName = "Name", isKeywords = false) {
  try {
    const records = await fetchAllAirtableRecords(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, tableName, {
        fields: [fieldName],
        sort: [{ field: fieldName, direction: "asc" }]
    });

    if (isKeywords) {
      const keywordNames = records.map(record => record.fields[fieldName]).filter(Boolean);
      targetArray.splice(0, targetArray.length, ...keywordNames);
    } else {
      const typeObjects = records.map(record => ({
        label: record.fields[fieldName].trim(),
        count: 0
      })).filter(item => item.label);
      targetArray.splice(0, targetArray.length, ...typeObjects);
    }
  } catch (error) {
    console.error(`Failed to load ${tableName} from Airtable. Filter list will be empty.`, error);
    targetArray.length = 0; // Clear the array on error
  }
  return targetArray;
}

function calculateAndAssignEventTypeCounts() {
  if (!masterEventList || !dynamicEventTypes || dynamicEventTypes.length === 0) { // Keep initial checks
      if (dynamicEventTypes) {
        dynamicEventTypes.forEach(typeObj => typeObj.count = 0);
      }
      return;
  }

  // Use the globally updated list of *actually displayed* events for counting
  const eventsToCount = currentlyDisplayedEventsForCount; // Use the filtered list

  if (!eventsToCount || eventsToCount.length === 0) {
      dynamicEventTypes.forEach(typeObj => typeObj.count = 0);
      return;
  }

  dynamicEventTypes.forEach(typeObj => {
      typeObj.count = 0; // Reset count
      const typeLabelNormalized = typeObj.label.trim().toLowerCase();

      eventsToCount.forEach(event => { // Iterate over the filtered list
          if (event.eventTypes && Array.isArray(event.eventTypes)) {
              const matchFound = event.eventTypes.some(eventTypeFromEvent =>
                  eventTypeFromEvent && typeof eventTypeFromEvent === 'string' &&
                  eventTypeFromEvent.trim().toLowerCase() === typeLabelNormalized
              );
              if (matchFound) {
                  typeObj.count++;
              }
          }
      });
  });
}

function applyAllEventsFiltersAndPopulate() {
  let eventsToDisplay = [...masterEventList]; // Start with all fetched (and sorted) events

  // 0. Get current date for default filtering (normalized to start of day)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Date Filtering (Default past events OR Calendar Range)
  if (rangeStart) { // rangeStart is global, set by calendar; if set, calendar filter is active
      const calRangeStart = new Date(rangeStart);
      calRangeStart.setHours(0, 0, 0, 0); // Normalize to start of selected day

      const calRangeEnd = rangeEnd ? new Date(rangeEnd) : new Date(rangeStart); // If no rangeEnd, it's a single day selection
      calRangeEnd.setHours(23, 59, 59, 999); // Normalize to end of selected day

      eventsToDisplay = eventsToDisplay.filter(event => {
          if (!event.airtableFields || !event.airtableFields.Start) return false; // Event must have a start date

          const eventStartDate = new Date(event.airtableFields.Start);
          // If no Airtable End date, consider it a single-day event for range checking.
          // Its effective end is the end of its start day.
          const eventEffectiveEndDate = event.airtableFields.End
                                        ? new Date(event.airtableFields.End)
                                        : new Date(new Date(eventStartDate).setHours(23, 59, 59, 999));

          return eventStartDate <= calRangeEnd && eventEffectiveEndDate >= calRangeStart;
      });
  } else { // Default filter: No calendar range selected, so hide past events
      eventsToDisplay = eventsToDisplay.filter(event => {
          if (!event.airtableFields || !event.airtableFields.Start) return false;

          const eventStartDateObj = new Date(event.airtableFields.Start);
          const eventEndDateObj = event.airtableFields.End ? new Date(event.airtableFields.End) : null;

          if (eventEndDateObj) { // Event has an end date
              return eventEndDateObj >= today; // Show if its end date is today or in the future
          } else { // Event only has a start date (treat as ending on its start day)
              const eventStartDayEnd = new Date(eventStartDateObj);
              eventStartDayEnd.setHours(23, 59, 59, 999); // Consider it to end at the end of its start day
              return eventStartDayEnd >= today; // Show if its start day is today or in the future
          }
      });
  }

  // 2. Search Query Filter
  if (currentSearchQuery) {
      const query = currentSearchQuery.trim().toLowerCase();
      eventsToDisplay = eventsToDisplay.filter(ev =>
          (ev.title && typeof ev.title === 'string' && ev.title.toLowerCase().includes(query)) ||
          (ev.category && typeof ev.category === 'string' && ev.category.toLowerCase().includes(query)) ||
          (ev.address && typeof ev.address === 'string' && ev.address.toLowerCase().includes(query))
      );
  }

  // 3. Type Filters
  const selectedTypes = getSelectedFilterValues('#event-type-panel input[type="checkbox"]:checked', '#mobile-type-list input[type="checkbox"]:checked');
  if (selectedTypes.length > 0) {
      eventsToDisplay = eventsToDisplay.filter(event =>
          event.eventTypes && event.eventTypes.some(et => selectedTypes.includes(et.trim().toLowerCase()))
      );
  }

  // 4. Keyword Filters
  const selectedKeywords = getSelectedFilterValues('#keywords-panel input[type="checkbox"]:checked', '#mobile-keywords-list input[type="checkbox"]:checked');
  if (selectedKeywords.length > 0) {
      eventsToDisplay = eventsToDisplay.filter(event =>
          event.airtableFields.Keywords && Array.isArray(event.airtableFields.Keywords) &&
          event.airtableFields.Keywords.some(kw => selectedKeywords.includes(kw.trim().toLowerCase()))
      );
  }

  // 5. Free/Ticket Filters
  const freeEntryDesktop = document.getElementById('free-entry-btn')?.classList.contains('red');
  const ticketDesktop = document.getElementById('ticket-btn')?.classList.contains('red');
  const freeEntryMobile = document.getElementById('mobile-free-entry')?.checked;
  const ticketMobile = document.getElementById('mobile-ticket')?.checked;

  const wantsFree = freeEntryDesktop || freeEntryMobile;
  const wantsTicket = ticketDesktop || ticketMobile;

  if (wantsFree && !wantsTicket) {
      eventsToDisplay = eventsToDisplay.filter(event => event.airtableFields.Entry && event.airtableFields.Entry.trim().toLowerCase() === 'gratuit');
  } else if (wantsTicket && !wantsFree) {
      eventsToDisplay = eventsToDisplay.filter(event => event.airtableFields.Entry && event.airtableFields.Entry.trim().toLowerCase() !== 'gratuit' && event.airtableFields.Entry.trim() !== '');
  }

  currentlyDisplayedEventsForCount = [...eventsToDisplay];

  populateRecentEvents(eventsToDisplay);
}

function getSelectedFilterValues(desktopSelector, mobileSelector) {
  const desktopChecked = Array.from(document.querySelectorAll(desktopSelector)).map(cb => cb.value.trim().toLowerCase());
  const mobileChecked = Array.from(document.querySelectorAll(mobileSelector)).map(cb => {
      let val = cb.value;
      return val.trim().toLowerCase();
  });
  return [...new Set([...desktopChecked, ...mobileChecked])];
}

let calendarInserted = false;
async function toggleEvents(event) {
  event.preventDefault();

  const isDesktop = !window.matchMedia('(max-width: 550px)').matches;
  if (isDesktop) {
    if (document.getElementById('events-container').style.display === '') {
      document.getElementById('events-container').style.display = 'none';
      resetEventFiltersSimple();
      return;
    } else {
      document.getElementById('events-container').style.display = '';
      closeAboutUs();
      closeArticlesHeader();
      closeArticle();
      closeEngage();
      closeArchive();
      window.location.hash = 'events';
    }
  } else {
    cleanupMobilePanels();
    document.getElementById('events-container').style.display = '';
    window.location.hash = 'events';
  }

  if (!calendarInserted) {
    insertCalendarOnce();
    calendarInserted = true;
  }

  if (!initialEventsFetchPromise) {
    console.warn("Initial event fetch promise not set. Consider calling initiateEventDataFetch() earlier.");
    initialEventsFetchPromise = fetchAndPrepareInitialEventData();
  }
  if (!initialEventTypesFetchPromise) {
    initialEventTypesFetchPromise = fetchAndPrepareEventsFilterData('Evtype', dynamicEventTypes, "Name", false);
  }
  if (!initialKeywordsFetchPromise) {
    initialKeywordsFetchPromise = fetchAndPrepareEventsFilterData('Keywords', dynamicKeywords, "Name", true);
  }

  try {
    // Wait for all data to be fetched and prepared
    await Promise.all([
      initialEventsFetchPromise,
      initialEventTypesFetchPromise,
      initialKeywordsFetchPromise
    ]);
    applyAllEventsFiltersAndPopulate();
  } catch (error) {
    console.error("Error awaiting initial event fetch in toggleEvents:", error);
  }

  calculateAndAssignEventTypeCounts();

  if (isDesktop) {
    populateTypeDropdown(dynamicEventTypes);
    populateKeywordsPanel(dynamicKeywords);
  } else {
    populateMobileCategories();
  }

  if (isDesktop) {
    [
      { panelId: 'event-type-panel', type: 'tip' },
      { panelId: 'keywords-panel',  type: 'keyword' }
    ].forEach(({ panelId, type }) => {
      const panelElement = document.getElementById(panelId);
      if (panelElement) {
        panelElement.addEventListener('change', e => {
          if (e.target.matches('input[type="checkbox"]')) {
            const pillDisplayText = e.target.value;
            if (e.target.checked) {
              addFilterPill(type, pillDisplayText, e.target.id);
            } else {
              removeFilterPill(type, pillDisplayText);
            }
            applyAllEventsFiltersAndPopulate();
          }
        });
      }
    });
  } else {
      const mobBtn    = document.getElementById('mobile-events-categories-btn');
      const mobPanel  = document.getElementById('mobile-events-categories-panel');
      const mobApply  = document.getElementById('mobile-apply-categories');

      mobBtn.addEventListener('click', () => {
        mobPanel.classList.add('visible');
        const evcont = document.querySelector('.events-container');
        evcont.classList.add('no-scroll');
      });

      const mobClose = document.getElementById('mobile-close-categories'); // Ensure mobClose is defined
      mobClose.addEventListener('click', () => {
        const mobPanel = document.getElementById('mobile-events-categories-panel'); // Ensure mobPanel is accessible
        mobPanel.classList.remove('visible');
        const evcont = document.querySelector('.events-container');
        if (evcont) { // Check if evcont exists
          evcont.classList.remove('no-scroll');
        }
      });

      const mobCancel = document.getElementById('mobile-cancel-categories'); // Ensure mobCancel is defined
      mobCancel.addEventListener('click', () => {
        const mobPanel = document.getElementById('mobile-events-categories-panel'); // Ensure mobPanel is accessible

        // 1. Deselect all checked "Tipul Evenimentelor" checkboxes
        document.querySelectorAll('#mobile-type-list input[type="checkbox"]:checked').forEach(checkbox => {
          checkbox.click(); // .click() will uncheck it AND trigger its change event
        });

        // 2. Deselect all checked "Cuvinte Cheie" checkboxes
        document.querySelectorAll('#mobile-keywords-list input[type="checkbox"]:checked').forEach(checkbox => {
          checkbox.click(); // .click() will uncheck it AND trigger its change event
        });

        // 3. Deselect "Intrare liberă" checkbox if checked
        const mobileFreeEntryCheckbox = document.getElementById('mobile-free-entry');
        if (mobileFreeEntryCheckbox && mobileFreeEntryCheckbox.checked) {
          mobileFreeEntryCheckbox.click(); // .click() will uncheck it AND trigger its change event
        }

        // 4. Deselect "Bilet" checkbox if checked
        const mobileTicketCheckbox = document.getElementById('mobile-ticket');
        if (mobileTicketCheckbox && mobileTicketCheckbox.checked) {
          mobileTicketCheckbox.click(); // .click() will uncheck it AND trigger its change event
        }

        // 5. Finally, close the mobile categories panel
        mobPanel.classList.remove('visible');
        const evcont = document.querySelector('.events-container');
        if (evcont) { // Check if evcont exists
          evcont.classList.remove('no-scroll');
        }
      });

      mobApply.addEventListener('click', () => {
        mobPanel.classList.remove('visible');
        const evcont = document.querySelector('.events-container');
        evcont.classList.remove('no-scroll'); 
      });

      // whenever any of these lists changes, add/remove that pill immediately:
      [
        { selector: '#mobile-type-list',   type: 'tip' },
        { selector: '#mobile-keywords-list', type: 'keyword' },
      ].forEach(({ selector, type }) => {
        document.querySelector(selector)
          .addEventListener('change', e => {
            if (!e.target.matches('input[type=checkbox]')) return;

            let fullLabelText = e.target.nextSibling.textContent.trim(); // e.g., "Seminar (4)"
            let pillLabelText = fullLabelText; // Default to the full text

            const isMobile = window.matchMedia("(max-width: 550px)").matches;

            // Only modify for 'tip' (Event Type) on mobile
            if (isMobile && type === 'tip') {
              const countRegex = /\s*\(\d+\)$/; // Regex to find " (N)" at the end
              const match = fullLabelText.match(countRegex);
              if (match) {
                // If a count is found, take the substring before it
                pillLabelText = fullLabelText.substring(0, match.index).trim();
              }
            }

            if (e.target.checked) {
              addFilterPill(type, pillLabelText, e.target.id);
            } else {
              removeFilterPill(type, pillLabelText);
            }
            refreshDynamicContainer();
            ensureCancelAll();
            applyAllEventsFiltersAndPopulate();
          });
      });

      // free / ticket on mobile:
      document.getElementById('mobile-free-entry')
        .addEventListener('change', e => {
          const label = 'Intrare liberă';
          if (e.target.checked) {
            addFilterPill('free', label, e.target.id);
          } else {
            removeFilterPill('free', label);
          }
          refreshDynamicContainer();
          ensureCancelAll();
          applyAllEventsFiltersAndPopulate();
        });

      document.getElementById('mobile-ticket')
        .addEventListener('change', e => {
          const label = 'Bilet';
          if (e.target.checked) {
            addFilterPill('ticket', label, e.target.id);
          } else {
            removeFilterPill('ticket', label);
          }
          refreshDynamicContainer();
          ensureCancelAll();
          applyAllEventsFiltersAndPopulate();
        });
  }

  // Desktop + mobile
  document.addEventListener('click', (e) => {
    // TYPE panel
    const typeBtn   = document.getElementById('event-type-btn');
    const typePanel = document.getElementById('event-type-panel');
    if (
      typePanel.classList.contains('visible') &&               // only if it’s open
      !typeBtn.contains(e.target) &&                            // click wasn’t on the button
      !typePanel.contains(e.target)                             // nor on the panel itself
    ) {
      toggleTypePanel();
    }
  
    // KEYWORDS panel
    const keyBtn   = document.getElementById('keywords-btn');
    const keyPanel = document.getElementById('keywords-panel');
    if (
      keyPanel.classList.contains('visible') &&
      !keyBtn.contains(e.target) &&
      !keyPanel.contains(e.target)
    ) {
      toggleKeywordsPanel();
    }
  
    // calendar
    const calBtn   = document.getElementById('calendar-btn');
    const calPanel = document.getElementById('calendar-container');
    if (
      calPanel.classList.contains('visible') &&     // only if it's open
      !calBtn.contains(e.target) &&                  // click wasn’t on the button
      !calPanel.contains(e.target)                   // nor in the calendar panel
    ) {
      const confirmBtn = calPanel.querySelector('.calendar-confirm-btn');
      if (confirmBtn) {
        confirmBtn.click();
      } else {
        toggleCalendar();
      }
    }
  });
}

// Calendar state
let currentDate = new Date();
let selectedDate = new Date();
let displayedMonth = currentDate.getMonth();
let displayedYear = currentDate.getFullYear();

// Month names in Romanian
const monthNames = [
  "Ianuarie",
  "Februarie",
  "Martie",
  "Aprilie",
  "Mai",
  "Iunie",
  "Iulie",
  "August",
  "Septembrie",
  "Octombrie",
  "Noiembrie",
  "Decembrie",
];

// DOM elements
let calendarGrid;
let monthYearDisplay;
let prevMonthBtn;
let nextMonthBtn;
let todayTab;
let tomorrowTab;
let weekendTab;

// Initialize calendar
function initCalendar() {
  calendarGrid = document.getElementById("calendar-grid");
  monthYearDisplay = document.getElementById("month-year");
  prevMonthBtn = document.getElementById("prev-month");
  nextMonthBtn = document.getElementById("next-month");
  todayTab = document.getElementById("today-tab");
  tomorrowTab = document.getElementById("tomorrow-tab");
  weekendTab = document.getElementById("weekend-tab");

  // Set initial month and year to current date
  displayedMonth = currentDate.getMonth();
  displayedYear = currentDate.getFullYear();

  // Update the month-year display
  updateMonthYearDisplay();

  // Generate the calendar grid
  generateCalendar();

  // Add event listeners
  prevMonthBtn.addEventListener("click", goToPreviousMonth);
  nextMonthBtn.addEventListener("click", goToNextMonth);
  todayTab.addEventListener("click", goToToday);
  tomorrowTab.addEventListener("click", goToTomorrow);
  weekendTab.addEventListener("click", goToWeekend);

  // Set today tab as active by default
  todayTab.classList.add("active");
}

// Update month and year display
function updateMonthYearDisplay() {
  monthYearDisplay.textContent = `${monthNames[displayedMonth]} ${displayedYear}`;
}

// Generate calendar grid
function generateCalendar() {
  calendarGrid.innerHTML = "";

  // Get first day of the month (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const firstDayOfMonth = new Date(
    displayedYear,
    displayedMonth,
    1,
  ).getDay();
  // Adjust for Monday as first day of week (0 = Monday, 1 = Tuesday, ..., 6 = Sunday)
  const firstDayAdjusted =
    firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  // Get number of days in the month
  const daysInMonth = new Date(
    displayedYear,
    displayedMonth + 1,
    0,
  ).getDate();

  // Get number of days in previous month
  const daysInPrevMonth = new Date(
    displayedYear,
    displayedMonth,
    0,
  ).getDate();

  // Calculate total cells needed (max 6 rows of 7 days)
  const totalCells = 42;

  // Create calendar rows
  let dayCounter = 1;
  let nextMonthCounter = 1;

  for (let row = 0; row < 6; row++) {
    const calendarRow = document.createElement("div");
    calendarRow.className = "calendar-row";

    for (let col = 0; col < 7; col++) {
      const dayCell = document.createElement("div");
      dayCell.className = "calendar-day";

      // Calculate the day to display
      const cellIndex = row * 7 + col;

      if (cellIndex < firstDayAdjusted) {
        // Previous month days
        const prevMonthDay =
          daysInPrevMonth - (firstDayAdjusted - cellIndex - 1);
        dayCell.textContent = prevMonthDay;
        dayCell.classList.add("faded");

        // Add data attributes for date info
        dayCell.dataset.year =
          displayedMonth === 0 ? displayedYear - 1 : displayedYear;
        dayCell.dataset.month =
          displayedMonth === 0 ? 11 : displayedMonth - 1;
        dayCell.dataset.day = prevMonthDay;
      } else if (
        cellIndex >= firstDayAdjusted &&
        dayCounter <= daysInMonth
      ) {
        // Current month days
        dayCell.textContent = dayCounter;

        // Add data attributes for date info
        dayCell.dataset.year = displayedYear;
        dayCell.dataset.month = displayedMonth;
        dayCell.dataset.day = dayCounter;

        // Check if this is today
        const isToday =
          currentDate.getDate() === dayCounter &&
          currentDate.getMonth() === displayedMonth &&
          currentDate.getFullYear() === displayedYear;

        if (isToday) {
          dayCell.classList.add("today");
        }

        // — new range selection highlighting —
        const cellDate = new Date(
          +dayCell.dataset.year,
          +dayCell.dataset.month,
          +dayCell.dataset.day
        );

        // one-day mode: highlight start if no end yet
        if (rangeStart && !rangeEnd) {
          if (cellDate.getTime() === rangeStart.getTime()) {
            dayCell.classList.add("selected");
          }
        }

        // two-click range mode
        if (rangeStart && rangeEnd) {
          // normalize so start <= end
          const start = rangeStart < rangeEnd ? rangeStart : rangeEnd;
          const end   = rangeStart < rangeEnd ? rangeEnd   : rangeStart;

          if (cellDate >= start && cellDate <= end) {
            dayCell.classList.add("selected");
          }
        }

        dayCounter++;
      } else {
        // Next month days
        dayCell.textContent = nextMonthCounter;
        dayCell.classList.add("faded");

        // Add data attributes for date info
        dayCell.dataset.year =
          displayedMonth === 11 ? displayedYear + 1 : displayedYear;
        dayCell.dataset.month =
          displayedMonth === 11 ? 0 : displayedMonth + 1;
        dayCell.dataset.day = nextMonthCounter;

        nextMonthCounter++;
      }

      // Add click event to select a date
      dayCell.addEventListener("click", e => {
        e.stopPropagation();
        selectDate(dayCell);
      });

      calendarRow.appendChild(dayCell);
    }

    calendarGrid.appendChild(calendarRow);

    // If we've displayed all days of the current month and filled the row, we can stop
    if (dayCounter > daysInMonth && ((row + 1) * 7) % 7 === 0) {
      break;
    }
  }
  renderRangeBar();
}

let rangeStart = null;
let rangeEnd   = null;

function selectDate(dayCell) {
  const cal = document.getElementById('calendar-container');
  cal.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  // 1) Figure out which date was clicked
  const year  = +dayCell.dataset.year;
  const month = +dayCell.dataset.month;
  const day   = +dayCell.dataset.day;
  const clicked = new Date(year, month, day);

  // 2) Handle range state
  if (!rangeStart || (rangeStart && rangeEnd)) {
    // first click or resetting after a full range
    rangeStart = clicked;
    rangeEnd   = null;
  } else {
    // second click: close out the range
    rangeEnd = clicked;
  }

  // 3) If they clicked a day in another month, move the calendar there
  if (
    clicked.getMonth() !== displayedMonth ||
    clicked.getFullYear() !== displayedYear
  ) {
    displayedMonth = clicked.getMonth();
    displayedYear  = clicked.getFullYear();
    updateMonthYearDisplay();
  }

  // 4) Re-draw, which will pick up rangeStart/rangeEnd and highlight accordingly
  generateCalendar();
}

// Navigation functions
function goToPreviousMonth() {
  displayedMonth--;
  if (displayedMonth < 0) {
    displayedMonth = 11;
    displayedYear--;
  }
  updateMonthYearDisplay();
  generateCalendar();
}

function goToNextMonth() {
  displayedMonth++;
  if (displayedMonth > 11) {
    displayedMonth = 0;
    displayedYear++;
  }
  updateMonthYearDisplay();
  generateCalendar();
}

// Tab functions
function goToToday() {
  // Reset tabs
  const cal = document.getElementById('calendar-container');
  cal.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  todayTab.classList.add("active");

  // Start a new range on today
  const now = new Date();
  rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  rangeEnd   = null;
  displayedMonth = rangeStart.getMonth();
  displayedYear  = rangeStart.getFullYear();

  updateMonthYearDisplay();
  generateCalendar();
}

function goToTomorrow() {
  // Reset tabs
  const cal = document.getElementById('calendar-container');
  cal.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  tomorrowTab.classList.add("active");

  // Start a new range on tomorrow
  const temp = new Date();
  temp.setDate(temp.getDate() + 1);
  rangeStart = new Date(temp.getFullYear(), temp.getMonth(), temp.getDate());
  rangeEnd   = null;
  displayedMonth = rangeStart.getMonth();
  displayedYear  = rangeStart.getFullYear();

  updateMonthYearDisplay();
  generateCalendar();
}

function goToWeekend() {
  // Reset tabs
  const cal = document.getElementById('calendar-container');
  cal.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  weekendTab.classList.add("active");

  // Find the next Saturday
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysUntilWeekend = dayOfWeek === 0 ? 6 : 6 - dayOfWeek;

  const nextWeekend = new Date();
  nextWeekend.setDate(today.getDate() + daysUntilWeekend);

  // Start a new range on that Saturday
  rangeStart = new Date(
    nextWeekend.getFullYear(),
    nextWeekend.getMonth(),
    nextWeekend.getDate()
  );
  rangeEnd   = null;
  displayedMonth = nextWeekend.getMonth();
  displayedYear  = nextWeekend.getFullYear();

  updateMonthYearDisplay();
  generateCalendar();
}

function insertCalendarOnce() {
  const tpl    = document.getElementById('calendar-template');
  const clone  = tpl.content.cloneNode(true);
  const isMobile = window.matchMedia('(max-width: 550px)').matches;

  // pick the correct host
  const host = isMobile
    ? document.querySelector('.filter-bar-mobile')
    : document.querySelector('.filter-bar');

  if (isMobile) {
    const dd = document.getElementById('mobile-categories-dropdown');
    host.insertBefore(clone, dd);
    initCalendar();
    return;
  }

  // find the divider that marks the exact insert spot
  const divider = host.querySelector('.filter-div');
  if (!divider) {
    console.warn('No .filter-div found in host:', host);
    return;
  }

  // inject our one-and-only calendar clone immediately before it
  divider.parentNode.insertBefore(clone, divider);
  initCalendar();
}

function toggleCalendar() {
  const cal = document.getElementById('calendar-container');
  const btn = document.getElementById('calendar-btn');
  const icon = btn.querySelector('.filter-icon');
  const isVisible = cal.classList.toggle('visible');
  const hasSelection = document.querySelectorAll('.calendar-day.selected').length > 0;

  if (window.matchMedia("(max-width: 550px)").matches) {
    const evcont = document.querySelector('.events-container');
    if (isVisible) {
      const mobileNav = document.querySelector('.mobile-nav');
      const filterBarMobile = document.querySelector('.filter-bar-mobile'); // The bar containing #calendar-btn
      if (evcont && filterBarMobile && mobileNav) {
        const mobileNavHeight = mobileNav.offsetHeight;
        // Get current positions relative to the viewport
        const filterBarRect = filterBarMobile.getBoundingClientRect();
        // filterBarRect.top is the current distance of the filter bar's top from the viewport's top.

        // Target viewport Y position for the top of the filter bar:
        // It should be right below the mobileNav.
      }
    }
  }
}