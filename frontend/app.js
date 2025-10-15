const API = "http://localhost:5000/api";
let TOKEN = null;
let ROLE = null;

const authHeaders = () => (TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {});

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const logoutButton = document.getElementById("logoutButton");
  const navButtons = document.querySelectorAll("button[data-section]");
  const bulkButtons = document.querySelectorAll(".bulk-add");
  const issueButtons = document.querySelectorAll(".issue-btn");
  const returnButtons = document.querySelectorAll(".return-btn");

  loginForm.addEventListener("submit", doLogin);
  logoutButton.addEventListener("click", logout);

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });

  bulkButtons.forEach((btn) =>
    btn.addEventListener("click", () => voorraadToevoegen(btn.dataset.product))
  );
  issueButtons.forEach((btn) =>
    btn.addEventListener("click", () => txIssue(btn.dataset.product, 1))
  );
  returnButtons.forEach((btn) =>
    btn.addEventListener("click", () => txReturn(btn.dataset.product, 1))
  );

  document.getElementById("scanNFCBtn").addEventListener("click", scanNFC);
  document.getElementById("saveKlant").addEventListener("click", () => {
    const id = document.getElementById("saveKlant").dataset.customerId;
    if (!id) {
      return alert("Selecteer eerst een klant.");
    }
    saveKlant(Number(id));
  });

  document
    .getElementById("zoekKlantBtn")
    .addEventListener("click", zoekKlant);
  document
    .getElementById("scanNFCInputBtn")
    .addEventListener("click", scanNFCInput);
  document
    .getElementById("uitgifteBtn")
    .addEventListener("click", registreerUitgifte);
  document
    .getElementById("innameBtn")
    .addEventListener("click", registreerInname);

  document
    .getElementById("dagAfrekeningBtn")
    .addEventListener("click", downloadDagAfrekening);
  document
    .getElementById("eindAfrekeningBtn")
    .addEventListener("click", downloadEindAfrekening);
  document.getElementById("txCsvBtn").addEventListener("click", downloadTxCSV);
  document.getElementById("invCsvBtn").addEventListener("click", downloadInvCSV);
});

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
    if (res.ok) {
      TOKEN = data.token;
      ROLE = data.role;
      document.getElementById(
        "userRole"
      ).textContent = `Ingelogd als ${username} (${ROLE})`;
      document.getElementById("loginView").classList.add("hidden");
      document.getElementById("appView").classList.remove("hidden");
      showSection("dashboard");
      await initApp();
    } else {
      alert(data.error || "Login mislukt");
    }
  } catch (err) {
    alert("Login mislukt: " + err.message);
  }
}

function logout() {
  TOKEN = null;
  ROLE = null;
  document.getElementById("userRole").textContent = "";
  document.getElementById("loginForm").reset();
  document.getElementById("appView").classList.add("hidden");
  document.getElementById("loginView").classList.remove("hidden");
  document
    .querySelectorAll("#appView section")
    .forEach((section) => section.classList.remove("active"));
  document.getElementById("dashboard").classList.add("active");
  resetCustomerDetails();
  clearTransactionSelection();
}

function showSection(id) {
  document
    .querySelectorAll("#appView section")
    .forEach((section) => section.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) {
    target.classList.add("active");
  }
}

async function initApp() {
  await Promise.all([loadCustomers(), loadInventory(), loadDashboard()]);
  if (ROLE !== "admin") {
    document
      .querySelectorAll(
        "#voorraad input[type='number'], #voorraad .bulk-add, #voorraad .issue-btn, #voorraad .return-btn"
      )
      .forEach((el) => el.setAttribute("disabled", "true"));
    document.getElementById("saveKlant").setAttribute("disabled", "true");
  } else {
    document
      .querySelectorAll(
        "#voorraad input[type='number'], #voorraad .bulk-add, #voorraad .issue-btn, #voorraad .return-btn"
      )
      .forEach((el) => el.removeAttribute("disabled"));
    document.getElementById("saveKlant").removeAttribute("disabled");
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
  } catch (err) {
    alert(err.message);
  }
}

async function loadInventory() {
  try {
    const res = await fetch(`${API}/inventory`, { headers: authHeaders() });
    const inv = await res.json();
    if (!res.ok) throw new Error(inv.error || "Fout voorraad");
    document.getElementById("voorraadHardcups").innerText = inv.hardcups?.units ?? 0;
    document.getElementById("voorraadChampagne").innerText = inv.champagne?.units ?? 0;
    document.getElementById("voorraadCocktail").innerText = inv.cocktail?.units ?? 0;
  } catch (err) {
    alert(err.message);
  }
}

