import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";
document.title = "Geocoin";

const STARTING_POSITION = leaflet.latLng(
  36.98949379578401,
  -122.06277128548504,
);
const MAP_ZOOM_LEVEL = 19;
const GRID_TILE_SIZE = 1e-4;
const SEARCH_RADIUS = 8;
const CACHE_PROBABILITY = 0.1;

interface GridTile {
  row: number;
  col: number;
}

class Cache {
  row: number;
  col: number;
  coins: { i: number; j: number; serial: number }[];

  constructor(row: number, col: number, initialCoins: number) {
    this.row = row;
    this.col = col;
    this.coins = Array.from(
      { length: initialCoins },
      (_, serial) => ({ i: row, j: col, serial }),
    );
  }

  toMomento(): string {
    return JSON.stringify(this.coins);
  }

  fromMomento(momento: string): void {
    this.coins = JSON.parse(momento);
  }
}

const activeCaches = new Map<string, Cache>();
const savedCacheStates = new Map<string, string>();

const PLAYER_HISTORY_KEY = "playerHistory";

const mapInstance = leaflet.map(document.getElementById("map")!, {
  center: STARTING_POSITION,
  zoom: MAP_ZOOM_LEVEL,
  minZoom: MAP_ZOOM_LEVEL,
  maxZoom: MAP_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
  dragging: false,
  keyboard: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: MAP_ZOOM_LEVEL,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(mapInstance);

const playerIconConfig = leaflet.icon({
  iconUrl: "/project/src/manEmoji.png",
  iconSize: [16, 16],
  tooltipAnchor: [-16, 16],
});
const playerMarker = leaflet.marker(STARTING_POSITION, {
  icon: playerIconConfig,
});
playerMarker.bindTooltip("You").addTo(mapInstance);

let totalCoins = 0;
const inventoryPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
inventoryPanel.innerHTML = "Empty";

const cacheIconConfig = leaflet.icon({
  iconUrl: "/project/src/backpackEmoji.png",
  iconSize: [16, 16],
  tooltipAnchor: [-16, 16],
  popupAnchor: [16, 16],
});

const tileFlyweightMap = new Map<string, GridTile>();

regenerateCaches();

const playerHistory = new leaflet.Polyline([], { color: "blue" }).addTo(
  mapInstance,
);

const savedHistory = localStorage.getItem(PLAYER_HISTORY_KEY);
if (savedHistory) {
  const parsedHistory = JSON.parse(savedHistory);
  playerHistory.setLatLngs(parsedHistory);
  if (parsedHistory.length > 0) {
    const lastPosition = parsedHistory[parsedHistory.length - 1];
    playerMarker.setLatLng(lastPosition);
    mapInstance.setView(lastPosition, MAP_ZOOM_LEVEL);
  }
}

function getTileIndices(location: { lat: number; lng: number }): GridTile {
  return {
    row: Math.floor(location.lat / GRID_TILE_SIZE),
    col: Math.floor(location.lng / GRID_TILE_SIZE),
  };
}

function getOrCreateTile(row: number, col: number): GridTile {
  const key = `${row}:${col}`;
  if (!tileFlyweightMap.has(key)) {
    tileFlyweightMap.set(key, { row, col });
  }
  return tileFlyweightMap.get(key)!;
}

function createCache(tile: GridTile): Cache {
  const cacheKey = `${tile.row}:${tile.col}`;
  const cacheLocation = leaflet.latLng(
    (tile.row * GRID_TILE_SIZE + (tile.row + 1) * GRID_TILE_SIZE) / 2,
    (tile.col * GRID_TILE_SIZE + (tile.col + 1) * GRID_TILE_SIZE) / 2,
  );

  const numCoins = Math.floor(Math.random() * 8) + 1;
  const cache = new Cache(tile.row, tile.col, numCoins);

  if (savedCacheStates.has(cacheKey)) {
    cache.fromMomento(savedCacheStates.get(cacheKey)!);
  }

  const cacheMarker = leaflet.marker(cacheLocation, { icon: cacheIconConfig });
  cacheMarker.addTo(mapInstance);

  cacheMarker.bindPopup(() => {
    const popupContent = document.createElement("div");

    function updateDisplay() {
      popupContent.innerHTML = `
        <div>Cache at "${tile.row}:${tile.col}". Available coins:</div>
        <ul id="availableCoins">
          ${
        cache.coins
          .map(
            (coin) => `
                  <li>${coin.i}:${coin.j}#${coin.serial} 
                    <button data-serial="${coin.serial}" class="takeCoinButton">Take</button>
                  </li>`,
          )
          .join("")
      }
        </ul>
        <button id="depositCoin">Deposit</button>`;

      popupContent.querySelectorAll<HTMLButtonElement>(".takeCoinButton")
        .forEach((button) => {
          button.addEventListener("click", () => {
            const serial = parseInt(button.dataset.serial!);
            const coinIndex = cache.coins.findIndex(
              (coin) => coin.serial === serial,
            );

            if (coinIndex !== -1) {
              const [coin] = cache.coins.splice(coinIndex, 1);
              updateInventoryDisplay(coin);
              updateDisplay();
            }
          });
        });

      popupContent.querySelector<HTMLButtonElement>("#depositCoin")!
        .addEventListener("click", () => {
          if (totalCoins > 0) {
            const lastCollectedCoin = collectedCoins.pop();
            if (lastCollectedCoin) {
              cache.coins.push(lastCollectedCoin);
              totalCoins--;
              updateInventoryDisplay();
              updateDisplay();
            }
          }
        });
    }

    updateDisplay();
    return popupContent;
  });

  activeCaches.set(cacheKey, cache);
  return cache;
}

const collectedCoins: { i: number; j: number; serial: number }[] = [];

function updateInventoryDisplay(
  addedCoin?: { i: number; j: number; serial: number },
) {
  if (addedCoin) {
    collectedCoins.push(addedCoin);
    totalCoins++;
  }
  inventoryPanel.innerHTML = collectedCoins
    .map((coin) => `${coin.i}:${coin.j}#${coin.serial}`)
    .join(", ") || "Empty";
}

function regenerateCaches() {
  const playerTile = getTileIndices(playerMarker.getLatLng());
  const newActiveCaches = new Map<string, Cache>();

  for (
    let row = playerTile.row - SEARCH_RADIUS;
    row <= playerTile.row + SEARCH_RADIUS;
    row++
  ) {
    for (
      let col = playerTile.col - SEARCH_RADIUS;
      col <= playerTile.col + SEARCH_RADIUS;
      col++
    ) {
      const cacheKey = `${row}:${col}`;
      if (!activeCaches.has(cacheKey)) {
        if (luck([row, col].toString()) < CACHE_PROBABILITY) {
          const newCache = createCache(getOrCreateTile(row, col));
          newActiveCaches.set(cacheKey, newCache);
        }
      } else {
        newActiveCaches.set(cacheKey, activeCaches.get(cacheKey)!);
      }
    }
  }

  // Save states of caches that are no longer active
  activeCaches.forEach((cache, key) => {
    if (!newActiveCaches.has(key)) {
      savedCacheStates.set(key, cache.toMomento());
    }
  });

  activeCaches.clear();
  newActiveCaches.forEach((cache, key) => activeCaches.set(key, cache));
}

function movePlayer(deltaLat: number, deltaLng: number) {
  const currentPos = playerMarker.getLatLng();
  const newPos = leaflet.latLng(
    currentPos.lat + deltaLat,
    currentPos.lng + deltaLng,
  );
  playerMarker.setLatLng(newPos);
  mapInstance.panTo(newPos);

  // Update player history
  playerHistory.addLatLng(newPos);
  localStorage.setItem(
    PLAYER_HISTORY_KEY,
    JSON.stringify(playerHistory.getLatLngs()),
  );

  regenerateCaches();
}

document.getElementById("sensor")!.addEventListener("click", () => {
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition((position) => {
      const { latitude, longitude } = position.coords;
      const newPos = leaflet.latLng(latitude, longitude);
      playerMarker.setLatLng(newPos);
      mapInstance.panTo(newPos);

      playerHistory.addLatLng(newPos);
      localStorage.setItem(
        PLAYER_HISTORY_KEY,
        JSON.stringify(playerHistory.getLatLngs()),
      );
      regenerateCaches();
    });
  } else {
    alert("Geolocation is not supported by your browser.");
  }
});

document.getElementById("north")!.addEventListener(
  "click",
  () => movePlayer(GRID_TILE_SIZE, 0),
);
document.getElementById("south")!.addEventListener(
  "click",
  () => movePlayer(-GRID_TILE_SIZE, 0),
);
document.getElementById("east")!.addEventListener(
  "click",
  () => movePlayer(0, GRID_TILE_SIZE),
);
document.getElementById("west")!.addEventListener(
  "click",
  () => movePlayer(0, -GRID_TILE_SIZE),
);

document.getElementById("reset")!.addEventListener("click", () => {
  if (confirm("Are you sure you want to erase all game data?")) {
    // Reset game state
    playerMarker.setLatLng(STARTING_POSITION);
    mapInstance.setView(STARTING_POSITION, MAP_ZOOM_LEVEL);
    playerHistory.setLatLngs([]);
    localStorage.removeItem(PLAYER_HISTORY_KEY);

    totalCoins = 0;
    collectedCoins.length = 0;
    inventoryPanel.innerHTML = "Empty";
    alert("Game state has been reset.");
  }
});
