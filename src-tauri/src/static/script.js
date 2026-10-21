function showAdminLogin() {
  document.getElementById("admin-login-overlay").hidden = false;
  document.getElementById("admin-login-username").focus();
}

function hideAdminLogin() {
  document.getElementById("admin-login-overlay").hidden = true;
}

function expireAdminSession() {
  showAdminLogin();
}

async function apiFetch(url, options = {}) {
  const response = await window.fetch(url, options);
  if (response.status === 401) {
    expireAdminSession();
    throw new Error("Admin session expired. Please sign in again.");
  }
  return response;
}

async function loginAdmin(event) {
  event.preventDefault();
  const form = document.getElementById("admin-login-form");
  const button = document.getElementById("admin-login-button");
  const status = document.getElementById("admin-login-status");
  button.disabled = true;
  status.textContent = "";
  status.className = "";
  try {
    const response = await window.fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("admin-login-username").value.trim(),
        password: document.getElementById("admin-login-password").value,
      }),
    });
    if (!response.ok) {
      throw new Error(await response.text() || "Sign in failed.");
    }
    document.getElementById("admin-login-password").value = "";
    hideAdminLogin();
    loadProducts();
  } catch (error) {
    status.textContent = error.message;
    status.className = "err";
  } finally {
    button.disabled = false;
  }
}

async function logoutAdmin() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch (error) {
    console.error("Failed to end admin session:", error);
  } finally {
    expireAdminSession();
  }
}

async function restoreAdminSession() {
  try {
    const response = await window.fetch("/auth/session");
    if (!response.ok) {
      showAdminLogin();
      return;
    }
    hideAdminLogin();
    loadProducts();
  } catch (error) {
    showAdminLogin();
  }
}

/* ═══════════════════════════════ PRODUCTS ═══════════════════════════════ */
let products = [];

async function loadProducts() {
  try {
    const res = await apiFetch("/products");
    products = await res.json();
    renderTable();
  } catch (e) {
    setStatus("Failed to load products.", false);
  }
}

async function importProductsFromCsv() {
  const input = document.getElementById("product-csv");
  const file = input.files[0];
  const button = document.getElementById("import-products-btn");
  const status = document.getElementById("import-status");

  if (!file) {
    status.textContent = "Choose a CSV file to import.";
    status.className = "err";
    return;
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    status.textContent = "Choose a .csv file.";
    status.className = "err";
    return;
  }

  button.disabled = true;
  status.textContent = "Importing products…";
  status.className = "";
  try {
    const res = await apiFetch("/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv_content: await file.text() }),
    });
    const message = await res.text();
    if (!res.ok) throw new Error(message || "Product import failed.");

    status.textContent = message;
    status.className = "ok";
    input.value = "";
    await loadProducts();
  } catch (e) {
    status.textContent = `Import failed: ${e}`;
    status.className = "err";
    await loadProducts();
  } finally {
    button.disabled = false;
  }
}

async function loadCategories() {
  try {
    const res = await apiFetch("/categories");
    if (!res.ok) throw new Error("Failed to fetch categories");
    const cats = await res.json();
    const select = document.getElementById("category");
    select.innerHTML = "";

    if (!cats.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No categories";
      select.appendChild(opt);
    } else {
      cats.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
      });
    }

    const otherOpt = document.createElement("option");
    otherOpt.value = "__other__";
    otherOpt.textContent = "Other (custom)…";
    select.appendChild(otherOpt);

    const firstReal = cats[0] || "__other__";
    select.value = firstReal;
    toggleCustomCategory();
  } catch (e) {
    console.error("Failed to load categories:", e);
  }
}

function toggleCustomCategory() {
  const isOther = document.getElementById("category").value === "__other__";
  document.getElementById("custom-category-field").style.display = isOther ? "flex" : "none";
}

