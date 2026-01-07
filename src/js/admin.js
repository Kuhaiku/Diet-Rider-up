document.addEventListener('DOMContentLoaded', () => {
    
    // CONFIGURAÇÃO
    const API_BASE = '/auth'; 
    const token = localStorage.getItem('token');
    if (!token) window.location.href = 'index.html';

    // ESTADO GLOBAL
    let library = [];
    let planner = { 1: {}, 2: {}, 3: {}, 4: {} };
    let themes = {};
    let lastSavedState = ""; 
    let pickerContext = null;
    let currentImportType = '';

    const TEMPLATE_PLAN = `Atue como um Nutricionista Sênior. Objetivo: Gerar um JSON válido com um plano mensal (4 semanas). SEU PERFIL: [PERFIL] REGRAS RIGOROSAS: 1. "ingredients": Use a Quantidade DIÁRIA ("q_daily") APENAS em 'g' (gramas) ou 'ml' (mililitros). NUNCA use 'kg' ou 'l'. 2. Categorias: "cafe", "almoco", "lanche", "jantar". 3. Mercado: "carnes", "horti", "mercearia", "outros". ESTRUTURA JSON (Responda APENAS ISSO): { "library": [{ "id": "rec_01", "name": "Nome", "cat": "almoco", "icon": "fa-drumstick-bite", "ingredients": [{"n": "Item", "q_daily": 200, "u": "g", "cat": "carnes"}], "steps": ["Passo 1"] }], "planner": { "1": { "cafe": "rec_01" ... } }, "themes": { "1": "Nome..." } }`;
    const TEMPLATE_RECIPE = `Atue como Nutricionista. Gere um JSON Array com [QTD] receitas do tipo: [PERFIL]. REGRAS: Quantidades DIÁRIAS (q_daily) em 'g'/'ml'. ESTRUTURA: [{ "id": "rec_01", "name": "Nome", "cat": "cafe", "icon": "fa-mug-hot", "ingredients": [{"n": "Item", "q_daily": 200, "u": "g", "cat": "mercearia"}], "steps": ["Passo 1"] }]`;

    // --- SELETORES GLOBAIS ---
    const storedUser = JSON.parse(localStorage.getItem('user'));
    if(storedUser && storedUser.name) document.getElementById('user-display').innerText = storedUser.name;

    // --- FUNÇÕES DE UTILIDADE ---
    
    window.showToast = (message, type = 'success') => {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        let icon = 'fa-check-circle';
        if (type === 'error') icon = 'fa-exclamation-circle';
        if (type === 'info') icon = 'fa-info-circle';
        if (type === 'warning') icon = 'fa-triangle-exclamation';
        toast.innerHTML = `<i class="fa-solid ${icon} text-xl ${type === 'success' ? 'text-green-500' : type === 'error' ? 'text-red-500' : type === 'info' ? 'text-blue-500' : 'text-yellow-500'}"></i><span class="font-medium text-sm text-slate-700">${message}</span>`;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
    };

    function updateLastSavedState() {
        lastSavedState = JSON.stringify({ library, planner, themes });
    }
    
    function checkChanges() {
        const current = JSON.stringify({ library, planner, themes });
        return current !== lastSavedState;
    }

    function downloadJSON(data, filename) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", filename + ".json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    // --- NAVEGAÇÃO ---
    
    function switchView(viewName) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${viewName}`).classList.remove('hidden');
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const isActive = btn.id === `nav-${viewName}`;
            btn.className = isActive 
                ? "nav-btn flex items-center w-full px-4 py-3 text-sm font-bold text-blue-700 bg-blue-50 rounded-lg shadow-sm mb-1 border border-blue-100" 
                : "nav-btn flex items-center w-full px-4 py-3 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-50 transition-colors mb-1";
            const i = btn.querySelector('i');
            if(isActive) i.classList.add('text-blue-600'); else i.classList.remove('text-blue-600');
        });
    }

    // Bind Navegação
    document.getElementById('nav-presets').addEventListener('click', () => switchView('presets'));
    document.getElementById('nav-planner').addEventListener('click', () => switchView('planner'));
    document.getElementById('nav-library').addEventListener('click', () => switchView('library'));
    document.getElementById('btn-logout').addEventListener('click', () => {
        localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = 'index.html';
    });

    // --- CRUD PLANOS ---

    window.loadPlansFromDB = async () => {
        const loading = document.getElementById('loading-plans');
        const grid = document.getElementById('presets-grid');
        const empty = document.getElementById('empty-presets');
        loading.classList.remove('hidden'); grid.innerHTML = ''; empty.classList.add('hidden');

        try {
            const res = await fetch(`${API_BASE}/get-plans`, { headers: { 'Authorization': `Bearer ${token}` } });
            if(!res.ok) throw new Error();
            const plans = await res.json();
            
            if (plans.length === 0) empty.classList.remove('hidden');
            else {
                plans.forEach(p => {
                    const date = new Date(p.updated_at).toLocaleDateString('pt-BR');
                    const activeBadge = p.is_active ? `<span class="absolute top-4 right-4 bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full border border-green-200 shadow-sm flex items-center gap-1"><i class="fa-solid fa-check-circle"></i> ATIVO</span>` : '';
                    
                    const el = document.createElement('div');
                    el.className = "bg-white border border-slate-200 rounded-xl p-5 hover:shadow-xl transition-all relative group";
                    el.innerHTML = `
                        ${activeBadge}
                        <div class="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xl mb-4"><i class="fa-solid fa-file-contract"></i></div>
                        <h3 class="font-bold text-slate-800 text-lg mb-1 truncate">${p.plan_name}</h3>
                        <p class="text-xs text-slate-400 mb-6 font-medium">Atualizado: ${date}</p>
                        <div class="flex gap-2">
                             <button class="flex-1 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm font-bold text-slate-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors btn-edit">Editar</button>
                             <button class="w-10 flex items-center justify-center border border-slate-200 bg-slate-50 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors btn-del"><i class="fa-solid fa-trash"></i></button>
                        </div>`;
                    
                    el.querySelector('.btn-edit').addEventListener('click', () => loadPlan(p.id));
                    el.querySelector('.btn-del').addEventListener('click', (e) => { e.stopPropagation(); deletePlan(p.id); });
                    grid.appendChild(el);
                });
            }
        } catch { showToast('Erro ao carregar planos.', 'error'); } finally { loading.classList.add('hidden'); }
    };

    async function loadPlan(id) {
        try {
            const res = await fetch(`${API_BASE}/get-plan/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if(!res.ok) throw new Error();
            const data = await res.json();
            library = data.library || []; planner = data.planner || {}; themes = data.themes || {};
            renderLibrary(); renderPlanner(); loadThemes(); updateLastSavedState(); switchView('planner');
        } catch { showToast('Erro ao abrir plano.', 'error'); }
    }

    async function deletePlan(id) {
        if(!confirm("Tem certeza que deseja EXCLUIR este plano? Isso não pode ser desfeito.")) return;
        try {
            const res = await fetch(`${API_BASE}/delete-plan/${id}`, { 
                method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } 
            });
            if(res.ok) { showToast('Plano excluído.'); loadPlansFromDB(); }
            else throw new Error();
        } catch { showToast('Erro ao excluir.', 'error'); }
    }

    async function saveToCloud() {
        if (!checkChanges()) { showToast('Nenhuma alteração detectada.', 'info'); return; }
        if(Object.keys(planner[1]).length === 0 && library.length === 0) { showToast('O plano está vazio!', 'warning'); return; }
        const name = prompt("Nome do Plano (ex: Hipertrofia Janeiro):"); if(!name) return;
        const makeActive = confirm("Ativar este plano no App agora?");
        
        const btn = document.getElementById('btn-save-cloud');
        const originalText = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/save-plan`, { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, 
                body: JSON.stringify({ name, data: { library, planner, themes }, is_active: makeActive }) 
            });
            if(res.ok) { showToast('Plano salvo!', 'success'); updateLastSavedState(); loadPlansFromDB(); } 
            else throw new Error();
        } catch { showToast('Erro ao salvar.', 'error'); } finally { btn.innerHTML = originalText; btn.disabled = false; }
    }

    // --- EXPORTAR / COMPARTILHAR ---
    
    document.getElementById('btn-export-plan').addEventListener('click', () => {
        if(library.length === 0) return showToast('Nada para exportar.', 'warning');
        downloadJSON({ library, planner, themes }, "plano_dieta_completo");
    });

    document.getElementById('btn-export-library').addEventListener('click', () => {
        if(library.length === 0) return showToast('Biblioteca vazia.', 'warning');
        downloadJSON(library, "pacote_receitas");
    });

    // --- IMPORTAÇÃO ---
    
    window.openImportModal = (type) => {
        currentImportType = type;
        document.getElementById('import-title').innerText = type === 'plan' ? 'Importar Plano' : 'Importar Receitas';
        document.getElementById('import-text').value = '';
        document.getElementById('import-file-input').value = ''; 
        document.getElementById('import-modal').classList.remove('hidden');
    };
    
    document.getElementById('btn-import-plan-main').addEventListener('click', () => openImportModal('plan'));
    document.getElementById('btn-import-recipe').addEventListener('click', () => openImportModal('recipe'));
    document.getElementById('btn-close-import').addEventListener('click', () => document.getElementById('import-modal').classList.add('hidden'));

    // Leitura de Arquivo
    document.getElementById('import-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const json = JSON.parse(ev.target.result);
                document.getElementById('import-text').value = JSON.stringify(json, null, 2);
                showToast('Arquivo carregado. Clique em Processar.', 'info');
            } catch(err) { showToast('Arquivo JSON inválido.', 'error'); }
        };
        reader.readAsText(file);
    });

    document.getElementById('btn-process-import').addEventListener('click', () => {
        let text = document.getElementById('import-text').value.trim();
        if(!text) return showToast('Cole o JSON ou anexe um arquivo.', 'warning');
        
        // Limpeza básica
        if (!text.startsWith('{') && !text.startsWith('[')) {
            const start = text.search(/[\{\[]/);
            if (start !== -1) {
                text = text.substring(start);
                const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
                if (end !== -1) text = text.substring(0, end + 1);
            }
        }
        if (text.startsWith('"library"')) text = '{' + text + '}';

        try {
            const data = JSON.parse(text);
            if (currentImportType === 'plan') {
                if (data.library && data.planner) {
                    data.library.forEach(r => { if(!library.find(x => x.id === r.id)) library.push(r); });
                    planner = data.planner; themes = data.themes || {};
                    renderLibrary(); renderPlanner(); loadThemes();
                    document.getElementById('import-modal').classList.add('hidden');
                    showToast('Plano importado!', 'success');
                    switchView('planner');
                } else throw new Error();
            } else {
                let list = Array.isArray(data) ? data : (data.library || []);
                if(!list.length) throw new Error();
                list.forEach(n => {
                    const i = library.findIndex(x => x.id === n.id);
                    if(i >= 0) library[i] = n; else library.push(n);
                });
                renderLibrary();
                showToast('Receitas importadas!', 'success');
                document.getElementById('import-modal').classList.add('hidden');
                switchView('library');
            }
        } catch { showToast('JSON Inválido.', 'error'); }
    });

    // --- GERADOR IA ---
    document.getElementById('btn-open-gen').addEventListener('click', () => {
        document.getElementById('prompt-modal').classList.remove('hidden');
        toggleGenInputs();
    });
    document.getElementById('btn-close-gen').addEventListener('click', () => document.getElementById('prompt-modal').classList.add('hidden'));
    
    document.getElementById('gen-type').addEventListener('change', toggleGenInputs);
    
    function toggleGenInputs() {
        const type = document.getElementById('gen-type').value;
        const qtyDiv = document.getElementById('gen-qty-container');
        const ph = document.getElementById('gen-input');
        if (type === 'recipe') {
            qtyDiv.classList.remove('hidden');
            ph.placeholder = "Ex: Café da manhã low carb...";
        } else {
            qtyDiv.classList.add('hidden');
            ph.placeholder = "Ex: Mulher, 35 anos, emagrecimento...";
        }
    }

    document.getElementById('btn-generate-prompt').addEventListener('click', () => {
        const type = document.getElementById('gen-type').value;
        const val = document.getElementById('gen-input').value;
        if(!val.trim()) return showToast('Preencha o perfil.', 'warning');
        
        let final = type === 'plan' 
            ? TEMPLATE_PLAN.replace('[PERFIL]', val) 
            : TEMPLATE_RECIPE.replace('[QTD]', document.getElementById('gen-qty').value || 5).replace('[PERFIL]', val);
        document.getElementById('gen-output').value = final;
    });

    document.getElementById('btn-copy-prompt').addEventListener('click', () => {
        const txt = document.getElementById('gen-output'); txt.select(); navigator.clipboard.writeText(txt.value);
        showToast('Copiado!', 'success');
    });

    // --- RENDERIZADORES ---
    
    function renderLibrary() {
        const grid = document.getElementById('recipe-grid'); grid.innerHTML = '';
        if(library.length === 0) { document.getElementById('empty-library').classList.remove('hidden'); return; }
        document.getElementById('empty-library').classList.add('hidden');

        library.forEach(r => {
            const el = document.createElement('div');
            el.className = "bg-white border border-slate-200 rounded-xl p-4 hover:shadow-lg transition-all cursor-pointer relative group";
            el.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <span class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg"><i class="fa-solid ${r.icon || 'fa-utensils'}"></i></span>
                    <button class="del-btn text-slate-300 hover:text-red-500 w-8 h-8 rounded-full hover:bg-red-50 flex items-center justify-center transition-colors"><i class="fa-solid fa-trash"></i></button>
                </div>
                <h4 class="font-bold text-slate-800 text-sm mb-1 line-clamp-2 h-10 leading-tight">${r.name}</h4>
                <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-md uppercase font-bold tracking-wide">${r.cat}</span>`;
            
            el.addEventListener('click', (e) => { if(!e.target.closest('.del-btn')) openRecipeModal(r.id); });
            el.querySelector('.del-btn').addEventListener('click', (e) => deleteRecipe(r.id, e));
            grid.appendChild(el);
        });
    }

    function renderPlanner() {
        const tbody = document.getElementById('planner-body'); tbody.innerHTML = '';
        // Cria inputs para temas se não existirem
        const themesContainer = document.getElementById('themes-container'); themesContainer.innerHTML = '';
        
        [1, 2, 3, 4].forEach(w => {
            if(!planner[w]) planner[w] = {};
            
            // Renderiza Linha Tabela
            let rowHtml = `<td class="px-6 py-4 text-sm font-bold text-slate-700 text-center border-r border-slate-200 bg-white sticky left-0 z-10 shadow-sm">Semana ${w}</td>`;
            
            ['cafe', 'almoco', 'lanche', 'jantar'].forEach(slot => {
                const r = library.find(x => x.id === planner[w][slot]);
                let cellContent = '';
                if(r) {
                    cellContent = `
                    <div class="bg-white border border-blue-200 p-2 rounded-lg shadow-sm cursor-pointer flex items-center gap-3 group/card relative h-14 hover:shadow-md transition-all meal-card">
                        <div class="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex flex-shrink-0 items-center justify-center text-xs font-bold"><i class="fa-solid ${r.icon||'fa-utensils'}"></i></div>
                        <span class="font-bold text-xs text-slate-700 truncate w-full pr-4">${r.name}</span>
                        <button class="absolute -top-2 -right-2 w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover/card:opacity-100 hover:bg-red-500 hover:text-white transition-all btn-clear"><i class="fa-solid fa-xmark"></i></button>
                    </div>`;
                } else {
                    cellContent = `<button class="w-full border-2 border-dashed border-slate-200 rounded-lg h-14 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all group/btn btn-add"><i class="fa-solid fa-plus text-xs mb-0.5 group-hover/btn:scale-110 transition-transform"></i><span class="text-[10px] font-bold uppercase tracking-wide">Add</span></button>`;
                }
                rowHtml += `<td class="px-2 py-3 min-w-[160px] align-middle">${cellContent}</td>`;
            });
            
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 group transition-colors";
            tr.innerHTML = rowHtml;
            
            // Attach Events na Tabela
            const slots = ['cafe', 'almoco', 'lanche', 'jantar'];
            const cells = tr.querySelectorAll('td:not(:first-child)');
            cells.forEach((td, idx) => {
                const slot = slots[idx];
                const btnAdd = td.querySelector('.btn-add');
                const card = td.querySelector('.meal-card');
                const btnClear = td.querySelector('.btn-clear');

                if(btnAdd) btnAdd.addEventListener('click', () => openPicker(w, slot));
                if(card) card.addEventListener('click', (e) => { if(!e.target.closest('.btn-clear')) openPicker(w, slot); });
                if(btnClear) btnClear.addEventListener('click', (e) => { e.stopPropagation(); delete planner[w][slot]; renderPlanner(); });
            });
            tbody.appendChild(tr);

            // Renderiza Input Tema
            themesContainer.innerHTML += `
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Semana ${w}</label>
                    <input type="text" id="theme-w${w}" placeholder="Ex: Foco em Proteína" class="w-full mt-1 bg-slate-50 border border-slate-200 rounded p-2 text-sm focus:outline-none focus:border-blue-500 transition-colors" value="${themes[w]||''}">
                </div>`;
        });

        // Bind Events Temas
        [1,2,3,4].forEach(w => {
            document.getElementById(`theme-w${w}`).addEventListener('change', (e) => themes[w] = e.target.value);
        });
    }

    function loadThemes() { /* Já tratado no renderPlanner */ }

    // --- EDITOR DE RECEITAS ---
    
    document.getElementById('btn-new-recipe').addEventListener('click', () => openRecipeModal());
    document.getElementById('btn-close-recipe').addEventListener('click', closeModal);
    document.getElementById('btn-cancel-recipe').addEventListener('click', closeModal);
    document.getElementById('btn-save-cloud').addEventListener('click', saveToCloud); // Save Plan button logic

    function openRecipeModal(id=null) {
        document.getElementById('recipe-modal').classList.remove('hidden');
        document.getElementById('edit-id').value = id || '';
        document.getElementById('rec-ingredients').innerHTML = ''; 
        document.getElementById('rec-steps').innerHTML = '';
        
        if(id) {
            const r = library.find(x => x.id === id);
            document.getElementById('rec-name').value = r.name; 
            document.getElementById('rec-cat').value = r.cat; 
            document.getElementById('rec-icon').value = r.icon||'fa-utensils';
            r.ingredients.forEach(i => addRecLine(i));
            r.steps.forEach(s => addStepLine(s));
        } else { 
            document.getElementById('rec-name').value = ''; 
            addRecLine(); addStepLine(); 
        }
    }

    function closeModal() { document.getElementById('recipe-modal').classList.add('hidden'); }

    const tplIngRow = `<div class="grid grid-cols-12 gap-2 ing-row items-center mb-2 bg-slate-50 p-2 rounded-lg border border-slate-100"><div class="col-span-5"><input type="text" placeholder="Item" class="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-sm i-n font-medium outline-none focus:border-blue-400"></div><div class="col-span-2"><input type="number" placeholder="0" class="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-sm text-center i-q outline-none focus:border-blue-400"></div><div class="col-span-2"><input type="text" placeholder="g" class="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-sm text-center i-u outline-none focus:border-blue-400"></div><div class="col-span-2"><select class="w-full bg-white border border-slate-200 rounded px-1 py-1.5 text-xs i-c outline-none"><option value="mercearia">Merc.</option><option value="carnes">Carnes</option><option value="horti">Horti</option><option value="outros">Out.</option></select></div><div class="col-span-1 text-center"><button class="text-slate-300 hover:text-red-500 btn-del-row"><i class="fa-solid fa-xmark"></i></button></div></div>`;

    document.getElementById('btn-add-ing').addEventListener('click', () => addRecLine());
    document.getElementById('btn-add-step').addEventListener('click', () => addStepLine());

    function addRecLine(data = null) {
        const div = document.createElement('div');
        div.innerHTML = tplIngRow;
        const row = div.firstChild;
        document.getElementById('rec-ingredients').appendChild(row);
        
        if(data) {
            row.querySelector('.i-n').value = data.n;
            let v = data.q_daily||0, u = data.u||'g';
            if(u==='g' && v>=1000){ v/=1000; u='kg'; }
            row.querySelector('.i-q').value = v;
            row.querySelector('.i-u').value = u;
            row.querySelector('.i-c').value = data.cat||'mercearia';
        }
        row.querySelector('.btn-del-row').addEventListener('click', () => row.remove());
    }

    function addStepLine(txt = '') {
        const div = document.createElement('div');
        div.className = "flex gap-2 step-row mb-2";
        div.innerHTML = `<textarea class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm h-14 s-txt outline-none focus:border-blue-400 resize-none" placeholder="Passo...">${txt}</textarea><button class="text-slate-300 hover:text-red-500 h-14 w-8 btn-del-step"><i class="fa-solid fa-trash"></i></button>`;
        document.getElementById('rec-steps').appendChild(div);
        div.querySelector('.btn-del-step').addEventListener('click', () => div.remove());
    }

    document.getElementById('btn-save-recipe').addEventListener('click', () => {
        const id = document.getElementById('edit-id').value || 'rec_' + Date.now();
        const name = document.getElementById('rec-name').value;
        if(!name) return showToast('Insira o nome.', 'warning');
        
        const ings = []; 
        document.querySelectorAll('.ing-row').forEach(r => { 
            const n = r.querySelector('.i-n').value; 
            if(n) { 
                let q = parseFloat(r.querySelector('.i-q').value)||0; 
                let u = r.querySelector('.i-u').value.toLowerCase(); 
                if(u==='kg'){ q*=1000; u='g'; } 
                ings.push({n, q_daily: q, u, cat: r.querySelector('.i-c').value}); 
            } 
        });
        const steps = []; 
        document.querySelectorAll('.s-txt').forEach(t => { if(t.value) steps.push(t.value); });
        
        const obj = { id, name, cat: document.getElementById('rec-cat').value, icon: document.getElementById('rec-icon').value, ingredients: ings, steps };
        const idx = library.findIndex(x => x.id === id); if(idx >= 0) library[idx] = obj; else library.push(obj);
        
        closeModal(); renderLibrary(); renderPlanner();
    });

    function deleteRecipe(id, e) { 
        e.stopPropagation(); 
        if(confirm("Excluir receita?")) { 
            library = library.filter(x => x.id !== id); 
            renderLibrary(); renderPlanner(); 
        } 
    }

    // --- PICKER ---
    
    document.getElementById('picker-search').addEventListener('keyup', renderPickerList);
    document.getElementById('btn-close-picker').addEventListener('click', () => document.getElementById('picker-modal').classList.add('hidden'));

    function openPicker(w, s) { 
        pickerContext = { w, s }; 
        document.getElementById('picker-modal').classList.remove('hidden'); 
        document.getElementById('picker-search').value = ''; 
        renderPickerList(); 
        setTimeout(() => document.getElementById('picker-search').focus(), 100); 
    }

    function renderPickerList() {
        const list = document.getElementById('picker-list'); 
        const term = document.getElementById('picker-search').value.toLowerCase(); 
        list.innerHTML = '';
        
        library.filter(r => r.name.toLowerCase().includes(term)).forEach(r => {
            const el = document.createElement('div');
            el.className = "p-3 hover:bg-indigo-50 cursor-pointer rounded-lg flex items-center gap-3 border border-transparent hover:border-indigo-100 mb-1 group";
            el.innerHTML = `
                <div class="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center text-sm group-hover:bg-white group-hover:text-indigo-600"><i class="fa-solid ${r.icon||'fa-utensils'}"></i></div>
                <div><p class="text-sm font-bold text-slate-700 group-hover:text-indigo-700">${r.name}</p><span class="text-[10px] bg-white border border-slate-200 px-1.5 rounded text-slate-400 uppercase">${r.cat}</span></div>`;
            el.addEventListener('click', () => {
                if(pickerContext) { planner[pickerContext.w][pickerContext.s] = r.id; renderPlanner(); document.getElementById('picker-modal').classList.add('hidden'); }
            });
            list.appendChild(el);
        });
    }

    // INIT
    loadPlansFromDB();
    switchView('presets');
    updateLastSavedState();
});
