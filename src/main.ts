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

function createCache(tile: GridTile) {
  const cacheLocation = leaflet.latLng(
    (tile.row * GRID_TILE_SIZE + (tile.row + 1) * GRID_TILE_SIZE) / 2,
    (tile.col * GRID_TILE_SIZE + (tile.col + 1) * GRID_TILE_SIZE) / 2,
  );

  const cacheMarker = leaflet.marker(cacheLocation, { icon: cacheIconConfig });
  cacheMarker.addTo(mapInstance);
  cacheMarker.bindPopup(() => {
    let cacheCoins = Math.floor(
      luck([tile.row, tile.col, "initialValue"].toString()) * 10,
    );

    const popupContent = document.createElement("div");
    popupContent.innerHTML = `
      <div>There is a cache here at "${tile.row},${tile.col}". It has <span id="cacheCoins">${cacheCoins}</span> coins.</div>
      <button id="takeCoin">Take</button>
      <button id="depositCoin">Deposit</button>`;

    popupContent.querySelector<HTMLButtonElement>("#takeCoin")!
      .addEventListener("click", () => {
        if (cacheCoins > 0) {
          cacheCoins--;
          totalCoins++;
          updateDisplay();
        }
      });

    popupContent.querySelector<HTMLButtonElement>("#depositCoin")!
      .addEventListener("click", () => {
        if (totalCoins > 0) {
          cacheCoins++;
          totalCoins--;
          updateDisplay();
        }
      });

    function updateDisplay() {
      popupContent.querySelector<HTMLSpanElement>("#cacheCoins")!.textContent =
        cacheCoins.toString();
      inventoryPanel.innerHTML = `${totalCoins} coins!`;
    }

    return popupContent;
  });
}

function getTileIndices(location: { lat: number; lng: number }): GridTile {
  return {
    row: Math.floor(location.lat / GRID_TILE_SIZE),
    col: Math.floor(location.lng / GRID_TILE_SIZE),
  };
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
      createCache({ row, col });
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
