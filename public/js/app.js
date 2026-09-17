// public/js/app.js - SOHA ENTERPRISE Full Functional ERP Controller with Authentication & RBAC

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------------
    // Global State & Auth Token
    // ----------------------------------------------------------------------
    let currentUser = null;
    let currentActiveView = 'my-business';
    let currentBusinessData = [];

    const AUTH_STORAGE_KEY = 'soha_erp_auth_token';

    // ----------------------------------------------------------------------
    // UI Elements
    // ----------------------------------------------------------------------
    // Login Screen
    const loginOverlay = document.getElementById('loginOverlay');
    const loginForm = document.getElementById('loginForm');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const loginAlert = document.getElementById('loginAlert');
    const btnLoginSubmit = document.getElementById('btnLoginSubmit');

    // Header & User Profile
    const topUserRoleBadge = document.getElementById('topUserRoleBadge');
    const userPhoneDisplay = document.getElementById('userPhoneDisplay');
    const dropdownFullName = document.getElementById('dropdownFullName');
    const dropdownRoleDesig = document.getElementById('dropdownRoleDesig');
    const dropdownPhone = document.getElementById('dropdownPhone');
    const adminMenuSection = document.getElementById('adminMenuSection');
    const navSubAccountsLi = document.getElementById('navSubAccountsLi');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdownMenu = document.getElementById('userDropdownMenu');
    const btnLogout = document.getElementById('btnLogout');
    const btnInstallApp = document.getElementById('btnInstallApp');

    // Navigation & Sidebar
    const sidebar = document.getElementById('apexSidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    const bannerOfficerTitle = document.getElementById('bannerOfficerTitle');
    const scrollTopBtn = document.getElementById('scrollTopBtn');

    // Modals
    const subUserModal = document.getElementById('subUserModal');
    const detailModal = document.getElementById('detailModal');
    const addTxModal = document.getElementById('addTxModal');
    const customerModal = document.getElementById('customerModal');
    const collectionModal = document.getElementById('collectionModal');
    const productModal = document.getElementById('productModal');

    // Sub-Account Management
    const subAccountsTableBody = document.getElementById('subAccountsTableBody');
    const btnOpenSubAccounts = document.getElementById('btnOpenSubAccounts');
    const btnOpenCreateSubUser = document.getElementById('btnOpenCreateSubUser');
    const btnOpenCreateSubUserDirect = document.getElementById('btnOpenCreateSubUserDirect');
    const btnCloseSubUserModal = document.getElementById('btnCloseSubUserModal');
    const btnCancelSubUser = document.getElementById('btnCancelSubUser');
    const btnSubmitSubUser = document.getElementById('btnSubmitSubUser');
    const subEmployeeSelect = document.getElementById('subEmployeeSelect');

    // My Business Filters
    const dateFromInput = document.getElementById('dateFrom');
    const dateToInput = document.getElementById('dateTo');
    const btnPreview = document.getElementById('btnPreview');
    const btnRefresh = document.getElementById('btnRefresh');
    const btnExportCsv = document.getElementById('btnExportCsv');
    const btnQuickAdd = document.getElementById('btnQuickAdd');
    const dateRangeDisplay = document.getElementById('dateRangeDisplay');

    // ----------------------------------------------------------------------
    // Helper Functions
    // ----------------------------------------------------------------------
    function formatSouthAsianNumber(val) {
        if (val === null || val === undefined || isNaN(val)) return '0';
        const num = Math.round(Number(val));
        const str = num.toString();
        if (str.length <= 3) return str;
        const lastThree = str.substring(str.length - 3);
        const otherDigits = str.substring(0, str.length - 3);
        const formattedRest = otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
        return formattedRest + ',' + lastThree;
    }

    function showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    function getAuthToken() {
        return localStorage.getItem(AUTH_STORAGE_KEY);
    }

    function setAuthToken(token) {
        localStorage.setItem(AUTH_STORAGE_KEY, token);
    }

    function removeAuthToken() {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    // ----------------------------------------------------------------------
    // 1. AUTHENTICATION & LOGIN CONTROLLER
    // ----------------------------------------------------------------------
    async function checkCurrentSession() {
        const token = getAuthToken();
        if (!token) {
            showLoginModal();
            return;
        }

        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                removeAuthToken();
                showLoginModal();
                return;
            }

            const data = await res.json();
            handleSuccessfulLogin(data.user, token);
        } catch (err) {
            console.error('Session check failed:', err);
            showLoginModal();
        }
    }

    function showLoginModal() {
        loginOverlay.classList.remove('hidden');
        loginAlert.style.display = 'none';
        loginUsername.value = '';
        loginPassword.value = '';
    }

    function handleSuccessfulLogin(user, token) {
        currentUser = user;
        setAuthToken(token);
        loginOverlay.classList.add('hidden');

        // Update Top Bar & Profile
        topUserRoleBadge.textContent = user.role === 'main_admin' ? 'MAIN ADMIN' : (user.role === 'sub_admin' ? 'SUB-ADMIN' : 'TSO OFFICER');
        userPhoneDisplay.textContent = user.phone || (user.role === 'main_admin' ? 'Admin' : user.username);
        dropdownFullName.textContent = user.fullName;
        dropdownRoleDesig.textContent = `Role: ${user.employeeDesig} (${user.role})`;
        dropdownPhone.textContent = user.phone || (user.role === 'main_admin' ? 'System Administrator' : user.username);

        // Toggle Main Admin Privilege Elements
        if (user.role === 'main_admin') {
            adminMenuSection.style.display = 'block';
            navSubAccountsLi.style.display = 'block';
        } else {
            adminMenuSection.style.display = 'none';
            navSubAccountsLi.style.display = 'none';
        }

        showToast(`Welcome, ${user.fullName}!`, 'success');

        // Load Default View
        switchView(currentActiveView);
    }

    // Login Form Submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = loginUsername.value.trim();
        const password = loginPassword.value;

        loginAlert.style.display = 'none';
        btnLoginSubmit.disabled = true;
        btnLoginSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            if (!res.ok) {
                loginAlert.textContent = data.message || 'Login failed. Please check credentials.';
                loginAlert.style.display = 'block';
                return;
            }

            handleSuccessfulLogin(data.user, data.token);
        } catch (err) {
            loginAlert.textContent = 'Server connection error. Please try again.';
            loginAlert.style.display = 'block';
        } finally {
            btnLoginSubmit.disabled = false;
            btnLoginSubmit.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In to SOHA ERP';
        }
    });

    // Logout
    btnLogout.addEventListener('click', async () => {
        const token = getAuthToken();
        if (token) {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (e) {
                console.error(e);
            }
        }
        removeAuthToken();
        currentUser = null;
        userDropdownMenu.classList.remove('show');
        showLoginModal();
        showToast('You have been signed out.', 'success');
    });

    // ----------------------------------------------------------------------
    // 2. SUB-ACCOUNTS MANAGEMENT (MAIN ADMIN ONLY)
    // ----------------------------------------------------------------------
    async function loadSubAccounts() {
        if (!currentUser || currentUser.role !== 'main_admin') {
            showToast('Access denied: Main Admin privileges required', 'error');
            return;
        }

        subAccountsTableBody.innerHTML = `<tr><td colspan="9" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading user accounts from SQLite...</td></tr>`;

        try {
            const res = await fetch('/api/users');
            const data = (await res.json()).data || [];

            subAccountsTableBody.innerHTML = data.map(u => {
                const roleClass = u.role === 'main_admin' ? 'role-main-admin' : (u.role === 'sub_admin' ? 'role-sub-admin' : 'role-tso-officer');
                const roleLabel = u.role === 'main_admin' ? 'Main Admin' : (u.role === 'sub_admin' ? 'Sub-Admin' : 'TSO Officer');
                const statusBadge = u.is_active ? `<span class="status-badge status-active"><i class="fa-solid fa-circle-check"></i> Active</span>` : `<span class="status-badge status-inactive"><i class="fa-solid fa-circle-xmark"></i> Inactive</span>`;
                const toggleBtn = u.role === 'main_admin' ? '' : `
                    <button class="btn-toggle-status" onclick="window.app.toggleUserStatus(${u.id}, ${u.is_active})">
                        ${u.is_active ? '<i class="fa-solid fa-ban text-danger"></i> Deactivate' : '<i class="fa-solid fa-check text-green"></i> Activate'}
                    </button>
                `;

                return `
                    <tr>
                        <td><strong>${u.id}</strong></td>
                        <td><code>${u.username}</code></td>
                        <td><strong>${u.full_name}</strong></td>
                        <td><span class="role-badge ${roleClass}">${roleLabel}</span></td>
                        <td>${u.phone || '-'}</td>
                        <td>${u.employee_name ? `${u.employee_code} - ${u.employee_name}` : 'Direct Master'}</td>
                        <td>${statusBadge}</td>
                        <td>${u.created_at ? u.created_at.slice(0, 10) : '-'}</td>
                        <td class="text-center">${toggleBtn}</td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            subAccountsTableBody.innerHTML = `<tr><td colspan="9" class="text-danger text-center">Error loading accounts: ${err.message}</td></tr>`;
        }
    }

    async function openCreateSubUserModal() {
        if (!currentUser || currentUser.role !== 'main_admin') {
            showToast('Access restricted to Main Admin', 'error');
            return;
        }

        try {
            const empRes = await fetch('/api/employees');
            const emps = (await empRes.json()).data || [];
            subEmployeeSelect.innerHTML = '<option value="">-- None / Direct Office Operator --</option>' + emps.map(e => `
                <option value="${e.id}">${e.code} - ${e.name} (${e.designation})</option>
            `).join('');

            document.getElementById('subUsername').value = '';
            document.getElementById('subPassword').value = '';
            document.getElementById('subFullName').value = '';
            document.getElementById('subPhone').value = '';
            subUserModal.classList.add('show');
        } catch (err) {
            console.error(err);
        }
    }

    // Submit New Sub-Account
    btnSubmitSubUser.addEventListener('click', async () => {
        const username = document.getElementById('subUsername').value.trim();
        const password = document.getElementById('subPassword').value;
        const fullName = document.getElementById('subFullName').value.trim();
        const role = document.getElementById('subRole').value;
        const phone = document.getElementById('subPhone').value.trim();
        const empId = subEmployeeSelect.value;

        if (!username || !password || !fullName) {
            showToast('Please fill in Username, Password, and Full Name', 'error');
            return;
        }

        try {
            btnSubmitSubUser.disabled = true;
            btnSubmitSubUser.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    full_name: fullName,
                    role,
                    phone,
                    employee_id: empId || null
                })
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.message);

            showToast(result.message, 'success');
            subUserModal.classList.remove('show');
            loadSubAccounts();
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        } finally {
            btnSubmitSubUser.disabled = false;
            btnSubmitSubUser.innerHTML = 'Create Sub-Account';
        }
    });

    async function toggleUserStatus(userId, currentStatus) {
        const action = currentStatus ? 'deactivate' : 'activate';
        if (!confirm(`Are you sure you want to ${action} this sub-account?`)) return;

        try {
            const res = await fetch(`/api/users/${userId}/toggle`, { method: 'PATCH' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            showToast(data.message, 'success');
            loadSubAccounts();
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    }

    // ----------------------------------------------------------------------
    // 3. SPA ROUTER: Switch View
    // ----------------------------------------------------------------------
    function switchView(viewName) {
        currentActiveView = viewName;

        // Hide all view panels
        document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));

        // Show target panel
        const targetPanel = document.getElementById(`view-${viewName}`);
        if (targetPanel) targetPanel.classList.add('active');

        // Update active class on nav links
        document.querySelectorAll('.nav-link, .sub-nav-link').forEach(link => {
            link.classList.remove('active');
            const bullet = link.querySelector('.check-bullet');
            if (bullet) bullet.remove();
        });

        const activeLink = document.querySelector(`[data-view="${viewName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
            if (activeLink.classList.contains('sub-nav-link')) {
                activeLink.insertAdjacentHTML('afterbegin', '<i class="fa-solid fa-check check-bullet"></i> ');
            }
        }

        // Close mobile drawer
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('open');
            sidebarBackdrop.classList.remove('show');
            const icon = sidebarToggle.querySelector('i');
            if (icon) icon.className = 'fa-solid fa-bars';
        }

        updateBannerTitle(viewName);
        loadViewData(viewName);
    }

    function updateBannerTitle(viewName) {
        switch (viewName) {
            case 'my-business':
                bannerOfficerTitle.textContent = 'Name & Code: --';
                break;
            case 'sub-accounts':
                bannerOfficerTitle.textContent = 'Master Setup / Sub-Accounts Management (RBAC)';
                break;
            case 'home':
                bannerOfficerTitle.textContent = 'SOHA ENTERPRISE - Executive Dashboard Overview';
                break;
            case 'forecast-review':
                bannerOfficerTitle.textContent = 'Business / Forecast Review - Target vs Actual Performance';
                break;
            case 'forecast-entry':
                bannerOfficerTitle.textContent = 'Business / Forecast Entry - Sales Quotas & Planning';
                break;
            case 'forecast-report':
                bannerOfficerTitle.textContent = 'Business / Forecast Report - Territory Target Achievements';
                break;
            case 'my-customers':
                bannerOfficerTitle.textContent = 'Business / My Customers - Client Portfolios & Ledger';
                break;
            case 'comparison':
                bannerOfficerTitle.textContent = 'Business / Comparision Business - Growth Analytics';
                break;
            case 'customer-product-sell':
                bannerOfficerTitle.textContent = 'Business / Customer Wise Product Sell Analysis';
                break;
            case 'top-ten':
                bannerOfficerTitle.textContent = 'Business / MTD/YTD SALE And Top Ten Products';
                break;
            case 'ageing':
                bannerOfficerTitle.textContent = 'Business / Accounts Receivable Ageing Report';
                break;
            case 'outstanding':
                bannerOfficerTitle.textContent = 'Business / Customer Outstanding Balances & Credit Ledger';
                break;
            case 'product-customer-sale':
                bannerOfficerTitle.textContent = 'Business / Product Wise Customer Sales Distribution';
                break;
            case 'outstanding-confirmation':
                bannerOfficerTitle.textContent = 'Business / Outstanding Confirmation Audit Records';
                break;
            case 'master-setup':
                bannerOfficerTitle.textContent = 'Master Setup - Product Catalog & Officer Configurations';
                break;
            case 'sales':
                bannerOfficerTitle.textContent = 'Sales - Order Operations & Invoicing Ledger';
                break;
            case 'collection':
                bannerOfficerTitle.textContent = 'Collection - Cash & Bank Money Receipts';
                break;
            case 'bills':
                bannerOfficerTitle.textContent = 'Bill Management - Billing Records & Statements';
                break;
            default:
                bannerOfficerTitle.textContent = 'SOHA ENTERPRISE ERP';
        }
    }

    function loadViewData(viewName) {
        switch (viewName) {
            case 'home':
                loadHomeDashboard();
                break;
            case 'my-business':
                loadMyBusinessReport();
                break;
            case 'sub-accounts':
                loadSubAccounts();
                break;
            case 'forecast-review':
                loadForecastReview();
                break;
            case 'forecast-entry':
                loadForecastEntryDropdowns();
                break;
            case 'forecast-report':
                loadForecastReport();
                break;
            case 'my-customers':
                loadMyCustomers();
                break;
            case 'comparison':
                loadComparisonReport();
                break;
            case 'customer-product-sell':
                loadCustomerWiseProducts();
                break;
            case 'top-ten':
                loadTopTenProducts();
                break;
            case 'ageing':
                loadAgeingReport();
                break;
            case 'outstanding':
                loadOutstandingReport();
                break;
            case 'product-customer-sale':
                loadProductWiseCustomers();
                break;
            case 'outstanding-confirmation':
                loadOutstandingConfirmation();
                break;
            case 'master-setup':
                loadMasterProducts();
                break;
            case 'sales':
                loadSalesLedger();
                break;
            case 'collection':
                loadCollectionReceipts();
                break;
            case 'bills':
                loadBillsLedger();
                break;
        }
    }

    // ----------------------------------------------------------------------
    // 4. DATA LOADERS FOR VIEWS
    // ----------------------------------------------------------------------
    async function loadHomeDashboard() {
        try {
            const empCode = (currentUser && currentUser.role === 'main_admin') ? 'ADMIN' : (currentUser ? currentUser.employeeCode : '');
            const res = await fetch(`/api/dashboard/kpi?code=${encodeURIComponent(empCode)}`);
            const data = await res.json();
            const { kpis, recentOrders } = data;

            document.getElementById('kpiYtdSales').textContent = `৳ ${kpis.ytdSales}`;
            document.getElementById('kpiYtdQty').textContent = kpis.ytdQty;
            document.getElementById('kpiMtdSales').textContent = `৳ ${kpis.mtdSales}`;
            document.getElementById('kpiTotalCollected').textContent = `৳ ${kpis.totalCollected}`;
            document.getElementById('kpiTotalDues').textContent = `৳ ${kpis.totalDues}`;
            document.getElementById('kpiCustCount').textContent = `${kpis.totalCustomers} Accounts`;

            const tbody = document.getElementById('homeRecentOrdersBody');
            if (!recentOrders || recentOrders.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No recent sales orders found.</td></tr>`;
            } else {
                tbody.innerHTML = recentOrders.map(o => `
                    <tr>
                        <td><strong>${o.invoice_no}</strong></td>
                        <td>${o.date}</td>
                        <td>${o.customer_name || '-'}</td>
                        <td>${o.product_name || '-'}</td>
                        <td class="text-right">${o.qty.toLocaleString()}</td>
                        <td class="text-right">৳ ${o.total_price_formatted}</td>
                        <td class="text-right text-danger">৳ ${o.dues_formatted}</td>
                    </tr>
                `).join('');
            }
        } catch (err) {
            console.error('Home load error:', err);
        }
    }

    async function loadMyBusinessReport() {
        const fromDate = dateFromInput.value;
        const toDate = dateToInput.value;
        const tbody = document.getElementById('businessTableBody');
        const tfoot = document.getElementById('businessTableFoot');

        tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Executing SQL query...</td></tr>`;

        try {
            const empCode = (currentUser && currentUser.role === 'main_admin') ? 'ADMIN' : (currentUser ? currentUser.employeeCode : '');
            const url = `/api/reports/my-business?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&code=${encodeURIComponent(empCode)}`;
            const res = await fetch(url);
            const result = await res.json();
            currentBusinessData = result.data || [];

            dateRangeDisplay.textContent = `Range: ${fromDate} to ${toDate}`;

            if (currentBusinessData.length === 0) {
                tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No sales records found for this date range. Click "+ New Entry" to create transactions.</td></tr>`;
                tfoot.innerHTML = '';
                return;
            }

            let bodyHtml = '';
            let tQty = 0, tPrice = 0, tBonus = 0, tDisc = 0, tDues = 0, tCash = 0, tComm = 0;

            currentBusinessData.forEach(r => {
                tQty += Number(r.qty);
                tPrice += Number(r.price);
                tBonus += Number(r.bonus_qty);
                tDisc += Number(r.disc_amt);
                tDues += Number(r.dues);
                tCash += Number(r.coll_cash);
                tComm += Number(r.coll_comm);

                bodyHtml += `
                    <tr>
                        <td class="col-page-link text-center">
                            <button class="btn-page-link" onclick="window.app.openDetails('${r.code}', '${r.name}')" title="View Invoices">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> View
                            </button>
                        </td>
                        <td class="col-code">${r.code}</td>
                        <td class="col-name font-weight-500">${r.name}</td>
                        <td class="col-desig">${r.desig}</td>
                        <td class="col-qty text-right"><span class="val-link" onclick="window.app.openDetails('${r.code}', '${r.name}')">${r.formatted.qty}</span></td>
                        <td class="col-price text-right"><span class="val-link" onclick="window.app.openDetails('${r.code}', '${r.name}')">${r.formatted.price}</span></td>
                        <td class="col-bonus text-center">${r.formatted.bonus_qty}</td>
                        <td class="col-disc text-right">${r.formatted.disc_amt}</td>
                        <td class="col-dues text-right">${r.formatted.dues}</td>
                        <td class="col-cash text-right">${r.formatted.coll_cash}</td>
                        <td class="col-comm text-right">${r.formatted.coll_comm || '0'}</td>
                    </tr>
                `;
            });

            tbody.innerHTML = bodyHtml;
            tfoot.innerHTML = `
                <tr>
                    <td colspan="4" class="text-right"><strong>Total:</strong></td>
                    <td class="text-right">${tQty.toLocaleString()}</td>
                    <td class="text-right">${formatSouthAsianNumber(tPrice)}</td>
                    <td class="text-center">${tBonus.toLocaleString()}</td>
                    <td class="text-right">${formatSouthAsianNumber(tDisc)}</td>
                    <td class="text-right">${formatSouthAsianNumber(tDues)}</td>
                    <td class="text-right">${formatSouthAsianNumber(tCash)}</td>
                    <td class="text-right">${formatSouthAsianNumber(tComm)}</td>
                </tr>
            `;
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger py-4">Error loading report: ${err.message}</td></tr>`;
        }
    }

    async function loadForecastReview() {
        const month = document.getElementById('forecastReviewMonth').value || '2026-08';
        const tbody = document.getElementById('forecastReviewBody');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading forecast review...</td></tr>`;

        try {
            const empCode = (currentUser && currentUser.role === 'main_admin') ? 'ADMIN' : (currentUser ? currentUser.employeeCode : '');
            const res = await fetch(`/api/forecasts/review?month=${encodeURIComponent(month)}&code=${encodeURIComponent(empCode)}`);
            const result = await res.json();
            const rows = result.data || [];

            if (rows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No forecast targets entered for ${month}.</td></tr>`;
                return;
            }

            tbody.innerHTML = rows.map(r => {
                const badgeColor = r.achievement_pct >= 100 ? 'text-green' : (r.achievement_pct >= 70 ? 'text-amber' : 'text-danger');
                return `
                    <tr>
                        <td><strong>${r.product_code}</strong></td>
                        <td>${r.product_name}</td>
                        <td class="text-right">${r.formatted.target_qty}</td>
                        <td class="text-right">${r.formatted.actual_qty}</td>
                        <td class="text-center font-weight-600 ${badgeColor}">${r.achievement_pct}%</td>
                        <td class="text-right">৳ ${r.formatted.target_amount}</td>
                        <td class="text-right">৳ ${r.formatted.actual_amount}</td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-danger py-4 text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadForecastEntryDropdowns() {
        try {
            const [empRes, prodRes] = await Promise.all([
                fetch('/api/employees'),
                fetch('/api/products')
            ]);
            const employees = (await empRes.json()).data || [];
            const products = (await prodRes.json()).data || [];

            document.getElementById('feOfficerSelect').innerHTML = employees.length ? employees.map(e => `
                <option value="${e.id}">${e.code} - ${e.name} (${e.designation})</option>
            `).join('') : '<option value="">-- No Employees / Officers yet --</option>';

            document.getElementById('feProductSelect').innerHTML = products.length ? products.map(p => `
                <option value="${p.id}">${p.name} - ৳${p.trade_price}</option>
            `).join('') : '<option value="">-- No Products registered yet --</option>';
        } catch (err) {
            console.error(err);
        }
    }

    async function loadForecastReport() {
        const tbody = document.getElementById('forecastReportBody');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading report...</td></tr>`;

        try {
            const res = await fetch('/api/forecasts/report');
            const data = (await res.json()).data || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No monthly forecast reports available.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(r => `
                <tr>
                    <td><strong>${r.year_month}</strong></td>
                    <td>${r.employee_name}</td>
                    <td class="text-center">${r.total_products_targeted}</td>
                    <td class="text-right">${Number(r.total_target_qty).toLocaleString()}</td>
                    <td class="text-right">${Number(r.total_actual_qty).toLocaleString()}</td>
                    <td class="text-right">৳ ${formatSouthAsianNumber(r.total_target_amount)}</td>
                    <td class="text-right">৳ ${formatSouthAsianNumber(r.total_actual_amount)}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadMyCustomers() {
        const tbody = document.getElementById('customersTableBody');
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading customer directory...</td></tr>`;

        try {
            const res = await fetch('/api/reports/my-customers');
            const data = (await res.json()).data || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No customers found. Click "+ Add New Customer" to register dealers.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(c => `
                <tr>
                    <td><strong>${c.code}</strong></td>
                    <td>${c.name}</td>
                    <td>${c.phone || '-'}</td>
                    <td>${c.address || c.territory}</td>
                    <td class="text-right">৳ ${c.formatted.total_billed}</td>
                    <td class="text-right text-success">৳ ${c.formatted.total_paid}</td>
                    <td class="text-right text-danger font-weight-600">৳ ${c.formatted.balance_dues}</td>
                    <td>${c.last_order_date || 'N/A'}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadComparisonReport() {
        const tbody = document.getElementById('comparisonTableBody');
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Analyzing period business...</td></tr>`;

        try {
            const res = await fetch('/api/reports/comparison');
            const data = (await res.json()).periods || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No comparative period sales data available.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(p => `
                <tr>
                    <td><strong>${p.period}</strong></td>
                    <td class="text-right">${p.formatted.total_qty}</td>
                    <td class="text-right font-weight-500">৳ ${p.formatted.total_sales}</td>
                    <td class="text-right text-success">৳ ${p.formatted.total_coll}</td>
                    <td class="text-right text-danger">৳ ${p.formatted.total_dues}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadCustomerWiseProducts() {
        const tbody = document.getElementById('custProdSellBody');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading sales analysis...</td></tr>`;

        try {
            const res = await fetch('/api/reports/customer-wise-products');
            const data = (await res.json()).data || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No customer product sales recorded yet.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(r => `
                <tr>
                    <td><strong>${r.customer_name}</strong></td>
                    <td>${r.territory}</td>
                    <td>${r.product_name}</td>
                    <td class="text-right">${r.formatted.total_qty}</td>
                    <td class="text-right">৳ ${r.formatted.total_amount}</td>
                    <td class="text-center">${r.bonus_qty || 0}</td>
                    <td>${r.last_order}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadTopTenProducts() {
        const tbody = document.getElementById('topTenBody');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Ranking top products...</td></tr>`;

        try {
            const res = await fetch('/api/reports/top-products');
            const data = (await res.json()).data || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No sales recorded to rank top products.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(p => `
                <tr>
                    <td class="text-center"><strong>#${p.rank}</strong></td>
                    <td>${p.code}</td>
                    <td class="font-weight-600">${p.name}</td>
                    <td>${p.category}</td>
                    <td>${p.pack_size}</td>
                    <td class="text-right">${p.formatted.total_sold_qty}</td>
                    <td class="text-right font-weight-600 text-primary">৳ ${p.formatted.total_revenue}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadAgeingReport() {
        const tbody = document.getElementById('ageingTableBody');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Calculating receivable ageing...</td></tr>`;

        try {
            const res = await fetch('/api/reports/ageing');
            const data = (await res.json()).data || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> All accounts clear. No overdue dues recorded.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(r => `
                <tr>
                    <td>${r.code}</td>
                    <td><strong>${r.customer_name}</strong></td>
                    <td class="text-right">৳ ${r.formatted.age_0_30}</td>
                    <td class="text-right">৳ ${r.formatted.age_31_60}</td>
                    <td class="text-right">৳ ${r.formatted.age_61_90}</td>
                    <td class="text-right text-danger">৳ ${r.formatted.age_above_90}</td>
                    <td class="text-right font-weight-700">৳ ${r.formatted.total_outstanding}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadOutstandingReport() {
        const tbody = document.getElementById('outstandingTableBody');
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading dues ledger...</td></tr>`;

        try {
            const res = await fetch('/api/reports/outstanding');
            const data = (await res.json()).data || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No outstanding dues found.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(o => `
                <tr>
                    <td>${o.code}</td>
                    <td><strong>${o.name}</strong></td>
                    <td>${o.territory}</td>
                    <td class="text-right">৳ ${o.formatted.total_bill}</td>
                    <td class="text-right text-success">৳ ${o.formatted.total_recovered}</td>
                    <td class="text-right text-danger font-weight-600">৳ ${o.formatted.current_dues}</td>
                    <td class="text-right">৳ ${o.formatted.credit_limit}</td>
                    <td>${o.last_activity}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadProductWiseCustomers() {
        const tbody = document.getElementById('prodCustSaleBody');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading product distribution...</td></tr>`;

        try {
            const res = await fetch('/api/reports/product-wise-customers');
            const data = (await res.json()).data || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No product-wise customer sales data available.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(r => `
                <tr>
                    <td><strong>${r.product_name}</strong></td>
                    <td>${r.pack_size}</td>
                    <td>৳${r.trade_price}</td>
                    <td>${r.customer_name}</td>
                    <td>${r.territory}</td>
                    <td class="text-right">${Number(r.qty_bought).toLocaleString()}</td>
                    <td class="text-right font-weight-500">৳ ${formatSouthAsianNumber(r.amount)}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadOutstandingConfirmation() {
        const tbody = document.getElementById('confirmationTableBody');
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading audit records...</td></tr>`;

        try {
            const res = await fetch('/api/reports/outstanding-confirmation');
            const data = (await res.json()).data || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No audit confirmations found.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(c => `
                <tr>
                    <td>${c.customer_code}</td>
                    <td><strong>${c.customer_name}</strong></td>
                    <td class="text-right font-weight-600 text-success">৳ ${c.formatted.confirmed_amount}</td>
                    <td class="text-right">৳ ${c.formatted.system_dues}</td>
                    <td>${c.confirmed_date}</td>
                    <td>${c.confirmed_by}</td>
                    <td><span class="meta-tag text-green"><i class="fa-solid fa-check-circle"></i> ${c.status}</span></td>
                    <td>${c.remarks || '-'}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadMasterProducts() {
        const tbody = document.getElementById('masterProductsBody');
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading catalog...</td></tr>`;

        try {
            const res = await fetch('/api/products');
            const data = (await res.json()).data || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No products in catalog. Click "+ Add Product" to register items.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(p => `
                <tr>
                    <td><strong>${p.code}</strong></td>
                    <td class="font-weight-600">${p.name}</td>
                    <td>${p.category}</td>
                    <td>${p.pack_size}</td>
                    <td class="text-right">৳ ${p.trade_price.toFixed(2)}</td>
                    <td class="text-right">${p.stock_qty || 0}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadSalesLedger() {
        const tbody = document.getElementById('salesLedgerBody');
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading orders ledger...</td></tr>`;

        try {
            const res = await fetch('/api/bills');
            const data = (await res.json()).data || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No sales orders recorded. Click "+ New Sales Order" to create.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(s => `
                <tr>
                    <td><strong>${s.invoice_no}</strong></td>
                    <td>${s.date}</td>
                    <td>${s.customer_name}</td>
                    <td>${s.product_name}</td>
                    <td class="text-right">${Number(s.qty).toLocaleString()}</td>
                    <td class="text-right">৳ ${s.total_price_formatted}</td>
                    <td class="text-right text-danger">৳ ${s.dues_formatted}</td>
                    <td class="text-right text-success">৳ ${formatSouthAsianNumber(s.coll_cash)}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadCollectionReceipts() {
        const tbody = document.getElementById('collectionTableBody');
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading collection vouchers...</td></tr>`;

        try {
            const res = await fetch('/api/collections');
            const data = (await res.json()).data || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No collection money receipts recorded. Click "+ New Collection" to record payment.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(c => `
                <tr>
                    <td><strong>${c.receipt_no}</strong></td>
                    <td>${c.date}</td>
                    <td>${c.customer_name}</td>
                    <td>${c.employee_name}</td>
                    <td class="text-right font-weight-600 text-success">৳ ${c.amount_formatted}</td>
                    <td>${c.payment_method}</td>
                    <td>${c.bank_name || '-'}</td>
                    <td>${c.notes || '-'}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    async function loadBillsLedger() {
        const tbody = document.getElementById('billsTableBody');
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading billing ledger...</td></tr>`;

        try {
            const res = await fetch('/api/bills');
            const data = (await res.json()).data || [];

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted"><i class="fa-solid fa-inbox"></i> No billing records found.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(b => `
                <tr>
                    <td><strong>${b.invoice_no}</strong></td>
                    <td>${b.date}</td>
                    <td>${b.customer_name}</td>
                    <td>${b.address || '-'}</td>
                    <td>${b.product_name}</td>
                    <td class="text-right">${Number(b.qty).toLocaleString()}</td>
                    <td class="text-right font-weight-500">৳ ${b.total_price_formatted}</td>
                    <td class="text-right text-danger">৳ ${b.dues_formatted}</td>
                    <td class="text-center">
                        <button class="btn-tool" onclick="alert('Printing statement for Invoice: ${b.invoice_no}')"><i class="fa-solid fa-print"></i> Print</button>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    // ----------------------------------------------------------------------
    // 5. TRANSACTION DRILL-DOWN MODAL ("Page Link" -> View)
    // ----------------------------------------------------------------------
    async function openDetails(code, name) {
        document.getElementById('modalOfficerName').textContent = `${name} (Code: ${code})`;
        document.getElementById('modalOfficerSubtitle').textContent = `SOHA ENTERPRISE | Date Filter: ${dateFromInput.value} to ${dateToInput.value}`;
        const tbody = document.getElementById('detailModalBody');
        tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading transactions...</td></tr>`;
        detailModal.classList.add('show');

        try {
            const url = `/api/reports/detail/${encodeURIComponent(code)}?from=${encodeURIComponent(dateFromInput.value)}&to=${encodeURIComponent(dateToInput.value)}`;
            const res = await fetch(url);
            const result = await res.json();
            const txs = result.data || [];

            if (txs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4">No records found.</td></tr>`;
                return;
            }

            tbody.innerHTML = txs.map(t => `
                <tr>
                    <td><strong>${t.invoice_no}</strong></td>
                    <td>${t.date}</td>
                    <td>${t.customer_name || '-'}</td>
                    <td>${t.product_name || '-'}</td>
                    <td class="text-right">${Number(t.qty).toLocaleString()}</td>
                    <td class="text-right">৳${Number(t.unit_price).toFixed(2)}</td>
                    <td class="text-right font-weight-500">৳${formatSouthAsianNumber(t.total_price)}</td>
                    <td class="text-center">${t.bonus_qty || 0}</td>
                    <td class="text-right">৳${formatSouthAsianNumber(t.discount_amt)}</td>
                    <td class="text-right">৳${formatSouthAsianNumber(t.dues)}</td>
                    <td class="text-right text-success font-weight-500">৳${formatSouthAsianNumber(t.coll_cash)}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="11" class="text-danger text-center">Error: ${err.message}</td></tr>`;
        }
    }

    // ----------------------------------------------------------------------
    // 6. FORMS & MODAL SUBMISSIONS (Sales, Customer, Collection, Forecast, Product)
    // ----------------------------------------------------------------------
    async function openNewTx() {
        try {
            const [empRes, custRes, prodRes] = await Promise.all([
                fetch('/api/employees'),
                fetch('/api/customers'),
                fetch('/api/products')
            ]);
            const employees = (await empRes.json()).data || [];
            const customers = (await custRes.json()).data || [];
            const products = (await prodRes.json()).data || [];

            document.getElementById('txEmployeeSelect').innerHTML = employees.length ? employees.map(e => `
                <option value="${e.id}">${e.code} - ${e.name} (${e.designation})</option>
            `).join('') : '<option value="">-- No Employees / Officers yet --</option>';

            document.getElementById('txCustomerSelect').innerHTML = customers.length ? customers.map(c => `
                <option value="${c.id}">${c.name} (${c.address || c.territory})</option>
            `).join('') : '<option value="">-- No Customers registered yet --</option>';

            const prodSel = document.getElementById('txProductSelect');
            prodSel.innerHTML = products.length ? products.map(p => `
                <option value="${p.id}" data-price="${p.trade_price}">${p.name} - ৳${p.trade_price} (${p.pack_size})</option>
            `).join('') : '<option value="">-- No Products registered yet --</option>';

            if (products.length > 0) {
                document.getElementById('txUnitPrice').value = products[0].trade_price;
                calcOrderTotal();
            } else {
                document.getElementById('txUnitPrice').value = '0';
                calcOrderTotal();
            }

            addTxModal.classList.add('show');
        } catch (err) {
            console.error(err);
        }
    }

    function calcOrderTotal() {
        const q = Number(document.getElementById('txQty').value) || 0;
        const p = Number(document.getElementById('txUnitPrice').value) || 0;
        document.getElementById('txPreviewTotal').textContent = `৳ ${formatSouthAsianNumber(q * p)}`;
    }

    document.getElementById('txQty').addEventListener('input', calcOrderTotal);
    document.getElementById('txUnitPrice').addEventListener('input', calcOrderTotal);
    document.getElementById('txProductSelect').addEventListener('change', (e) => {
        const opt = e.target.selectedOptions[0];
        if (opt && opt.dataset.price) {
            document.getElementById('txUnitPrice').value = opt.dataset.price;
            calcOrderTotal();
        }
    });

    document.getElementById('btnSubmitTx').addEventListener('click', async () => {
        const empId = document.getElementById('txEmployeeSelect').value;
        const custId = document.getElementById('txCustomerSelect').value;
        const prodId = document.getElementById('txProductSelect').value;

        if (!empId || !custId || !prodId) {
            showToast('Please ensure an Officer, Customer, and Product are selected', 'error');
            return;
        }

        const payload = {
            employee_id: empId,
            customer_id: custId,
            product_id: prodId,
            date: document.getElementById('txDate').value,
            qty: Number(document.getElementById('txQty').value),
            unit_price: Number(document.getElementById('txUnitPrice').value),
            bonus_qty: Number(document.getElementById('txBonusQty').value) || 0,
            discount_amt: Number(document.getElementById('txDiscount').value) || 0,
            dues: Number(document.getElementById('txDues').value) || 0,
            coll_cash: Number(document.getElementById('txCollCash').value) || 0,
            coll_comm: Number(document.getElementById('txCollComm').value) || 0,
            notes: document.getElementById('txNotes').value
        };

        try {
            const res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message);

            showToast(`Order ${result.invoiceNo} saved to SQLite!`, 'success');
            addTxModal.classList.remove('show');
            loadViewData(currentActiveView);
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    });

    function openNewCustomerModal() {
        customerModal.classList.add('show');
    }
    document.getElementById('btnSubmitCustomer').addEventListener('click', async () => {
        const payload = {
            code: document.getElementById('newCustCode').value,
            name: document.getElementById('newCustName').value,
            phone: document.getElementById('newCustPhone').value,
            territory: document.getElementById('newCustTerritory').value,
            address: document.getElementById('newCustAddress').value,
            credit_limit: Number(document.getElementById('newCustCreditLimit').value)
        };

        if (!payload.code || !payload.name) {
            showToast('Code and Name are required', 'error');
            return;
        }

        try {
            const res = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message);

            showToast(`Customer ${payload.name} added to SQLite!`, 'success');
            customerModal.classList.remove('show');
            loadViewData(currentActiveView);
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    });

    async function openCollectionModal() {
        try {
            const custRes = await fetch('/api/customers');
            const custs = (await custRes.json()).data || [];
            document.getElementById('collCustSelect').innerHTML = custs.length ? custs.map(c => `
                <option value="${c.id}">${c.name} (${c.address || c.territory})</option>
            `).join('') : '<option value="">-- No Customers registered yet --</option>';
            collectionModal.classList.add('show');
        } catch (err) {
            console.error(err);
        }
    }
    document.getElementById('btnSubmitColl').addEventListener('click', async () => {
        const custId = document.getElementById('collCustSelect').value;
        if (!custId) {
            showToast('Please add or select a customer first', 'error');
            return;
        }
        const payload = {
            customer_id: custId,
            employee_id: (currentUser && currentUser.employeeId) || null,
            date: document.getElementById('collDate').value,
            amount: Number(document.getElementById('collAmount').value),
            payment_method: document.getElementById('collMethod').value,
            bank_name: document.getElementById('collBank').value,
            notes: document.getElementById('collNotes').value
        };

        try {
            const res = await fetch('/api/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message);

            showToast(`Receipt ${result.receiptNo} saved to SQLite!`, 'success');
            collectionModal.classList.remove('show');
            loadViewData(currentActiveView);
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    });

    document.getElementById('formForecastEntry').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            employee_id: document.getElementById('feOfficerSelect').value,
            product_id: document.getElementById('feProductSelect').value,
            year_month: document.getElementById('feMonth').value,
            target_qty: Number(document.getElementById('feTargetQty').value),
            target_amount: Number(document.getElementById('feTargetAmount').value),
            notes: document.getElementById('feNotes').value
        };

        try {
            const res = await fetch('/api/forecasts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message);

            showToast('Sales Forecast Quota saved into SQLite!', 'success');
            switchView('forecast-review');
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    });

    document.getElementById('btnNewProduct').addEventListener('click', () => productModal.classList.add('show'));
    document.getElementById('btnSubmitProd').addEventListener('click', async () => {
        const payload = {
            code: document.getElementById('newProdCode').value,
            name: document.getElementById('newProdName').value,
            pack_size: document.getElementById('newProdPack').value,
            trade_price: Number(document.getElementById('newProdPrice').value),
            category: document.getElementById('newProdCategory').value
        };

        try {
            const res = await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message);

            showToast(`Product ${payload.name} added to SQLite!`, 'success');
            productModal.classList.remove('show');
            loadMasterProducts();
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    });

    // ----------------------------------------------------------------------
    // 7. EVENT LISTENERS & INITIALIZATION
    // ----------------------------------------------------------------------
    document.querySelectorAll('[data-view]').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const viewName = this.dataset.view;
            if (viewName) switchView(viewName);
        });
    });

    document.querySelectorAll('[data-toggle="sub"]').forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            const parent = this.closest('.nav-item');
            parent.classList.toggle('open');
            const arrow = this.querySelector('.nav-arrow');
            if (arrow) {
                arrow.className = parent.classList.contains('open') ? 'fa-solid fa-chevron-down nav-arrow' : 'fa-solid fa-chevron-right nav-arrow';
            }
        });
    });

    sidebarToggle.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            const isOpen = sidebar.classList.toggle('open');
            sidebarBackdrop.classList.toggle('show');
            const icon = sidebarToggle.querySelector('i');
            if (icon) icon.className = isOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
        } else {
            sidebar.classList.toggle('collapsed');
        }
    });
    sidebarBackdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('show');
        const icon = sidebarToggle.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-bars';
    });

    userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdownMenu.classList.toggle('show');
    });
    document.addEventListener('click', () => userDropdownMenu.classList.remove('show'));

    // Sub-Account management triggers
    btnOpenSubAccounts.addEventListener('click', () => {
        userDropdownMenu.classList.remove('show');
        switchView('sub-accounts');
    });
    btnOpenCreateSubUser.addEventListener('click', () => {
        userDropdownMenu.classList.remove('show');
        openCreateSubUserModal();
    });
    btnOpenCreateSubUserDirect.addEventListener('click', openCreateSubUserModal);
    btnCloseSubUserModal.addEventListener('click', () => subUserModal.classList.remove('show'));
    btnCancelSubUser.addEventListener('click', () => subUserModal.classList.remove('show'));

    // Top action buttons
    document.getElementById('btnOpenNewTx').addEventListener('click', openNewTx);
    document.getElementById('btnOpenNewColl').addEventListener('click', openCollectionModal);
    document.getElementById('btnOpenNewCust').addEventListener('click', openNewCustomerModal);
    btnQuickAdd.addEventListener('click', openNewTx);
    document.getElementById('btnAddCustomerBtn').addEventListener('click', openNewCustomerModal);
    document.getElementById('btnOpenNewCollPage').addEventListener('click', openCollectionModal);
    document.getElementById('btnFilterForecastReview').addEventListener('click', loadForecastReview);

    // Modal Closes
    document.getElementById('btnCloseDetailModal').addEventListener('click', () => detailModal.classList.remove('show'));
    document.getElementById('btnCloseDetailModalBtn').addEventListener('click', () => detailModal.classList.remove('show'));
    document.getElementById('btnCloseAddModal').addEventListener('click', () => addTxModal.classList.remove('show'));
    document.getElementById('btnCancelAdd').addEventListener('click', () => addTxModal.classList.remove('show'));
    document.getElementById('btnCloseCustomerModal').addEventListener('click', () => customerModal.classList.remove('show'));
    document.getElementById('btnCancelCust').addEventListener('click', () => customerModal.classList.remove('show'));
    document.getElementById('btnCloseCollModal').addEventListener('click', () => collectionModal.classList.remove('show'));
    document.getElementById('btnCancelColl').addEventListener('click', () => collectionModal.classList.remove('show'));
    document.getElementById('btnCloseProdModal').addEventListener('click', () => productModal.classList.remove('show'));
    document.getElementById('btnCancelProd').addEventListener('click', () => productModal.classList.remove('show'));

    btnPreview.addEventListener('click', loadMyBusinessReport);
    btnRefresh.addEventListener('click', loadMyBusinessReport);

    btnExportCsv.addEventListener('click', () => {
        if (!currentBusinessData || currentBusinessData.length === 0) {
            showToast('No data to export', 'error');
            return;
        }
        const headers = ['Code', 'Name', 'Designation', 'Quantity', 'Price', 'Bonus Qty', 'Discount Amount', 'Dues', 'Cash Collection', 'Commission Collection'];
        const rows = [headers.join(',')];
        currentBusinessData.forEach(r => {
            rows.push([`"${r.code}"`, `"${r.name}"`, `"${r.desig}"`, r.qty, r.price, r.bonus_qty, r.disc_amt, r.dues, r.coll_cash, r.coll_comm].join(','));
        });
        const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SOHA_ENTERPRISE_My_Business_${dateFromInput.value}_to_${dateToInput.value}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('CSV exported successfully', 'success');
    });

    scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Global exports for inline HTML handlers
    window.app = {
        switchView,
        openDetails,
        openNewTx,
        openNewCustomerModal,
        openCollectionModal,
        toggleUserStatus
    };

    // Check user authentication session on boot
    checkCurrentSession();
});
