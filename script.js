// ==================== GLOBAL STATE ====================
let allProducts = [];
let categoryData = { groups: [], custom: [] };
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
let customCategories = JSON.parse(localStorage.getItem('customCategories') || '[]');
let currentCategory = 'All';
let searchQuery = '';
let catSearchQuery = '';
let currentFilter = 'none'; // 'none' or 'good_buys'
let sortOption = 'name_asc';
let groupingOption = 'none';
let unitFilter = 'all';
let comparisonMode = false;
let selectedForComparison = JSON.parse(localStorage.getItem('comparison') || '[]');

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 App initializing...');
    showLoading(true, 'Initializing app...');
    
    await loadData();
    console.log('✅ Categories loaded');
    
    showLoading(true, 'Loading product data...');
    processData();
    console.log(`✅ Processed ${allProducts.length} products`);
    
    showLoading(true, 'Building interface...');
    renderSidebar();
    renderProducts();
    setupEventListeners();
    
    console.log('✅ App ready!');
    showLoading(false);
});

function showLoading(show, message = 'Loading...') {
    const loader = document.getElementById('loading-spinner');
    if (loader) {
        loader.classList.toggle('active', show);
        const text = loader.querySelector('span');
        if (text) text.textContent = message;
    }
}

function switchView(viewName) {
    const grid = document.getElementById('sh-grid');
    const analysis = document.getElementById('price-changes-view');
    const title = document.getElementById('current-view-title');

    if (viewName === 'grid') {
        grid.style.display = 'grid';
        analysis.style.display = 'none';
    } else if (viewName === 'analysis') {
        grid.style.display = 'none';
        analysis.style.display = 'block';
        if (title) title.innerText = 'Price Changes Analysis';
        updatePriceChangesAnalysis();
    }
}

function openDetailedChartByID(id) {
    const p = allProducts.find(prod => prod.id === id);
    if (p) openDetailedChart(p);
}

function updatePriceChangesAnalysis() {
    const container = document.getElementById('price-changes-view');
    if (!container) return;

    // We can reuse the existing range/sort/unit logic or just show everything changed recently
    // Let's show all changes with a nice grid
    const changes = allProducts.map(p => {
        if (!p.history || p.history.length < 2) return null;
        
        const startHist = p.history[0];
        const endHist = p.history[p.history.length - 1];
        
        const startPrice = startHist.normalized_price || startHist.price;
        const endPrice = endHist.normalized_price || endHist.price;
        const diff = endPrice - startPrice;
        const percent = startPrice > 0 ? (diff / startPrice) * 100 : 0;
        
        return {
            product: p,
            diff: diff,
            percent: percent,
            startPrice: startPrice,
            endPrice: endPrice
        };
    }).filter(c => c !== null && c.diff !== 0);

    // Sort by largest drop first
    changes.sort((a, b) => a.diff - b.diff);

    let html = `
        <div class="analysis-header" style="margin-bottom: 20px; display: flex; align-items: center; gap: 20px;">
            <button class="sh-btn" onclick="switchView('grid')"><i class="fas fa-arrow-left"></i> Back to Grid</button>
            <div style="font-size: 1.1rem; opacity: 0.8;"><i class="fas fa-chart-line"></i> Found <strong>${changes.length}</strong> products with price changes</div>
        </div>
        <div class="p-changes-grid">
    `;

    if (changes.length === 0) {
        html += '<div style="grid-column: 1/-1; padding: 60px; text-align: center; color: #888;">No price changes detected in the current data.</div>';
    } else {
        changes.forEach(c => {
            const p = c.product;
            const isDrop = c.diff < 0;
            html += `
                <div class="p-item-sh clickable" onclick="openDetailedChartByID('${p.id}')">
                    <div class="p-img-box">
                        <img src="${p.image}" class="product-image" loading="lazy">
                        <div class="price-tag">${Math.round(c.endPrice)}</div>
                        <div class="price-change ${isDrop ? 'positive' : 'negative'}">
                            <i class="fas fa-arrow-${isDrop ? 'down' : 'up'}"></i>
                            ${Math.abs(c.diff).toFixed(2)} (${Math.abs(c.percent).toFixed(1)}%)
                        </div>
                    </div>
                    <div class="p-detail-sh">
                        <div class="product-name">${p.name}</div>
                        <div class="product-unit">Was: ${c.startPrice.toFixed(2)}৳</div>
                    </div>
                </div>
            `;
        });
    }

    html += '</div>';
    container.innerHTML = html;
}

async function loadData() {
    // Load category structure from categories.js
    if (typeof CATEGORY_DATA !== 'undefined') {
        const cachedData = localStorage.getItem('categoryData');
        
        // ALWAYS use the latest structure from CATEGORY_DATA (categories.js)
        categoryData = JSON.parse(JSON.stringify(CATEGORY_DATA));
        
        // If we have cached preferences, try to apply them to the new structure
        if (cachedData) {
            try {
                const parsedCache = JSON.parse(cachedData);
                
                // Map of enabled categories from cache
                const enabledMap = new Set();
                parsedCache.groups.forEach(g => {
                    if (g.categories) {
                        g.categories.forEach(c => {
                            if (c.enabled) enabledMap.add(c.name);
                        });
                    }
                });
                
                // Apply enabled state to new structure
                categoryData.groups.forEach(group => {
                    // Start collapsed by default unless logically it should be open (omitted for now)
                    group.expanded = false; 
                    
                    group.categories.forEach(cat => {
                        if (enabledMap.has(cat.name)) {
                            cat.enabled = true;
                        } else {
                            cat.enabled = false;
                        }
                    });
                });
                
                // Restore custom categories
                if (parsedCache.custom) {
                    categoryData.custom = parsedCache.custom;
                }
                
            } catch (e) {
                console.warn('Failed to migrate cached category preferences:', e);
                // Fallback to default state (all disabled)
                 categoryData.groups.forEach(group => {
                    group.categories.forEach(cat => cat.enabled = false);
                });
            }
        } else {
            // First run: ensure all disabled
             categoryData.groups.forEach(group => {
                group.categories.forEach(cat => cat.enabled = false);
            });
        }
    } else {
        console.error('❌ CATEGORY_DATA not found! Make sure categories.js is loaded.');
    }
}