async function addCategory() {
  const input = document.getElementById("custom-category");
  const button = document.getElementById("add-category-btn");
  const status = document.getElementById("category-status");
  const categoryName = input.value.trim();

  status.textContent = "";
  status.className = "";
  if (!categoryName) {
    status.textContent = "Category name is required.";
    status.className = "err";
    input.focus();
    return;
  }

  button.disabled = true;
  try {
    const res = await apiFetch("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_name: categoryName })
    });
    if (!res.ok) throw new Error(await res.text() || "Failed to create category.");

    const select = document.getElementById("category");
    let option = Array.from(select.options).find(item => item.value === categoryName);
    if (!option) {
      option = document.createElement("option");
      option.value = categoryName;
      option.textContent = categoryName;
      const otherOption = select.querySelector('option[value="__other__"]');
      if (otherOption) {
        select.insertBefore(option, otherOption);
      } else {
        select.appendChild(option);
      }
    }
    select.value = categoryName;
    input.value = "";
    toggleCustomCategory();
    status.textContent = "Category created.";
    status.className = "ok";
  } catch (e) {
    status.textContent = `Failed to create category: ${e.message}`;
    status.className = "err";
  } finally {
    button.disabled = false;
  }
}

function renderTable() {
  const tbody = document.getElementById("product-rows");
  if (products.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No products yet.</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td style="color:#52525b">${p.product_id}</td>
      <td style="font-weight:600">${esc(p.product_name)}</td>
      <td>${esc(p.product_category)}</td>
      <td>£${p.product_price.toFixed(2)}</td>
      <td><span class="pill ${p.product_availability ? 'pill-active' : 'pill-inactive'}">${p.product_availability ? 'Active' : 'Hidden'}</span></td>
      <td>
        <button class="btn-icon" onclick="startEdit(${p.product_id})" title="Edit">✏️</button>
        <button class="btn-icon danger" onclick="deleteProduct(${p.product_id})" title="Delete">🗑</button>
      </td>
    </tr>
  `).join("");
}

function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function validatePrice(val) {
  const n = parseFloat(val);
  if (val.trim() === "" || isNaN(n) || n < 0 || !/^\d+(\.\d{0,2})?$/.test(val.trim())) {
    return null;
  }
  return n;
}

function setStatus(msg, ok) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = ok ? "ok" : "err";
}

function startEdit(id) {
  const p = products.find(x => x.product_id === id);
  if (!p) return;
  document.getElementById("edit-id").value = id;
  document.getElementById("name").value = p.product_name;
  const categorySelect = document.getElementById("category");
  const knownCategories = Array.from(categorySelect.options).map(o => o.value).filter(v => v && v !== "__other__");
  if (knownCategories.includes(p.product_category)) {
    categorySelect.value = p.product_category;
    document.getElementById("custom-category").value = "";
  } else {
    categorySelect.value = "__other__";
    document.getElementById("custom-category").value = p.product_category;
  }
  toggleCustomCategory();
  document.getElementById("price").value = p.product_price.toFixed(2);
  document.getElementById("availability").checked = p.product_availability;
  document.getElementById("form-title").textContent = "Edit Product";
  document.getElementById("cancel-btn").style.display = "";
  document.getElementById("name").focus();
}

function cancelEdit() {
  document.getElementById("edit-id").value = "";
  document.getElementById("name").value = "";
  const categorySelect = document.getElementById("category");
  const firstCategory = Array.from(categorySelect.options).find(o => o.value && o.value !== "__other__")?.value || "__other__";
  categorySelect.value = firstCategory;
  document.getElementById("custom-category").value = "";
  toggleCustomCategory();
  document.getElementById("price").value = "";
  document.getElementById("price-error").textContent = "";
  document.getElementById("price").classList.remove("error");
  document.getElementById("availability").checked = true;
  document.getElementById("form-title").textContent = "Add Product";
  document.getElementById("cancel-btn").style.display = "none";
  document.getElementById("status").textContent = "";
}

async function submitForm() {
  const priceVal = document.getElementById("price").value;
  const price = validatePrice(priceVal);

  if (price === null) {
    document.getElementById("price").classList.add("error");
    document.getElementById("price-error").textContent = "Must be a valid positive number (e.g. 1.50)";
    return;
  }
  document.getElementById("price").classList.remove("error");
  document.getElementById("price-error").textContent = "";

  const categorySelect = document.getElementById("category").value;
  const customCategory = document.getElementById("custom-category").value.trim();
  const product_category = categorySelect === "__other__" ? customCategory : categorySelect;

  if (categorySelect === "__other__" && !customCategory) {
    setStatus("Custom category name is required.", false);
    return;
  }

  const body = {
    product_name: document.getElementById("name").value.trim(),
    product_category,
    product_price: price,
    product_availability: document.getElementById("availability").checked,
  };

  if (!body.product_name) {
    setStatus("Name is required.", false);
    return;
  }

  const editId = document.getElementById("edit-id").value;

  try {
    if (editId) {
      await apiFetch(`/products/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setStatus("Product updated.", true);
    } else {
      await apiFetch("/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setStatus("Product added.", true);
    }
    cancelEdit();
    loadProducts();
  } catch (e) {
    setStatus(`Error: ${e}`, false);
  }
}

