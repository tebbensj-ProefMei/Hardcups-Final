let API = "http://localhost:5000/api";
const DASHBOARD_LABELS = {
  dashboard: "Dashboard",
  klantportaal: "Mijn gegevens",
  klanten: "Klanten",
  voorraad: "Voorraad",
  transacties: "Uitgifte & Inname",
  facturen: "Facturen",
  munten: "Munten",
  overzicht: "Klantoverzicht",
  accounts: "Accounts",
  instellingen: "Instellingen",
};
const DASHBOARD_KEYS = Object.keys(DASHBOARD_LABELS);

let TOKEN = null;
let ROLE = null;
let ALLOWED_DASHBOARDS = [];
let customersCache = [];
let cupChart = null;
let CURRENT_CUSTOMER = null;

const SETTINGS_STORAGE_KEY = "hardcupsSettings";
const DEFAULT_SETTINGS = {
  apiBase: "http://localhost:5000/api",
};
let SETTINGS = { ...DEFAULT_SETTINGS };

loadSettingsFromStorage();
applySettings();

function loadSettingsFromStorage() {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object") {
      SETTINGS = { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.warn("Kon lokale instellingen niet laden", err);
    SETTINGS = { ...DEFAULT_SETTINGS };
  }
}

function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(SETTINGS));
  } catch (err) {
    console.warn("Kon lokale instellingen niet opslaan", err);
  }
}

function applySettings() {
  let base = SETTINGS.apiBase || DEFAULT_SETTINGS.apiBase;
  if (typeof base === "string") {
    base = base.trim();
    if (!base) {
      base = DEFAULT_SETTINGS.apiBase;
    }
    base = base.replace(/\/+$/, "");
  } else {
    base = DEFAULT_SETTINGS.apiBase;
  }
  API = base;
  SETTINGS.apiBase = base;
  const apiInput = document.getElementById("apiBase");
  if (apiInput) {
    apiInput.value = API;
  }
}

function resetSettingsToDefault() {
  SETTINGS = { ...DEFAULT_SETTINGS };
  applySettings();
  persistSettings();
  if (TOKEN) {
    alert("Instellingen zijn teruggezet. Log opnieuw in om door te gaan.");
    logout();
  }
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  const apiInput = document.getElementById("apiBase");
  if (!apiInput) return;
  const value = apiInput.value.trim();
  if (!value) {
    return alert("Vul een API-adres in.");
  }
  SETTINGS.apiBase = value;
  applySettings();
  persistSettings();
  if (TOKEN) {
    alert("API-adres bijgewerkt. Log opnieuw in om de wijziging toe te passen.");
    logout();
  } else {
    alert("Instellingen opgeslagen.");
  }
}

const authHeaders = () => (TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {});

function isAllowed(section) {
  if (!TOKEN) return false;
  if (ROLE === "admin") return true;
  if (!ALLOWED_DASHBOARDS || !ALLOWED_DASHBOARDS.length) return false;
  return ALLOWED_DASHBOARDS.includes(section);
}