function toggleSelectAll() {
    const currentState = categoryData.groups.some(g => g.categories.some(c => c.enabled));
    const newState = !currentState;
    
    categoryData.groups.forEach(group => {
        group.categories.forEach(cat => {
            cat.enabled = newState;
        });
    });
    
    saveCategories();
    renderSidebar();
    renderProducts();
}

let latestPriceDate = null;
let goodBuysCount = 0;

function processData() {
    console.log('🔍 processData checking productData:', typeof productData);
    if (typeof productData === 'undefined' || !productData) {
        console.error('❌ productData NOT FOUND in window global scope!');
        allProducts = [];
        return;
    }
    
    // Support both direct array and products wrapper
    const rawProducts = productData.products ? productData.products : productData;
    console.log('🔍 rawProducts keys count:', Object.keys(rawProducts).length);
    
    latestPriceDate = null;
    goodBuysCount = 0;

    allProducts = Object.values(rawProducts).map(p => {
        const history = p.history || [];
        const prices = history.map(h => h.normalized_price || h.price);
        const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : p.normalized_price;
        const isGoodBuy = p.normalized_price < (avgPrice * 0.9);
        
        if (isGoodBuy) goodBuysCount++;

        let priceChange = 0;
        let priceChangePercent = 0;
        if (history.length >= 2) {
            const curr = history[history.length - 1].normalized_price || history[history.length - 1].price;
            const prev = history[history.length - 2].normalized_price || history[history.length - 2].price;
            priceChange = curr - prev;
            priceChangePercent = prev > 0 ? ((priceChange / prev) * 100) : 0;
        }

        // Find latest date
        history.forEach(h => {
            if (!latestPriceDate || h.date > latestPriceDate) latestPriceDate = h.date;
        });

        return {
            ...p,
            avgPrice: avgPrice || p.normalized_price,
            isGoodBuy,
            priceChange,
            priceChangePercent,
            isFavorite: favorites.includes(p.id),
            history: history
        };
    });

    precalculateCategoryCounts();
    updateStats();
}

function updateStats() {
    const totalEl = document.getElementById('total-items');
    const updateEl = document.getElementById('last-updated');
    const goodEl = document.getElementById('good-buys-count');

    if (totalEl) totalEl.innerText = allProducts.length;
    if (updateEl) updateEl.innerText = latestPriceDate || 'Never';
    if (goodEl) goodEl.innerText = goodBuysCount;
}

// ==================== CATEGORY COUNT HELPERS ====================
const categoryCounts = {};

function precalculateCategoryCounts() {
    console.log('📊 Precalculating category counts...');
    // Reset counts
    for (const key in categoryCounts) delete categoryCounts[key];
    
    allProducts.forEach(p => {
        const cat = normalizeString(p.category);
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        
        // Handle special cases
        if (cat.includes('buysavemore')) {
            categoryCounts['buysavemore'] = (categoryCounts['buysavemore'] || 0) + 1;
        }
        if (cat === 'meatandfishcombo' || cat === 'meatfish') {
            categoryCounts['meatandfish'] = (categoryCounts['meatandfish'] || 0) + 1;
        }
    });
}

function normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isProductInCallback(product, categoryName) {
    if (!categoryName) return false;
    const pCat = normalizeString(product.category);
    const target = normalizeString(categoryName);
    
    if (pCat === target) return true;
    if (target === 'buysavemore' && pCat.includes('buysavemore')) return true;
    if (target === 'meatandfish' && (pCat === 'meatandfishcombo' || pCat === 'meatfish')) return true;

    return false;
}

function getCategoryProductCount(categoryName) {
    const target = normalizeString(categoryName);
    return categoryCounts[target] || 0;
}

function getGroupProductCount(group) {
    let total = 0;
    group.categories.forEach(cat => {
        total += getCategoryProductCount(cat.name);
    });
    return total;
}

