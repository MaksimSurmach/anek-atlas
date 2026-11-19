"use strict";
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("ru-RU");
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const formats = {
  one_liner: "Однострочник",
  dialogue: "Диалог",
  story: "История",
  verse: "Стихи",
  other: "Другой формат",
};
const normalize = (s) => s.toLocaleLowerCase("ru").replaceAll("ё", "е");
const palette = [
  "#c2d7ab",
  "#e89e73",
  "#e3cb9c",
  "#87b29d",
  "#c7bb83",
  "#97c7bb",
  "#edbd87",
  "#b9c595",
  "#85ae9a",
  "#d9c395",
  "#e6aa89",
  "#a8cdb1",
  "#9cc2ac",
  "#dabe96",
  "#adcebf",
  "#ce9e79",
  "#ddc9ad",
  "#8cb49e",
  "#c0ba87",
  "#a6c3a8",
];
const pageSize = 12;
let meta,
  rows,
  terms,
  byId,
  atlas,
  pointsById,
  matches = [],
  onMap = [];
let page = 0,
  mapPage = 0,
  zoom = 1,
  pan = [0, 0],
  mappedPositions = [];
let mapLoading,
  lastFocus,
  openedHere = false,
  catalogLoaded = false;
let selectedPoint;

async function json(name) {
  const response = await fetch("./assets/" + name + ".json");
  if (!response.ok) throw Error("HTTP " + response.status);
  return response.json();
}
function showError(error) {
  $("error").hidden = false;
  $("error").innerHTML =
    'Не удалось загрузить данные. <button onclick="location.reload()">Повторить</button>';
  console.error(error);
}
function option(value, label) {
  return new Option(label, value);
}
function termName(id) {
  const term = terms.get(id);
  return formats[term.name] || term.name;
}
function cards(target, list) {
  $(target).innerHTML =
    list
      .map((j) => {
        const topic = j.terms.find((id) => terms.get(id).kind === "topic");
        const rating =
          j.rating == null ? "Без оценки" : fmt(+j.rating.toFixed(2)) + " / 5";
        return `<article class="entry"><div class="metadata"><a href="#${target === "map-cards" ? "map" : "catalog"}/${j.id}" data-joke="${j.id}">№ ${j.id}</a><span>${esc(rating)}</span></div>
      <p class="entry-text">${esc(j.text)}</p>${topic == null ? "" : `<p class="entry-topic">${esc(termName(topic))}</p>`}</article>`;
      })
      .join("") ||
    '<p class="empty">Совпадений нет. Попробуйте другую фразу или измените фильтры.</p>';
}
function filterCatalog() {
  if (!meta) return;
  const q = normalize($("query").value.trim());
  const number = q.match(/^(?:№\s*|#|id\s*)?(\d+)$/);
  const filters = [$("topic").value, $("character").value]
    .filter(Boolean)
    .map(Number);
  matches = rows.filter(
    (j) =>
      filters.every((id) => j.terms.includes(id)) &&
      (!q ||
        (number ? j.id === Number(number[1]) : normalize(j.text).includes(q))),
  );
  page = 0;
  $("clear").hidden = !(q || filters.length);
  renderCatalog();
}
function renderCatalog() {
  cards("cards", matches.slice(page * pageSize, (page + 1) * pageSize));
  $("count").textContent = catalogLoaded
    ? "Найдено: " + fmt(matches.length)
    : "Загрузка полного каталога…";
  $("catalog-draw").textContent = $("clear").hidden
    ? "Выбрать наугад"
    : "Наугад из найденных";
  $("catalog-draw").disabled = !catalogLoaded || !matches.length;
  $("pagination").hidden = matches.length <= pageSize;
  $("prev").disabled = !page;
  $("next").disabled = (page + 1) * pageSize >= matches.length;
  $("page").textContent =
    page + 1 + " из " + fmt(Math.ceil(matches.length / pageSize));
}
function turnCatalog(delta) {
  page += delta;
  renderCatalog();
  $("catalog").scrollIntoView();
}
$("prev").onclick = () => turnCatalog(-1);
$("next").onclick = () => turnCatalog(1);
$("filters").onsubmit = (e) => {
  e.preventDefault();
  filterCatalog();
};
$("filters").oninput = filterCatalog;
$("clear").onclick = () => {
  $("filters").reset();
  filterCatalog();
  $("query").focus();
};
let ranked = [],
  rankPage = 0,
  previousRandom;
const rankPageSize = 10;
function renderRanking() {
  const start = rankPage * rankPageSize;
  $("ranking").start = start + 1;
  $("ranking").innerHTML = ranked
    .slice(start, start + rankPageSize)
    .map(
      (j, i) =>
        `<li><span class="place" aria-hidden="true">${start + i + 1}</span><div class="rank-entry">
      <div class="metadata"><a data-joke="${j.id}" href="#top/${j.id}">№ ${j.id}</a>
      <span class="score" title="${String(j.rating).replace(".", ",")} из 5">${j.rating.toFixed(3).replace(".", ",")} / 5</span></div>
      <p class="entry-text">${esc(j.text)}</p></div></li>`,
    )
    .join("");
  $("rank-prev").disabled = !rankPage;
  $("rank-next").disabled = start + rankPageSize >= ranked.length;
  $("rank-page").textContent =
    rankPage + 1 + " из " + Math.ceil(ranked.length / rankPageSize);
  $("rank-pager").hidden = ranked.length <= rankPageSize;
}
function turnRank(delta) {
  rankPage += delta;
  renderRanking();
  $("top-title").scrollIntoView();
}
$("rank-prev").onclick = () => turnRank(-1);
$("rank-next").onclick = () => turnRank(1);
function drawFrom(pool) {
  const previous = pool.findIndex((j) => j.id === previousRandom);
  const exclude = previous >= 0 && pool.length > 1;
  let index = Math.floor(Math.random() * (pool.length - Number(exclude)));
  if (exclude && index >= previous) index++;
  return pool[index].id;
}
$("catalog-draw").onclick = () => {
  location.hash = "random/" + drawFrom(matches);
};
$("draw").onclick = () => {
  location.hash = "random/" + drawFrom(rows);
};
function renderRandom(hash) {
  if (!catalogLoaded) return;
  const requested = /^#random\/(\d+)$/.exec(hash);
  const id = requested ? Number(requested[1]) : drawFrom(rows);
  const joke = byId.get(id);
  if (!requested) history.replaceState(null, "", "#random/" + id);
  previousRandom = joke?.id;
  $("random-meta").textContent = joke
    ? "№ " +
      id +
      (joke.rating == null
        ? " · Без оценки"
        : " · " + fmt(+joke.rating.toFixed(2)) + " / 5")
    : "";
  $("random-text").textContent =
    joke?.text ?? "Анекдота с таким номером нет в каталоге.";
  $("random-link").hidden = !joke;
  $("random-link").href = "#catalog/" + id;
  $("draw").disabled = false;
}
function view() {
  const name = location.hash.slice(1).split(/[/?]/)[0];
  return ["map", "top", "random"].includes(name) ? name : "catalog";
}
function openJoke(id) {
  if (!$("dialog").open) {
    lastFocus = document.activeElement;
    openedHere = true;
    location.hash = view() + "/" + id;
  } else {
    history.replaceState(null, "", "#" + view() + "/" + id);
    route();
  }
}
function closeDialog() {
  const routed = /^#(?:top|catalog|map)\/\d+$/.test(location.hash);
  if (routed && openedHere) {
    history.back();
    return;
  }
  if (routed) history.replaceState(null, "", "#" + view());
  $("dialog").close();
}
$("close").onclick = closeDialog;
$("dialog").oncancel = (e) => {
  e.preventDefault();
  closeDialog();
};
$("dialog").addEventListener("click", (e) => {
  if (e.target !== $("dialog")) return;
  const r = e.target.getBoundingClientRect();
  if (
    e.clientX < r.left ||
    e.clientX > r.right ||
    e.clientY < r.top ||
    e.clientY > r.bottom
  )
    closeDialog();
});
$("dialog").onclose = () => {
  openedHere = false;
  if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
};
function modal(title, body) {
  $("dialog-title").textContent = title;
  $("dialog-body").innerHTML = body;
  if (!$("dialog").open) $("dialog").showModal();
  $("dialog").scrollTop = 0;
}
$("about").onclick = () => {
  lastFocus = $("about");
  modal(
    "О проекте",
    '<p>Атлас объединяет русскоязычные анекдоты в каталог с поиском по тексту, темам и персонажам.</p><p class="details-line">Карта охватывает отдельную выборку из ' +
      fmt(meta.sample) +
      ' текстов. Цвет показывает тематическую область. Подборки и мотивы предложены моделью и могут пересекаться. Цитаты в карточках позволяют проверить разметку.</p><p class="details-line">Снимок корпуса от ' +
      esc(meta.date.split("-").reverse().join(".")) +
      ". Рейтинг показан по пятибалльной шкале, когда оценка есть в источнике.</p>",
  );
};
function showJoke(id) {
  const j = byId.get(id);
  if (!j) {
    if (catalogLoaded)
      modal(
        "Анекдот не найден",
        "<p>В этом снимке нет анекдота с таким номером.</p>",
      );
    return;
  }
  const p = pointsById?.get(id);
  let body =
    '<p class="full-text">' +
    esc(j.text) +
    '</p><div class="details-line">' +
    (j.rating == null
      ? "Без оценки"
      : "Рейтинг " + fmt(+j.rating.toFixed(2)) + " / 5") +
    " · " +
    j.terms
      .map((t) => '<span class="tag">' + esc(termName(t)) + "</span>")
      .join(" ") +
    "</div>";
  if (p) {
    if (view() !== "map")
      body +=
        '<p class="details-line"><a class="link" href="#map?joke=' +
        id +
        '">Показать на карте ↗</a></p>';
    body +=
      "<details><summary>Подборки и цитаты (" +
      p.labels.length +
      ")</summary>" +
      p.labels
        .map(
          ([i, quote]) =>
            '<p class="evidence"><b>' +
            esc(atlas.labels[i][0]) +
            "</b> · " +
            esc(quote) +
            "</p>",
        )
        .join("") +
      "</details>";
    body +=
      '<details><summary>Похожие анекдоты в выборке</summary><div class="details-line">' +
      p.neighbors
        .map((id) => '<button data-joke="' + id + '">№ ' + id + "</button>")
        .join("") +
      "</div></details>";
  }
  modal("Анекдот № " + id, body);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-joke]");
  if (b && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    openJoke(+b.dataset.joke);
  }
});