function resolveAllowedFromResponse(list) {
  if (!Array.isArray(list) || !list.length) {
    return ["dashboard"];
  }
  if (list.includes("*")) {
    return [...DASHBOARD_KEYS];
  }
  return list.filter((key) => DASHBOARD_KEYS.includes(key));
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettingsFromStorage();
  applySettings();

  renderDashboardOptions();

  const forgotBtn = document.getElementById("forgotPasswordBtn");
  if (forgotBtn) {
    forgotBtn.addEventListener("click", showResetForm);
  }
  const resetCancelBtn = document.getElementById("resetCancelBtn");
  if (resetCancelBtn) {
    resetCancelBtn.addEventListener("click", () => hideResetForm());
  }
  const resetForm = document.getElementById("resetForm");
  if (resetForm) {
    resetForm.addEventListener("submit", submitResetForm);
  }

  document.getElementById("loginForm").addEventListener("submit", doLogin);
  document.getElementById("logoutButton").addEventListener("click", logout);

  document.querySelectorAll("#sideNav button[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });

  document
    .querySelectorAll(".bulk-add")
    .forEach((btn) => btn.addEventListener("click", () => voorraadToevoegen(btn.dataset.product)));
  document
    .querySelectorAll(".issue-btn")
    .forEach((btn) => btn.addEventListener("click", () => txIssue(btn.dataset.product, 1)));
  document
    .querySelectorAll(".return-btn")
    .forEach((btn) => btn.addEventListener("click", () => txReturn(btn.dataset.product, 1)));
  document
    .querySelectorAll(".inventory-set")
    .forEach((input) => input.addEventListener("change", () => directVoorraadAanpassen(input)));

  document.getElementById("scanNFCBtn").addEventListener("click", () => scanNFCInto("klantNFC", "nfcMode"));
  document.getElementById("saveKlant").addEventListener("click", () => {
    const id = document.getElementById("saveKlant").dataset.customerId;
    if (!id) return alert("Selecteer eerst een klant.");
    saveKlant(Number(id));
  });
  document.getElementById("nieuweKlantForm").addEventListener("submit", createKlant);

  document.getElementById("zoekKlantBtn").addEventListener("click", zoekKlant);
  document.getElementById("scanNFCInputBtn").addEventListener("click", () => scanNFCInto("nfcInput", "nfcMode2", zoekKlant));
  document.getElementById("uitgifteBtn").addEventListener("click", registreerUitgifte);
  document.getElementById("innameBtn").addEventListener("click", registreerInname);

  document.getElementById("dagAfrekeningBtn").addEventListener("click", downloadDagAfrekening);
  document.getElementById("eindAfrekeningBtn").addEventListener("click", downloadEindAfrekening);
  document.getElementById("txCsvBtn").addEventListener("click", downloadTxCSV);
  document.getElementById("invCsvBtn").addEventListener("click", downloadInvCSV);

  document.getElementById("coinIntakeForm").addEventListener("submit", registreerMunten);
  document.getElementById("coinScanBtn").addEventListener("click", () => scanNFCInto("coinIdentifier", "nfcModeCoins"));
  document.getElementById("refreshCoinStats").addEventListener("click", loadCoinSummaries);

  document.getElementById("accountForm").addEventListener("submit", saveAccount);
  document.getElementById("accountResetBtn").addEventListener("click", resetAccountForm);
  const accountRole = document.getElementById("accountRole");
  if (accountRole) {
    accountRole.addEventListener("change", () => syncRoleSpecificFields());
  }
  syncRoleSpecificFields(true);
  updateAccountCustomerOptions();

  const settingsForm = document.getElementById("settingsForm");
  if (settingsForm) {
    settingsForm.addEventListener("submit", handleSettingsSubmit);
  }
  const resetSettingsBtn = document.getElementById("resetSettingsBtn");
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener("click", (event) => {
      event.preventDefault();
      resetSettingsToDefault();
    });
  }
});

function showResetForm() {
  const loginView = document.getElementById("loginView");
  const resetView = document.getElementById("resetView");
  if (!loginView || !resetView) return;
  loginView.classList.add("hidden");
  resetView.classList.remove("hidden");
  const feedback = document.getElementById("resetFeedback");
  if (feedback) {
    feedback.textContent = "";
  }
}

function hideResetForm(force = false) {
  const loginView = document.getElementById("loginView");
  const resetView = document.getElementById("resetView");
  if (resetView) {
    resetView.classList.add("hidden");
  }
  if (loginView) {
    loginView.classList.remove("hidden");
  }
  const resetForm = document.getElementById("resetForm");
  if (resetForm) {
    resetForm.reset();
  }
  const feedback = document.getElementById("resetFeedback");
  if (feedback) {
    feedback.textContent = "";
  }
  return force;
}