// ==================== SIDEBAR RENDERING ====================
function renderSidebar() {
    const list = document.getElementById('category-list');
    if (!list) return;
    list.innerHTML = '';
    
    // Toggle All Button
    const toggleLi = document.createElement('li');
    toggleLi.className = 'category-item sidebar-btn';
    const allOn = categoryData.groups.some(g => g.categories.some(c => c.enabled));
    toggleLi.innerHTML = `<i class="fas fa-${allOn ? 'square-check' : 'square'}" style="margin-right:8px;"></i><span class="category-name">${allOn ? 'Turn All Off' : 'Turn All On'}</span>`;
    toggleLi.onclick = toggleSelectAll;
    list.appendChild(toggleLi);

    // All Products
    if (!catSearchQuery) {
        const allLi = document.createElement('li');
        allLi.className = `category-item ${currentCategory === 'All' ? 'active' : ''}`;
        const totalCount = allProducts.length;
        allLi.innerHTML = `<i class="fas fa-globe" style="margin-right:8px;"></i><span class="category-name">All Products <span style="font-size:0.75rem; opacity:0.6;">(${totalCount} items)</span></span>`;
        allLi.onclick = () => { currentCategory = 'All'; switchView('grid'); renderSidebar(); renderProducts(); };
        list.appendChild(allLi);
    }

    // Favorites Category
    if (!catSearchQuery) {
        const favLi = document.createElement('li');
        favLi.className = `category-item ${currentCategory === 'Favorites' ? 'active' : ''}`;
        const favCount = favorites.length;
        favLi.innerHTML = `<i class="fas fa-star" style="margin-right:8px; color:gold;"></i><span class="category-name">Favorites <span style="font-size:0.75rem; opacity:0.6;">(${favCount} items)</span></span>`;
        favLi.onclick = () => { currentCategory = 'Favorites'; switchView('grid'); renderSidebar(); renderProducts(); };
        list.appendChild(favLi);
    }

    // Render Category Groups
    categoryData.groups.forEach(group => {
        const groupCount = getGroupProductCount(group);
        if (groupCount === 0) return; // Hide empty groups

        const matchesSearch = !catSearchQuery || 
            group.name.toLowerCase().includes(catSearchQuery) ||
            group.categories.some(c => c.name.toLowerCase().includes(catSearchQuery));
        
        if (!matchesSearch) return;

        // Group Header
        const groupLi = document.createElement('li');
        groupLi.className = 'category-group';
        const icon = group.icon || 'folder';
        groupLi.innerHTML = `
            <div class="group-header-content">
                <div style="display:flex; align-items:center; gap:8px; flex:1;">
                    <i class="fas fa-chevron-${group.expanded ? 'down' : 'right'}" style="font-size:0.7rem;"></i>
                    <i class="fas fa-${icon}"></i>
                    <span class="category-name">${group.name}</span>
                    <span class="category-count" style="margin-left:auto; font-size:0.75rem; opacity:0.7;">(${groupCount} items)</span>
                </div>
                <input type="checkbox" ${isGroupEnabled(group) ? 'checked' : ''} onclick="toggleGroupEnabled(event, '${group.id}')" title="Enable/Disable All">
            </div>
        `;
        groupLi.querySelector('.group-header-content').onclick = (e) => {
            if (e.target.type === 'checkbox') return;
            group.expanded = !group.expanded;
            saveCategories();
            renderSidebar();
        };
        list.appendChild(groupLi);

        // Group Categories
        if (group.expanded) {
            group.categories.forEach(cat => {
                const catCount = getCategoryProductCount(cat.name);
                if (catCount === 0) return; // Hide empty categories

                const matchesCatSearch = !catSearchQuery || cat.name.toLowerCase().includes(catSearchQuery);
                if (!matchesCatSearch) return;

                const catLi = document.createElement('li');
                catLi.className = `category-item subcategory ${currentCategory === cat.name ? 'active' : ''}`;
                catLi.innerHTML = `
                    <span class="category-name" title="${cat.name}">${cat.name} <span style="font-size:0.75rem; opacity:0.6;">(${catCount} items)</span></span>
                    <input type="checkbox" ${cat.enabled ? 'checked' : ''} onclick="toggleCatEnabled(event, '${group.id}', '${cat.name}')">
                `;
                catLi.onclick = (e) => {
                    if (e.target.type === 'checkbox') return;
                    currentCategory = cat.name;
                    switchView('grid');
                    renderSidebar();
                    renderProducts();
                };
                list.appendChild(catLi);
            });
        }
    });

    // Custom Categories
    if (categoryData.custom && categoryData.custom.length > 0) {
        const customHeader = document.createElement('li');
        customHeader.className = 'category-group';
        customHeader.innerHTML = `
            <div class="group-header-content">
                <i class="fas fa-folder-open" style="margin-right:8px;"></i>
                <span class="category-name">My Custom Categories</span>
            </div>
        `;
        list.appendChild(customHeader);

        categoryData.custom.forEach(custom => {
            const customLi = document.createElement('li');
            customLi.className = `category-item subcategory ${currentCategory === custom.name ? 'active' : ''}`;
            customLi.innerHTML = `
                <i class="fas fa-${custom.icon || 'heart'}" style="margin-right:8px;"></i>
                <span class="category-name">${custom.name}</span>
                <i class="fas fa-trash" style="color:#f44; cursor:pointer;" onclick="deleteCustomCategory(event, '${custom.name}')"></i>
            `;
            customLi.onclick = (e) => {
                if (e.target.classList.contains('fa-trash')) return;
                currentCategory = custom.name;
                renderSidebar();
                renderProducts();
            };
            list.appendChild(customLi);
        });
    }
}

function isGroupEnabled(group) {
    return group.categories.some(c => c.enabled);
}

function toggleGroupEnabled(e, groupId) {
    e.stopPropagation();
    const group = categoryData.groups.find(g => g.id === groupId);
    if (group) {
        const newState = !isGroupEnabled(group);
        group.categories.forEach(cat => cat.enabled = newState);
        saveCategories();
        renderSidebar();
        renderProducts();
    }
}

function toggleCatEnabled(e, groupId, catName) {
    e.stopPropagation();
    const group = categoryData.groups.find(g => g.id === groupId);
    if (group) {
        const cat = group.categories.find(c => c.name === catName);
        if (cat) {
            cat.enabled = e.target.checked;
            saveCategories();
            renderSidebar();
            renderProducts();
        }
    }
}