async function loadCustomers() {
  try {
    const res = await fetch(`${API}/customers`, { headers: authHeaders() });
    const customers = await res.json();
    if (!res.ok) throw new Error(customers.error || "Fout klanten");

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

async function scanNFC() {
  try {
    const res = await fetch(`${API}/nfc/read`, { headers: authHeaders() });
    const data = await res.json();
    if (res.ok && data.nfc_code) {
      document.getElementById("klantNFC").value = data.nfc_code;
      showPill("nfcMode", data.mode === "hardware" ? "Hardware" : "Simulatie");
      alert(`NFC gescand (${data.mode}): ${data.nfc_code}`);
    } else {
      hideElement("nfcMode");
      alert("Fout bij NFC: " + (data.error || "Onbekend"));
    }
  } catch (err) {
    hideElement("nfcMode");
    alert("Kan NFC niet lezen: " + err.message);
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
    if (res.ok) {
      alert("Klant opgeslagen.");
      await loadCustomers();
    } else {
      throw new Error(data.error || "Opslaan mislukt.");
    }
  } catch (err) {
    alert(err.message);
  }
}

async function voorraadToevoegen(product) {
  if (ROLE !== "admin") return alert("Alleen admin mag voorraad toevoegen.");
  const input = document.querySelector(`input[data-product='${product}']`);
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
    await loadInventory();
    await loadDashboard();
    alert(`${amount} ${product} toegevoegd.`);
  } catch (err) {
    alert(err.message);
  }
}

async function txIssue(product, amount) {
  try {
    const res = await fetch(`${API}/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ identifier: "02", product, amount, type: "issue" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Uitgifte mislukt.");
    await loadInventory();
    await loadDashboard();
  } catch (err) {
    alert(err.message);
  }
}

async function txReturn(product, amount) {
  try {
    const res = await fetch(`${API}/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ identifier: "02", product, amount, type: "return" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Retour mislukt.");
    await loadInventory();
    await loadDashboard();
  } catch (err) {
    alert(err.message);
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

async function scanNFCInput() {
  try {
    const res = await fetch(`${API}/nfc/read`, { headers: authHeaders() });
    const data = await res.json();
    if (res.ok && data.nfc_code) {
      document.getElementById("nfcInput").value = data.nfc_code;
      showPill("nfcMode2", data.mode === "hardware" ? "Hardware" : "Simulatie");
      zoekKlant();
    } else {
      hideElement("nfcMode2");
      alert("Fout bij NFC: " + (data.error || "Onbekend"));
    }
  } catch (err) {
    hideElement("nfcMode2");
    alert("Kan NFC niet lezen: " + err.message);
  }
}

async function registreerUitgifte() {
  const identifier = document.getElementById("transactieKlant").dataset.identifier;
  if (!identifier) return alert("Koppel eerst een klant.");
  const product = document.getElementById("transactieProduct").value;
  const amount = Number(document.getElementById("transactieAantal").value);
  try {
    const res = await fetch(`${API}/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ identifier, product, amount, type: "issue" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Fout");
    alert("Uitgifte geregistreerd.");
    await loadInventory();
    await loadDashboard();
  } catch (err) {
    alert(err.message);
  }
}

async function registreerInname() {
  const identifier = document.getElementById("transactieKlant").dataset.identifier;
  if (!identifier) return alert("Koppel eerst een klant.");
  const product = document.getElementById("transactieProduct").value;
  const amount = Number(document.getElementById("transactieAantal").value);
  try {
    const res = await fetch(`${API}/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ identifier, product, amount, type: "return" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Fout");
    alert("Inname geregistreerd.");
    await loadInventory();
    await loadDashboard();
  } catch (err) {
    alert(err.message);
  }
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

async function downloadFile(url, fallbackName, options = {}) {
  try {
    const res = await fetch(url, {
      method: "GET",
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) },
    });
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
  const customer = document.getElementById("factuurKlant").value;
  if (!customer) {
    return alert("Selecteer eerst een klant.");
  }
  const today = new Date().toISOString().slice(0, 10);
  const url = `${API}/invoices/daily?customer=${encodeURIComponent(
    customer
  )}&date=${today}`;
  downloadFile(url, `Dagafrekening_${customer}_${today}.pdf`, { method: "POST" });
}

function downloadEindAfrekening() {
  const customer = document.getElementById("factuurKlant").value;
  if (!customer) {
    return alert("Selecteer eerst een klant.");
  }
  const url = `${API}/invoices/final?customer=${encodeURIComponent(customer)}`;
  downloadFile(url, `Eindafrekening_${customer}.pdf`, { method: "POST" });
}

function downloadTxCSV() {
  const url = `${API}/export/transactions.csv`;
  downloadFile(url, "transacties.csv");
}

function downloadInvCSV() {
  const url = `${API}/export/inventory.csv`;
  downloadFile(url, "voorraad.csv");
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

function showPill(id, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.remove("hidden");
}

function hideElement(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add("hidden");
  }
}

function clearTransactionSelection() {
  const el = document.getElementById("transactieKlant");
  el.textContent = "";
  delete el.dataset.identifier;
  document.getElementById("nfcInput").value = "";
  hideElement("nfcMode2");
}