async function submitResetForm(event) {
  event.preventDefault();
  const username = document.getElementById("resetUsername").value.trim();
  const customerNumber = document.getElementById("resetCustomerNumber").value.trim();
  const email = document.getElementById("resetEmail").value.trim();
  const newPassword = document.getElementById("resetPassword").value;
  if (!username || !customerNumber || !newPassword) {
    return alert("Vul gebruikersnaam, klantnummer en nieuw wachtwoord in.");
  }
  const payload = { username, customerNumber, newPassword };
  if (email) {
    payload.email = email;
  }
  try {
    const res = await fetch(`${API}/auth/customer-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Wachtwoord reset mislukt");
    alert("Wachtwoord bijgewerkt. Log opnieuw in met uw nieuwe wachtwoord.");
    hideResetForm();
  } catch (err) {
    alert(err.message);
  }
}

async function doLogin(event) {
  event.preventDefault();
  const username = document.getElementById("user").value.trim();
  const password = document.getElementById("pass").value;
  if (!username || !password) {
    return alert("Vul gebruikersnaam en wachtwoord in.");
  }
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login mislukt");
    TOKEN = data.token;
    ROLE = data.role;
    ALLOWED_DASHBOARDS = resolveAllowedFromResponse(data.dashboards);
    CURRENT_CUSTOMER = data.customer || null;
    if (ROLE !== "klant") {
      ALLOWED_DASHBOARDS = ALLOWED_DASHBOARDS.filter((key) => key !== "klantportaal");
    }
    document.getElementById("userRole").textContent = `Ingelogd als ${username} (${ROLE})`;
    document.getElementById("loginView").classList.add("hidden");
    document.getElementById("appView").classList.remove("hidden");
    syncNavVisibility();
    const defaultSection = ROLE === "klant" ? "klantportaal" : "dashboard";
    await initApp();
    showSection(defaultSection);
  } catch (err) {
    alert(err.message);
  }
}

function logout() {
  TOKEN = null;
  ROLE = null;
  ALLOWED_DASHBOARDS = [];
  customersCache = [];
  CURRENT_CUSTOMER = null;
  if (cupChart) {
    cupChart.destroy();
    cupChart = null;
  }
  document.getElementById("userRole").textContent = "";
  document.getElementById("loginForm").reset();
  document.getElementById("appView").classList.add("hidden");
  document.getElementById("loginView").classList.remove("hidden");
  hideResetForm(true);
  document.querySelectorAll("#appView section").forEach((section) => section.classList.remove("active"));
  document.querySelectorAll("#sideNav button[data-section]").forEach((btn) => btn.classList.remove("active"));
  resetCustomerDetails();
  clearTransactionSelection();
  resetAccountForm();
}

function syncNavVisibility() {
  document.querySelectorAll("#sideNav button[data-section]").forEach((btn) => {
    const key = btn.dataset.section;
    if (key === "klantportaal" && ROLE !== "klant") {
      btn.classList.add("hidden");
      return;
    }
    if (ROLE === "admin" || ALLOWED_DASHBOARDS.includes(key)) {
      btn.classList.remove("hidden");
    } else {
      btn.classList.add("hidden");
    }
  });
  document.querySelectorAll("#content > section").forEach((section) => {
    const key = section.id;
    if (key === "klantportaal" && ROLE !== "klant") {
      section.dataset.allowed = "false";
      return;
    }
    if (ROLE === "admin" || ALLOWED_DASHBOARDS.includes(key)) {
      section.dataset.allowed = "true";
    } else {
      section.dataset.allowed = "false";
    }
  });
}

function showSection(id) {
  if (!TOKEN) return;
  if (!(ROLE === "admin" || isAllowed(id))) {
    alert("Je hebt geen toegang tot dit onderdeel.");
    return;
  }
  document.querySelectorAll("#content > section").forEach((section) => section.classList.remove("active"));
  document.querySelectorAll("#sideNav button[data-section]").forEach((btn) => btn.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) {
    target.classList.add("active");
  }
  const navBtn = document.querySelector(`#sideNav button[data-section='${id}']`);
  if (navBtn) navBtn.classList.add("active");
  onSectionShown(id);
}

function onSectionShown(id) {
  switch (id) {
    case "klanten":
      if (isAllowed("klanten")) loadCustomers();
      break;
    case "voorraad":
      if (isAllowed("voorraad")) loadInventory();
      break;
    case "munten":
      if (isAllowed("munten")) loadCoinSummaries();
      break;
    case "overzicht":
      if (isAllowed("overzicht")) loadCustomerSummary();
      break;
    case "accounts":
      if (ROLE === "admin" || isAllowed("accounts")) loadAccounts();
      break;
    case "dashboard":
      if (isAllowed("dashboard")) loadDashboard();
      break;
    case "klantportaal":
      if (ROLE === "klant") loadCustomerPortal();
      break;
    default:
      break;
  }
}

async function initApp() {
  if (ROLE === "klant") {
    await loadCustomerPortal();
    return;
  }
  const tasks = [];
  if (isAllowed("dashboard")) tasks.push(loadDashboard());
  if (isAllowed("klanten")) tasks.push(loadCustomers());
  if (isAllowed("voorraad")) tasks.push(loadInventory());
  if (isAllowed("munten")) tasks.push(loadCoinSummaries());
  if (isAllowed("overzicht")) tasks.push(loadCustomerSummary());
  if (ROLE === "admin" || isAllowed("accounts")) tasks.push(loadAccounts());
  await Promise.all(tasks);

  const voorraadInputs = document.querySelectorAll(
    "#voorraad input[type='number'], #voorraad .bulk-add, #voorraad .issue-btn, #voorraad .return-btn"
  );
  if (ROLE !== "admin") {
    voorraadInputs.forEach((el) => el.setAttribute("disabled", "true"));
    document.getElementById("saveKlant").setAttribute("disabled", "true");
    document
      .querySelectorAll("#nieuweKlantForm input, #nieuweKlantForm button")
      .forEach((el) => el.setAttribute("disabled", "true"));
  } else {
    voorraadInputs.forEach((el) => el.removeAttribute("disabled"));
    document.getElementById("saveKlant").removeAttribute("disabled");
    document
      .querySelectorAll("#nieuweKlantForm input, #nieuweKlantForm button")
      .forEach((el) => el.removeAttribute("disabled"));
  }
}

async function loadDashboard() {
  try {
    const res = await fetch(`${API}/dashboard`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Fout dashboard");
    document.getElementById("stock-hardcups").innerText = data.inventory.hardcups ?? 0;
    document.getElementById("stock-champagne").innerText = data.inventory.champagne ?? 0;
    document.getElementById("stock-cocktail").innerText = data.inventory.cocktail ?? 0;
    document.getElementById("uitgifte-hardcups").innerText = data.issued.hardcups ?? 0;
    document.getElementById("uitgifte-champagne").innerText = data.issued.champagne ?? 0;
    document.getElementById("uitgifte-cocktail").innerText = data.issued.cocktail ?? 0;
    document.getElementById("inname-hardcups").innerText = data.returns.hardcups ?? 0;
    document.getElementById("inname-champagne").innerText = data.returns.champagne ?? 0;
    document.getElementById("inname-cocktail").innerText = data.returns.cocktail ?? 0;
    updateCupChart(data);
  } catch (err) {
    alert(err.message);
  }
}

function updateCupChart(data) {
  const ctx = document.getElementById("cupChart");
  if (!ctx) return;
  const labels = ["Hardcups", "Champagne", "Cocktail"];
  const issued = [data.issued.hardcups ?? 0, data.issued.champagne ?? 0, data.issued.cocktail ?? 0];
  const returned = [data.returns.hardcups ?? 0, data.returns.champagne ?? 0, data.returns.cocktail ?? 0];
  const ratio = [data.ratios.hardcups ?? 0, data.ratios.champagne ?? 0, data.ratios.cocktail ?? 0];
  if (!cupChart) {
    cupChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Uitgegeven",
            backgroundColor: "rgba(0, 123, 255, 0.7)",
            borderColor: "rgba(0, 123, 255, 1)",
            data: issued,
          },
          {
            label: "Ingenomen",
            backgroundColor: "rgba(46, 204, 113, 0.7)",
            borderColor: "rgba(46, 204, 113, 1)",
            data: returned,
          },
          {
            label: "% Ingenomen t.o.v. uitgifte",
            type: "line",
            yAxisID: "y1",
            backgroundColor: "rgba(255, 159, 64, 0.3)",
            borderColor: "rgba(255, 159, 64, 1)",
            data: ratio,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Aantal" } },
          y1: {
            beginAtZero: true,
            min: 0,
            max: 100,
            position: "right",
            grid: { drawOnChartArea: false },
            title: { display: true, text: "%" },
          },
        },
        plugins: {
          legend: { position: "bottom" },
        },
      },
    });
  } else {
    cupChart.data.labels = labels;
    cupChart.data.datasets[0].data = issued;
    cupChart.data.datasets[1].data = returned;
    cupChart.data.datasets[2].data = ratio;
    cupChart.update();
  }
}