function saveCategories() {
    localStorage.setItem('categoryData', JSON.stringify(categoryData));
    // Static site - no backend needed, using localStorage only
}

// ==================== PRODUCT RENDERING ====================
let currentRenderId = 0;

function renderProducts() {
    const grid = document.getElementById('sh-grid');
    if (!grid) return;
    
    // If we are in analysis view, don't update the grid title or content
    const analysisView = document.getElementById('price-changes-view');
    if (analysisView && analysisView.style.display === 'block') {
        const title = document.getElementById('current-view-title');
        if (title) title.innerText = 'Price Changes Analysis';
        return; 
    }

    grid.innerHTML = '';
    const title = document.getElementById('current-view-title');
    
    // Set title based on context
    if (title) {
        if (currentFilter === 'good_buys') {
            title.innerText = 'Good Buys (The Best Deals Today)';
            grid.classList.add('good-buys-view');
        } else {
            title.innerText = currentCategory === 'All' ? 'All Products' : currentCategory;
            grid.classList.remove('good-buys-view');
        }
    }

    let filtered = allProducts.filter(p => {
        // Special case for Good Buys filter
        if (currentFilter === 'good_buys' && !p.isGoodBuy) return false;

        if (currentCategory === 'Favorites') {
            if (!p.isFavorite) return false;
        } else if (currentCategory === 'All') {
            // When in "All" view, only show products from categories that are ENABLED in the sidebar
            // This allows the user to toggle categories to filter the main view
            const anyEnabled = categoryData.groups.some(g => g.categories.some(c => c.enabled));
            if (anyEnabled) {
                const isEnabled = categoryData.groups.some(g => 
                    g.categories.some(c => c.enabled && isProductInCallback(p, c.name))
                );
                if (!isEnabled) return false;
            }
        } else {
            const customCat = categoryData.custom.find(c => c.name === currentCategory);
            if (customCat) {
                if (!customCat.products.includes(p.id)) return false;
            } else {
                if (!isProductInCallback(p, currentCategory)) return false;
            }
        }
        
        if (searchQuery && !p.name.toLowerCase().includes(searchQuery)) return false;
        if (unitFilter !== 'all' && (p.unit || '').toLowerCase().includes(unitFilter)) return false;
        return true;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: #888;">
                <i class="fas fa-search" style="font-size: 48px; margin-bottom: 20px; opacity: 0.3;"></i>
                <h3 style="margin: 0 0 10px 0;">No products found</h3>
                <p style="margin: 0; font-size: 14px;">Try adjusting your filters or search term</p>
            </div>
        `;
        return;
    }

    filtered.sort((a, b) => {
        switch (sortOption) {
            case 'name_asc': return a.name.localeCompare(b.name);
            case 'name_desc': return b.name.localeCompare(a.name);
            case 'price_asc': return (a.normalized_price || 0) - (b.normalized_price || 0);
            case 'price_desc': return (b.normalized_price || 0) - (a.normalized_price || 0);
            case 'savings_desc': return (b.avgPrice - b.normalized_price) - (a.avgPrice - a.normalized_price);
            case 'change_desc': return (a.priceChange || 0) - (b.priceChange || 0);
            case 'change_asc': return (b.priceChange || 0) - (a.priceChange || 0);
            default: return 0;
        }
    });

    // Increment render ID to cancel any previous ongoing render
    currentRenderId++;
    const renderId = currentRenderId;

    if (groupingOption === 'none') {
        renderInBatches(filtered, grid, renderId);
    } else {
        const groups = {};
        filtered.forEach(p => {
            const key = p[groupingOption] || 'Unknown';
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
        
        const sortedKeys = Object.keys(groups).sort();
        let currentKeyIndex = 0;
        
        const renderNextGroup = () => {
            if (renderId !== currentRenderId || currentKeyIndex >= sortedKeys.length) return;
            
            const key = sortedKeys[currentKeyIndex];
            const header = document.createElement('div');
            header.className = 'group-header';
            header.innerText = `${key} (${groups[key].length})`;
            grid.appendChild(header);
            
            renderInBatches(groups[key], grid, renderId, () => {
                currentKeyIndex++;
                renderNextGroup();
            });
        };
        
        renderNextGroup();
    }
}

function renderInBatches(items, container, renderId, onComplete = null) {
    const BATCH_SIZE = 50;
    let index = 0;

    function renderNextBatch() {
        if (renderId !== currentRenderId) return;

        const fragment = document.createDocumentFragment();
        const end = Math.min(index + BATCH_SIZE, items.length);

        for (; index < end; index++) {
            const p = items[index];
            const card = createProductCard(p);
            fragment.appendChild(card);
        }

        container.appendChild(fragment);

        if (index < items.length) {
            setTimeout(renderNextBatch, 0);
        } else if (onComplete) {
            onComplete();
        }
    }

    renderNextBatch();
}

function createProductCard(p) {
    const card = document.createElement('div');
    card.className = 'p-item-sh';
    card.setAttribute('title', `Category: ${p.category || 'Uncategorized'}`);
    
    if (comparisonMode && selectedForComparison.includes(p.id)) {
        card.classList.add('selected-for-comparison');
    }

    const changeIndicator = p.priceChange !== 0 ? `
        <div class="price-change ${p.priceChange < 0 ? 'positive' : 'negative'}">
            <i class="fas fa-arrow-${p.priceChange < 0 ? 'down' : 'up'}"></i>
            ${Math.abs(p.priceChange).toFixed(2)}
        </div>
    ` : '';

    card.innerHTML = `
        <div class="p-img-box">
            <img src="${p.image}" class="product-image" loading="lazy" alt="${p.name}" 
                 onerror="this.src='https://placehold.co/200x200/000/0ff?text=No+Image'; this.onerror=null;">
            ${p.isGoodBuy ? '<div class="sale-corner"><i class="fas fa-fire"></i></div>' : ''}
            <div class="price-tag">${Math.round(p.normalized_price || p.current_price)}</div>
            ${changeIndicator}
            <button class="favorite-btn ${p.isFavorite ? 'active' : ''}" onclick="toggleFavorite(event, '${p.id}')">
                <i class="fa${p.isFavorite ? 's' : 'r'} fa-heart"></i>
            </button>
        </div>
        <div class="p-detail-sh">
            <div class="product-name" title="${p.name}">${p.name}</div>
            <div class="product-unit">${p.current_price} tk / ${p.unit || 'unit'}</div>
            ${comparisonMode ? '<div class="compare-hint">Click to ' + (selectedForComparison.includes(p.id) ? 'deselect' : 'select') + '</div>' : ''}
        </div>
    `;
    
    card.onclick = (e) => {
        if (e.target.closest('.favorite-btn')) return;
        if (comparisonMode) {
            toggleComparisonSelection(p.id);
        } else {
            openDetailedChart(p);
        }
    };
    
    return card;
}
// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Stats Dashboard Click Handlers
    const totalBtn = document.getElementById('stat-total-items-btn');
    if (totalBtn) {
        totalBtn.onclick = () => {
            currentFilter = 'none';
            currentCategory = 'All';
            switchView('grid');
            renderSidebar();
            renderProducts();
        };
    }

    const goodBuysBtn = document.getElementById('stat-good-buys-btn');
    if (goodBuysBtn) {
        goodBuysBtn.onclick = () => {
            currentFilter = 'good_buys';
            currentCategory = 'All';
            switchView('grid');
            renderSidebar();
            renderProducts();
        };
    }

    const changesBtn = document.getElementById('stat-last-updated-btn');
    if (changesBtn) {
        changesBtn.onclick = () => {
            switchView('analysis');
        };
    }

    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('hidden');
        });
    }

    // Search
    const productSearch = document.getElementById('product-search');
    const clearSearchBtn = document.getElementById('clear-search');

    if (productSearch) {
        productSearch.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            if (clearSearchBtn) {
                clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
            }
            renderProducts();
        });
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (productSearch) {
                productSearch.value = '';
                searchQuery = '';
                clearSearchBtn.style.display = 'none';
                renderProducts();
            }
        });
    }

    document.getElementById('category-filter').addEventListener('input', (e) => {
        catSearchQuery = e.target.value.toLowerCase();
        renderSidebar();
    });

    // Sort and Filter
    document.getElementById('sort-options').addEventListener('change', (e) => {
        sortOption = e.target.value;
        renderProducts();
    });

    document.getElementById('unit-filter').addEventListener('change', (e) => {
        unitFilter = e.target.value;
        renderProducts();
    });

    document.getElementById('group-products-by').addEventListener('change', (e) => {
        groupingOption = e.target.value;
        renderProducts();
    });

    // Category controls
    const toggleAllBtn = document.getElementById('select-all-cat');
    if (toggleAllBtn) {
        toggleAllBtn.addEventListener('click', toggleSelectAll);
    }

    document.getElementById('add-custom-cat-btn').addEventListener('click', () => {
        openCustomCategoryModal();
    });

    document.getElementById('bookmark-cat-btn').addEventListener('click', () => {
        currentFilter = 'none';
        currentCategory = 'Favorites';
        renderSidebar();
        renderProducts();
    });

    // Price Changes
    document.getElementById('price-changes-btn').addEventListener('click', () => {
        switchView('analysis');
    });

    // Compare Mode
    document.getElementById('compare-btn').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        if (!comparisonMode) {
            comparisonMode = true;
            btn.classList.add('active');
            btn.innerHTML = '<i class="fas fa-chart-line"></i> Show Chart';
            renderProducts();
        } else {
            if (selectedForComparison.length > 0) {
                openCompareModal();
            }
            comparisonMode = false;
            btn.classList.remove('active');
            btn.innerHTML = '<i class="fas fa-balance-scale"></i> Compare';
            renderProducts();
        }
    });

    // Scraper
    document.getElementById('run-scraper-btn').addEventListener('click', async () => {
        if (confirm("Run scraper now? This may take several minutes.")) {
            showLoading(true);
            try {
                const res = await fetch('/api/run-scraper', { method: 'POST' });
                const data = await res.json();
                alert(data.message || 'Scraper completed');
                location.reload();
            } catch (e) {
                alert('Error running scraper: ' + e.message);
            }
            showLoading(false);
        }
    });

    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.getAttribute('data-modal');
            if (modalId) {
                document.getElementById(modalId).style.display = 'none';
            } else {
                e.target.closest('.modal').style.display = 'none';
            }
        });
    });

    // Price changes date range
    document.querySelectorAll('input[name="date-range"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const customRange = document.getElementById('custom-date-range');
            if (e.target.value === 'custom') {
                customRange.style.display = 'flex';
            } else {
                customRange.style.display = 'none';
                updatePriceChanges(e.target.value);
            }
        });
    });

    document.getElementById('apply-custom-range').addEventListener('click', () => {
        updatePriceChanges('custom');
    });

    document.querySelectorAll('#changes-sort, #changes-unit-filter').forEach(select => {
        select.addEventListener('change', () => {
            const range = document.querySelector('input[name="date-range"]:checked').value;
            updatePriceChanges(range);
        });
    });

    // Custom category
    document.getElementById('save-custom-category').addEventListener('click', saveCustomCategory);
    
    document.getElementById('custom-cat-search').addEventListener('input', (e) => {
        renderCustomCategoryProducts(e.target.value.toLowerCase());
    });

    document.getElementById('compare-clear-all').addEventListener('click', () => {
        selectedForComparison = [];
        localStorage.setItem('comparison', JSON.stringify(selectedForComparison));
        updateCompareModal();
    });
}

// ==================== FAVORITES ====================
function toggleFavorite(e, id) {
    e.stopPropagation();
    if (favorites.includes(id)) {
        favorites = favorites.filter(fid => fid !== id);
    } else {
        favorites.push(id);
    }
    localStorage.setItem('favorites', JSON.stringify(favorites));
    const p = allProducts.find(p => p.id === id);
    if (p) p.isFavorite = !p.isFavorite;
    renderProducts();
}

// ==================== COMPARISON ====================
function toggleComparisonSelection(id) {
    if (selectedForComparison.includes(id)) {
        selectedForComparison = selectedForComparison.filter(i => i !== id);
    } else {
        if (selectedForComparison.length >= 10) {
            alert('Maximum 10 items can be compared');
            return;
        }
        selectedForComparison.push(id);
    }
    localStorage.setItem('comparison', JSON.stringify(selectedForComparison));
    renderProducts();
}

function openCompareModal() {
    const modal = document.getElementById('compare-modal');
    modal.style.display = 'flex';
    updateCompareModal();
}

let compareChart = null;
function updateCompareModal() {
    const products = allProducts.filter(p => selectedForComparison.includes(p.id));
    
    // Update count
    document.getElementById('selected-count').innerText = `${products.length} items selected (max 10)`;
    
    // Build chart
    const ctx = document.getElementById('compare-chart').getContext('2d');
    if (compareChart) compareChart.destroy();
    
    const allDates = new Set();
    products.forEach(p => {
        if (p.history) {
            p.history.forEach(h => allDates.add(h.date));
        }
    });
    const labels = Array.from(allDates).sort();
    
    const colors = [
        '#03dac6', '#bb86fc', '#ff4081', '#03a9f4', '#ffeb3b', 
        '#4caf50', '#ff9800', '#e91e63', '#9c27b0', '#00bcd4'
    ];
    
    const datasets = products.map((p, index) => {
        const dataMap = new Map();
        if (p.history) {
            p.history.forEach(h => dataMap.set(h.date, h.normalized_price || h.price));
        }
        const data = labels.map(date => dataMap.get(date) || null);
        return {
            label: p.name,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length] + '20',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6
        };
    });
    
    compareChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    grid: { color: '#333' },
                    ticks: { color: '#aaa' },
                    title: { display: true, text: 'Price (৳)', color: '#fff' }
                },
                x: {
                    grid: { color: '#333' },
                    ticks: { color: '#aaa' },
                    title: { display: true, text: 'Date', color: '#fff' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#fff', font: { size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff'
                }
            }
        }
    });
    
    // Render details grid
    const detailsGrid = document.getElementById('compare-details');
    detailsGrid.innerHTML = '';
    
    products.forEach((p, idx) => {
        const minPrice = Math.min(...(p.history || []).map(h => h.normalized_price || h.price));
        const maxPrice = Math.max(...(p.history || []).map(h => h.normalized_price || h.price));
        
        const card = document.createElement('div');
        card.className = 'compare-detail-card';
        card.style.borderLeft = `4px solid ${colors[idx % colors.length]}`;
        card.innerHTML = `
            <div style="font-weight:bold; margin-bottom:8px;">${p.name}</div>
            <div class="compare-stat">Current: <strong>${p.normalized_price || p.current_price}৳</strong></div>
            <div class="compare-stat">Average: <strong>${p.avgPrice.toFixed(2)}৳</strong></div>
            <div class="compare-stat">Range: <strong>${minPrice.toFixed(2)}৳ - ${maxPrice.toFixed(2)}৳</strong></div>
            <div class="compare-stat">Change: <strong class="${p.priceChange < 0 ? 'positive' : 'negative'}">${p.priceChange > 0 ? '+' : ''}${p.priceChange.toFixed(2)}৳</strong></div>
        `;
        detailsGrid.appendChild(card);
    });
}

// ==================== PRICE CHANGES ====================
function openPriceChangesModal() {
    const modal = document.getElementById('price-changes-modal');
    modal.style.display = 'flex';
    updatePriceChanges('yesterday');
}

function updatePriceChanges(range) {
    const content = document.getElementById('price-changes-content');
    const sort = document.getElementById('changes-sort').value;
    const unitFlt = document.getElementById('changes-unit-filter').value;
    
    let startDate, endDate;
    const today = new Date();
    
    if (range === 'yesterday') {
        endDate = new Date(today);
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 1);
    } else if (range === 'week') {
        endDate = new Date(today);
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 7);
    } else if (range === 'month') {
        endDate = new Date(today);
        startDate = new Date(today);
        startDate.setMonth(startDate.getMonth() - 1);
    } else if (range === 'custom') {
        startDate = new Date(document.getElementById('start-date').value);
        endDate = new Date(document.getElementById('end-date').value);
    }
    
    // Calculate changes
    const changes = allProducts.map(p => {
        if (!p.history || p.history.length < 2) return null;
        
        // Filter by unit
        if (unitFlt !== 'all' && p.unit_type !== unitFlt) return null;
        
        const startHist = p.history.find(h => new Date(h.date) >= startDate);
        const endHist = p.history[p.history.length - 1];
        
        if (!startHist || !endHist) return null;
        
        const startPrice = startHist.normalized_price || startHist.price;
        const endPrice = endHist.normalized_price || endHist.price;
        const diff = endPrice - startPrice;
        const percent = startPrice > 0 ? (diff / startPrice) * 100 : 0;
        
        return {
            product: p,
            diff: diff,
            percent: percent,
            startPrice: startPrice,
            endPrice: endPrice
        };
    }).filter(c => c !== null && c.diff !== 0);
    
    // Sort
    changes.sort((a, b) => {
        if (sort === 'diff_desc') return a.diff - b.diff;
        if (sort === 'diff_asc') return b.diff - a.diff;
        if (sort === 'percent_desc') return a.percent - b.percent;
        if (sort === 'percent_asc') return b.percent - a.percent;
        return 0;
    });
    
    // Render
    content.innerHTML = '';
    if (changes.length === 0) {
        content.innerHTML = '<div style="padding:40px; text-align:center; color:#888;">No price changes found</div>';
        return;
    }
    
    changes.forEach(change => {
        const p = change.product;
        const isPositive = change.diff < 0;
        
        const card = document.createElement('div');
        card.className = 'price-change-card';
        card.innerHTML = `
            <img src="${p.image}" class="change-card-img" alt="${p.name}">
            <div class="change-card-info">
                <div class="change-card-name">${p.name}</div>
                <div class="change-card-unit">${p.unit || 'unit'}</div>
            </div>
            <div class="change-card-prices">
                <div style="color:#888;">Was: ${change.startPrice.toFixed(2)}৳</div>
                <div style="font-size:1.2rem; font-weight:bold;">Now: ${change.endPrice.toFixed(2)}৳</div>
            </div>
            <div class="change-card-diff ${isPositive ? 'positive' : 'negative'}">
                <i class="fas fa-arrow-${isPositive ? 'down' : 'up'}"></i>
                <div>${Math.abs(change.diff).toFixed(2)}৳</div>
                <div>${Math.abs(change.percent).toFixed(1)}%</div>
            </div>
        `;
        card.onclick = () => openDetailedChart(p);
        content.appendChild(card);
    });
}

// ==================== DETAILED CHART (SCI-FI STYLE) ====================
let detailChart = null;
function openDetailedChart(product) {
    const modal = document.getElementById('chart-modal');
    modal.style.display = 'flex';
    
    document.getElementById('chart-product-name').innerText = product.name;
    
    const history = product.history || [];
    const prices = history.map(h => h.normalized_price || h.price);
    
    const current = product.normalized_price || product.current_price;
    const avg = product.avgPrice;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const change = product.priceChange || 0;
    
    // Calculate volatility (standard deviation)
    const mean = avg;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
    const volatility = Math.sqrt(variance);
    
    // Update stats
    document.getElementById('chart-current').innerHTML = `<span style="color:var(--accent-color)">${current.toFixed(2)}৳</span>`;
    document.getElementById('chart-avg').innerHTML = `${avg.toFixed(2)}৳`;
    document.getElementById('chart-min').innerHTML = `<span style="color:#4caf50">${min.toFixed(2)}৳</span>`;
    document.getElementById('chart-max').innerHTML = `<span style="color:#f44">${max.toFixed(2)}৳</span>`;
    
    const changeColor = change < 0 ? '#4caf50' : '#f44';
    const changeIcon = change < 0 ? 'down' : 'up';
    document.getElementById('chart-change').innerHTML = `<span style="color:${changeColor}"><i class="fas fa-arrow-${changeIcon}"></i> ${Math.abs(change).toFixed(2)}৳</span>`;
    
    const volPercent = (volatility / mean) * 100;
    let volLabel = 'Low';
    if (volPercent > 15) volLabel = 'High';
    else if (volPercent > 8) volLabel = 'Medium';
    document.getElementById('chart-volatility').innerHTML = `${volLabel} <span style="font-size:0.8rem;">(±${volatility.toFixed(2)}৳)</span>`;
    
    // Build chart
    const ctx = document.getElementById('price-history-chart').getContext('2d');
    if (detailChart) detailChart.destroy();
    
    const labels = history.map(h => h.date);
    const data = prices;
    
    // Moving average
    const movingAvg = [];
    const window = Math.min(7, Math.floor(data.length / 3));
    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - window);
        const subset = data.slice(start, i + 1);
        movingAvg.push(subset.reduce((a, b) => a + b, 0) / subset.length);
    }
    
    detailChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Price',
                    data: data,
                    borderColor: '#03dac6',
                    backgroundColor: 'rgba(3, 218, 198, 0.2)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#03dac6',
                    pointBorderColor: '#000',
                    pointBorderWidth: 2
                },
                {
                    label: 'Moving Average',
                    data: movingAvg,
                    borderColor: '#bb86fc',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'Average',
                    data: Array(data.length).fill(avg),
                    borderColor: '#ffeb3b',
                    borderDash: [10, 5],
                    borderWidth: 1,
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    grid: { color: '#222', drawBorder: false },
                    ticks: { 
                        color: '#aaa',
                        callback: function(value) {
                            return value.toFixed(2) + '৳';
                        }
                    },
                    title: { display: true, text: 'Price (৳)', color: '#fff', font: { size: 14 } }
                },
                x: {
                    grid: { color: '#222', drawBorder: false },
                    ticks: { color: '#aaa' },
                    title: { display: true, text: 'Date', color: '#fff', font: { size: 14 } }
                }
            },
            plugins: {
                legend: {
                    labels: { 
                        color: '#fff',
                        font: { size: 12 },
                        usePointStyle: true,
                        padding: 20
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.9)',
                    titleColor: '#03dac6',
                    bodyColor: '#fff',
                    borderColor: '#03dac6',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeInOutQuart'
            }
        }
    });
    
    // Generate insights
    generatePriceInsights(product, prices, avg, min, max, volatility);
}

function generatePriceInsights(product, prices, avg, min, max, volatility) {
    const content = document.getElementById('prediction-content');
    const current = product.normalized_price || product.current_price;
    
    const insights = [];
    
    // Trend analysis
    const recentPrices = prices.slice(-7);
    const trend = recentPrices[recentPrices.length - 1] - recentPrices[0];
    if (trend < -2) {
        insights.push({ icon: 'chart-line', color: '#4caf50', text: 'Downward trend detected. Price has been decreasing recently.' });
    } else if (trend > 2) {
        insights.push({ icon: 'chart-line', color: '#f44', text: 'Upward trend detected. Price has been increasing recently.' });
    } else {
        insights.push({ icon: 'minus', color: '#ffeb3b', text: 'Price stable. No significant trend detected.' });
    }
    
    // Value assessment
    const percentDiff = ((current - avg) / avg) * 100;
    if (percentDiff < -10) {
        insights.push({ icon: 'fire', color: '#4caf50', text: `Great deal! ${Math.abs(percentDiff).toFixed(1)}% below average price.` });
    } else if (percentDiff > 10) {
        insights.push({ icon: 'exclamation-triangle', color: '#f44', text: `Overpriced. ${percentDiff.toFixed(1)}% above average price.` });
    } else {
        insights.push({ icon: 'check-circle', color: '#03dac6', text: 'Fair price. Close to historical average.' });
    }
    
    // Volatility
    const volPercent = (volatility / avg) * 100;
    if (volPercent > 15) {
        insights.push({ icon: 'bolt', color: '#ff9800', text: 'High volatility. Price fluctuates significantly.' });
    } else if (volPercent < 5) {
        insights.push({ icon: 'shield-alt', color: '#03a9f4', text: 'Low volatility. Price is very stable.' });
    }
    
    // Best time to buy
    if (current <= min * 1.05) {
        insights.push({ icon: 'star', color: '#ffeb3b', text: '⭐ Best time to buy! Near all-time low.' });
    } else if (current >= max * 0.95) {
        insights.push({ icon: 'clock', color: '#f44', text: 'Wait if possible. Near all-time high.' });
    }
    
    content.innerHTML = insights.map(insight => `
        <div class="insight-item">
            <i class="fas fa-${insight.icon}" style="color:${insight.color}; font-size:1.2rem;"></i>
            <span>${insight.text}</span>
        </div>
    `).join('');
}

// ==================== CUSTOM CATEGORIES ====================
function openCustomCategoryModal() {
    const modal = document.getElementById('custom-category-modal');
    modal.style.display = 'flex';
    document.getElementById('custom-cat-name').value = '';
    document.getElementById('custom-cat-icon').value = '';
    renderCustomCategoryProducts('');
}

function renderCustomCategoryProducts(searchTerm) {
    const container = document.getElementById('custom-cat-products');
    container.innerHTML = '';
    
    const filtered = allProducts.filter(p => 
        !searchTerm || p.name.toLowerCase().includes(searchTerm)
    ).slice(0, 50); // Limit to 50 for performance
    
    filtered.forEach(p => {
        const div = document.createElement('div');
        div.className = 'custom-cat-product-item';
        div.innerHTML = `
            <input type="checkbox" id="prod-${p.id}" value="${p.id}">
            <label for="prod-${p.id}">${p.name}</label>
        `;
        container.appendChild(div);
    });
}

function saveCustomCategory() {
    const name = document.getElementById('custom-cat-name').value.trim();
    const icon = document.getElementById('custom-cat-icon').value.trim() || 'heart';
    
    if (!name) {
        alert('Please enter a category name');
        return;
    }
    
    const selectedProducts = Array.from(document.querySelectorAll('#custom-cat-products input:checked'))
        .map(cb => cb.value);
    
    if (selectedProducts.length === 0) {
        alert('Please select at least one product');
        return;
    }
    
    const customCat = {
        name: name,
        icon: icon,
        products: selectedProducts
    };
    
    customCategories.push(customCat);
    categoryData.custom = customCategories;
    localStorage.setItem('customCategories', JSON.stringify(customCategories));
    saveCategories();
    
    document.getElementById('custom-category-modal').style.display = 'none';
    renderSidebar();
    alert(`Custom category "${name}" created with ${selectedProducts.length} products!`);
}

function deleteCustomCategory(e, name) {
    e.stopPropagation();
    if (confirm(`Delete custom category "${name}"?`)) {
        customCategories = customCategories.filter(c => c.name !== name);
        categoryData.custom = customCategories;
        localStorage.setItem('customCategories', JSON.stringify(customCategories));
        saveCategories();
        renderSidebar();
        if (currentCategory === name) {
            currentCategory = 'All';
            renderProducts();
        }
    }
}

// End of script
