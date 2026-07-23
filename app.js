const STORAGE_KEY = 'el_usuario_pide_config';
const CATEGORY_ORDER = ['soraya', 'carlos', 'jazmin'];
const FALLBACK_COLORS = ['#8B5CF6', '#3B82F6', '#22C55E', '#F97316', '#EC4899', '#14B8A6'];

let currentConfig = null;
let loadPromise = null;
let activeTab = 'game';

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isHexColor(value) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uniqueCategoryId(baseName, usedIds) {
  const baseId = slugify(baseName) || 'categoria';
  let candidate = baseId;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function normalizeConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  const categories = Array.isArray(source.categorias) ? source.categorias : [];
  const usedIds = new Set();

  return {
    categorias: categories.map((category, index) => {
      const name = typeof category?.nombre === 'string' && category.nombre.trim()
        ? category.nombre.trim()
        : `Categoría ${index + 1}`;

      const id = typeof category?.id === 'string' && category.id.trim()
        ? uniqueCategoryId(category.id.trim(), usedIds)
        : uniqueCategoryId(name, usedIds);

      const colorHex = isHexColor(category?.colorHex)
        ? category.colorHex.trim()
        : FALLBACK_COLORS[index % FALLBACK_COLORS.length];

      const requerimientos = Array.isArray(category?.requerimientos)
        ? category.requerimientos
            .map((requirement) => (typeof requirement === 'string' ? requirement.trim() : String(requirement ?? '').trim()))
            .filter((requirement) => requirement.length > 0)
        : [];

      return {
        id,
        nombre: name,
        colorHex,
        requerimientos: requerimientos.length ? requerimientos : ['Nuevo requerimiento'],
      };
    }),
  };
}

function readFromLocalStorage() {
  try {
    const rawConfig = localStorage.getItem(STORAGE_KEY);
    if (!rawConfig) {
      return null;
    }

    return normalizeConfig(JSON.parse(rawConfig));
  } catch (error) {
    console.warn('No se pudo leer la configuración desde localStorage.', error);
    return null;
  }
}

async function fetchDefaultConfig() {
  const response = await fetch('default-config.json', { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`No se pudo cargar default-config.json. Estado HTTP: ${response.status}`);
  }

  return normalizeConfig(await response.json());
}

async function loadConfig() {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const storedConfig = readFromLocalStorage();

    if (storedConfig) {
      currentConfig = storedConfig;
      return cloneConfig(currentConfig);
    }

    currentConfig = await fetchDefaultConfig();
    return cloneConfig(currentConfig);
  })();

  return loadPromise;
}

function saveConfig(config = currentConfig) {
  if (!config) {
    throw new Error('No hay configuración disponible para guardar.');
  }

  currentConfig = normalizeConfig(config);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentConfig, null, 2));
  return cloneConfig(currentConfig);
}

function exportConfig(config = currentConfig, fileName = 'default-config.json') {
  if (!config) {
    throw new Error('No hay configuración disponible para exportar.');
  }

  const jsonBlob = new Blob([JSON.stringify(normalizeConfig(config), null, 2)], {
    type: 'application/json',
  });
  const downloadUrl = URL.createObjectURL(jsonBlob);
  const anchor = document.createElement('a');

  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(downloadUrl);
}

function getConfig() {
  return currentConfig ? cloneConfig(currentConfig) : null;
}

function getCategories() {
  return Array.isArray(currentConfig?.categorias) ? currentConfig.categorias : [];
}

function getCategoryById(categoryId) {
  return getCategories().find((category) => category.id === categoryId) || null;
}

function getInitialTurn() {
  const categories = getCategories();
  const availableCategory = CATEGORY_ORDER.find((categoryId) =>
    categories.some((category) => category.id === categoryId),
  );

  return availableCategory || categories[0]?.id || '';
}

function getSafeTurnId(turnId) {
  const categories = getCategories();

  if (categories.some((category) => category.id === turnId)) {
    return turnId;
  }

  return getInitialTurn();
}

function getRandomRequirement(category) {
  if (!category || !Array.isArray(category.requerimientos) || category.requerimientos.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * category.requerimientos.length);
  return category.requerimientos[randomIndex];
}