async function loadInventory() {
  try {
    const res = await fetch(`${API}/inventory`, { headers: authHeaders() });
    const inv = await res.json();
    if (!res.ok) throw new Error(inv.error || "Fout voorraad");
    const hardcupsInput = document.querySelector(".inventory-set[data-product='hardcups']");
    const champagneInput = document.querySelector(".inventory-set[data-product='champagne']");
    const cocktailInput = document.querySelector(".inventory-set[data-product='cocktail']");
    if (hardcupsInput) {
      hardcupsInput.value = inv.hardcups?.units ?? 0;
      hardcupsInput.dataset.lastValue = hardcupsInput.value;
    }
    if (champagneInput) {
      champagneInput.value = inv.champagne?.units ?? 0;
      champagneInput.dataset.lastValue = champagneInput.value;
    }
    if (cocktailInput) {
      cocktailInput.value = inv.cocktail?.units ?? 0;
      cocktailInput.dataset.lastValue = cocktailInput.value;
    }
  } catch (err) {
    alert(err.message);
  }
}

async function directVoorraadAanpassen(input) {
  if (ROLE !== "admin") {
    input.value = input.dataset.lastValue || 0;
    return alert("Alleen admin kan voorraad direct aanpassen.");
  }
  const product = input.dataset.product;
  const units = Number(input.value);
  const oldValue = input.dataset.lastValue ?? input.value ?? 0;
  if (Number.isNaN(units) || units < 0) {
    alert("Voer een geldig aantal in.");
    input.value = oldValue;
    return;
  }
  try {
    const res = await fetch(`${API}/inventory/${product}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ units }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Aanpassen mislukt");
    input.dataset.lastValue = data.units;
    await loadDashboard();
  } catch (err) {
    input.value = oldValue;
    alert(err.message);
  }
}

async function voorraadToevoegen(product) {
  if (ROLE !== "admin") return alert("Alleen admin kan voorraad toevoegen.");
  const input = document.querySelector(`#voorraad .inline-input input[data-product='${product}']`);
  const amount = Number(input?.value);
  if (!amount || amount <= 0) return alert("Voer een geldig aantal in.");

  try {
    const res = await fetch(`${API}/inventory/add_bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ product, amount }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Fout bij voorraad toevoegen.");
    await Promise.all([loadInventory(), loadDashboard()]);
    alert(`${amount} ${product} toegevoegd.`);
  } catch (err) {
    alert(err.message);
  }
}

async function loadCustomers() {
  try {
    const res = await fetch(`${API}/customers`, { headers: authHeaders() });
    const customers = await res.json();
    if (!res.ok) throw new Error(customers.error || "Fout klanten");
    customersCache = customers;
    updateAccountCustomerOptions();

    const tbody = document.getElementById("klantenTabel");
    const sel = document.getElementById("factuurKlant");
    tbody.innerHTML = "";
    sel.innerHTML = "";

    customers.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${c.name}</td><td>${c.number}</td><td>${c.email || ""}</td>`;
      const actionTd = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Details";
      btn.addEventListener("click", () => openKlant(c.id));
      actionTd.appendChild(btn);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);

      const opt = document.createElement("option");
      opt.value = c.number;
      opt.textContent = `${c.number} - ${c.name}`;
      sel.appendChild(opt);
    });

    if (isAllowed("overzicht") && document.getElementById("overzicht").classList.contains("active")) {
      loadCustomerSummary();
    }
  } catch (err) {
    alert(err.message);
  }
}

