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

function createCache(tile: GridTile) {
  const cacheLocation = leaflet.latLng(
    (tile.row * GRID_TILE_SIZE + (tile.row + 1) * GRID_TILE_SIZE) / 2,
    (tile.col * GRID_TILE_SIZE + (tile.col + 1) * GRID_TILE_SIZE) / 2,
  );

  const cacheMarker = leaflet.marker(cacheLocation, { icon: cacheIconConfig });
  cacheMarker.addTo(mapInstance);

  const coins = Array.from(
    {
      length: Math.floor(
        luck([tile.row, tile.col, "initialValue"].toString()) * 10,
      ),
    },
    (_, serial) => ({
      i: tile.row,
      j: tile.col,
      serial,
    }),
  );

  cacheMarker.bindPopup(() => {
    const popupContent = document.createElement("div");

    function updateDisplay() {
      popupContent.innerHTML = `
        <div>Cache at "${tile.row}:${tile.col}". Available coins:</div>
        <ul id="availableCoins">
          ${
        coins
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
            const coinIndex = coins.findIndex((coin) => coin.serial === serial);

            if (coinIndex !== -1) {
              const [coin] = coins.splice(coinIndex, 1);
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
              coins.push(lastCollectedCoin);
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

const playerTile = getTileIndices(STARTING_POSITION);
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
    if (luck([row, col].toString()) < CACHE_PROBABILITY) {
      createCache(getOrCreateTile(row, col));
    }
  }
}

const btnSensor = document.getElementById("sensor")!;
const btnNorth = document.getElementById("north")!;
const btnSouth = document.getElementById("south")!;
const btnWest = document.getElementById("west")!;
const btnEast = document.getElementById("east")!;
const btnReset = document.getElementById("reset")!;

const MOVE_STEP = GRID_TILE_SIZE;

function movePlayer(deltaLat: number, deltaLng: number) {
  const currentPos = playerMarker.getLatLng();
  const newPos = leaflet.latLng(
    currentPos.lat + deltaLat,
    currentPos.lng + deltaLng,
  );
  playerMarker.setLatLng(newPos);
  mapInstance.panTo(newPos);
}

btnSensor.addEventListener("click", () => {
  playerMarker.setLatLng(STARTING_POSITION);
  mapInstance.setView(STARTING_POSITION, MAP_ZOOM_LEVEL);
});

btnNorth.addEventListener("click", () => movePlayer(MOVE_STEP, 0));
btnSouth.addEventListener("click", () => movePlayer(-MOVE_STEP, 0));
btnWest.addEventListener("click", () => movePlayer(0, -MOVE_STEP));
btnEast.addEventListener("click", () => movePlayer(0, MOVE_STEP));

btnReset.addEventListener("click", () => {
  playerMarker.setLatLng(STARTING_POSITION);
  mapInstance.setView(STARTING_POSITION, MAP_ZOOM_LEVEL);
  totalCoins = 0;
  inventoryPanel.innerHTML = "Empty";
});
