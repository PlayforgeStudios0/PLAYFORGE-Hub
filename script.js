/* =========================================================
   PLAYFORGE Hub — script.js
   ========================================================= */

const CONFIG = {
  owner: "PlayforgeStudios0",
  repo: "PLAYFORGE-Hub",
  branch: "main",
  appsFolder: "apps",
  gamesFolder: "games",
  paypalClientId: "AXDaXaUmy5QrNG2R1uIs3jFs9pzD2UxNebi23aeH4wK_-tJfkeDIj4mLk4Q8oj_062VsLpIJihBVrJxh",
  currency: "USD"
};

let allItems = [];
let query = "";
let category = "all";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function decodeBase64(str) {
  const binary = atob(str.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function rawUrl(folder, itemName, asset) {
  return `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${folder}/${encodeURIComponent(itemName)}/${encodeURIComponent(asset)}`;
}

function formatDownloads(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

async function listFolders(folder) {
  const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}?ref=${CONFIG.branch}`;
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`Could not read directory "${folder}"`);
  const data = await res.json();
  return data.filter((item) => item.type === "dir").map((item) => item.name);
}

async function fetchManifest(folder, itemName) {
  const apiUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}/${itemName}/manifest.json?ref=${CONFIG.branch}`;
  try {
    const res = await fetch(apiUrl, { headers: { Accept: "application/vnd.github+json" } });
    if (res.ok) {
      const data = await res.json();
      if (data && data.content) return JSON.parse(decodeBase64(data.content));
    }
  } catch (e) {}

  const rawRes = await fetch(rawUrl(folder, itemName, "manifest.json"));
  if (!rawRes.ok) throw new Error("Missing manifest.json for " + itemName);
  return await rawRes.json();
}

function buildItem(folder, itemName, manifest) {
  const price = Number(manifest.price) || 0;
  const defaultPackage = folder === 'games' ? `com.playforge.cube.${itemName}` : `com.playforge.breeze.${itemName}`;
  
  return {
    folder,
    id: itemName,
    name: manifest.name || itemName,
    packageName: manifest.package || manifest.packageName || defaultPackage,
    version: manifest.version || "1.0.0",
    size: manifest.size || "N/A",
    category: folder,
    tags: manifest.category || folder,
    price,
    currency: manifest.currency || CONFIG.currency,
    free: price === 0,
    shortDescription: manifest.shortDescription || manifest.description || "",
    description: manifest.description || "No full description provided.",
    updateNotes: manifest.updateNotes || "",
    icon: rawUrl(folder, itemName, manifest.icon || "icon.png"),
    screenshots: (manifest.screenshots || []).map((s) => rawUrl(folder, itemName, s)),
    apk: rawUrl(folder, itemName, manifest.apk || "app-release.apk"),
    developer: manifest.developer || "Playforge",
    rating: Number(manifest.rating) || 5.0,
    downloads: Number(manifest.downloads) || 0,
    updated: manifest.updated || "Recently"
  };
}

async function loadAll() {
  showStatus("loading");
  try {
    const [gameNames, appNames] = await Promise.all([
      listFolders(CONFIG.gamesFolder).catch(() => []),
      listFolders(CONFIG.appsFolder).catch(() => [])
    ]);
    
    const allNames = [
      ...gameNames.map((n) => ({ folder: "games", name: n })),
      ...appNames.map((n) => ({ folder: "apps", name: n }))
    ];
    
    const items = await Promise.all(
      allNames.map(async ({ folder, name }) => {
        try { 
          return buildItem(folder, name, await fetchManifest(folder, name)); 
        } catch (e) { 
          return null; 
        }
      })
    );
    
    allItems = items.filter(Boolean);
    hideStatus();
    updateStats();
    render();
    checkDeepLink();
  } catch (err) {
    showStatus("error", err.message);
  }
}

function showStatus(kind, message) {
  const box = $("#statusBox");
  const grid = $("#appGrid");
  grid.innerHTML = "";
  box.hidden = false;
  
  if (kind === "loading") {
    box.innerHTML = `<span class="status-icon"><i class="ri-loader-4-line"></i></span>
      <h3>Loading Store Catalog…</h3><p>Fetching latest repository updates.</p>`;
  } else if (kind === "error") {
    box.innerHTML = `<span class="status-icon"><i class="ri-error-warning-line"></i></span>
      <h3>Unable to Load Content</h3>
      <p>${message || "Please check your internet connection or repository settings."}</p>
      <button class="retry-btn" onclick="loadAll()">Retry</button>`;
  }
}

function hideStatus() { 
  $("#statusBox").hidden = true; 
  $("#statusBox").innerHTML = "";
}

function updateStats() {
  const games = allItems.filter((i) => i.category === "games").length;
  const apps = allItems.filter((i) => i.category === "apps").length;
  $("#statGames").textContent = games;
  $("#statApps").textContent = apps;
  $("#statTotal").textContent = allItems.length;
}

function getFiltered() {
  const q = query.trim().toLowerCase();
  return allItems.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (!q) return true;
    const searchTarget = `${item.name} ${item.packageName} ${item.tags} ${item.developer} ${item.shortDescription}`.toLowerCase();
    return searchTarget.includes(q);
  });
}