async function openKlant(id) {
  try {
    const res = await fetch(`${API}/customers/${id}`, { headers: authHeaders() });
    const c = await res.json();
    if (!res.ok) throw new Error(c.error || "Fout klant");

    document.getElementById("klantDetails").classList.remove("hidden");
    document.getElementById("klantNaam").value = c.name || "";
    document.getElementById("klantEmail").value = c.email || "";
    document.getElementById("klantAdres").value = c.address || "";
    document.getElementById("klantNummer").value = c.number || "";
    document.getElementById("klantNFC").value = c.nfc_code || "";
    document.getElementById("saveKlant").dataset.customerId = String(c.id);
    hideElement("nfcMode");
  } catch (err) {
    alert(err.message);
  }
}

async function createKlant(event) {
  event.preventDefault();
  if (ROLE !== "admin") return alert("Alleen admin kan klanten toevoegen.");
  const payload = {
    name: document.getElementById("nieuweKlantNaam").value.trim(),
    number: document.getElementById("nieuweKlantNummer").value.trim(),
    email: document.getElementById("nieuweKlantEmail").value.trim(),
    address: document.getElementById("nieuweKlantAdres").value.trim(),
    nfc_code: document.getElementById("nieuweKlantNFC").value.trim() || null,
  };
  if (!payload.name || !payload.number) {
    return alert("Naam en klantnummer zijn verplicht.");
  }
  try {
    const res = await fetch(`${API}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Toevoegen mislukt");
    document.getElementById("nieuweKlantForm").reset();
    await loadCustomers();
    alert("Klant aangemaakt.");
  } catch (err) {
    alert(err.message);
  }
}

async function saveKlant(id) {
  if (ROLE !== "admin") return alert("Alleen admin mag klanten wijzigen.");
  const payload = {
    name: document.getElementById("klantNaam").value,
    email: document.getElementById("klantEmail").value,
    address: document.getElementById("klantAdres").value,
    number: document.getElementById("klantNummer").value,
    nfc_code: document.getElementById("klantNFC").value,
  };
  try {
    const res = await fetch(`${API}/customers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Opslaan mislukt");
    alert("Klant opgeslagen.");
    await loadCustomers();
  } catch (err) {
    alert(err.message);
  }
}

async function scanNFCInto(inputId, pillId, callback) {
  try {
    const res = await fetch(`${API}/nfc/read`, { headers: authHeaders() });
    const data = await res.json();
    if (res.ok && data.nfc_code) {
      document.getElementById(inputId).value = data.nfc_code;
      showPill(pillId, data.mode === "hardware" ? "Hardware" : "Simulatie");
      if (typeof callback === "function") callback();
    } else {
      hideElement(pillId);
      alert("Fout bij NFC: " + (data.error || "Onbekend"));
    }
  } catch (err) {
    hideElement(pillId);
    alert("Kan NFC niet lezen: " + err.message);
  }
}

function zoekKlant() {
  const el = document.getElementById("transactieKlant");
  const val = document.getElementById("nfcInput").value.trim();
  if (!val) {
    el.textContent = "Voer een NFC-code of klantnummer in.";
    delete el.dataset.identifier;
    return;
  }
  el.textContent = "Geselecteerde klant: " + val;
  el.dataset.identifier = val;
}

async function registreerUitgifte() {
  await transact("issue");
}

async function registreerInname() {
  await transact("return");
}

async function transact(type) {
  const identifier = document.getElementById("transactieKlant").dataset.identifier;
  if (!identifier) return alert("Koppel eerst een klant.");
  const product = document.getElementById("transactieProduct").value;
  const amount = Number(document.getElementById("transactieAantal").value);
  try {
    const res = await fetch(`${API}/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ identifier, product, amount, type }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Fout");
    alert(type === "issue" ? "Uitgifte geregistreerd." : "Inname geregistreerd.");
    await Promise.all([loadInventory(), loadDashboard()]);
    if (isAllowed("overzicht")) loadCustomerSummary();
  } catch (err) {
    alert(err.message);
  }
}

async function txIssue(product, amount) {
  if (!TOKEN) return;
  try {
    const res = await fetch(`${API}/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ identifier: "02", product, amount, type: "issue" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Uitgifte mislukt.");
    await Promise.all([loadInventory(), loadDashboard()]);
  } catch (err) {
    alert(err.message);
  }
}

async function txReturn(product, amount) {
  if (!TOKEN) return;
  try {
    const res = await fetch(`${API}/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ identifier: "02", product, amount, type: "return" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Retour mislukt.");
    await Promise.all([loadInventory(), loadDashboard()]);
  } catch (err) {
    alert(err.message);
  }
}

async function downloadFile(url, fallbackName, options = {}) {
  try {
    const fetchOptions = { method: "GET", ...options };
    fetchOptions.headers = { ...authHeaders(), ...(options.headers || {}) };
    const res = await fetch(url, fetchOptions);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Download mislukt");
    }
    const blob = await res.blob();
    const filename = extractFilename(res, fallbackName);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch (err) {
    alert(err.message);
  }
}

function downloadDagAfrekening() {
  if (!isAllowed("facturen")) return alert("Geen toegang tot facturen.");
  const customer = document.getElementById("factuurKlant").value;
  if (!customer) return alert("Selecteer eerst een klant.");
  const today = new Date().toISOString().slice(0, 10);
  const body = JSON.stringify({ customer, date: today });
  downloadFile(`${API}/invoices/daily`, `Dagafrekening_${customer}_${today}.pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

function downloadEindAfrekening() {
  if (!isAllowed("facturen")) return alert("Geen toegang tot facturen.");
  const customer = document.getElementById("factuurKlant").value;
  if (!customer) return alert("Selecteer eerst een klant.");
  const body = JSON.stringify({ customer });
  downloadFile(`${API}/invoices/final`, `Eindafrekening_${customer}.pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

function downloadTxCSV() {
  if (!isAllowed("facturen")) return alert("Geen toegang tot exports.");
  downloadFile(`${API}/export/transactions.csv`, "transacties.csv");
}

function downloadInvCSV() {
  if (!isAllowed("facturen")) return alert("Geen toegang tot exports.");
  downloadFile(`${API}/export/inventory.csv`, "voorraad.csv");
}

async function loadCoinSummaries() {
  if (!isAllowed("munten")) return;
  await Promise.all([loadCoinDaily(), loadCoinCustomers()]);
}

async function loadCoinDaily() {
  try {
    const res = await fetch(`${API}/coins/daily`, { headers: authHeaders() });
    const rows = await res.json();
    if (!res.ok) throw new Error(rows.error || "Fout munten per dag");
    const tbody = document.getElementById("coinsDailyTabel");
    tbody.innerHTML = "";
    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = "<td colspan='2'>Nog geen innamen.</td>";
      tbody.appendChild(tr);
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.date}</td><td>${row.amount}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    alert(err.message);
  }
}

async function loadCoinCustomers() {
  try {
    const res = await fetch(`${API}/coins/customers`, { headers: authHeaders() });
    const rows = await res.json();
    if (!res.ok) throw new Error(rows.error || "Fout munten per klant");
    const tbody = document.getElementById("coinsCustomerTabel");
    tbody.innerHTML = "";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.name}</td><td>${row.number}</td><td>${row.total}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    alert(err.message);
  }
}

async function registreerMunten(event) {
  event.preventDefault();
  if (!isAllowed("munten")) return alert("Geen toegang tot munten.");
  const identifier = document.getElementById("coinIdentifier").value.trim();
  const amount = Number(document.getElementById("coinAmount").value);
  if (!identifier || !amount || amount <= 0) {
    return alert("Voer een geldige klant en hoeveelheid in.");
  }
  try {
    const res = await fetch(`${API}/coins/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ identifier, amount }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Inname mislukt");
    document.getElementById("coinIntakeForm").reset();
    hideElement("nfcModeCoins");
    await loadCoinSummaries();
    if (isAllowed("overzicht")) loadCustomerSummary();
    alert("Munten geregistreerd.");
  } catch (err) {
    alert(err.message);
  }
}

async function loadCustomerSummary() {
  try {
    const res = await fetch(`${API}/customers/summary`, { headers: authHeaders() });
    const rows = await res.json();
    if (!res.ok) throw new Error(rows.error || "Fout klantoverzicht");
    const tbody = document.getElementById("klantOverzichtTabel");
    tbody.innerHTML = "";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.number} - ${row.name}</td>
        <td>${row.issued.hardcups}</td>
        <td>${row.returned.hardcups}</td>
        <td>${row.issued.champagne}</td>
        <td>${row.returned.champagne}</td>
        <td>${row.issued.cocktail}</td>
        <td>${row.returned.cocktail}</td>
        <td>${row.coins}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    alert(err.message);
  }
}

async function loadCustomerPortal() {
  if (ROLE !== "klant") return;
  try {
    const res = await fetch(`${API}/customer/me`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Kon klantgegevens niet laden");
    CURRENT_CUSTOMER = {
      id: data.id,
      number: data.number,
      name: data.name,
      email: data.email,
      address: data.address,
    };
    const assignText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value ?? "";
    };
    assignText("customerNameDisplay", data.name || "-");
    assignText("customerNumberDisplay", data.number || "-");
    assignText("customerEmailDisplay", data.email || "-");
    assignText("customerAddressDisplay", data.address || "-");
    assignText("customerHardcupsIssued", data.hardcups?.issued ?? 0);
    assignText("customerHardcupsReturned", data.hardcups?.returned ?? 0);
    assignText("customerHardcupsBalance", data.hardcups?.balance ?? 0);
    assignText("customerCoinsDisplay", data.coins ?? 0);

    const productLabels = {
      hardcups: "Hardcups",
      champagne: "Champagne Hardcups",
      cocktail: "Cocktail Hardcups",
    };
    const tbody = document.getElementById("customerProductTabel");
    if (tbody) {
      tbody.innerHTML = "";
      Object.entries(productLabels).forEach(([key, label]) => {
        const issued = data.products?.issue?.[key] ?? 0;
        const returned = data.products?.return?.[key] ?? 0;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${label}</td><td>${issued}</td><td>${returned}</td>`;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    alert(err.message);
  }
}

async function fetchCustomersForAccounts() {
  if (!(ROLE === "admin" || isAllowed("klanten") || isAllowed("accounts"))) {
    return;
  }
  try {
    const res = await fetch(`${API}/customers`, { headers: authHeaders() });
    if (!res.ok) {
      return;
    }
    const customers = await res.json();
    customersCache = customers;
    updateAccountCustomerOptions();
  } catch (err) {
    console.warn("Kon klantenlijst niet laden voor accounts", err);
  }
}

function updateAccountCustomerOptions() {
  const list = document.getElementById("customerNumberOptions");
  if (!list) return;
  list.innerHTML = "";
  customersCache.forEach((c) => {
    const option = document.createElement("option");
    option.value = c.number;
    option.label = `${c.number} - ${c.name}`;
    list.appendChild(option);
  });
}

function syncRoleSpecificFields(preserveCustomer = false) {
  const roleField = document.getElementById("accountRole");
  const wrapper = document.getElementById("accountCustomerWrapper");
  const input = document.getElementById("accountCustomerNumber");
  if (!roleField || !wrapper || !input) return;
  const checkboxes = document.querySelectorAll("#accountDashboardOptions input[type='checkbox']");
  if (roleField.value === "klant") {
    wrapper.classList.remove("hidden");
    checkboxes.forEach((cb) => {
      if (cb.value === "klantportaal") {
        cb.disabled = false;
        cb.checked = true;
      } else {
        cb.checked = false;
        cb.disabled = true;
      }
    });
  } else {
    wrapper.classList.add("hidden");
    checkboxes.forEach((cb) => {
      if (cb.value === "klantportaal") {
        cb.checked = false;
      }
      cb.disabled = false;
    });
    if (!preserveCustomer) {
      input.value = "";
    }
  }
}

async function loadAccounts() {
  if (!(ROLE === "admin" || isAllowed("accounts"))) return;
  try {
    if (!customersCache.length) {
      await fetchCustomersForAccounts();
    }
    const res = await fetch(`${API}/users`, { headers: authHeaders() });
    const users = await res.json();
    if (!res.ok) throw new Error(users.error || "Fout bij laden accounts");
    const tbody = document.getElementById("accountsTabel");
    tbody.innerHTML = "";
    users.forEach((user) => {
      const tr = document.createElement("tr");
      const dashList =
        user.dashboards && user.dashboards.length
          ? user.dashboards.map((k) => DASHBOARD_LABELS[k] || k).join(", ")
          : "-";
      const customerDisplay = user.customer ? `${user.customer.number} - ${user.customer.name}` : "-";
      tr.innerHTML = `<td>${user.username}</td><td>${user.role}</td><td>${customerDisplay}</td><td>${dashList}</td>`;
      const actionTd = document.createElement("td");
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Bewerken";
      editBtn.addEventListener("click", () => populateAccountForm(user));
      actionTd.appendChild(editBtn);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });
  } catch (err) {
    alert(err.message);
  }
}

function renderDashboardOptions() {
  const container = document.getElementById("accountDashboardOptions");
  if (!container) return;
  container.innerHTML = "";
  DASHBOARD_KEYS.forEach((key) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = key;
    label.appendChild(input);
    label.appendChild(document.createTextNode(DASHBOARD_LABELS[key]));
    container.appendChild(label);
  });
}

function populateAccountForm(user) {
  document.getElementById("accountFormTitle").textContent = `Account bewerken (${user.username})`;
  document.getElementById("accountId").value = user.id;
  document.getElementById("accountUsername").value = user.username;
  document.getElementById("accountUsername").setAttribute("disabled", "true");
  document.getElementById("accountPassword").value = "";
  document.getElementById("accountRole").value = user.role;
  const allowed = new Set(user.dashboards || []);
  document
    .querySelectorAll("#accountDashboardOptions input[type='checkbox']")
    .forEach((cb) => {
      cb.checked = allowed.has(cb.value);
    });
  const customerInput = document.getElementById("accountCustomerNumber");
  if (customerInput) {
    customerInput.value = user.customer?.number || "";
  }
  syncRoleSpecificFields(true);
}

function resetAccountForm() {
  document.getElementById("accountFormTitle").textContent = "Nieuw account";
  document.getElementById("accountId").value = "";
  document.getElementById("accountUsername").value = "";
  document.getElementById("accountUsername").removeAttribute("disabled");
  document.getElementById("accountPassword").value = "";
  document.getElementById("accountRole").value = "medewerker";
  document
    .querySelectorAll("#accountDashboardOptions input[type='checkbox']")
    .forEach((cb) => (cb.checked = false));
  const customerInput = document.getElementById("accountCustomerNumber");
  if (customerInput) customerInput.value = "";
  syncRoleSpecificFields();
}

async function saveAccount(event) {
  event.preventDefault();
  if (!(ROLE === "admin" || isAllowed("accounts"))) {
    return alert("Geen toegang tot accounts.");
  }
  const id = document.getElementById("accountId").value;
  const username = document.getElementById("accountUsername").value.trim();
  const password = document.getElementById("accountPassword").value;
  const role = document.getElementById("accountRole").value;
  const customerNumber = document.getElementById("accountCustomerNumber").value.trim();
  const dashboards = Array.from(
    document.querySelectorAll("#accountDashboardOptions input[type='checkbox']")
  )
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);

  if (!username) return alert("Gebruikersnaam is verplicht.");
  if (!id && password.length < 6) return alert("Wachtwoord minimaal 6 tekens.");
  if (role === "klant" && !customerNumber) {
    return alert("Klantnummer is verplicht voor klantaccounts.");
  }

  let filteredDashboards = dashboards;
  if (role === "klant") {
    filteredDashboards = ["klantportaal"];
  } else {
    filteredDashboards = dashboards.filter((d) => d !== "klantportaal");
  }

  const payload = { role, dashboards: filteredDashboards };
  if (role === "klant") {
    payload.customerNumber = customerNumber;
  } else if (id) {
    payload.customerNumber = null;
  }
  if (!id || password) payload.password = password;
  if (!id) payload.username = username;

  try {
    const url = id ? `${API}/users/${id}` : `${API}/users`;
    const method = id ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Opslaan mislukt");
    alert("Account opgeslagen.");
    resetAccountForm();
    await loadAccounts();
  } catch (err) {
    alert(err.message);
  }
}

function resetCustomerDetails() {
  hideElement("klantDetails");
  hideElement("nfcMode");
  const saveButton = document.getElementById("saveKlant");
  delete saveButton.dataset.customerId;
  document.getElementById("klantNaam").value = "";
  document.getElementById("klantEmail").value = "";
  document.getElementById("klantAdres").value = "";
  document.getElementById("klantNummer").value = "";
  document.getElementById("klantNFC").value = "";
}

function clearTransactionSelection() {
  const el = document.getElementById("transactieKlant");
  el.textContent = "";
  delete el.dataset.identifier;
  document.getElementById("nfcInput").value = "";
  hideElement("nfcMode2");
}

function showPill(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden");
}

function hideElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

function extractFilename(res, fallback) {
  const disposition = res.headers.get("Content-Disposition");
  if (disposition) {
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    if (match) {
      return decodeURIComponent(match[1] || match[2]);
    }
  }
  return fallback;
}
