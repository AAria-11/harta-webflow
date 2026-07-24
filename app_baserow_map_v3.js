mapboxgl.accessToken = 'pk.eyJ1IjoiYWxleGFuZHJ1Y20iLCJhIjoiY2x5OG12MGZ4MGtrejJrc2JoeDJwam9nMSJ9.qacp8v2WqXV_48dG9O1gng';

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
  const BASEROW_TOKEN = 'hnnLjCo3Boogz0b9OGPPy4SDQK9mdfVF';
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
          const path = `https://cdn.jsdelivr.net/gh/AAria-11/harta-webflow@main/pins/${iconName}.png`;  // Construct the file path via GitHub/jsDelivr
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

const AIRTABLE_API_KEY = 'patbwEkPQC08zp6qy.d68a2e2965681fef780e5483bd34fed597a21f10bcf7bc8774b34bb7810dcb19';
const AIRTABLE_BASE_ID = 'appz7cGVGynDa0R4z';

function formatEventDateTime(isoStartDate, isoEndDate) {
  if (!isoStartDate) return "Data neprecizată";

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
          // normalize so start ≤ end
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
        // It should be right below the mobileNav, plus an 8px margin.
        const targetViewportYForFilterBar = mobileNavHeight + 8;

        // The amount we need to scroll 'evcont' is the difference between
        // where the filter bar IS (filterBarRect.top) and where we WANT IT to be (targetViewportYForFilterBar),
        // added to the current scroll position of 'evcont'.
        const scrollDelta = filterBarRect.top - targetViewportYForFilterBar;
        const desiredPageScrollY = evcont.scrollTop + scrollDelta;

        // Ensure desiredPageScrollY is not negative (can't scroll beyond the top)
        const scrollToY = Math.max(0, desiredPageScrollY);

        evcont.scrollTo({
          top: scrollToY,
          behavior: 'auto' // or 'auto'
        });
      }
      // only on mobile: append the backdrop
      const backdrop = document.createElement('div');
      backdrop.className = 'calendar-backdrop';
      evcont.appendChild(backdrop);
      evcont.classList.add('no-scroll');
    } else {
      document.querySelectorAll('.calendar-backdrop').forEach(el => el.remove());
      evcont.classList.remove('no-scroll');
    }
  }

  if (hasSelection) {
    btn.style.background = '#AD537C';
    btn.style.color = '#F6F4EA';
    btn.classList.add('red'); 
    icon.src = 'CalendarWhite.svg';
    return; 
  } else {
    if (window.matchMedia("(max-width: 550px)").matches) {
      const label  = btn.querySelector(".filter-text");
      label.style.fontSize = '16px'; 
    }
  }

  if (isVisible) {
    cal.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  }
  
  btn.style.background = isVisible ? '#AD537C' : '#FBF6EF';
  btn.style.color = isVisible ? '#F6F4EA' : '#3E1928';
  btn.classList.toggle('red', isVisible); 
  icon.src = isVisible ? 'CalendarWhite.svg' : 'CalendarBlank.svg';
}

function hideCalendar() {
  const cal = document.getElementById('calendar-container');
  cal.classList.remove('visible');
  if (window.matchMedia("(max-width: 550px)").matches) {
    document.querySelectorAll('.calendar-backdrop').forEach(el => el.remove());
    const evcont = document.querySelector('.events-container');
    evcont.classList.remove('no-scroll');
  }
}

function renderRangeBar() {
  const container = document.getElementById("range-bar-container");
  container.innerHTML = "";           // clear old

  // Only show if at least a start date exists
  if (!rangeStart) return;

  // Build date‐only versions so we compare midnight-to-midnight
  const sd = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  // Determine ordered start/end
  let start = sd(rangeStart);
  let end   = rangeEnd ? sd(rangeEnd) : null;
  if (end && start > end) [start, end] = [end, start];

  // Text: single-date or “start → end”
  const fmt = d =>
    String(d.getDate()).padStart(2, "0") + "." +
    String(d.getMonth() + 1).padStart(2, "0");
  const text = end ? `${fmt(start)} → ${fmt(end)}` : fmt(start);

  const barBtn = document.createElement("button");
  barBtn.type      = "button";
  barBtn.className = "calendar-confirm-btn";
  barBtn.textContent = text;

  // On click: confirm the range
  barBtn.addEventListener("click", () => {
    hideCalendar();  // close the popup

    // Update the main Calendar button
    const calBtn = document.getElementById("calendar-btn");
    const icon   = calBtn.querySelector(".filter-icon");
    const label  = calBtn.querySelector(".filter-text");
    const clr    = calBtn.querySelector(".calendar-clear-btn");

    calBtn.classList.add("red");
    icon.src          = "CalendarWhite.svg";
    label.textContent = text;
    if (window.matchMedia("(max-width: 550px)").matches && end) {
      label.style.fontSize = '14px';
    }

    // Show & wire the “×” icon to clear all
    clr.style.display = "inline";
    clr.onclick = (e) => {
      e.stopPropagation();
      rangeStart = rangeEnd = null;
      calBtn.classList.remove("red");
      calBtn.style.background = '#FBF6EF';
      calBtn.style.color = '#3E1928';
      icon.src          = "CalendarBlank.svg";
      label.textContent = "Calendar";
      label.style.fontSize = '16px';
      clr.style.display = "none";
      document
      .querySelectorAll('.calendar-day.selected')
      .forEach(d => d.classList.remove('selected'));
      const pill = document.querySelector('.calendar-confirm-btn');
      if (pill) pill.remove();
      hideCalendar();
      applyAllEventsFiltersAndPopulate();
      calculateAndAssignEventTypeCounts();
      if (!window.matchMedia('(max-width: 550px)').matches) {
          populateTypeDropdown(dynamicEventTypes);
          populateKeywordsPanel(dynamicKeywords);
      } else {
          populateMobileCategories();
      }
    };

    applyAllEventsFiltersAndPopulate();
    calculateAndAssignEventTypeCounts();
    if (!window.matchMedia('(max-width: 550px)').matches) {
        populateTypeDropdown(dynamicEventTypes);
        populateKeywordsPanel(dynamicKeywords);
    } else {
        populateMobileCategories();
    }
  });

  container.appendChild(barBtn);
}

async function fetchArchiveData() {
  try {
      const response = await fetch('archive.json');
      if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
  } catch (error) {
      console.error("Could not fetch archive data:", error);
      return [];
  }
}

function createArchiveGallery(galleryDir, entryTitle) {
  const numImages = picsDirToNum[galleryDir] || 0;
  if (numImages === 0) {
      return null;
  }
  if (window.matchMedia("(max-width: 550px)").matches) {
      const galleryContainer = document.createElement('div');
      galleryContainer.className = 'archive-gallery-mobile';

      const mainImageContainer = document.createElement('div');
      mainImageContainer.className = 'main-image';

      const imgElement = document.createElement('img');
      imgElement.src = buildPicPath(galleryDir, 0);
      imgElement.alt = `Imagine principală pentru ${entryTitle}`;

      const counterLabel = document.createElement('div');
      counterLabel.className = 'num-pics-label';
      counterLabel.textContent = `1 / ${numImages}`;

      mainImageContainer.onclick = () => {
          openLightboxMobile(galleryDir);
      };

      mainImageContainer.appendChild(imgElement);
      mainImageContainer.appendChild(counterLabel);
      galleryContainer.appendChild(mainImageContainer);
      return galleryContainer;
  } else {
      const galleryContainer = document.createElement('div');
      galleryContainer.className = 'archive-gallery';

      for (let i = 0; i < numImages; i++) {
          const thumbWrapper = document.createElement('div');
          thumbWrapper.className = 'thumbnail-archive';

          const imgElement = document.createElement('img');
          const imgPath = buildPicPath(galleryDir, i);
          imgElement.src = imgPath;
          imgElement.alt = `Imagine ${i + 1} din galeria pentru ${entryTitle}`;

          imgElement.onclick = () => {
              currentImageDir = galleryDir;
              openLightbox(imgPath, i);
          };

          thumbWrapper.appendChild(imgElement);
          galleryContainer.appendChild(thumbWrapper);
      }
      return galleryContainer;
  }
}

function createArchiveEntryElement(entryData) {
  const entryElement = document.createElement('div');
  entryElement.className = 'archive-entry';

  const marker = document.createElement('div');
  marker.className = 'archive-timeline-marker';

  const content = document.createElement('div');
  content.className = 'archive-content';

  const dateEl = document.createElement('div');
  dateEl.className = 'archive-date';
  dateEl.textContent = entryData.date;

  const titleEl = document.createElement('div');
  titleEl.className = 'archive-title';
  titleEl.textContent = entryData.title;
  
  const subtitleEl = document.createElement('div');
  subtitleEl.className = 'archive-subtitle';
  subtitleEl.textContent = entryData.subtitle;

  const mainImageEl = document.createElement('img');
  mainImageEl.className = 'archive-main-image';
  mainImageEl.src = entryData.mainImage;
  mainImageEl.alt = entryData.title;

  if (window.matchMedia("(max-width: 550px)").matches) {
    mainImageEl.style.cursor = 'pointer';
    mainImageEl.onclick = () => {
        openLightboxMobile(entryData.mainImage);
    };
  }

  const descriptionEl = document.createElement('div');
  descriptionEl.className = 'archive-description';
  entryData.description.forEach(pText => {
      const p = document.createElement('p');
      if (pText.startsWith('!')) {
          p.className = 'archive-subtitle';
          p.innerHTML = pText.substring(1).trim();
      } else {
          p.innerHTML = pText;
      }
      descriptionEl.appendChild(p);
  });
  
  const galleryEl = createArchiveGallery(entryData.galleryDir, entryData.title);

  content.appendChild(dateEl);
  content.appendChild(titleEl);
  content.appendChild(subtitleEl);
  content.appendChild(mainImageEl);
  content.appendChild(descriptionEl);
  if (galleryEl) {
      content.appendChild(galleryEl);
  }
  
  entryElement.appendChild(marker);
  entryElement.appendChild(content);

  return entryElement;
}

async function populateArchivePage() {
  const archiveData = await fetchArchiveData();
  const timelineContainer = document.querySelector('#archive-container .archive-timeline');
  
  if (!timelineContainer) {
      console.error('Archive timeline container not found!');
      return;
  }

  timelineContainer.innerHTML = ''; // Clear any previous content

  if (archiveData && archiveData.length > 0) {
      archiveData.forEach(entry => {
          const entryElement = createArchiveEntryElement(entry);
          timelineContainer.appendChild(entryElement);
      });
  } else {
      timelineContainer.innerHTML = '<p style="text-align: center; padding: 2rem;">Arhiva este momentan goală.</p>';
  }
}

let archiveLoaded = false;
async function toggleArchive(event) {
  event.preventDefault();

  const archiveContainer = document.getElementById('archive-container');
  const isDesktop = !window.matchMedia('(max-width: 550px)').matches;

  if (isDesktop && (archiveContainer.style.display === '' || archiveContainer.style.display === 'block')) {
      closeArchive();
      return;
  }

  if (isDesktop) {
    closeAboutUs();
    closeArticlesHeader();
    closeArticle();
    closeEngage();
    closeEvents();
  } else {
    closeMobileMenu();
  }
  archiveContainer.style.display = '';
  window.location.hash = 'archive';

  setActiveDesktopLink('archive-link');

  if (!archiveLoaded) {
    await populateArchivePage();
    archiveLoaded = true;
  }
}

function closeArchive() {
  document.getElementById('archive-container').style.display = 'none';
  window.location.hash = '';
  document.getElementById('archive-link').style.color = '#25121B';
}

function slugify(text) {
  if (typeof text !== 'string') text = String(text); // Ensure text is a string
  // Basic diacritic folding for common Romanian characters
  const diacriticsMap = {
    'ă': 'a', 'Ă': 'A', 'â': 'a', 'Â': 'A', 'î': 'i', 'Î': 'I',
    'ș': 's', 'Ș': 'S', 'ț': 't', 'Ț': 'T'
  };
  return text.toString().toLowerCase()
    .replace(/[ăâîșțĂÂÎȘȚ]/g, char => diacriticsMap[char.toLowerCase()] || char) // Fold diacritics
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w-]+/g, '')       // Remove all non-word chars (except hyphen)
    .replace(/--+/g, '-')           // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