function createCategoryTemplate() {
  const categories = getCategories();
  const usedIds = new Set(categories.map((category) => category.id));
  const index = categories.length + 1;
  const name = `Nuevo jugador ${index}`;

  return {
    id: uniqueCategoryId(name, usedIds),
    nombre: name,
    colorHex: FALLBACK_COLORS[(index - 1) % FALLBACK_COLORS.length],
    requerimientos: ['Nuevo requerimiento'],
  };
}

function setConfigStatus(message) {
  const statusElement = document.getElementById('config-status');

  if (statusElement) {
    statusElement.textContent = message;
  }
}

function setTurnHint(turnId) {
  const hintElement = document.getElementById('turn-hint');

  if (!hintElement) {
    return;
  }

  const turnCategory = getCategoryById(turnId);
  if (!turnCategory) {
    hintElement.textContent = 'Selecciona un turno válido para iniciar el juego.';
    return;
  }

  hintElement.textContent = `Cuando el turno sea de ${turnCategory.nombre}, su tarjeta quedará deshabilitada.`;
}

function renderTurnSelect(selectedTurnId) {
  const turnSelect = document.getElementById('turn-select');

  if (!turnSelect) {
    return '';
  }

  const categories = getCategories();
  const safeTurnId = getSafeTurnId(selectedTurnId || turnSelect.value || getInitialTurn());

  turnSelect.innerHTML = categories
    .map((category) => `<option value="${category.id}">${escapeHtml(category.nombre)}</option>`)
    .join('');

  turnSelect.value = safeTurnId;
  return safeTurnId;
}

function renderBoard(turnId) {
  const board = document.getElementById('board');

  if (!board) {
    return;
  }

  const categories = getCategories();

  if (!categories.length) {
    board.innerHTML = '<div class="empty-state">No hay categorías disponibles en la configuración.</div>';
    return;
  }

  board.innerHTML = categories
    .map((category) => {
      const isDisabled = category.id === turnId;

      return `
        <button
          type="button"
          class="board-card ${isDisabled ? 'is-disabled' : ''}"
          data-category-id="${category.id}"
          style="background: linear-gradient(135deg, ${category.colorHex}, rgba(15, 23, 42, 0.92)); color: #fff;"
          ${isDisabled ? 'disabled aria-disabled="true"' : ''}
        >
          <span class="badge">${isDisabled ? 'No disponible en tu turno' : 'Disponible'}</span>
          <div>
            <h2>${escapeHtml(category.nombre)}</h2>
            <p>${isDisabled ? 'Esta tarjeta está bloqueada para forzar elegir otra opción.' : 'Haz clic para pedir un requerimiento aleatorio de esta categoría.'}</p>
          </div>
          <div class="foot"></div>
          <!-- <div class="foot">Color asignado: ${category.colorHex}</div> -->
        </button>
      `;
    })
    .join('');
}

function renderGameView() {
  const turnSelect = document.getElementById('turn-select');
  const selectedTurn = renderTurnSelect(turnSelect?.value || getInitialTurn());

  setTurnHint(selectedTurn);
  renderBoard(selectedTurn);
}