function render() {
  const list = getFiltered();
  const grid = $("#appGrid");
  grid.innerHTML = "";
  
  $("#resultCount").textContent = `${list.length} result${list.length === 1 ? "" : "s"}`;
  $("#catalogTitle").textContent = category === "all" ? "All Titles" : category === "games" ? "Games" : "Apps";

  if (list.length === 0) {
    if (query.trim().length > 0) {
      grid.innerHTML = `
        <div class="status-box" style="grid-column: 1/-1;">
          <span class="status-icon"><i class="ri-search-line"></i></span>
          <h3>No Matches Found</h3>
          <p>No results found for "${escapeHtml(query)}". Try refining your search query.</p>
        </div>`;
    } else {
      const activeCategory = category === "all" ? "titles" : category;
      grid.innerHTML = `
        <div class="status-box" style="grid-column: 1/-1;">
          <span class="status-icon"><i class="ri-folder-unknow-line"></i></span>
          <h3>No Products Available</h3>
          <p>There are currently no ${activeCategory} listed. Please check back later for updates.</p>
        </div>`;
    }
    return;
  }
  
  list.forEach((item) => grid.appendChild(createCard(item)));
}

function createCard(item) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="card-top">
      <img class="card-icon" src="${item.icon}" alt="${item.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/64'" />
      <span class="card-badge ${item.category}">${item.category === "games" ? "Game" : "App"}</span>
    </div>
    <h3 class="card-title">${escapeHtml(item.name)}</h3>
    <span class="card-package">${escapeHtml(item.packageName)}</span>
    <div class="card-foot">
      <span class="card-rating"><i class="ri-star-fill"></i> ${item.rating.toFixed(1)}</span>
      <span class="card-price ${item.free ? "free" : ""}">${item.free ? "Free" : item.currency + " " + item.price}</span>
      <button class="card-action">${item.free ? "Get" : "View"}</button>
    </div>`;
  card.addEventListener("click", () => openModal(item));
  return card;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function wireCategoryPills() {
  $$("#categoryPills .pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      $$("#categoryPills .pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      category = pill.dataset.category;
      render();
    });
  });
}

function wireSearch() {
  const inputs = [$("#searchInput"), $("#heroSearchInput")];
  inputs.forEach((input) => {
    input.addEventListener("input", (e) => {
      query = e.target.value;
      inputs.forEach((other) => { if (other !== e.target) other.value = e.target.value; });
      render();
    });
  });
}

function wireScrollObserver() {
  const navbar = $(".navbar");
  const navSearchBar = $(".search-bar");
  const heroSearch = $("#heroSearchInput");

  if (!heroSearch) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        navbar.classList.add("glass");
        navSearchBar.classList.add("visible");
      } else {
        navbar.classList.remove("glass");
        navSearchBar.classList.remove("visible");
      }
    });
  }, { threshold: 0.1 });

  observer.observe(heroSearch);
}

function openModal(item) {
  $("#mIcon").src = item.icon;
  $("#mName").textContent = item.name;
  $("#mPackage").textContent = item.packageName;
  $("#mCategory").textContent = item.category === "games" ? "Game" : "App";
  $("#mCategory").className = "m-badge " + item.category;
  $("#mRating").textContent = item.rating.toFixed(1);
  $("#mDownloads").textContent = formatDownloads(item.downloads);
  $("#mShort").textContent = item.shortDescription;
  $("#mDesc").textContent = item.description;

  const shots = $("#mScreenshots");
  shots.innerHTML = "";
  if (item.screenshots && item.screenshots.length > 0) {
    item.screenshots.forEach((s) => {
      const img = document.createElement("img");
      img.src = s; img.alt = `${item.name} screenshot`; img.loading = "lazy";
      img.onerror = function() { this.style.display = 'none'; };
      shots.appendChild(img);
    });
  } else {
    shots.innerHTML = '<p style="font-size: 13px; color: var(--ink-400);">No preview screenshots provided.</p>';
  }

  const notesBlock = $("#mNotesBlock");
  if (item.updateNotes) { 
    notesBlock.hidden = false; 
    $("#mNotes").textContent = item.updateNotes; 
  } else { 
    notesBlock.hidden = true; 
  }

  $("#mVersion").textContent = item.version;
  $("#mSize").textContent = item.size;
  $("#mUpdated").textContent = item.updated;

  const priceBlock = $("#mPriceBlock");
  priceBlock.className = "price-block" + (item.free ? " free" : "");
  priceBlock.textContent = item.free ? "Free" : `${item.currency} ${item.price}`;

  const action = $("#mAction");
  if (item.free) {
    action.innerHTML = `
      <a class="btn" href="${item.apk}" download><i class="ri-download-2-line"></i> Download APK</a>
      <button class="btn btn-share" id="shareBtn"><i class="ri-share-line"></i> Share</button>`;
  } else {
    action.innerHTML = `
      <button class="btn buy" id="buyBtn"><i class="ri-shopping-bag-3-line"></i> Buy Now</button>
      <button class="btn btn-share" id="shareBtn"><i class="ri-share-line"></i> Share</button>`;
  }

  $("#shareBtn").addEventListener("click", () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?id=${item.id}`;
    navigator.clipboard.writeText(shareUrl);
    $("#shareBtn").innerHTML = `<i class="ri-check-line"></i> Copied!`;
    setTimeout(() => { $("#shareBtn").innerHTML = `<i class="ri-share-line"></i> Share`; }, 2000);
  });

  $("#paypalBlock").innerHTML = "";
  $("#detailModal").classList.add("open");
  document.body.style.overflow = "hidden";

  if (!item.free) {
    $("#buyBtn").addEventListener("click", () => startPayPal(item));
  }
}