async function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;
  try {
    await apiFetch(`/products/${id}`, { method: "DELETE" });
    setStatus("Product deleted.", true);
    loadProducts();
  } catch (e) {
    setStatus(`Error: ${e}`, false);
  }
}

/* ═══════════════════════════════ ORDERS ═════════════════════════════════ */
let orders = [];

async function loadOrders() {
  const start = document.getElementById("start-date").value;
  const end = document.getElementById("end-date").value;
  const params = new URLSearchParams();
  if (start) params.set("start_date", start);
  if (end) params.set("end_date", end);
  const url = "/orders/detail" + (params.toString() ? "?" + params.toString() : "");

  document.getElementById("order-rows").innerHTML =
    '<tr class="empty-row"><td colspan="6">Loading…</td></tr>';
  try {
    const res = await apiFetch(url);
    orders = await res.json();
    renderOrders();
  } catch (e) {
    document.getElementById("order-rows").innerHTML =
      '<tr class="empty-row"><td colspan="6">Failed to load orders.</td></tr>';
  }
}

function renderOrders() {
  const tbody = document.getElementById("order-rows");
  const dlBtn = document.getElementById("dl-btn");
  const summary = document.getElementById("orders-summary");

  if (!orders.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No orders found.</td></tr>';
    summary.innerHTML = "";
    dlBtn.disabled = true;
    return;
  }

  const totalRevenue = orders.reduce((s, o) => s + o.price, 0);
  const totalQty = orders.reduce((s, o) => s + o.quantity, 0);
  summary.innerHTML =
    `<strong>${orders.length}</strong> orders &nbsp;·&nbsp; ` +
    `<strong>${totalQty}</strong> items &nbsp;·&nbsp; ` +
    `<strong>£${totalRevenue.toFixed(2)}</strong> total`;
  dlBtn.disabled = false;

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td style="color:#52525b">${o.order_id}</td>
      <td style="font-weight:600">${esc(o.product_name)}</td>
      <td>${esc(o.product_category)}</td>
      <td>${o.quantity}</td>
      <td>£${o.price.toFixed(2)}</td>
      <td style="color:#71717a; font-size:0.8rem">${esc(o.timestamp)}</td>
    </tr>
  `).join("");
}

function clearOrderFilter() {
  document.getElementById("start-date").value = "";
  document.getElementById("end-date").value = "";
  loadOrders();
}

function downloadCSV() {
  if (!orders.length) return;
  const header = ["Order ID", "Product", "Category", "Quantity", "Price (£)", "Timestamp"];
  const rows = orders.map(o => [
    o.order_id,
    `"${String(o.product_name).replace(/"/g, '""')}"`,
    `"${String(o.product_category).replace(/"/g, '""')}"`,
    o.quantity,
    o.price.toFixed(2),
    `"${o.timestamp}"`,
  ]);
  const csv = [header, ...rows].map(r => r.join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const now = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `orders_${now}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════ USERS ═════════════════════════════════ */
let users = [];

async function loadUsers() {
  const query = document.getElementById("user-search").value.trim();
  const searchValue = query === "" ? "%" : query;
  const encoded = encodeURIComponent(searchValue);
  const url = `/users/name/${encoded}`;

  const tbody = document.getElementById("user-rows");
  tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Searching…</td></tr>';

  document.getElementById("user-is-admin").addEventListener("change", function () {
    const balanceInput = document.getElementById("user-balance");

    if (this.checked) {
      balanceInput.value = "0";
      balanceInput.closest(".field").style.display = "none";
    } else {
      balanceInput.closest(".field").style.display = "";
    }
  });

  try {
    const res = await apiFetch(url);
    users = await res.json();
    renderUsers();
  } catch (e) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Failed to load users.</td></tr>';
  }
}

function renderUsers() {
  const tbody = document.getElementById("user-rows");
  const summary = document.getElementById("users-summary");

  if (!users.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No users found.</td></tr>';
    summary.innerHTML = "";
    return;
  }

  summary.innerHTML = `<strong>${users.length}</strong> user${users.length === 1 ? "" : "s"}`;
  tbody.innerHTML = users.map(u => `
    <tr>
      <td style="color:#52525b">${u.user_id}</td>
      <td style="font-family:monospace; font-size:0.9rem;">${esc(u.tag_id)}</td>
      <td style="font-weight:600">${esc(u.full_name)}</td>
      <td><span class="pill ${u.is_admin ? 'pill-active' : 'pill-inactive'}">${u.is_admin ? 'Admin' : 'User'}</span></td>
      <td>£${u.balance.toFixed(2)}</td>
      <td>
        <button class="btn btn-secondary" onclick="startEditUser('${encodeURIComponent(u.tag_id)}')">Edit</button>
        <button class="btn btn-secondary" onclick="toggleAdmin('${encodeURIComponent(u.tag_id)}')">${u.is_admin ? 'Revoke admin' : 'Make admin'}</button>
        <button class="btn btn-secondary" onclick="deleteUser('${encodeURIComponent(u.tag_id)}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

async function toggleAdmin(encodedTagId) {
  const tagId = decodeURIComponent(encodedTagId);
  const user = users.find(u => u.tag_id === tagId);
  if (!user) return;

  if (!user.is_admin) {
    startEditUser(encodedTagId);
    document.getElementById("user-is-admin").checked = true;
    document.getElementById("user-status").textContent =
      "Set an admin username and password to promote this user.";
    return;
  }

  const updated = {
    tag_id: user.tag_id,
    full_name: user.full_name,
    username: user.username || null,
    password: "",
    is_admin: !user.is_admin,
    balance: user.balance,
  };

  try {
    const res = await apiFetch(`/users?tag_id=${encodeURIComponent(tagId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (!res.ok) {
      throw new Error(`Status ${res.status}`);
    }
    user.is_admin = !user.is_admin;
    renderUsers();
  } catch (e) {
    alert(`Failed to update admin status: ${e}`);
  }
}

async function deleteUser(encodedTagId) {
  const tagId = decodeURIComponent(encodedTagId);
  if (!confirm("Delete this user?")) return;

  try {
    const res = await apiFetch(`/users?tag_id=${encodeURIComponent(tagId)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    loadUsers();
  } catch (e) {
    alert(`Failed to delete user: ${e}`);
  }
}

function startEditUser(encodedTagId) {
  const tagId = decodeURIComponent(encodedTagId);
  const user = users.find(u => u.tag_id === tagId);
  if (!user) return;

  document.getElementById("user-edit-tag-id").value = user.tag_id;
  document.getElementById("user-tag-id").value = user.tag_id;
  document.getElementById("user-tag-id").disabled = true;
  document.getElementById("user-full-name").value = user.full_name;
  document.getElementById("username").value = user.username || "";
  document.getElementById("user-password").value = "";
  document.getElementById("user-password-confirm").value = "";
  document.getElementById("user-balance").value = user.balance.toFixed(2);

  const adminCheckbox = document.getElementById("user-is-admin");
  adminCheckbox.checked = user.is_admin;

  const balanceField = document.getElementById("user-balance").closest(".field");

  if (user.is_admin) {
    document.getElementById("user-balance").value = "0";
    balanceField.style.display = "none";
  } else {
    balanceField.style.display = "";
  }

  document.getElementById("user-form-title").textContent = "Edit User";
  document.getElementById("user-submit-btn").textContent = "Save user";
  document.getElementById("user-cancel-btn").style.display = "";
  document.getElementById("user-status").textContent = "";
}

function cancelUserEdit() {
  document.getElementById("user-edit-tag-id").value = "";
  document.getElementById("user-tag-id").value = "";
  document.getElementById("user-tag-id").disabled = false;
  document.getElementById("user-full-name").value = "";
  document.getElementById("username").value = "";
  document.getElementById("user-password").value = "";
  document.getElementById("user-password-confirm").value = "";
  document.getElementById("show-user-passwords").checked = false;
  toggleUserPasswordVisibility();
  document.getElementById("user-balance").value = "";
  document.getElementById("user-is-admin").checked = false;

  document.getElementById("user-balance").closest(".field").style.display = "";

  document.getElementById("user-form-title").textContent = "Create User";
  document.getElementById("user-submit-btn").textContent = "Create user";
  document.getElementById("user-cancel-btn").style.display = "none";
  document.getElementById("user-status").textContent = "";
}

function toggleUserPasswordVisibility() {
  const type = document.getElementById("show-user-passwords").checked ? "text" : "password";
  document.getElementById("user-password").type = type;
  document.getElementById("user-password-confirm").type = type;
}

async function submitUserForm() {
  const submitButton = document.getElementById("user-submit-btn");
  if (submitButton.disabled) return;

  const originalTagId = document.getElementById("user-edit-tag-id").value;
  const tagId = document.getElementById("user-tag-id").value.trim();
  const fullName = document.getElementById("user-full-name").value.trim();
  const username = document.getElementById("username").value.trim();
  const balanceValue = document.getElementById("user-balance").value.trim();
  const password = document.getElementById("user-password").value.trim();
  const confirmPassword = document.getElementById("user-password-confirm").value.trim();
  const isAdmin = document.getElementById("user-is-admin").checked;
  const statusEl = document.getElementById("user-status");
  const wasAdmin = originalTagId && users.some(
    (user) => user.tag_id === originalTagId && user.is_admin,
  );

  statusEl.textContent = "";
  const balance = isAdmin ? 0 : parseFloat(balanceValue || "0");
  if (!tagId || !fullName || (isAdmin && !username)) {
    statusEl.textContent = isAdmin
      ? "Tag ID, full name, and admin username are required."
      : "Tag ID and full name are required.";
    statusEl.className = "err";
    return;
  }
  if (isAdmin && !wasAdmin && password.length < 8) {
    statusEl.textContent = "New admins need a password of at least 8 characters.";
    statusEl.className = "err";
    return;
  }
  if (isAdmin && password !== confirmPassword) {
    statusEl.textContent = "Passwords do not match.";
    statusEl.className = "err";
    return;
  }
  if (balanceValue !== "" && (isNaN(balance) || balance < 0)) {
    statusEl.textContent = "Balance must be a positive number.";
    statusEl.className = "err";
    return;
  }

  const payload = {
    tag_id: tagId.toLowerCase(),
    full_name: fullName,
    username: username || null,
    password: password || null,
    is_admin: isAdmin,
    balance: isNaN(balance) ? 0 : balance,
  };

  const isUpdating = Boolean(originalTagId);
  submitButton.disabled = true;
  submitButton.textContent = isUpdating ? "Updating…" : "Creating…";
  document.getElementById("user-cancel-btn").disabled = true;
  statusEl.textContent = isUpdating ? "Updating user…" : "Creating user…";
  statusEl.className = "loading";

  try {
    const url = originalTagId
      ? `/users?tag_id=${encodeURIComponent(originalTagId)}`
      : "/users";
    const method = originalTagId ? "PUT" : "POST";
    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    cancelUserEdit();
    statusEl.textContent = isUpdating ? "User updated." : "User created.";
    statusEl.className = "ok";
    loadUsers();
  } catch (e) {
    statusEl.textContent = `Save failed: ${e}`;
    statusEl.className = "err";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = document.getElementById("user-edit-tag-id").value
      ? "Save user"
      : "Create user";
    document.getElementById("user-cancel-btn").disabled = false;
  }
}

function clearUserSearch() {
  document.getElementById("user-search").value = "";
  loadUsers();
}

/* ═════════════════════════════ IMAGES ═════════════════════════════════ */
async function loadImages() {
  const grid = document.getElementById("image-grid");
  grid.innerHTML = '<p style="color:#52525b; grid-column: 1 / -1">Loading…</p>';
  try {
    const res = await apiFetch("/images");
    if (!res.ok) throw new Error("Failed to fetch images");
    const imgs = await res.json();
    if (!imgs.length) {
      grid.innerHTML = '<p style="color:#52525b; grid-column: 1 / -1">No images uploaded yet.</p>';
      return;
    }
    grid.innerHTML = imgs.map(img => `
      <div class="image-card">
        <img src="${esc(img.url)}" alt="${esc(img.name)}" loading="lazy" />
        <div class="image-info">${esc(img.name)}</div>
        <div class="image-actions">
          <button class="btn-icon danger" onclick="deleteImage('${encodeURIComponent(img.name)}')" title="Delete">🗑</button>
        </div>
      </div>
    `).join("");
  } catch (e) {
    grid.innerHTML = `<p style="color:#f87171; grid-column: 1 / -1">Failed to load images: ${esc(e.message)}</p>`;
  }
}

async function uploadImages(files) {
  if (!files || !files.length) return;
  const status = document.getElementById("image-status");
  status.textContent = "Uploading…";
  status.className = "";

  const form = new FormData();
  for (const file of files) {
    form.append("images", file);
  }

  try {
    const res = await apiFetch("/images", { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text() || res.statusText);
    status.textContent = `${files.length} image(s) uploaded.`;
    status.className = "ok";
    document.getElementById("image-input").value = "";
    loadImages();
  } catch (e) {
    status.textContent = `Upload failed: ${e.message}`;
    status.className = "err";
  }
}

async function deleteImage(encodedName) {
  const name = decodeURIComponent(encodedName);
  if (!confirm(`Delete ${name}?`)) return;
  try {
    const res = await apiFetch(`/images/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text() || res.statusText);
    loadImages();
  } catch (e) {
    alert(`Failed to delete image: ${e.message}`);
  }
}

/* drag-and-drop */
const uploadZone = document.getElementById("upload-zone");
uploadZone.addEventListener("dragover", e => { e.preventDefault(); uploadZone.classList.add("dragover"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
uploadZone.addEventListener("drop", e => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  uploadImages(e.dataTransfer.files);
});

/* ═════════════════════════════ TABS ════════════════════════════════════ */
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
}

/* ═════════════════════════════ INIT ════════════════════════════════════ */
restoreAdminSession();
loadCategories();
loadOrders();
loadUsers();
loadImages();