function renderConfigView() {
  const editorList = document.getElementById('category-editor-list');

  if (!editorList) {
    return;
  }

  const categories = getCategories();

  if (!categories.length) {
    editorList.innerHTML = '<div class="empty-state">No hay categorías para editar. Usa <strong>Agregar jugador/categoría</strong>.</div>';
    return;
  }

  editorList.innerHTML = categories
    .map((category) => {
      const requirements = Array.isArray(category.requerimientos) ? category.requerimientos : [];

      return `
        <article class="category-editor" data-category-id="${category.id}">
          <div class="category-editor-header" style="background: linear-gradient(135deg, ${category.colorHex}, rgba(15, 23, 42, 0.92));">
            <span>${escapeHtml(category.nombre)}</span>
            <button class="mini-button danger" type="button" data-action="remove-category" data-category-id="${category.id}">Eliminar categoría</button>
          </div>
          <div class="category-editor-body">
            <div class="field-grid">
              <div class="field half">
                <label for="name-${category.id}">Nombre</label>
                <input id="name-${category.id}" type="text" value="${escapeHtml(category.nombre)}" data-field="category-name" data-category-id="${category.id}" />
              </div>
              <div class="field half">
                <label for="color-${category.id}">Color Hex</label>
                <input id="color-${category.id}" type="color" value="${category.colorHex}" data-field="category-color" data-category-id="${category.id}" />
              </div>
            </div>

            <div>
              <label>Requerimientos</label>
              <div class="requirement-list">
                ${requirements
                  .map(
                    (requirement, requirementIndex) => `
                      <div class="requirement-item" data-category-id="${category.id}" data-requirement-index="${requirementIndex}">
                        <input
                          type="text"
                          value="${escapeHtml(requirement)}"
                          placeholder="Escribe un requerimiento"
                          data-field="requirement-text"
                          data-category-id="${category.id}"
                          data-requirement-index="${requirementIndex}"
                        />
                        <button class="mini-button danger" type="button" data-action="remove-requirement" data-category-id="${category.id}" data-requirement-index="${requirementIndex}">Eliminar</button>
                      </div>
                    `,
                  )
                  .join('')}
              </div>

              <div class="category-actions">
                <button class="mini-button" type="button" data-action="add-requirement" data-category-id="${category.id}">Agregar requerimiento</button>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

function refreshVisibleView() {
  if (activeTab === 'game') {
    renderGameView();
  } else {
    renderConfigView();
  }
}

function showRequestToast(requirement) {
  const backdrop = document.getElementById('request-toast');
  const requestText = document.getElementById('toast-request');

  if (!backdrop || !requestText) {
    return;
  }

  requestText.textContent = `El requerimiento: ${requirement}`;
  backdrop.classList.add('is-visible');
  backdrop.setAttribute('aria-hidden', 'false');

  window.clearTimeout(showRequestToast.hideTimer);
  showRequestToast.hideTimer = window.setTimeout(() => {
    backdrop.classList.remove('is-visible');
    backdrop.setAttribute('aria-hidden', 'true');
  }, 3500);
}

function handleBoardClick(event) {
  const card = event.target.closest('[data-category-id]');

  if (!card || card.disabled) {
    return;
  }

  const category = getCategoryById(card.dataset.categoryId);
  const requirement = getRandomRequirement(category);

  if (!requirement) {
    showRequestToast('No hay requerimientos disponibles para esta categoría.');
    return;
  }

  showRequestToast(requirement);
}

function setActiveTab(tabName) {
  activeTab = tabName === 'config' ? 'config' : 'game';

  const gameView = document.getElementById('game-view');
  const configView = document.getElementById('config-view');
  const gameTab = document.getElementById('tab-game');
  const configTab = document.getElementById('tab-config');

  if (gameView) {
    gameView.classList.toggle('is-hidden', activeTab !== 'game');
  }

  if (configView) {
    configView.classList.toggle('is-hidden', activeTab !== 'config');
  }

  if (gameTab) {
    gameTab.classList.toggle('is-active', activeTab === 'game');
    gameTab.setAttribute('aria-selected', String(activeTab === 'game'));
  }

  if (configTab) {
    configTab.classList.toggle('is-active', activeTab === 'config');
    configTab.setAttribute('aria-selected', String(activeTab === 'config'));
  }

  refreshVisibleView();
}

function addCategory() {
  currentConfig.categorias.push(createCategoryTemplate());
  setConfigStatus('Categoría agregada. Recuerda guardar los cambios.');
  renderConfigView();
}

function removeCategory(categoryId) {
  currentConfig.categorias = getCategories().filter((category) => category.id !== categoryId);

  if (!currentConfig.categorias.length) {
    setConfigStatus('Se eliminó la última categoría. Puedes agregar una nueva.');
  } else {
    setConfigStatus('Categoría eliminada. Recuerda guardar los cambios.');
  }

  renderConfigView();
  renderGameView();
}

function addRequirement(categoryId) {
  const category = getCategoryById(categoryId);
  if (!category) {
    return;
  }

  category.requerimientos.push('Nuevo requerimiento');
  setConfigStatus('Requerimiento agregado. Recuerda guardar los cambios.');
  renderConfigView();
}

function removeRequirement(categoryId, requirementIndex) {
  const category = getCategoryById(categoryId);
  if (!category || !Array.isArray(category.requerimientos)) {
    return;
  }

  category.requerimientos.splice(requirementIndex, 1);

  if (!category.requerimientos.length) {
    category.requerimientos.push('Nuevo requerimiento');
  }

  setConfigStatus('Requerimiento eliminado. Recuerda guardar los cambios.');
  renderConfigView();
}

function handleConfigInput(event) {
  const input = event.target;

  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const field = input.dataset.field;
  const categoryId = input.dataset.categoryId;
  const category = getCategoryById(categoryId);

  if (!field || !category) {
    return;
  }

  if (field === 'category-name') {
    category.nombre = input.value;
    setConfigStatus('Cambios pendientes de guardar.');
    return;
  }

  if (field === 'category-color') {
    category.colorHex = input.value;
    setConfigStatus('Cambios pendientes de guardar.');
    return;
  }

  if (field === 'requirement-text') {
    const requirementIndex = Number(input.dataset.requirementIndex);
    if (Number.isNaN(requirementIndex)) {
      return;
    }

    category.requerimientos[requirementIndex] = input.value;
    setConfigStatus('Cambios pendientes de guardar.');
  }
}

function handleConfigClick(event) {
  const button = event.target.closest('[data-action]');

  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const categoryId = button.dataset.categoryId;
  const requirementIndex = Number(button.dataset.requirementIndex);

  if (action === 'add-category') {
    addCategory();
    return;
  }

  if (action === 'remove-category') {
    removeCategory(categoryId);
    return;
  }

  if (action === 'add-requirement') {
    addRequirement(categoryId);
    return;
  }

  if (action === 'remove-requirement') {
    removeRequirement(categoryId, requirementIndex);
  }
}

async function resetToDefaultValues() {
  currentConfig = await fetchDefaultConfig();
  saveConfig(currentConfig);
  setConfigStatus('Valores por defecto restablecidos y guardados.');
  renderGameView();
  renderConfigView();
}

function bindGameUI() {
  const turnSelect = document.getElementById('turn-select');
  const board = document.getElementById('board');
  const backdrop = document.getElementById('request-toast');
  const tabButtons = document.querySelectorAll('[data-tab-target]');

  if (turnSelect) {
    turnSelect.addEventListener('change', () => {
      renderGameView();
    });
  }

  if (board) {
    board.addEventListener('click', handleBoardClick);
  }

  if (backdrop) {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        backdrop.classList.remove('is-visible');
        backdrop.setAttribute('aria-hidden', 'true');
      }
    });
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.tabTarget);
    });
  });

  const configPanel = document.getElementById('config-view');

  if (configPanel) {
    configPanel.addEventListener('input', handleConfigInput);
    configPanel.addEventListener('click', handleConfigClick);
  }

  const saveButton = document.getElementById('save-config-button');
  const exportButton = document.getElementById('export-config-button');
  const resetButton = document.getElementById('reset-config-button');
  const addCategoryButton = document.getElementById('add-category-button');

  if (saveButton) {
    saveButton.addEventListener('click', () => {
      saveConfig(currentConfig);
      setConfigStatus('Cambios guardados en localStorage.');
      renderGameView();
    });
  }

  if (exportButton) {
    exportButton.addEventListener('click', () => {
      exportConfig(currentConfig, 'default-config.json');
      setConfigStatus('JSON exportado correctamente.');
    });
  }

  if (resetButton) {
    resetButton.addEventListener('click', () => {
      resetToDefaultValues().catch((error) => {
        console.error('No se pudieron restablecer los valores por defecto.', error);
      });
    });
  }

  if (addCategoryButton) {
    addCategoryButton.addEventListener('click', addCategory);
  }
}

function renderApp() {
  renderGameView();
  renderConfigView();
}

window.ElUsuarioPideConfig = {
  loadConfig,
  saveConfig,
  exportConfig,
  getConfig,
  initConfig: loadConfig,
};

document.addEventListener('DOMContentLoaded', () => {
  bindGameUI();

  loadConfig()
    .then(() => {
      renderApp();
      setActiveTab('game');
      setConfigStatus('Agrega jugadores, colores y requerimientos por categoría.');
    })
    .catch((error) => {
      console.error('No se pudo inicializar la configuración.', error);
      setConfigStatus('No se pudo cargar la configuración inicial.');
    });
});