function paint(canvas, points, areas, overview) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const w = rect.width,
    h = rect.height,
    dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#14392f";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#315347";
  ctx.lineWidth = 0.6;
  for (let x = 16; x < w; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 13; y < h; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  const sx = overview ? w * 0.45 : Math.min(w * 0.46, h * 0.68) * zoom;
  const sy = overview ? h * 0.43 : Math.min(h * 0.46, w * 0.46) * zoom;
  const cx = w * 0.5 + (overview ? 0 : pan[0]),
    cy = h * 0.5 + (overview ? 0 : pan[1]);
  const centers = areas.map(() => [0, 0, 0]);
  if (!overview) mappedPositions = [];
  for (const [xy, area, id] of points) {
    const x = cx + xy[0] * sx,
      y = cy - xy[1] * sy;
    if (!overview) mappedPositions.push([x, y, id]);
    const c = centers[area];
    c[0] += x;
    c[1] += y;
    c[2]++;
    ctx.fillStyle = palette[area];
    ctx.globalAlpha = overview ? 0.78 : 0.85;
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      overview ? 1.02 : Math.min(3, 1.65 * Math.sqrt(zoom)),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = "11px Arial";
  ctx.textBaseline = "middle";
  const used = [];
  for (const i of [
    6, 5, 8, 2, 15, 0, 13, 17, 7, 10, 3, 11, 12, 1, 4, 14, 16, 18, 19, 9,
  ]) {
    if (overview && ![6, 5, 8].includes(i)) continue;
    const [x, y, n] = centers[i];
    if (!n) continue;
    const tw = ctx.measureText(areas[i]).width + 12;
    const left = Math.min(w - tw - 4, Math.max(4, x / n - tw / 2)),
      top = y / n - 20;
    if (
      top < 8 ||
      top > h - 28 ||
      used.some(
        (r) =>
          left < r[0] + r[2] + 3 &&
          left + tw > r[0] - 3 &&
          Math.abs(top - r[1]) < 22,
      )
    )
      continue;
    used.push([left, top, tw]);
    ctx.fillStyle = "#15372ff2";
    ctx.fillRect(left, top, tw, 17);
    ctx.strokeStyle = "#708b75";
    ctx.strokeRect(left, top, tw, 17);
    ctx.fillStyle = "#f1efd7";
    ctx.fillText(areas[i], left + 6, top + 9);
  }
  const selected =
    !overview && mappedPositions.find((p) => p[2] === selectedPoint);
  if (selected) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(selected[0], selected[1], 6, 0, 2 * Math.PI);
    ctx.stroke();
  }
}
function drawPreview() {
  if (meta && view() === "catalog")
    paint($("preview"), meta.preview, meta.areas, true);
}
function drawMap() {
  if (!atlas || view() !== "map") return;
  const k = +$("layout").value;
  paint(
    $("map-canvas"),
    onMap.map((p) => [p.xy[k], p.area, p.id]),
    atlas.areas,
    false,
  );
}
new ResizeObserver(drawPreview).observe($("preview"));
new ResizeObserver(drawMap).observe($("map-canvas"));
function installMap(data) {
  atlas = data;
  pointsById = new Map(data.points.map((p) => [p.id, p]));
  const layoutNames = {
    semantic: "Семантическая",
    thematic: "Тематическая",
    hybrid: "Гибрид 70/30",
  };
  data.layouts.forEach((key, i) =>
    $("layout").add(
      option(
        i,
        layoutNames[key] ||
          "Гибрид " +
            key.slice(7).replace("_", "/") +
            (key === "hybrid_30_30" ? " (50/50)" : ""),
      ),
    ),
  );
  $("layout").value = data.layouts.indexOf("thematic");
  const counts = new Map();
  for (const p of data.points)
    for (const [i] of p.labels) counts.set(i, (counts.get(i) || 0) + 1);
  fillLabels("layer", counts, "Вся выборка");
  updateMap(true);
}
function fillLabels(target, counts, first) {
  const select = $(target);
  select.replaceChildren(option("", first));
  const fragment = document.createDocumentFragment();
  for (const [i, count] of [...counts].sort(
    (a, b) =>
      b[1] - a[1] ||
      atlas.labels[a[0]][0].localeCompare(atlas.labels[b[0]][0], "ru"),
  )) {
    const [name, kind] = atlas.labels[i];
    fragment.append(
      option(
        i,
        name + (kind === "motif" ? " · мотив" : "") + " (" + count + ")",
      ),
    );
  }
  select.append(fragment);
}
function ensureMap() {
  if (!mapLoading)
    mapLoading = json("atlas")
      .then(installMap)
      .catch((e) => {
        mapLoading = null;
        throw e;
      });
  return mapLoading;
}
function updateMap(firstChanged) {
  if (!atlas) return;
  const first = $("layer").value;
  const has = (p, value) =>
    value === "" || p.labels.some(([i]) => i === Number(value));
  const group = atlas.points.filter((p) => has(p, first));
  if (firstChanged) {
    const counts = new Map();
    if (first !== "")
      for (const p of group)
        for (const [i] of p.labels)
          if (i !== Number(first)) counts.set(i, (counts.get(i) || 0) + 1);
    fillLabels("other", counts, "Любое");
    $("other").disabled = !counts.size;
  }
  onMap = group.filter((p) => has(p, $("other").value));
  mapPage = 0;
  resetCamera();
  $("map-count").textContent =
    fmt(onMap.length) + " из " + fmt(atlas.points.length) + " анекдотов";
  renderMapList();
}
function renderMapList() {
  if (!catalogLoaded || !atlas) return;
  cards(
    "map-cards",
    onMap
      .slice(mapPage * pageSize, (mapPage + 1) * pageSize)
      .map((p) => byId.get(p.id)),
  );
  $("map-prev").disabled = !mapPage;
  $("map-next").disabled = (mapPage + 1) * pageSize >= onMap.length;
  $("map-page").textContent =
    mapPage + 1 + " из " + fmt(Math.ceil(onMap.length / pageSize));
}
function turnMap(delta) {
  mapPage += delta;
  renderMapList();
  $("map-cards").scrollIntoView();
}
$("map-prev").onclick = () => turnMap(-1);
$("map-next").onclick = () => turnMap(1);
function resetCamera() {
  zoom = 1;
  pan = [0, 0];
  drawMap();
}
$("layer").onchange = () => updateMap(true);
$("other").onchange = () => updateMap(false);
$("layout").onchange = resetCamera;
$("reset-map").onclick = resetCamera;
function changeZoom(factor) {
  const prev = zoom;
  zoom = Math.max(0.75, Math.min(8, zoom * factor));
  pan = pan.map((n) => (n * zoom) / prev);
  drawMap();
}
$("zoom-in").onclick = () => changeZoom(1.4);
$("zoom-out").onclick = () => changeZoom(1 / 1.4);
const canvas = $("map-canvas");
let drag;
canvas.onpointerdown = (e) => {
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  drag = [e.clientX, e.clientY, ...pan];
};
canvas.onpointermove = (e) => {
  if (!drag) return;
  pan = [drag[2] + e.clientX - drag[0], drag[3] + e.clientY - drag[1]];
  drawMap();
};
canvas.onpointercancel = () => {
  drag = null;
};
canvas.onpointerup = (e) => {
  if (!drag) return;
  const moved = Math.hypot(e.clientX - drag[0], e.clientY - drag[1]);
  drag = null;
  if (moved > 5) return;
  const rect = canvas.getBoundingClientRect();
  let best = 100,
    nearest;
  for (const [x, y, id] of mappedPositions) {
    const d =
      (x - e.clientX + rect.left) ** 2 + (y - e.clientY + rect.top) ** 2;
    if (id === selectedPoint && d <= 36) {
      nearest = id;
      break;
    }
    if (d < best) {
      best = d;
      nearest = id;
    }
  }
  if (nearest) {
    selectedPoint = nearest;
    drawMap();
    openJoke(nearest);
  }
};
async function route() {
  const hash = location.hash,
    section = view(),
    map = section === "map";
  $("catalog").hidden = section !== "catalog";
  $("top").hidden = section !== "top";
  $("random-reader").hidden = section !== "random";
  const titles = {
    catalog: "Каталог",
    top: "Топ-100 анекдотов",
    random: "Случайный анекдот",
    map: "Карта",
  };
  document.title = titles[section] + " · Атлас анекдотов";
  $("map").hidden = !map;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === section) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const id = hash.match(/^#(?:map|catalog|top)\/(\d+)$/);
  if (!id && $("dialog").open) $("dialog").close();
  if (!meta) return;
  if (section === "random") renderRandom(hash);
  if (map || id) {
    await ensureMap();
    if (hash !== location.hash) return;
  }
  const focus = hash.match(/^#map\?joke=(\d+)$/);
  if (focus && pointsById.has(Number(focus[1]))) {
    const point = pointsById.get(Number(focus[1]));
    selectedPoint = point.id;
    $("layer").value = "";
    updateMap(true);
    const pos = mappedPositions.find((p) => p[2] === point.id);
    if (pos) {
      pan = [canvas.clientWidth / 2 - pos[0], canvas.clientHeight / 2 - pos[1]];
      changeZoom(2);
    }
    $("map-count").textContent =
      "Выбран анекдот № " +
      selectedPoint +
      " · " +
      fmt(onMap.length) +
      " точек";
    mapPage = Math.floor(onMap.indexOf(point) / pageSize);
    renderMapList();
  }
  if (map) drawMap();
  else drawPreview();
  if (id) showJoke(Number(id[1]));
}
window.addEventListener("hashchange", (event) => {
  const previous = new URL(event.oldURL).hash.split(/[/?]/)[0] || "#catalog";
  if (previous !== "#" + view() || view() === "random") window.scrollTo(0, 0);
  route().catch(showError);
});
async function start() {
  $("about").disabled = true;
  meta = await json("index");
  rows = meta.first;
  byId = new Map(rows.map((j) => [j.id, j]));
  terms = new Map(meta.terms.map((t) => [t.id, t]));
  $("pilot-count").textContent = fmt(meta.sample);
  for (const kind of ["topic", "character"]) {
    const list = meta.terms.filter((t) => t.kind === kind);
    for (const t of list.sort((a, b) => a.name.localeCompare(b.name, "ru")))
      $(kind).add(option(t.id, t.name));
  }
  $("about").disabled = false;
  filterCatalog();
  route().catch(showError);
  rows = await json("catalog");
  byId = new Map(rows.map((j) => [j.id, j]));
  const rated = rows.filter((j) => Number.isFinite(j.rating));
  ranked = rated
    .sort((a, b) => b.rating - a.rating || a.id - b.id)
    .slice(0, 100);
  $("top-summary").textContent =
    "По оценкам из архива. Оценены " +
    fmt(rated.length) +
    " из " +
    fmt(rows.length) +
    " анекдотов.";
  renderRanking();
  catalogLoaded = true;
  filterCatalog();
  renderMapList();
  await route();
}
start().catch(showError);