// — 2) Renders the checkboxes into #type-panel —
function populateTypeDropdown(items, containerId = 'event-type-panel') {
  const panel = document.getElementById(containerId);
  panel.innerHTML = '';       // clear out old
  items.forEach(item => {
    const labelElement = document.createElement('label'); // Renamed to avoid conflict
    labelElement.className = 'dropdown-option';

    const cb = document.createElement('input');
    cb.type  = 'checkbox';
    cb.value = item.label;
    cb.id    = `${slugify(item.label)}-id`; // e.g., "proiectie-de-film-id"

    labelElement.appendChild(cb);
    labelElement.appendChild(
      document.createTextNode(` ${item.label} (${item.count})`)
    );
    panel.appendChild(labelElement);
  });
}

function updateDropdownButtonState(btnId, panelId) {
  const btn       = document.getElementById(btnId);
  const panel     = document.getElementById(panelId);
  const icon      = btn.querySelector('.dropdown-icon');
  const isOpen    = panel.classList.contains('visible');
  const anyChecked = !!panel.querySelector('input[type="checkbox"]:checked');

  if (isOpen) {
    // Panel open → white text + red background + up–caret (which is WHITE)
    btn.style.background ='#AD537C';
    btn.style.color = '#F6F4EA';
    icon.src        = 'CaretUp.svg';
    btn.classList.add('red');
    icon.style.transform = '';
  } else if (anyChecked) {
    // Closed but something selected → white text + red background + down–caret WHITE
    btn.style.background ='#AD537C';
    btn.style.color = '#F6F4EA';
    icon.src        = 'CaretUp.svg';
    icon.style.transform = 'rotate(180deg)';
    btn.classList.add('red');
  } else {
    // Closed + nothing selected → black text + defaut background + down–caret BLACK
    btn.style.background ='#FBF6EF';
    btn.style.color = '#3E1928';
    icon.src        = 'CaretDown.svg';
    icon.style.transform = '';
    btn.classList.remove('red');
  }
}

function toggleTypePanel() {
  const panel = document.getElementById('event-type-panel');
  panel.classList.toggle('visible');
  updateDropdownButtonState('event-type-btn', 'event-type-panel');
}

function normalizeStringForSort(str) {
  if (typeof str !== 'string') return '';
  return str.normalize('NFC').toLowerCase()
    .replace(/[ăâ]/g, 'a')
    .replace(/[î]/g, 'i')
    .replace(/[ș]/g, 's')
    .replace(/[ț]/g, 't')
    .trim();
}
// Populate the keywords panel just like event‑type
function populateKeywordsPanel(items, containerId = 'keywords-panel') {
  const panel = document.getElementById(containerId);
  panel.innerHTML = '';

  const sortedItems = [...items].sort((a, b) => {
    const normA = normalizeStringForSort(a);
    const normB = normalizeStringForSort(b);

    if (normA < normB) return -1;
    if (normA > normB) return 1;
    return String(a).localeCompare(String(b), 'ro', { sensitivity: 'base' });
  });

  sortedItems.forEach(item => {
    const label = document.createElement('label');
    label.className = 'dropdown-option';

    const cb = document.createElement('input');
    cb.type  = 'checkbox';
    cb.value = item;
    cb.id    = `${containerId}-kw-${item}`;

    label.appendChild(cb);
    label.appendChild(
      document.createTextNode(`${item}`)
    );

    cb.addEventListener('change', () => {
      label.classList.toggle('selected', cb.checked);
    });

    panel.appendChild(label);
  });
}

function toggleKeywordsPanel() {
  const panel = document.getElementById('keywords-panel');
  panel.classList.toggle('visible');
  updateDropdownButtonState('keywords-btn', 'keywords-panel');
}

document.getElementById('event-type-panel')
  .addEventListener('change', e => {
    if (e.target.matches('input[type="checkbox"]')) {
      updateDropdownButtonState('event-type-btn', 'event-type-panel');
    }
  });

document.getElementById('keywords-panel')
  .addEventListener('change', e => {
    if (e.target.matches('input[type="checkbox"]')) {
      updateDropdownButtonState('keywords-btn', 'keywords-panel');
    }
  });

function populateMobileCategories() {
  document.getElementById('mobile-type-list').innerHTML     = '';
  document.getElementById('mobile-keywords-list').innerHTML = '';
  
  // reuse desktop populator with custom panel IDs
  populateTypeDropdown(dynamicEventTypes,    'mobile-type-list');
  populateKeywordsPanel(dynamicKeywords,     'mobile-keywords-list');
}

function populateRecentEvents(events) {
  const countEl = document.getElementById('results-count');
  const container = document.getElementById('recent-events-container');
  container.innerHTML = '';             // clear old
  countEl.textContent = `${events.length} rezultate`;

  events.forEach(ev => {
    // build the <article class="event-card">…
    const art = document.createElement('article');
    art.className = 'event-card';
    art.onclick = () => openEventDetailPanel(ev.title);

    if (window.matchMedia("(max-width: 550px)").matches && ev.title.length > 50) {
      art.style.height = '350px';
    }

    art.innerHTML = `
      <img
        src="${ev.image}"
        class="event-image"
        alt="Imagine eveniment: ${ev.title}"
      />
      <section class="event-details">
        <div class="event-info">
          <div class="event-content">
            <p class="event-category">${ev.category}</p>
            <h2 class="event-title">${ev.title}</h2>
            <div class="event-location">
              <img
                src="Pin.svg"
                class="location-icon"
                alt="icon locație"
              />
              <p class="location-address">${ev.address}</p>
            </div>
          </div>
        </div>
        <time class="event-time">${ev.time}</time>
      </section>
    `;

    container.appendChild(art);
  });
}