function closeModal() {
  $("#detailModal").classList.remove("open");
  document.body.style.overflow = "";
  $("#paypalBlock").innerHTML = "";
}

function wireModal() {
  $("#modalClose").addEventListener("click", closeModal);
  $("#detailModal").addEventListener("click", (e) => {
    if (e.target === $("#detailModal")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

function checkDeepLink() {
  const urlParams = new URLSearchParams(window.location.search);
  const appId = urlParams.get('id');
  if (appId) {
    const matchedItem = allItems.find(i => i.id === appId);
    if (matchedItem) openModal(matchedItem);
  }
}

function loadPayPal() {
  return new Promise((resolve, reject) => {
    if (window.paypal) return resolve();
    if (!CONFIG.paypalClientId || CONFIG.paypalClientId === "YOUR_PAYPAL_CLIENT_ID") {
      return reject("PayPal Client ID not configured");
    }
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${CONFIG.paypalClientId}&currency=${CONFIG.currency}`;
    s.onload = () => resolve();
    s.onerror = () => reject("Failed to load PayPal SDK");
    document.body.appendChild(s);
  });
}

async function startPayPal(item) {
  const block = $("#paypalBlock");
  const btn = $("#buyBtn");
  if (btn) btn.disabled = true;
  block.innerHTML = `<p style="font-size:14px;color:var(--ink-500);">Initializing checkout…</p>`;
  
  try {
    await loadPayPal();
    block.innerHTML = "";
    paypal.Buttons({
      style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },
      createOrder: (data, actions) => actions.order.create({
        purchase_units: [{ amount: { value: item.price.toFixed(2), currency_code: item.currency } }]
      }),
      onApprove: (data, actions) => actions.order.capture().then((details) => {
        block.innerHTML = `
          <div class="status-box">
            <span class="status-icon"><i class="ri-checkbox-circle-fill"></i></span>
            <h3>Payment Successful</h3>
            <p>Thank you, ${details.payer?.name?.given_name || "customer"}!<br />
            Your order for <b>${escapeHtml(item.name)}</b> has been processed.</p>
            <a class="retry-btn" href="${item.apk}" download><i class="ri-download-2-line"></i> Download APK</a>
          </div>`;
      }),
      onCancel: () => { block.innerHTML = ""; if (btn) btn.disabled = false; },
      onError: () => { 
        block.innerHTML = `<p style="font-size:14px;color:#b91c1c;">Transaction failed. Please try again.</p>`; 
        if (btn) btn.disabled = false; 
      }
    }).render(block);
  } catch (err) {
    block.innerHTML = `<p style="font-size:14px;color:#b91c1c;">${err}</p>`;
    if (btn) btn.disabled = false;
  }
}

function init() {
  $("#year").textContent = new Date().getFullYear();
  wireCategoryPills();
  wireSearch();
  wireModal();
  wireScrollObserver();
  loadAll();
}

document.addEventListener("DOMContentLoaded", init);