function openEventDetailPanel(eventTitle) {
  // Find the event data from masterEventList
  const eventData = masterEventList.find(event => event.title === eventTitle && event.airtableFields);
  if (!eventData) {
      console.error("Event data not found for title:", eventTitle);
      return;
  }
  currentOpenEventData = eventData; // Store for use in toggleEventDescription
  const fields = eventData.airtableFields; // Raw Airtable fields

  if (eventData.title) {
    window.location.hash = `event-${slugify(eventData.title)}`;
  }

  const panel = document.getElementById('eventDetailPanel');
  const headerImageDiv = document.getElementById('eventDetailHeaderImage');
  const categoriesDiv = document.getElementById('eventDetailCategories');
  const titleEl = document.getElementById('eventDetailTitle');
  const quoteEl = document.getElementById('eventDetailQuote');
  const locationTextEl = document.getElementById('eventDetailLocationText');
  const dateTimeTextEl = document.getElementById('eventDetailDateTimeText');
  
  const ticketButtonContainerEl = document.getElementById('eventDetailTicketButtonContainer');
  const ticketButtonEl = document.getElementById('eventDetailTicketButton'); 

  const organizerNameEl = document.getElementById('eventDetailOrganizerName');
  const organizerDescriptionEl = document.getElementById('eventDetailOrganizerDescription');
  const organizerSocialLinksEl = document.getElementById('eventDetailOrganizerSocialLinks');

  const fbShareButtonContainer = document.getElementById('eventDetailFbShareButton');
  const relatedEventsContainer = document.getElementById('eventDetailRelatedEvents');

  const datetimeOriginalContentEl = dateTimeTextEl.parentNode;

  // 1. Header Image
  const imageUrl = (fields.Picture && fields.Picture.length > 0 && fields.Picture[0].url)
                 ? fields.Picture[0].url
                 : 'https://placehold.co/717x361/EAAAC8/EAAAC8'; 
  headerImageDiv.style.backgroundImage = `url('${imageUrl}')`;
  if (imageUrl.startsWith('http')) { // Only make it clickable if it's a real image
    headerImageDiv.style.cursor = 'pointer';

    // For Desktop Lightbox: call openLightbox() with totalImages = 1
    const desktopClickHandler = () => openLightbox(imageUrl, 0, 1);
    
    // For Mobile Lightbox: call openLightboxMobile() with the direct URL
    const mobileClickHandler = () => openLightboxMobile(imageUrl);

    if (!window.matchMedia("(max-width: 550px)").matches) {
        headerImageDiv.onclick = desktopClickHandler;
    } else {
        headerImageDiv.onclick = mobileClickHandler;
    }
  } else {
    // If it's a placeholder, make sure it's not clickable
    headerImageDiv.onclick = null;
    headerImageDiv.style.cursor = 'default';
  }

  // 2. Categories/Tags
  categoriesDiv.innerHTML = ''; 
  const eventTypes = fields.Event_type || []; 
  const entryType = fields.Entry ? fields.Entry.trim() : '';
  if (entryType.toLowerCase() === 'bilet' || (entryType.toLowerCase() !== 'gratuit' && entryType !== '')) {
       const ticketTag = document.createElement('span');
       ticketTag.className = 'category-tag';
       ticketTag.textContent = currentLang === 'ro' ? 'BILET' : 'TICKET';
       categoriesDiv.appendChild(ticketTag);
  } else if (entryType.toLowerCase() === 'gratuit') {
       const freeTag = document.createElement('span');
       freeTag.className = 'category-tag';
       freeTag.textContent = currentLang === 'ro' ? 'INTRARE LIBERĂ' : 'FREE ENTRY';
       categoriesDiv.appendChild(freeTag);
  }
  eventTypes.forEach(type => {
      const tag = document.createElement('span');
      tag.className = 'category-tag';
      tag.textContent = type.toUpperCase(); 
      categoriesDiv.appendChild(tag);
  });

  // 3. Title and Quote
  titleEl.textContent = fields.Title || "N/A";
  const fullDescriptionForQuote = fields.Description_ro || fields.Description || ""; 
  const quoteMatch = fullDescriptionForQuote.match(/^“.*?”/);
  if (fields.Quote_ro || fields.Quote) { 
      quoteEl.textContent = fields.Quote_ro || fields.Quote;
      quoteEl.style.display = 'block';
  } else if (quoteMatch) {
      quoteEl.textContent = quoteMatch[0];
      quoteEl.style.display = 'block';
  } else {
      quoteEl.style.display = 'none';
  }

  // 4. Location, Date/Time
  if (locationTextEl) {
    locationTextEl.textContent = fields.Location || "N/A";
    const locationNameForPinInteraction = fields.Location;

    locationTextEl.style.cursor = 'pointer';
    locationTextEl.onclick = null;
    locationTextEl.onclick = () => {
        if (locationNameForPinInteraction && nameToFeature[locationNameForPinInteraction]) {
            const featureToOpen = nameToFeature[locationNameForPinInteraction];

            closeEventDetailPanel();
            if (typeof closeEvents === 'function') {
                closeEvents();
            }

            if (typeof openPin === 'function') {
                openPin(featureToOpen); // This shows the map card
            }
        } else {
            console.warn("Location feature not found for click interaction:", locationNameForPinInteraction);
        }
    };
  }
  dateTimeTextEl.textContent = formatEventDateTime(fields.Start, fields.End); 

  // 5. Ticket Button 
  if (ticketButtonContainerEl && ticketButtonEl) { 
    if (fields.Ticket_details && fields.Ticket_details.trim() !== "") {
        const ticketUrl = fields.Ticket_details.trim();
        ticketButtonEl.href = ticketUrl.startsWith('http') ? ticketUrl : `http://${ticketUrl}`;
        ticketButtonEl.textContent = currentLang === 'ro' ? 'Cumpără bilet' : 'Buy Ticket';
        
        if (!ticketUrl.toLowerCase().includes('http://') && !ticketUrl.toLowerCase().includes('https://') && !ticketUrl.toLowerCase().includes('www.')) {
             ticketButtonEl.textContent = ticketUrl; 
             ticketButtonEl.removeAttribute('href');
             ticketButtonEl.removeAttribute('target'); 
        } else {
            ticketButtonEl.setAttribute('target', '_blank'); 
        }
        ticketButtonContainerEl.style.display = 'block'; 
    } else {
        ticketButtonContainerEl.style.display = 'none'; 
    }
  }

  if (datetimeOriginalContentEl) { 
    if (ticketButtonContainerEl && ticketButtonContainerEl.style.display === 'block') {
        datetimeOriginalContentEl.style.marginBottom = '16px';
    } else {
        datetimeOriginalContentEl.style.marginBottom = '0px';
    }
  }

  const descriptionContainer = document.getElementById('eventDetailDescription');
  const descriptionReadMoreBtn = document.getElementById('eventDetailDescReadMoreBtn');

  // Temporarily disconnect the button so it doesn't get overwritten by innerHTML changes
  if (descriptionReadMoreBtn) {
      descriptionReadMoreBtn.remove();
      descriptionReadMoreBtn.style.display = 'none';
      descriptionReadMoreBtn.removeAttribute('data-state');
  }

  // Clear previous paragraphs and data attributes
  if (descriptionContainer) {
      descriptionContainer.innerHTML = '';
      delete descriptionContainer.dataset.previewHtml;
      delete descriptionContainer.dataset.fullHtml;
  }

  const descText = fields.Description_ro || fields.Description || "";
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'ro';
  const defaultNoDescText = lang === 'ro' ? "Nicio descriere disponibilă." : "No description available.";

  if (!descText.trim()) {
      if (descriptionContainer) {
          descriptionContainer.innerHTML = `<p>${defaultNoDescText}</p>`;
      }
  } else {
      const paragraphs = descText.split(/\n\s*\n+|\n\n+/).map(pText => pText.trim()).filter(pText => pText.length > 0);
      const fullHtml = paragraphs.map(p => `<p>${p.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join('');
      const previewCharLimit = 500;

      if (descText.length <= previewCharLimit || paragraphs.length < 1) {
          descriptionContainer.innerHTML = fullHtml || `<p>${descText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
      } else {
          let visibleHtml = '';
          let charCount = 0;
          for (const p of paragraphs) {
              if ((charCount + p.length) > previewCharLimit && charCount > 0) {
                  const remainingChars = previewCharLimit - charCount;
                  const visiblePart = p.substring(0, remainingChars > 3 ? remainingChars - 3 : 0);
                  const pElement = document.createElement('p');
                  pElement.textContent = visiblePart + '...';
                  visibleHtml += pElement.outerHTML;
                  break;
              } else {
                  const pElement = document.createElement('p');
                  pElement.textContent = p;
                  visibleHtml += pElement.outerHTML;
                  charCount += p.length;
              }
          }

          descriptionContainer.innerHTML = visibleHtml;
          descriptionContainer.dataset.previewHtml = visibleHtml;
          descriptionContainer.dataset.fullHtml = fullHtml;

          if (descriptionReadMoreBtn) {
              descriptionContainer.appendChild(descriptionReadMoreBtn); // Append button back INSIDE the div
              descriptionReadMoreBtn.style.display = 'block';
              descriptionReadMoreBtn.textContent = lang === 'ro' ? 'Continuați să citiți' : 'Read more';
              descriptionReadMoreBtn.setAttribute('data-state', 'truncated');
          }
      }
  }

  // Organizer Details
  const organizerLocationName = fields.Location;
  const organizerFeature = nameToFeature ? nameToFeature[organizerLocationName] : null; 

  const handleOrganizerDirectReadMore = () => {
    if (organizerLocationName && nameToFeature[organizerLocationName]) {
        const featureToOpen = nameToFeature[organizerLocationName];
        closeEventDetailPanel();
        if (typeof closeEvents === 'function') {
            closeEvents();
        }

        openPin(featureToOpen);
        if (featureToOpen.properties[`Descriere_${currentLang}`]) {
            openReadMore(organizerLocationName);
        }
    } else {
        console.warn("Organizer feature not found for click interaction:", organizerLocationName);
    }
  };

  if (organizerFeature) {
      organizerNameEl.textContent = currentLang === 'ro' ? `Descoperă ${organizerLocationName}` : `Discover ${organizerLocationName}`;
      organizerNameEl.href = "#";

      const orgDescKey = `Descriere_${currentLang}`;
      const organizerDescTextSpan = document.getElementById('organizerDescriptionTextPreview');
      const organizerArrowIcon = organizerDescriptionEl ? organizerDescriptionEl.querySelector('.organizer-description-arrow-icon') : null;

      const fullOrganizerDesc = (organizerFeature.properties[orgDescKey]) ? organizerFeature.properties[orgDescKey].split('\n')[0] : "";
      const organizerPreviewLength = window.matchMedia("(max-width: 550px)").matches ? 150 : 250;

      if (organizerDescTextSpan && organizerArrowIcon) {
          if (fullOrganizerDesc && fullOrganizerDesc.length > organizerPreviewLength) {
              organizerDescTextSpan.textContent = fullOrganizerDesc.substring(0, organizerPreviewLength).trim() + "...";
              organizerArrowIcon.style.display = 'inline-block';
          } else if (fullOrganizerDesc) {
              organizerDescTextSpan.textContent = fullOrganizerDesc;
              organizerArrowIcon.style.display = 'none';
          } else {
              organizerDescTextSpan.textContent = (currentLang === 'ro' ? "Mai multe detalii în curând." : "More details soon.");
              organizerArrowIcon.style.display = 'none';
          }
      } else if (organizerDescTextSpan) {
           organizerDescTextSpan.textContent = fullOrganizerDesc || (currentLang === 'ro' ? "Mai multe detalii în curând." : "More details soon.");
      }

      const organizerNameLineEl = organizerNameEl.closest('.organizer-name-line');
      if (organizerNameLineEl) {
          organizerNameLineEl.style.cursor = 'pointer';
          organizerNameLineEl.onclick = handleOrganizerDirectReadMore;
          // Prevent the <a> tag's default navigation since the parent div handles the click
          organizerNameEl.onclick = (e) => {
              e.preventDefault();
          };
      } else if (organizerNameEl) { // Fallback if only the name element itself is targeted
          organizerNameEl.style.cursor = 'pointer';
          organizerNameEl.onclick = (e) => {
              e.preventDefault();
              handleOrganizerDirectReadMore();
          };
      }

      if (organizerDescriptionEl) { // This is the <p> tag
          organizerDescriptionEl.style.cursor = 'pointer';
          organizerDescriptionEl.onclick = handleOrganizerDirectReadMore;
      }

      organizerSocialLinksEl.innerHTML = ''; 
      const socialPlatforms = [
          { idPrefix: 'eventOrganizerSite', field: 'Site', icon: 'Site.svg', textKey: 'site'},
          { idPrefix: 'eventOrganizerInsta', field: 'Insta', icon: 'Instagram.svg', textKey: 'instagram'},
          { idPrefix: 'eventOrganizerFb', field: 'FB', icon: 'Facebook.svg', textKey: 'facebook'},
          { idPrefix: 'eventOrganizerMaps', field: 'Gmaps', icon: 'Maps.svg', textKey: 'googleMaps'}
      ];
      socialPlatforms.forEach(platform => {
          if (organizerFeature.properties[platform.field] && organizerFeature.properties[platform.field].trim() !== "") {
              const linkElement = document.createElement('a');
              linkElement.className = 'read-more-social-link'; 
              linkElement.id = `${platform.idPrefix}Link`;
              linkElement.href = fixLinkIfNeeded(organizerFeature.properties[platform.field]);
              linkElement.target = '_blank';
              linkElement.rel = 'noopener noreferrer';
              linkElement.innerHTML = `<div class="read-more-social-icon"><img src="${platform.icon}" alt="${platform.field}"></div>`;
              organizerSocialLinksEl.appendChild(linkElement);
          }
      });
  } else { // Fallback if organizerFeature is not found
      organizerNameEl.textContent = organizerLocationName || (currentLang === 'ro' ? "Organizator" : "Organizer");
      organizerNameEl.removeAttribute('href');
      organizerNameEl.onclick = null; // No click action if no feature

      const organizerDescTextSpanUnavailable = document.getElementById('organizerDescriptionTextPreview');
      const organizerArrowIconUnavailable = organizerDescriptionEl ? organizerDescriptionEl.querySelector('.organizer-description-arrow-icon') : null;

      if (organizerDescTextSpanUnavailable) {
          organizerDescTextSpanUnavailable.textContent = currentLang === 'ro' ? "Detalii despre organizator indisponibile." : "Organizer details unavailable.";
      }
      if (organizerArrowIconUnavailable) {
          organizerArrowIconUnavailable.style.display = 'none';
      }

      organizerSocialLinksEl.innerHTML = '';
  }

  // Share Button
  const eventPageUrl = window.location.href; 
  fbShareButtonContainer.setAttribute('data-href', eventPageUrl);
  if (typeof FB !== 'undefined') {
      FB.XFBML.parse(fbShareButtonContainer.parentNode);
  }

  // Related Events
  populateRelatedEvents(eventData, relatedEventsContainer);

  // Show the panel and scroll content to top
  panel.classList.add('visible');
  const contentWrapper = panel.querySelector('.event-detail-content-wrapper');
  if(contentWrapper) {
    contentWrapper.scrollTop = 0;
  }
  panel.scrollTop = 0;

}

function closeEventDetailPanel() {
  const panel = document.getElementById('eventDetailPanel');
  panel.classList.remove('visible');
  document.body.style.overflow = '';
  const contentWrapper = panel.querySelector('.event-detail-content-wrapper');
  if(contentWrapper) contentWrapper.scrollTop = 0;
  if (window.location.hash.startsWith('#event-')) {
    if (document.getElementById('events-container').style.display !== 'none') {
        window.location.hash = 'events';
    }
  }
  currentOpenEventData = null;
}

function toggleEventDescriptionFull(button) {
  const descriptionContainer = document.getElementById('eventDetailDescription');
  if (!descriptionContainer || !button) return;

  const currentState = button.getAttribute('data-state');
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'ro';

  // Set the new HTML content first
  if (currentState === 'truncated') {
      descriptionContainer.innerHTML = descriptionContainer.dataset.fullHtml || '';
      button.textContent = lang === 'ro' ? 'Citește mai puțin' : 'Read less';
      button.setAttribute('data-state', 'expanded');
  } else {
      descriptionContainer.innerHTML = descriptionContainer.dataset.previewHtml || '';
      button.textContent = lang === 'ro' ? 'Continuați să citiți' : 'Read more';
      button.setAttribute('data-state', 'truncated');
  }

  // After setting the HTML, append the button back inside.
  // This ensures it's always the last element and inside the border.
  descriptionContainer.appendChild(button);
}

function populateRelatedEvents(currentEventData, container) {
  const relatedSectionWrapper = container ? container.parentNode : null;
  if (!relatedSectionWrapper) {
      console.error("Related events section wrapper not found.");
      if (container) container.innerHTML = ''; // Clear if only container exists
      return;
  }
  container.innerHTML = ''; // Clear previous cards

  if (!masterEventList || masterEventList.length === 0 || !currentEventData || !currentEventData.eventTypes) {
      relatedSectionWrapper.style.display = 'none'; // Hide the whole section
      return;
  }

  const currentEventTypes = currentEventData.eventTypes.map(type => type.trim().toLowerCase());
  const currentEventTitle = currentEventData.title;

  const related = masterEventList.filter(event => {
      if (event.title === currentEventTitle) return false; 
      if (!event.eventTypes || event.eventTypes.length === 0) return false;
      
      const eventTypesNormalized = event.eventTypes.map(type => type.trim().toLowerCase());
      return eventTypesNormalized.some(type => currentEventTypes.includes(type));
  }).slice(0, 3); 

  const todayForRelated = new Date();
  todayForRelated.setHours(0, 0, 0, 0);

  const futureRelatedEvents = related.filter(event => {
      if (!event.airtableFields || !event.airtableFields.Start) return false;

      const eventStartDateObj = new Date(event.airtableFields.Start);
      const eventEndDateObj = event.airtableFields.End ? new Date(event.airtableFields.End) : null;

      if (eventEndDateObj) {
          return eventEndDateObj >= todayForRelated;
      } else {
          const eventStartDayEnd = new Date(eventStartDateObj);
          eventStartDayEnd.setHours(23, 59, 59, 999);
          return eventStartDayEnd >= todayForRelated;
      }
  });

  if (futureRelatedEvents.length === 0) {
    relatedSectionWrapper.style.display = 'none'; // Hide the whole section if no related events
    return;
  }

  relatedSectionWrapper.style.display = 'block'; // Show the whole section if there are related events

  futureRelatedEvents.forEach(event => {
      const card = document.createElement('a'); 
      card.className = 'event-card'; 
      card.href = '#'; 
      card.onclick = (e) => {
          e.preventDefault();
          const detailPanel = document.getElementById('eventDetailPanel');
          if (detailPanel) {
              const contentWrapper = detailPanel.querySelector('.event-detail-content-wrapper');
              if (contentWrapper) {
                  contentWrapper.scrollTop = 0;
              } else {
                  detailPanel.scrollTop = 0; 
              }
          }
          openEventDetailPanel(event.title); 
      };
      if (window.matchMedia("(max-width: 550px)").matches && event.title.length > 50) {
        card.style.height = '350px';
      }

      const imageUrl = event.image || 'https://placehold.co/284x180/EAAAC8/EAAAC8';
      const location = event.address || "N/A";
      const time = event.time || "N/A";

      card.innerHTML = `
          <img src="${imageUrl}" alt="Imagine eveniment: ${event.title}" class="event-image">
          <section class="event-details">
              <div class="event-info">
                  <div class="event-content">
                      <p class="event-category">${event.category.toUpperCase()}</p>
                      <h2 class="event-title">${event.title}</h2>
                      <div class="event-location">
                          <img
                              src="Pin.svg"
                              class="location-icon"
                              alt="icon locație"
                          />
                          <p class="location-address">${location}</p>
                      </div>
                  </div>
              </div>
              <time class="event-time">${time}</time>
          </section>
      `;
      container.appendChild(card);
  });
}

function handleEventsSearch(e) {
  currentSearchQuery = e.target.value;
  applyAllEventsFiltersAndPopulate();
}

function toggleAboutUsDesktop(event) {
  event.preventDefault();
  if (isAboutUsDesktopOpen()) {
    closeAboutUs();
  } else {
    openAboutUs();
  }
}

function isAboutUsDesktopOpen() {
  return document.querySelector('.about-us-container').style.display === 'none' ? false : true;
}

function openAboutUs() {
  document.getElementById('sidePanel').style.display = 'none';
  document.querySelector('.about-us-container').style.display = '';
  document.getElementById('about-us-link').style.color = '#AD537C';
  if ((isArticlesHeaderOpen() || isEngageOpen()) &&
  (isSidePanelClosed() && !wasSidePanelClosedArticles
  || !isSidePanelClosed() && wasSidePanelClosedArticles
  ||  isSidePanelClosed() && !wasSidePanelClosedEngage
  || !isSidePanelClosed() && wasSidePanelClosedEngage)) {
    toggleSidePanel();
  }
  closeArticlesHeader();
  closeEngage();
  closeArticle();
  closeEvents();
  closeEventDetailPanel();
  closeArchive();
  window.location.hash = "about-us";
  var characterImage = document.getElementById('characterGif');
  setTimeout(function() {
    characterImage.src = 'tomita.png';
  }, 1060);
  document.getElementById('partners').src = "partners.png";
}

function closeAboutUs() {
  document.getElementById('sidePanel').style.display = 'flex';
  document.querySelector('.about-us-container').style.display = 'none';
  document.getElementById('about-us-link').style.color = '#25121B';
  var characterImage = document.getElementById('characterGif');
  characterImage.src = 'tomita.gif';
  history.replaceState(null, null, ' ');
}


function expandOrCloseMobileMenu() {
  document.querySelector('.mobile-nav').classList.toggle('mobile-nav-active');
  document.querySelector('.mobile-nav-title').classList.toggle('mobile-nav-active');
  document.querySelector('.mobile-nav-subtitle').classList.toggle('mobile-nav-active');

  var menuButton = document.querySelector('.mobile-menu-button');
  if (menuButton.querySelector('img')) {
    // If image is displayed, replace with text
    const closeBtnTxt = currentLang === 'ro' ? 'ÎNCHIDE' : 'CLOSE';
    menuButton.innerHTML = `<span style="font-family: IBM Plex Sans; font-size: 16px; font-weight: 400; line-height: 20.8px; text-align: left; color: #F6F4EA;">${closeBtnTxt}</span>`;
  } else {
    // If text is displayed, replace with image
    menuButton.innerHTML = '<img src="hamburger-menu.svg">';
  }

  var mobileMenu = document.querySelector('.mobile-menu');
  if (mobileMenu.style.display === 'flex') {
    mobileMenu.style.display = 'none';
    closeEngage();
  } else {
    mobileMenu.style.display = 'flex';
  }
}

function closeMobileMenu() {
  document.querySelector('.mobile-nav').classList.remove('mobile-nav-active');
  document.querySelector('.mobile-nav-title').classList.remove('mobile-nav-active');
  document.querySelector('.mobile-nav-subtitle').classList.remove('mobile-nav-active');
  var menuButton = document.querySelector('.mobile-menu-button');
  menuButton.innerHTML = '<img src="hamburger-menu.svg">';
  var mobileMenu = document.querySelector('.mobile-menu');
  mobileMenu.style.display = 'none';
  document.querySelector('.about-us-container').style.display = 'none';
  closeMobilePanel();
  closeEngage();
  closeArticle();
  closeEvents();
  closeEventDetailPanel();
  closeArchive();
  closeMobileArticlesPage();
  document.getElementById('events-container').style.display = 'none';
}

function cleanupMobilePanels() {
  document.querySelector('.mobile-nav').classList.remove('mobile-nav-active');
  document.querySelector('.mobile-nav-title').classList.remove('mobile-nav-active');
  document.querySelector('.mobile-nav-subtitle').classList.remove('mobile-nav-active');
  var menuButton = document.querySelector('.mobile-menu-button');
  if (menuButton) {
      menuButton.innerHTML = '<img src="hamburger-menu.svg">';
  }

  const mobileMenu = document.querySelector('.mobile-menu');
  if (mobileMenu) mobileMenu.style.display = 'none';

  const aboutUs = document.querySelector('.about-us-container');
  if (aboutUs) aboutUs.style.display = 'none';

  const sidePanel = document.getElementById('sidePanel');
  if (sidePanel) sidePanel.style.display = 'none';

  const eventsContainer = document.getElementById('events-container');
  if (eventsContainer) eventsContainer.style.display = 'none';

  const articlesPage = document.getElementById('mobile-articles-page');
  if (articlesPage) articlesPage.style.display = 'none';

  closeEngage();
  closeArticle();
  closeEventDetailPanel();
  closeArchive();
}

function openAboutUsMobile(mobileMenuExpand = true) {
  if (mobileMenuExpand) {
    expandOrCloseMobileMenu();
  }
  document.querySelector('.about-us-container').style.display = '';
  var characterImage = document.getElementById('characterGif');
  setTimeout(function() {
    characterImage.src = 'tomita.png';
  }, 1060);
  closeArticle();
  closeEvents();
  closeEventDetailPanel();
  closeArchive();
  window.location.hash = 'about-us';
  document.getElementById('partners').src = "partners-mobile.png"
}

function closeMobilePanel() {
  document.getElementById('sidePanel').style.display = 'none'; 
  resetToolbarToMapView();
}

function updateCounter(current, total) {
  const counter = document.getElementById('mobileLightboxCounter');
  counter.textContent = current + ' / ' + total;
}

function openLightboxMobile(source) {
  const lightbox = document.getElementById('lightbox-mobile');
  const container = document.getElementById('scrollContainer');
  const counter = document.getElementById('mobileLightboxCounter');
  
  if (!lightbox || !container || !counter) return;

  container.innerHTML = ''; // Clear previous content

  if (typeof source === 'string' && (source.startsWith('http') || source.endsWith('.jpg') || source.endsWith('.png'))) {
      // --- Single Image Mode ---
      let img = document.createElement('img');
      img.src = source;
      container.appendChild(img);
      
      counter.textContent = '1 / 1';
      
      // Disable scrolling behavior for a single image
      container.onscroll = null;
      container.style.scrollSnapType = 'none';

  } else {
      // --- Gallery Mode (original behavior) ---
      const imagesDir = source;
      const numImg = picsDirToNum[imagesDir] || 0;
      
      if (numImg === 0) {
          lightbox.style.display = 'none';
          return;
      }

      for (let i = 0; i < numImg; i++) {
          let img = document.createElement('img');
          img.src = buildPicPath(imagesDir, i);
          container.appendChild(img);
      }

      updateCounter(1, numImg); // Use existing updateCounter function
      
      // Re-enable snapping and the scroll listener for the gallery
      container.style.scrollSnapType = 'x mandatory';
      container.onscroll = () => {
          const scrollX = container.scrollLeft;
          const index = Math.round(scrollX / container.clientWidth);
          updateCounter(index + 1, numImg);
      };
  }

  lightbox.style.display = 'flex';
  container.scrollLeft = 0; // Ensure it starts at the beginning
}

function closeLightboxMobile() {
  const container = document.getElementById('scrollContainer');
  container.scrollLeft = 0;
  container.innerHTML = '';
  document.getElementById('lightbox-mobile').style.display = 'none'; // This hides the lightbox
}

function isSidePanelClosed() {
  var panel = document.getElementById('sidePanel');
  const currentLeft = parseInt(window.getComputedStyle(panel).left, 10) || 0;
  return currentLeft < 0 ? true : false;
}

function isEngageOpen() {
  var container = document.getElementById('engage-container');
  return container.style.display === 'none' ? false : true;
}

var wasSidePanelClosedEngage = false;

function toggleEngage(event) {
  event.preventDefault();
  if (isEngageOpen()) {
    closeEngage();
  } else {
    openEngage();
  }
}

function openEngage() {
  if (!window.matchMedia("(max-width: 550px)").matches) {
    if (!isSidePanelClosed()) {
      toggleSidePanel();
      wasSidePanelClosedEngage = false;
    } else {
      if (isArticlesHeaderOpen()) {
        wasSidePanelClosedEngage = wasSidePanelClosedArticles;
      } else {
        wasSidePanelClosedEngage = true;
      }
    }
    const card = document.querySelector('.card');
    card.classList.add('hidden-element');
    if (lastClickedFeatureCategory && lastClickedFeatureName) {
      updateIconState(lastClickedFeatureName, `${iconPaths[lastClickedFeatureCategory]}_normal`);
      lastClickedFeatureName = null;
      lastClickedFeatureCategory = null;
    }
    var container = document.getElementById('engage-container');
    container.style.display = 'flex';
    document.getElementById('engage-link').style.color = '#AD537C';
    closeReadMore();
    closeAboutUs();
    closeArticlesHeader();
    closeArticle();
    closeEvents();
    closeEventDetailPanel();
    closeArchive();
  } else {
    closeMobileMenu();
    var container = document.getElementById('engage-container-mobile');
    container.style.display = 'flex';
  }
}

function closeEngage() {
  if (!window.matchMedia("(max-width: 550px)").matches) {
    document.getElementById('engage-link').style.color = '#25121B';
    if (!isAboutUsDesktopOpen() && !isArticlesHeaderOpen() && ((isSidePanelClosed() && !wasSidePanelClosedEngage) || (!isSidePanelClosed() && wasSidePanelClosedEngage))) {
      toggleSidePanel();
    }
    var container = document.getElementById('engage-container');
    container.style.display = 'none';
  } else {
    var container = document.getElementById('engage-container-mobile');
    container.style.display = 'none';
  }
}

function openForm(event) {
  if (window.matchMedia("(max-width: 550px)").matches) {
    const button = event.currentTarget;
    const shadow = button.nextElementSibling;

    button.classList.add('clicked');
    shadow.classList.add('clicked');

    setTimeout(() => {
        button.classList.remove('clicked');
        shadow.classList.remove('clicked');
    }, 300);
  }
  event.preventDefault();
  window.open("https://docs.google.com/forms/d/e/1FAIpQLSdbZF3hjP4e0jlIRJgDSXqiI2N1OT4ltYvMjJzMOFX1p_M0jg/viewform", '_blank');
}

function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

var isTextTransparent = false;

function toggleTransparency() {
  const footer = document.getElementById('menu-footer');
  let logo = document.getElementById('mobile-menu-logo');
  if (isTextTransparent) {
      footer.style.color = hexToRGBA('#F6F4EA', 1);
      logo.style.opacity = 1;
  } else {
      footer.style.color = hexToRGBA('#F6F4EA', 0.3);
      logo.style.opacity = 0.3;
  }
  isTextTransparent = !isTextTransparent;
}

function isArticlesHeaderOpen() {
  const articlesHeader = document.getElementById('articles-header');
  return articlesHeader.style.display === 'none' ? false : true;
}

var wasSidePanelClosedArticles = false;

function openArticlesHeader() {
  const articlesHeader = document.getElementById('articles-header');
  articlesHeader.style.display = 'flex';
  document.getElementById('articles-link').style.color = '#AD537C';
  if (!isSidePanelClosed()) {
    toggleSidePanel();
    wasSidePanelClosedArticles = false;
  } else {
    if (isEngageOpen()) {
      wasSidePanelClosedArticles = wasSidePanelClosedEngage;
    } else {
      wasSidePanelClosedArticles = true;
    }
  }
  const card = document.querySelector('.card');
  card.classList.add('hidden-element');
  if (lastClickedFeatureCategory && lastClickedFeatureName) {
    updateIconState(lastClickedFeatureName, `${iconPaths[lastClickedFeatureCategory]}_normal`);
    lastClickedFeatureName = null;
    lastClickedFeatureCategory = null;
  }
  closeReadMore();
  closeEngage();
  closeAboutUs();
  closeArticle();
  closeEvents();
  closeEventDetailPanel();
  closeArchive();
}

function closeArticlesHeader() {
  const articlesHeader = document.getElementById('articles-header');
  if (!isAboutUsDesktopOpen() && !isEngageOpen() && ((isSidePanelClosed() && !wasSidePanelClosedArticles) || (!isSidePanelClosed() && wasSidePanelClosedArticles))) {
    toggleSidePanel();
  }
  articlesHeader.style.display = 'none';
  document.getElementById('articles-link').style.color = '#25121B';
}

function toggleArticlesHeader(event) {
  event.preventDefault();
  if (isArticlesHeaderOpen()) {
    closeArticlesHeader();
  } else {
    openArticlesHeader();
    setActiveDesktopLink('articles-link');
  }
}

async function openArticle(event, articleName, shouldScrollToTop = true, shouldCloseMobileMenu = true) {
  if (event !== null) {
    event.preventDefault();
  }

  const isLoaded = await loadArticle(articleName);
  if (isLoaded) {
      const defaultPicsDir = 'cinema_union';

      let correctArticleName = articleName;
      if (correctArticleName.includes("(CdRF)") || correctArticleName.includes("Photography Resource Centre")) {
        correctArticleName = "Centrul de Resurse în Fotografie";
      }
      // FIXME
      if (correctArticleName === "Masca Theater") {
        correctArticleName = "Teatrul Masca";
      }

      if (correctArticleName === "The “Tudor Arghezi” Memorial House") {
        correctArticleName = "Casa Memorială Tudor Arghezi — Mărțișor"
      }

      const featurePicsDirName = titleToPicsDir(correctArticleName);
      const featurePicsDir = featurePicsDirName in picsDirToNum ? featurePicsDirName : defaultPicsDir;
      const numFeaturePics = picsDirToNum[featurePicsDir];

      // Set currentImageDir and currentImageIndex for lightbox
      currentImageIndex = 0;
      currentImageDir = featurePicsDir;

      let imageContainer = document.getElementById('image-gallery-container-article');
      let mainImage = imageContainer.querySelector('.main-image');
      var mainImgElement = mainImage.querySelector('img');
      if (numFeaturePics > 0) {
        mainImgElement.src = buildPicPath(featurePicsDir, 0);
        if (!window.matchMedia("(max-width: 550px)").matches) {
          mainImgElement.setAttribute('onclick', `openLightbox('${buildPicPath(featurePicsDir, 0)}', 0)`);
        } else {
          mainImgElement.setAttribute('onclick', `openLightboxMobile('${featurePicsDir}')`);
        }
        mainImage.querySelector('.num-pics-label').textContent = '1 / ' + numFeaturePics;
      }

      if (!window.matchMedia("(max-width: 550px)").matches) {
        var thumbnailsList = document.querySelectorAll('.thumbnails-article .thumbnail-article');
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

        const maxNumPics = 5;
        for (let i = 1; i < Math.min(numFeaturePics, maxNumPics); i++) {
          var imgElement = thumbnails[i - 1].querySelector('img');
          imgElement.setAttribute('src', buildPicPath(featurePicsDir, i));
          imgElement.setAttribute('onclick', `openLightbox('${buildPicPath(featurePicsDir, i)}', ${i})`);
        }

        for (let i = numFeaturePics; i < maxNumPics; i++) {
          var imgElement = thumbnails[i - 1].querySelector('img');
          imgElement.classList.add('hidden');
        }
      }

      if (!window.matchMedia("(max-width: 550px)").matches) {
        closeArticlesHeader();
        setActiveDesktopLink('articles-link');
      } else {
        if (shouldCloseMobileMenu) {
          cleanupMobilePanels();
        }
        document.querySelector('.about-us-container').style.display = 'none';
      }

      window.location.hash = titleToLinkName[correctArticleName];

      document.getElementById('fb-share-article').href = encodeURIComponent(window.location.href);

      const articleCardContainer = document.getElementById('article-card-container-bottom');
      const articleCards = articleCardContainer.querySelectorAll('.article-card');

      articleCards.forEach((articleCard) => {
        const titleElement = articleCard.querySelector('.article-card-title');
        const newLang = Object.keys(translations).filter(l => l !== currentLang)[0];
        if (titleElement.textContent === articleName || articleName === titleElement.textContent + " (CdRF)"
         || articleName + " (CdRF)" === titleElement.textContent
         || articleTitleTranslation[newLang][articleName] === titleElement.textContent
         || articleTitleTranslation[newLang][articleName] === titleElement.textContent + " (CdRF)"
         || articleTitleTranslation[newLang][articleName] + " (CdRF)" === titleElement.textContent) {
          articleCard.style.display = 'none';
        } else {
          articleCard.style.display = '';
        }
      });

      if (!window.matchMedia("(max-width: 550px)").matches) {
        var articleCardCategory = document.getElementById("article-category-desktop");
        const categoriesKey = `Categories_${currentLang}`;
        const category = nameToFeature[correctArticleName].properties[categoriesKey].split(/[,;]+/).map(s => s.trim())[0];
        articleCardCategory.style.color = `${getCategoryColor(category)}`;
        articleCardCategory.textContent = category.toUpperCase();
      }

      if (shouldScrollToTop) {
        var articleCont = document.getElementById('article-container');
        articleCont.scrollTop = 0;
        scrollFun();
        document.getElementById('article-container').style.display = 'flex';
        articleCont.scrollTop = 0;
        scrollFun();
      }
      initializePlayerForCurrentArticle();
  } else {
    console.error('Failed to load the article content.');
  }
}

function closeArticle() {
  document.getElementById('article-container').style.display = 'none';
  if (!window.matchMedia("(max-width: 550px)").matches) {
    document.getElementById('articles-link').style.color = '#25121B';
  }
  history.replaceState(null, null, ' ');
}

function scrollFun() {
  var container = document.querySelector('.article-container');
  var winScroll = container.scrollTop;
  var height = container.scrollHeight - container.clientHeight;
  var scrolled = (winScroll / height) * 100;
  document.getElementById("myBar").style.width = scrolled + "%";

  scrollTopButton = document.getElementById("scrollTopBtn");
  if (container.scrollTop > 400) {
    scrollTopButton.style.display = "block";
  } else {
    scrollTopButton.style.display = "none";
  }
}

function scrollToTop() {
  var component = document.getElementById("article-container");
  component.scrollTo({top: 0, behavior: 'smooth'});
}

function handleSelectAll(isFromSelectAllCheckbox = false) {
  const isMobile = window.matchMedia("(max-width: 550px)").matches;
  const selectAllId = isMobile ? 'mobileSelectAllInput' : 'selectAllInput';
  var box = document.getElementById(selectAllId);

  if (isFromSelectAllCheckbox) {
      if (box.checked && selectedCategories.length === 0) {
          return;
      }
      if (box.checked) {
          selectedCategories = [];
      } else {
          selectedCategories = [];
      }
  } else {
      if (box.checked && selectedCategories.length === 0) {
          return;
      }
      selectedCategories = [];
      if (box) box.checked = true;
  }

  const card = document.querySelector('.card');
  if (card) card.classList.add('hidden-element');

  if (lastClickedFeatureCategory && lastClickedFeatureName) {
    updateIconState(lastClickedFeatureName, `${iconPaths[lastClickedFeatureCategory]}_normal`);
    lastClickedFeatureName = null;
    lastClickedFeatureCategory = null;
  }
  
  const labelContainer = document.getElementById("dynamicLabelContainer");
  if (labelContainer) {
      labelContainer.innerHTML = '';
      labelContainer.style.display = 'none';
  }

  updateObjectiveListAppearance();
  populateGalleryContainer();
}

let currentLang = 'ro';

const translations = {
    ro: {},
    en: {}
};

// Load translation files (JSON)
async function loadTranslations() {
  try {
    const enResponse = await fetch('en.json');
    translations.en = await enResponse.json();

    const roResponse = await fetch('ro.json');
    translations.ro = await roResponse.json();

    return true;
  } catch(error) {
    console.error("Error while loading the language configurations: ", error);
    return false;
  }
}

async function changeLanguage(event, langToChangeTo = null) {
  event.preventDefault();

  if (langToChangeTo && langToChangeTo === currentLang) {
    return;
  }

  let isJsonLoaded = true;
  if (Object.keys(translations.ro).length === 0) {
    isJsonLoaded = await loadTranslations();
  }

  let oldLang = currentLang;

  if (isJsonLoaded) {
    const newLang = langToChangeTo ? langToChangeTo : Object.keys(translations).filter(l => l !== currentLang)[0];
    const isMobile = window.matchMedia("(max-width: 550px)").matches;

    if (isMobile) {
      document.getElementById("langro").style.textDecoration = "none";
      document.getElementById("langen").style.textDecoration = "none";
      var element = document.getElementById("lang" + newLang);
      element.style.textDecoration = "underline";
      element.style.textUnderlineOffset = "2px";
      element.style.textDecorationThickness = "1px";

      var menuButton = document.querySelector('.mobile-menu-button');
      let spanElem = menuButton.querySelector('span');
      if (spanElem) {
        spanElem.textContent = newLang === 'ro' ? "ÎNCHIDE" : "CLOSE";
      }
    }

    Object.keys(translations[newLang]).forEach(elemId => {
      if (elemId === 'objList') {
        const targetId = isMobile ? 'mobileObjList' : 'objList';
        let elem = document.getElementById(targetId);
        if (elem) {
          const numberMatch = elem.textContent.match(/\d+/);
          const number = numberMatch ? numberMatch[0] : '0';
          elem.textContent = translations[newLang][elemId] + " (" + number + ")";
        }
        return;
      }

      if (window.matchMedia("(max-width: 550px)").matches) {
        if (elemId === 'locations-panel-title' || elemId === 'filters-panel-name' || elemId === "mobile-articles-link" || elemId === 'mobile-obiective-btn' || elemId === 'mobile-filtre-btn') {
          const targetElem = document.getElementById(elemId);
          if (targetElem && targetElem.childNodes.length > 0) {
            targetElem.childNodes[0].nodeValue = translations[newLang][elemId];
          }
          return;
        }
      } else if (elemId.startsWith("mobile")) {
        return;
      }
      
      const elementToTranslate = document.getElementById(elemId);
      if(elementToTranslate) elementToTranslate.textContent = translations[newLang][elemId];
    });

    if (isMobile) {
        const trans = translations[newLang];
        document.querySelector('#mobile-discover-panel .discover-title').childNodes[0].nodeValue = trans['discover-title-mobile'];
        document.getElementById('mobile-filters-panel-name').childNodes[0].nodeValue = trans['filters-title-mobile'];

        document.getElementById('mobileSearchInput').placeholder = trans['searchInput'];
        
        const selectAllMobile = document.getElementById('mobileSelectAllLabelText');
        if (selectAllMobile) selectAllMobile.textContent = trans['selectAllLabelText'];

        const mobileSectionTitles = {
          'mobile-filtre-organizatii': trans['filtre-organizatii'],
          'mobile-prop-class': trans['prop-class']
        };
        for (const id in mobileSectionTitles) {
            const elem = document.getElementById(id);
            if (elem) elem.textContent = mobileSectionTitles[id];
        }

        const mobileLabels = {
            'mobile-fund-txt': trans['fund-txt'],
            'mobile-priv-inst-txt': trans['priv-inst-txt'],
            'mobile-pub-inst-txt': trans['pub-inst-txt'],
            'mobile-ong-txt': trans['ong-txt']
        };
        for (const id in mobileLabels) {
            const elem = document.getElementById(id);
            if (elem) elem.textContent = mobileLabels[id];
        }

        const mobileButtons = {
            'mobile-historicalMonument': trans['historicalMonument'],
            'mobile-unclassified': trans['unclassified']
        };
        for (const id in mobileButtons) {
            const elem = document.getElementById(id);
            if (elem) elem.textContent = mobileButtons[id];
        }

        const mobileEngageElements = {
          'mobile-engage-title-1': trans['engage-title-1'],
          'mobile-engage-text-1': trans['engage-text-1'],
          'mobile-engage-button-text': trans['mobile-engage-button-text'],
          'mobile-engage-title-2': trans['engage-title-2'],
          'mobile-engage-text-2': trans['engage-text-2']
        };
        for (const id in mobileEngageElements) {
            const elem = document.getElementById(id);
            if (id === 'mobile-engage-text-2' && elem) {
                elem.innerHTML = mobileEngageElements[id];
            } else if (elem) {
                elem.textContent = mobileEngageElements[id];
            }
        }
    }

    document.getElementById('searchInput').placeholder = translations[newLang]['searchInput'];
    document.getElementById('about-us-first-p').innerHTML = translations[newLang]['about-us-first-p'];
    document.getElementById('about-us-second-p').innerHTML = translations[newLang]['about-us-second-p'];
    document.getElementById('disclaimer-afcn').innerHTML = translations[newLang]['disclaimer-afcn'];

    const listItems = document.querySelectorAll('#custom-bulleted-list li, #mobileCustomBulletedList li');
    listItems.forEach(li => {
      const oldName = li.textContent;
      li.textContent = categoryTranslation[currentLang][oldName];
      const oldCat = li.getAttribute('data-category-name');
      li.setAttribute('data-category-name', categoryTranslation[currentLang][oldCat]);
    });

    let labelContainer = document.getElementById("dynamicLabelContainer");
    if (labelContainer.children.length > 0 && labelContainer.style.display !== 'none') {
      Array.from(labelContainer.children).forEach(child => {
        let textField = child.querySelector('.dynamic-label-text');
        const oldLabel = textField.textContent;

        let newLabel;
        if (labelTranslation[currentLang][oldLabel]) {
            newLabel = labelTranslation[currentLang][oldLabel];
        } else if (periodTranslation[currentLang][oldLabel.replace(/\s/g, '')]) { // Check clean value "1990-prezent"
            newLabel = periodTranslation[currentLang][oldLabel]; // Get display value "1990 - present"
        } else if (styleTranslation[currentLang][oldLabel]) {
            newLabel = styleTranslation[currentLang][oldLabel];
        } else {
            newLabel = oldLabel; // Fallback
        }
        textField.textContent = newLabel;
      });
    }

    let uniqueCatTranslated = [];
    uniqueCategories.forEach(cat => uniqueCatTranslated.push(categoryTranslation[currentLang][cat]));
    uniqueCategories = uniqueCatTranslated;

    if (selectedCategories.length > 0) {
      let catTranslated = [];
      selectedCategories.forEach(cat => catTranslated.push(categoryTranslation[currentLang][cat]));
      selectedCategories = catTranslated;
    }

    if (clasare !== '') {
      clasare = labelTranslation[currentLang][clasare];
    }
    if (orgs.length > 0) {
      orgs.forEach((org, index) => {
        orgs[index] = labelTranslation[currentLang][org];
      });
    }
    if (periods.length > 0) {
      periods.forEach((period, index) => {
        periods[index] = periodTranslation[currentLang][period];
      });
    }
    if (styles.length > 0) {
      styles.forEach((style, index) => {
        styles[index] = styleTranslation[currentLang][style];
      });
    }

    const languageLink = document.getElementById('language-link');
    if(languageLink) languageLink.childNodes[0].textContent = currentLang.toUpperCase();

    const allArticleCards = document.querySelectorAll('.article-card');
    allArticleCards.forEach((articleCard) => {
      const titleElement = articleCard.querySelector('.article-card-title');
      if (titleElement) {
          const currentTitle = titleElement.textContent.trim();
          const newTitle = articleTitleTranslation[oldLang][currentTitle];
          if (newTitle) {
              titleElement.textContent = newTitle;
          }
      }
    });

    currentLang = newLang;

    if (lastClickedFeatureName !== null) {
      let feature = nameToFeature[lastClickedFeatureName];
      const cardCategory = document.querySelector('.card-category');
      const categoriesKey = `Categories_${currentLang}`;
      const category = feature.properties[categoriesKey].split(/[,;]+/).map(s => s.trim())[0];
      cardCategory.style.color = `${getCategoryColor(category)}`;
      cardCategory.textContent = category;

      const descriereKey = `Descriere_${currentLang}`;
      let contentArr = feature.properties[descriereKey].split('\n').filter(l => l.length > 0 && l.trim() !== '');
      const cardText = document.querySelector('.card-text');
      if (contentArr.length !== 0) {
        cardText.textContent = contentArr[0];
      } else if (getArticleDescr(lastClickedFeatureName)) {
        cardText.textContent = getArticleDescr(lastClickedFeatureName);
      } else {
        cardText.textContent = currentLang === 'ro' ? "Mai multe detalii în curând." : "More details soon.";
      }
    }

    refreshOrFillReadMore();

    if (document.getElementById('article-container').style.display !== 'none') {
      var articleTitleElem = document.querySelector('.article-title');
      if (articleTitleElem) openArticle(null, articleTitleElem.textContent, false, false);
    }

    if (!isMobile) {
      var artCat = document.getElementById('article-category-desktop');
      if (artCat && artCat.textContent) {
        artCat.textContent = categoryTranslation[oldLang][artCat.textContent.charAt(0) +
          artCat.textContent.substring(1).toLowerCase()].toUpperCase();
      }
    }
  }
}

function getArticleDescr(articleName) {
  const articleToLangToDescr = {
    ro: {
      "Suprainfinit Gallery": "Primul text din cadrul proiectului Filtru Cultural București intră în dialog cu galeria de artă Suprainfinit, poziționată în centrul simbolic al cartierului Mântuleasa.",
      "Centrul de Resurse în Fotografie": "Al doilea text din cadrul proiectului Filtru Cultural București intră în dialog cu Centrul de Resurse în Fotografie.",
      "Atelierele Scânteia" : "Ultimul text din cadrul proiectului Filtru Cultural București intră în dialog cu Atelierele Scânteia.",
      "Paper Traffic": "Al patrulea text din cadrul proiectului Filtru Cultural București intră în dialog cu Paper Traffic, un spațiu hibrid între librărie, galerie și frizerie, aflat pe terasa de la etajul Halelor Obor.",
      "Teatrul Masca": "Pentru cea de-a doua ediție a proiectului Filtru Cultural, care și-a extins granițele către inițiative culturale din inelul doi al Bucureștiului, am deschis un dialog cu Teatrul Masca.",
      "Casa Memorială Tudor Arghezi — Mărțișor": "Textul are ca punct de plecare o vizită la Casa Memorială „Tudor Arghezi” din București, unde am stat de vorbă cu Dorotheea Nicolescu, muzeografă aici de peste 15 ani."
    },

    en: {
      "Suprainfinit Gallery": "The first text of the project Filtru Cultural București enters into dialogue with the art gallery Suprainfinit, located in the symbolic center of the Mântuleasa district.",
      "Centrul de Resurse în Fotografie": "The second text of the project Filtru Cultural București enters into dialog with the Centre for Photographic Resources.",
      "Atelierele Scânteia" : "The last text of the project Filtru Cultural București enters into dialogue with Atelierele Scânteia.",
      "Paper Traffic": "The fourth text within the project Filtru Cultural Bucharest enters into a dialogue with Paper Traffic, a hybrid space between bookstore, gallery and barbershop, located on the upstairs terrace of the Obor Halls.",
      "Teatrul Masca": "For the second edition of the Filtru Cultural project, which has extended its focus toward cultural initiatives in Bucharest’s outer ring of neighborhoods, we started a dialogue with Masca Theater.",
      "The “Tudor Arghezi” Memorial House": "The text takes as its starting point a visit to the Tudor Arghezi Memorial House in Bucharest, where we spoke with Dorotheea Nicolescu, who has been a curator here for over fifteen years."
    }
  };
  return articleToLangToDescr[currentLang][articleName];
}

function scrollToSection(sectionId, event = null) {
  if (event) {
    event.preventDefault();
  }
  var element = document.getElementById(sectionId);
  element.scrollIntoView({ behavior: 'smooth' });
}

function toggleCDRFText() {
  var footnotes = document.getElementById("footnotes-cdrf");
  var moreText = document.getElementById("footnotes-more-text");
  var expandBtn = document.getElementById("expand-text-btn");

  if (footnotes.classList.contains("expanded")) {
    // Collapsing (Read less)
    footnotes.classList.remove("expanded");

    // Set max-height back to 0 for collapse
    moreText.style.maxHeight = 0;
    if (currentLang === 'ro') {
      expandBtn.innerHTML = "Continuați să citiți ↓"; // Down arrow
    } else {
      expandBtn.innerHTML = "Read more ↓";
    }
} else {
    // Expanding (Read more)
    footnotes.classList.add("expanded");

    // Dynamically calculate the actual height of the content
    var fullHeight = moreText.scrollHeight + "px";

    // Animate by setting max-height to the content's full height
    moreText.style.maxHeight = fullHeight;
    if (currentLang === 'ro') {
      expandBtn.innerHTML = "Citește mai puțin ↑";
    } else {
      expandBtn.innerHTML = "Read less ↑"; // Up arrow
    }
  }
}

async function loadArticle(articleName) {
  let nameToFile = {
    "Suprainfinit Gallery" : "suprainfinit",
    "Centrul de Resurse în Fotografie" : "cdrf",
    "Atelierele Scânteia" : "atsc",
    "Paper Traffic" : "pprt",
    "Teatrul Masca" : "masca",
    "Masca Theater" : "masca",
    "Casa Memorială Tudor Arghezi — Mărțișor" : "arghezi",
    "The “Tudor Arghezi” Memorial House" : "arghezi",
    "Scânteia Workshops" : "atsc",
    "Photography Resource Centre (CdRF)" : "cdrf",
    "Photography Resource Centre" : "cdrf",
    "Centrul de Resurse în Fotografie (CdRF)" : "cdrf",
  };
  const articleContent = document.getElementById('article-content-id');
  try {
      // Fetch the HTML file for the selected article and language
      const response = await fetch(`articles/${nameToFile[articleName]}_${currentLang}.html`);
      const data = await response.text();

      // Replace the content of the article section with the loaded HTML
      articleContent.innerHTML = data;

      // Now the HTML is loaded, so we can manipulate the DOM safely
      return true; // Indicate that the article has been successfully loaded
  } catch (error) {
      console.error('Error loading the article:', error);
      return false; // Indicate failure
  }
}


const filterLabelsContainer = document.getElementById('filterLabelsContainer')

// helper: show or hide the whole container
function refreshDynamicContainer() {
  filterLabelsContainer.style.display = filterLabelsContainer.children.length
    ? 'flex'
    : 'none'
}

// helper: rebuild “Anulează tot” pill if needed
function ensureCancelAll() {
  // if there are user-picked pills but no “cancel-all” yet…
  if (
    filterLabelsContainer.children.length >= 1 &&
    !filterLabelsContainer.querySelector('[data-cancel-all]')
  ) {
    const pill = document.createElement('div')
    pill.className = 'dynamic-label'
    pill.setAttribute('data-cancel-all', 'true')
    pill.innerHTML = `
      <span class="dynamic-label-text">Anulează tot</span>
      <span class="dynamic-label-close-btn"></span>
    `
    filterLabelsContainer.appendChild(pill)
  }
}

// adds a single pill for a filter
function addFilterPill(type, value, id) {
  // guard-rail: don’t double-add
  if (filterLabelsContainer.querySelector(`[data-type="${type}"][data-value="${value}"]`))
    return;

  const pill = document.createElement('div');
  pill.className = 'dynamic-label';
  pill.setAttribute('data-type', type);
  pill.setAttribute('data-value', value);
  pill.innerHTML = `
    <span class="dynamic-label-text">${value}</span>
    <span class="dynamic-label-close-btn"></span>
  `;
  filterLabelsContainer.insertBefore(pill, filterLabelsContainer.firstChild);
  refreshDynamicContainer();
  ensureCancelAll();
}

// removes a pill matching type/value
function removeFilterPill(type, value) {
  const pill = filterLabelsContainer.querySelector(`[data-type="${type}"][data-value="${value}"]`)
  if (pill) pill.remove()
  const onlyCancelAll =
    filterLabelsContainer.children.length === 1 &&
    filterLabelsContainer.querySelector('[data-cancel-all]')
  if (onlyCancelAll) filterLabelsContainer.innerHTML = ''
  refreshDynamicContainer()
}


// catch clicks on the pills container
filterLabelsContainer.addEventListener('click', e => {
  const isMobile = window.matchMedia("(max-width: 550px)").matches;
   // 1) if they clicked the ✕ on a pill…
  const pill = e.target.closest('.dynamic-label:not([data-cancel-all])');
  if (pill && e.target.classList.contains('dynamic-label-close-btn')) {
    const { type, value } = pill.dataset; // 'type' is 'tip', 'keyword', 'free', 'ticket', etc.
                                         // 'value' is the display text of the pill.
    // Always remove the pill from display first
    removeFilterPill(type, value); // This function handles UI for removing the pill itself

    let checkboxToModify;
    let panelIdForButtonUpdate;
    let buttonIdForUpdate;

    if (type === 'tip' || type === 'keyword') {
      if (!isMobile) { // Desktop
        panelIdForButtonUpdate = (type === 'tip') ? 'event-type-panel' : 'keywords-panel';
        buttonIdForUpdate = (type === 'tip') ? 'event-type-btn' : 'keywords-btn';
        const panel = document.getElementById(panelIdForButtonUpdate);
        if (panel) {
          checkboxToModify = panel.querySelector(`input[type="checkbox"][value="${value}"]`);
        }
      } else { // Mobile
        const listId = (type === 'tip') ? 'mobile-type-list' : 'mobile-keywords-list';
        const list = document.getElementById(listId);
        if (list) {
          // For mobile 'tip', the pill 'value' is just the label part e.g. "Seminar"
          // Checkbox value attribute is also just the label part e.g. "Seminar"
          // So, this query should work.
          checkboxToModify = list.querySelector(`input[type="checkbox"][value="${value}"]`);
        }
      }
    } else if (type === 'free-entry-btn' || type === 'ticket-btn') { // Desktop Free/Ticket buttons acting as filters
        // These don't have separate checkboxes in a dropdown, their state is the button itself.
        // removeFilterPill() already removed the pill.
        // We need to reset the button's visual state.
        const btn = document.getElementById(type); // type here is the button's ID
        if (btn && btn.classList.contains('red')) {
            btn.classList.remove('red');
            btn.style.background = '#FBF6EF';
            btn.style.color      = '#3E1928';
        }
    } else if (type === 'free' || type === 'ticket') { // Mobile Free/Ticket checkboxes
        checkboxToModify = document.getElementById(
            type === 'free' ? 'mobile-free-entry' : 'mobile-ticket'
        );
    }

    // If a corresponding checkbox was found and is checked, uncheck it
    if (checkboxToModify && checkboxToModify.checked) {
      checkboxToModify.checked = false;
    }

    // Manually update desktop dropdown button appearance if applicable
    if (!isMobile && panelIdForButtonUpdate && buttonIdForUpdate) {
      updateDropdownButtonState(buttonIdForUpdate, panelIdForButtonUpdate);
    }

    // Re-apply all filters and update counts/dropdowns
    applyAllEventsFiltersAndPopulate();
    return;
  }

  // 2) if they clicked the “Anulează tot” pill itself…
  if (e.target.closest('[data-cancel-all]')) {
    // desktop
    document
      .querySelectorAll('#event-type-panel input, #keywords-panel input')
      .forEach(i => {
        if (i.checked) i.click() // will cascade and remove every pill
      })

    // —— mobile panels ——
    // 1) clear the mobile types & keywords lists
    document
      .querySelectorAll(
        '#mobile-type-list input[type="checkbox"], ' +
        '#mobile-keywords-list input[type="checkbox"]'
      )
      .forEach(cb => { cb.checked = false })

    // 2) clear the free-entry / ticket toggles
    const mFree   = document.getElementById('mobile-free-entry')
    const mTicket = document.getElementById('mobile-ticket')
    if (mFree)   mFree.checked   = false
    if (mTicket) mTicket.checked = false

    // all dynamic labels
    Array.from(
      filterLabelsContainer
        .querySelectorAll('.dynamic-label:not([data-cancel-all]) .dynamic-label-close-btn')
    ).forEach(closeBtn => closeBtn.click());
  }
});

document.addEventListener('DOMContentLoaded', () => {
  ['free-entry-btn', 'ticket-btn'].forEach(btnId => {
    const btn = document.getElementById(btnId);
    btn.addEventListener('click', () => {
      // grab its display text
      const labelText = btn.querySelector('.filter-text')?.textContent.trim() 
                        || btn.textContent.trim();
      const isActive  = btn.classList.contains('red');

      if (!isActive) {
        // add the pill (data-type=btnId, data-value=labelText),
        // then refresh + auto-insert “Anulează tot”
        addFilterPill(btnId, labelText);
      } else {
        // remove that pill (and auto-cleanup “Anulează tot”)
        removeFilterPill(btnId, labelText);
      }

      // mirror the styling logic in toggleCalendar/updateDropdown:
      btn.classList.toggle('red', !isActive);
      btn.style.background = !isActive ? '#AD537C' : '#FBF6EF';
      btn.style.color      = !isActive ? '#F6F4EA' : '#3E1928';

      applyAllEventsFiltersAndPopulate();
    });
  });
});

function createEventCardElement(eventData, clickHandler) {
  const art = document.createElement('article');
  art.className = 'event-card';

  if (clickHandler && typeof clickHandler === 'function') {
      art.onclick = clickHandler;
  } else if (typeof openEventDetailPanel === 'function' && eventData && eventData.title) {
      // Default click handler to open the event detail panel if available
      art.onclick = () => openEventDetailPanel(eventData.title);
  }

  const currentEventData = eventData || {};
  const titleText = currentEventData.title || (currentLang === 'ro' ? "Eveniment fără titlu" : "Untitled Event");
  const addressText = currentEventData.address || (currentLang === 'ro' ? "Locație neprecizată" : "Location not specified");
  const categoryText = currentEventData.category || (currentLang === 'ro' ? "Necategorisit" : "Uncategorized");
  const imageUrl = currentEventData.image || 'https://placehold.co/284x180/EAAAC8/3E1928'; // Default placeholder
  const timeText = currentEventData.time || (currentLang === 'ro' ? "Data neprecizată" : "Date not specified");

  const altImageText = (currentLang === 'ro' ? 'Imagine eveniment: ' : 'Event image: ') + titleText;
  const altLocationIconText = currentLang === 'ro' ? 'icon locație' : 'location icon';

  // --- Dynamic Height Adjustments ---
  const isMobileCard = window.matchMedia("(max-width: 550px)").matches;
  if (isMobileCard) {
      if (titleText.length > 50) { // Example condition for mobile
          art.style.height = '350px';
      } else {
          art.style.height = '330px'; // Default mobile card height
      }
  }

  art.innerHTML = `
    <img
      src="${imageUrl}"
      class="event-image"
      alt="${altImageText}"
      onerror="this.onerror=null; this.src='https://placehold.co/284x180/EAAAC8/3E1928';" 
      />
    <section class="event-details">
      <div class="event-info">
        <div class="event-content">
          <p class="event-category">${categoryText.toUpperCase()}</p>
          <h2 class="event-title">${titleText}</h2>
          <div class="event-location">
            <img
              src="Pin.svg"
              class="location-icon"
              alt="${altLocationIconText}"
            />
            <p class="location-address">${addressText}</p>
          </div>
        </div>
      </div>
      <time class="event-time">${timeText}</time>
    </section>
  `;

  return art;
}

async function populateRelatedEventsForReadMore(featureName) {
  const isMobile = window.matchMedia("(max-width: 550px)").matches;
  const wrapperId = isMobile ? 'readMoreRelatedEventsWrapperMobile' : 'readMoreRelatedEventsWrapperDesktop';
  const containerId = isMobile ? 'readMoreRelatedEventsContainerMobile' : 'readMoreRelatedEventsContainerDesktop';
  const titleId = isMobile ? 'readMoreRelatedSectionTitleMobile' : 'readMoreRelatedSectionTitleDesktop';

  const relatedWrapper = document.getElementById(wrapperId);
  const relatedContainer = document.getElementById(containerId);
  const relatedTitleElement = document.getElementById(titleId);

  if (!relatedWrapper || !relatedContainer || !relatedTitleElement) {
      console.warn("Related events section elements for Read More page not found.");
      return;
  }

  relatedContainer.innerHTML = ''; // Clear previous events

  // Ensure masterEventList is populated (await if necessary)
  if (!initialEventsFetchPromise) {
      console.warn("Initial event fetch promise not available for Read More related events. Attempting to fetch.");
      initialEventsFetchPromise = fetchAndPrepareInitialEventData();
  }
  try {
      await initialEventsFetchPromise; // Wait for events to be loaded
  } catch (error) {
      console.error("Error ensuring masterEventList is populated:", error);
      relatedWrapper.style.display = 'none';
      return;
  }

  if (!masterEventList || masterEventList.length === 0 || !featureName) {
      relatedWrapper.style.display = 'none';
      return;
  }

  const todayForFilter = new Date();
  todayForFilter.setHours(0, 0, 0, 0);

  const eventsAtLocation = masterEventList.filter(event => {
      if (!event.airtableFields || !event.airtableFields.Location || !event.airtableFields.Start) {
          return false;
      }
      // Case-insensitive and trim comparison for location
      if (event.airtableFields.Location.trim().toLowerCase() !== featureName.trim().toLowerCase()) {
          return false;
      }

      // Filter out past events (same logic as in applyAllEventsFiltersAndPopulate)
      const eventStartDateObj = new Date(event.airtableFields.Start);
      const eventEndDateObj = event.airtableFields.End ? new Date(event.airtableFields.End) : null;

      if (eventEndDateObj) { // Event has an end date
          return eventEndDateObj >= todayForFilter;
      } else { // Event only has a start date
          const eventStartDayEnd = new Date(eventStartDateObj);
          eventStartDayEnd.setHours(23, 59, 59, 999);
          return eventStartDayEnd >= todayForFilter;
      }
  }).sort((a, b) => new Date(a.airtableFields.Start) - new Date(b.airtableFields.Start)); // Sort by date

  if (eventsAtLocation.length === 0) {
      relatedWrapper.style.display = 'none';
  } else {
      // Update title based on language and featureName
      let locationDisplayName = featureName;
      // If featureName is a key in articleTitleTranslation, use the translated name for display
      if (articleTitleTranslation[currentLang] && articleTitleTranslation[currentLang][featureName]) {
          locationDisplayName = articleTitleTranslation[currentLang][featureName];
      }
      relatedTitleElement.textContent = currentLang === 'ro' ? `Evenimente la ${locationDisplayName}` : `Events at ${locationDisplayName}`;

      const maxEventsToShow = isMobile ? 3 : 5; // Show fewer on mobile if stacked vertically

      eventsAtLocation.slice(0, maxEventsToShow).forEach(event => {
          const card = createEventCardElement(event, () => {
              // When a related event card is clicked on the Read More page
              closeReadMore(); // Close the current Read More page
              // Ensure events panel is shown if not already, then open detail
              const eventsContainer = document.getElementById('events-container');
              if (eventsContainer.style.display === 'none' || eventsContainer.style.display === '') {
                  toggleEvents({ preventDefault: () => {} }); // Open events panel
                   // Wait a brief moment for panel to initialize if needed, then open detail
                  setTimeout(() => {
                     openEventDetailPanel(event.title);
                  }, 100); // Adjust delay if necessary
              } else {
                  openEventDetailPanel(event.title);
              }
          });
          relatedContainer.appendChild(card);
      });
      relatedWrapper.style.display = 'block'; // Show the section
  }
}

function createRelatedFeatureCardElement(featureData, clickHandler) {
  const art = document.createElement('article');
  art.className = 'event-card'; // Use the existing event-card class

  if (clickHandler && typeof clickHandler === 'function') {
      art.onclick = clickHandler;
  }

  // Ensure featureData and its properties exist, providing fallbacks
  const properties = featureData && featureData.properties ? featureData.properties : {};
  
  const featureName = properties.Name || (currentLang === 'ro' ? "Locație fără nume" : "Unnamed Location");
  
  const categoriesKey = `Categories_${currentLang}`;
  const primaryCategory = (properties[categoriesKey] ? properties[categoriesKey].split(/[,;]+/)[0].trim() : (currentLang === 'ro' ? "Necategorisit" : "Uncategorized"));
  
  const address = properties.Address || (currentLang === 'ro' ? "Adresă neprecizată" : "Address not specified");

  // 1. Determine the imageUrl (Main display image of the feature)
  let imageUrl;
  const featurePicsDirName = titleToPicsDir(featureName); // Assumes titleToPicsDir is globally available
  const numFeaturePics = picsDirToNum[featurePicsDirName] || 0; // Assumes picsDirToNum is globally available

  if (numFeaturePics > 0) {
      imageUrl = buildPicPath(featurePicsDirName, 0); // Assumes buildPicPath is globally available
  } else {
      // Fallback if feature has no images in picsDirToNum
      imageUrl = 'https://placehold.co/284x180/E0E0E0/E0E0E0'; // Generic placeholder
  }

  const altImageText = (currentLang === 'ro' ? 'Imagine locație: ' : 'Location image: ') + featureName;
  const altLocationIconText = currentLang === 'ro' ? 'icon adresă' : 'address icon';

  // 2. Determine timeText (Short description preview)
  const descriereKey = `Descriere_${currentLang}`;
  const fullDescription = properties[descriereKey] ? properties[descriereKey].split('\n')[0].trim() : ''; // Use first line as a base for preview
  const previewLength = 90;
  let timeText;

  if (fullDescription) {
      if (fullDescription.length > previewLength) {
          timeText = fullDescription.substring(0, previewLength) + "...";
      } else {
          timeText = fullDescription;
      }
  } else {
      timeText = ""; // Empty if no description, or a fallback like "Detalii locație" / "Venue Details"
  }

  const isMobileCard = window.matchMedia("(max-width: 550px)").matches;
  if (isMobileCard) {
      // Example: Adjust height if name is very long or description preview is substantial
      if (featureName.length > 40 || (timeText.length > 50 && featureName.length > 20)) {
          art.style.height = '350px';
      } else {
          art.style.height = '330px'; // Default mobile card height
      }
  } 

  art.innerHTML = `
    <img
      src="${imageUrl}"
      class="event-image"
      alt="${altImageText}"
      style="object-fit: cover; padding: 0;"
      onerror="this.onerror=null; this.src='https://placehold.co/284x180/E0E0E0/E0E0E0';"
    />
    <section class="event-details">
      <div class="event-info">
        <div class="event-content">
          <p class="event-category">${primaryCategory.toUpperCase()}</p>
          <h2 class="event-title">${featureName}</h2>
          <div class="event-location">
            <img
              src="Pin.svg"
              class="location-icon"
              alt="${altLocationIconText}"
            />
            <p class="location-address">${address}</p>
          </div>
        </div>
      </div>
      <time class="event-time">${timeText}</time> 
    </section>
  `;
  return art;
}


async function populateRelatedFeaturesByCategory(currentFeatureName, currentFeaturePrimaryCategory, currentFeatureCoords) {
  const isMobile = window.matchMedia("(max-width: 550px)").matches;
  // IDs for the "related features by category" section
  const wrapperId = isMobile ? 'categoryRelatedFeaturesWrapperMobile' : 'categoryRelatedFeaturesWrapperDesktop';
  const containerId = isMobile ? 'categoryRelatedFeaturesContainerMobile' : 'categoryRelatedFeaturesContainerDesktop';
  const titleId = isMobile ? 'categoryRelatedFeaturesTitleMobile' : 'categoryRelatedFeaturesTitleDesktop';

  const relatedWrapper = document.getElementById(wrapperId);
  const relatedContainer = document.getElementById(containerId);
  const relatedTitleElement = document.getElementById(titleId);

  if (!relatedWrapper || !relatedContainer || !relatedTitleElement) {
      console.warn("Related features by category section elements for Read More page not found.");
      return;
  }

  relatedContainer.innerHTML = ''; // Clear previous cards

  if (!geojsonData || !geojsonData.features || geojsonData.features.length === 0 || !currentFeaturePrimaryCategory || !currentFeatureCoords) {
      relatedWrapper.style.display = 'none';
      return;
  }

  const categoriesKey = `Categories_${currentLang}`;

  let relatedFeatures = geojsonData.features.filter(feature => {
      if (feature.properties.Name === currentFeatureName) {
          return false;
      }
      const featureCategoriesArray = feature.properties && feature.properties[categoriesKey]
                                  ? feature.properties[categoriesKey].split(/[,;]+/)
                                  : [];
      const featurePrimaryCategory = featureCategoriesArray.length > 0 ? featureCategoriesArray[0].trim() : null;

      if(featurePrimaryCategory !== currentFeaturePrimaryCategory) {
          return false;
      }

      const descriereKey = `Descriere_${currentLang}`;
      const description = feature.properties[descriereKey];
      // These locations have separate articles, so they are valid even without a description in the spreadsheet.
      const specialArticleLocations = ["Suprainfinit Gallery", "Centrul de Resurse în Fotografie", 
          "Atelierele Scânteia", "Paper Traffic", "Teatrul Masca", "Casa Memorială Tudor Arghezi — Mărțișor"];

      if ((!description || description.trim() === '') && !specialArticleLocations.includes(feature.properties.Name)) {
          return false; // Exclude if description is empty and it's not a special article location
      }

      // A place has a placeholder if it has no pictures defined in the system.
      const featurePicsDirName = titleToPicsDir(feature.properties.Name);
      const numFeaturePics = picsDirToNum[featurePicsDirName] || 0;
      if (numFeaturePics === 0) {
          return false; // Exclude if the location has no pictures
      }

      // If all checks pass, keep the feature
      return true;
  });

  if (relatedFeatures.length === 0) {
      relatedWrapper.style.display = 'none';
      return;
  }

  // Calculate distances for valid features
  const fromPoint = turf.point(currentFeatureCoords);
  relatedFeatures = relatedFeatures.map(feature => {
      if (!feature.geometry || !feature.geometry.coordinates) {
          return { ...feature, distance: Infinity };
      }
      const toPoint = turf.point(feature.geometry.coordinates);
      const distance = turf.distance(fromPoint, toPoint, { units: 'kilometers' });
      return { ...feature, distance: distance };
  });

  // Sort by distance and take top 5
  relatedFeatures.sort((a, b) => a.distance - b.distance);
  const closestFeatures = relatedFeatures.slice(0, 5);

  if (closestFeatures.length === 0) {
      relatedWrapper.style.display = 'none';
  } else {
      relatedTitleElement.textContent = currentLang === 'ro' ? `Obiective similare din apropriere` : `Similar landmarks nearby`;

      closestFeatures.forEach(featureItem => {
          const card = createRelatedFeatureCardElement(featureItem, () => {
              closeReadMore();
              openReadMore(featureItem.properties.Name); 
          });
          relatedContainer.appendChild(card);
      });
      relatedWrapper.style.display = 'block';
  }
}


function handleToolbarClick(clickedButton) {
  const buttons = document.querySelectorAll('.mobile-toolbar .toolbar-button');
  buttons.forEach(btn => {
      btn.classList.remove('active');
  });

  clickedButton.classList.add('active');

  switch (clickedButton.id) {
    case 'mobile-toolbar-map':
        showMapView();
        break;
    case 'mobile-toolbar-filters':
        showFiltre();
        break;
    case 'mobile-toolbar-search':
        showObiective();
        break;
    case 'mobile-toolbar-events':
        toggleEvents({ preventDefault: () => {} });
        break;
    case 'mobile-toolbar-articles':
        openMobileArticlesPage();
        break;
  }
}

function resetToolbarToMapView() {
  const buttons = document.querySelectorAll('.mobile-toolbar .toolbar-button');
  buttons.forEach(btn => {
      btn.classList.remove('active');
  });

  const mapButton = document.getElementById('mobile-toolbar-map');
  if (mapButton) {
      mapButton.classList.add('active');
  }
}

function showMapView() {
  closeMobileMenu();
  const mapButton = document.getElementById('mobile-toolbar-map');
  if (mapButton && !mapButton.classList.contains('active')) {
      const buttons = document.querySelectorAll('.mobile-toolbar .toolbar-button');
      buttons.forEach(btn => btn.classList.remove('active'));
      mapButton.classList.add('active');
  }
}

function openMobileArticlesPage() {
  cleanupMobilePanels();
  const articlesPage = document.getElementById('mobile-articles-page');
  articlesPage.style.display = 'flex';
  articlesPage.scrollTop = 0;
}

function closeMobileArticlesPage() {
  const articlesPage = document.getElementById('mobile-articles-page');
  articlesPage.style.display = 'none';
  resetToolbarToMapView();
}

function updateToolbarActiveState(activeBtnId) {
  const buttons = document.querySelectorAll('.mobile-toolbar .toolbar-button');
  buttons.forEach(btn => {
      btn.classList.remove('active');
  });
  const activeButton = document.getElementById(activeBtnId);
  if (activeButton) {
      activeButton.classList.add('active');
  }
}

function setActiveDesktopLink(activeLinkId) {
  const linkIds = ['articles-link', 'archive-link', 'about-us-link', 'engage-link'];
  linkIds.forEach(id => {
      const link = document.getElementById(id);
      if (link) {
          link.style.color = (id === activeLinkId) ? '#AD537C' : '#25121B';
      }
  });
}

let currentArticleAudio = null;

function setupAudioPlayer(audioPlayerContainer) {
    const audioElement = audioPlayerContainer.querySelector('#articleAudioPlayer');
    const progressBar = audioPlayerContainer.querySelector('.progress-bar');
    const playPauseButton = audioPlayerContainer.querySelector('.play-pause-button');
    const rewindButton = audioPlayerContainer.querySelector('.rewind-button');
    const forwardButton = audioPlayerContainer.querySelector('.forward-button');
    const currentTimeSpan = audioPlayerContainer.querySelector('.current-time');
    const totalTimeSpan = audioPlayerContainer.querySelector('.total-time');

    if (!audioElement || !progressBar || !playPauseButton) return;

    let isDraggingProgressBar = false;

    playPauseButton.classList.remove('pause');
    playPauseButton.classList.add('play');

    const updatePlayerState = () => {
        if (audioElement.duration) {
            totalTimeSpan.textContent = formatTime(audioElement.duration);
            progressBar.max = audioElement.duration;
            progressBar.value = audioElement.currentTime;
            progressBar.style.setProperty('--progress', `${(audioElement.currentTime / audioElement.duration) * 100}%`);
        }
        currentTimeSpan.textContent = formatTime(audioElement.currentTime);
    };

    audioElement.addEventListener('canplay', updatePlayerState);
    if (audioElement.readyState >= 1) {
        updatePlayerState();
    }

    audioElement.addEventListener('timeupdate', () => {
        if (!isDraggingProgressBar) {
            updatePlayerState();
        }
    });

    audioElement.addEventListener('ended', () => {
        playPauseButton.classList.remove('pause');
        playPauseButton.classList.add('play');
        audioElement.currentTime = 0;
    });

    playPauseButton.onclick = () => {
        if (audioElement.paused) {
            audioElement.play();
            playPauseButton.classList.remove('play');
            playPauseButton.classList.add('pause');
        } else {
            audioElement.pause();
            playPauseButton.classList.remove('pause');
            playPauseButton.classList.add('play');
        }
    };

    rewindButton.onclick = () => {
        audioElement.currentTime = Math.max(0, audioElement.currentTime - 10);
    };

    forwardButton.onclick = () => {
        audioElement.currentTime = Math.min(audioElement.duration, audioElement.currentTime + 10);
    };

    progressBar.addEventListener('input', () => {
        isDraggingProgressBar = true;
        currentTimeSpan.textContent = formatTime(progressBar.value);
        progressBar.style.setProperty('--progress', `${(progressBar.value / progressBar.max) * 100}%`);
    });

    progressBar.addEventListener('change', () => {
        isDraggingProgressBar = false;
        audioElement.currentTime = progressBar.value;
    });

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }
}

function initializePlayerForCurrentArticle() {
  if (currentArticleAudio && !currentArticleAudio.paused) {
      currentArticleAudio.pause();
  }

  const articleContainer = document.getElementById('article-container');
  const audioPlayerContainer = articleContainer.querySelector('.audio-player-container');

  if (audioPlayerContainer) {
      currentArticleAudio = audioPlayerContainer.querySelector('#articleAudioPlayer');
      setupAudioPlayer(audioPlayerContainer);
  }
}

function setupArticleHeaderScroll() {
  if (window.matchMedia("(max-width: 550px)").matches) return;

  const scrollWrapper = document.querySelector('.article-header-scroll-wrapper');
  const leftArrow = document.getElementById('scroll-left-btn');
  const rightArrow = document.getElementById('scroll-right-btn');

  if (!scrollWrapper || !leftArrow || !rightArrow) {
    return;
  }

  const updateArrowState = () => {
    const { scrollLeft, scrollWidth, clientWidth } = scrollWrapper;

    const isAtStart = scrollLeft < 1;
    const isAtEnd = scrollLeft >= scrollWidth - clientWidth - 1;

    leftArrow.classList.toggle('disabled', isAtStart);
    rightArrow.classList.toggle('disabled', isAtEnd);
  };

  const scrollAmount = 300;
  rightArrow.addEventListener('click', () => { scrollWrapper.scrollLeft += scrollAmount; });
  leftArrow.addEventListener('click', () => { scrollWrapper.scrollLeft -= scrollAmount; });

  scrollWrapper.addEventListener('scroll', updateArrowState);

  const observer = new ResizeObserver(updateArrowState);
  observer.observe(scrollWrapper);
}