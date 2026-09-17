// server.js - Real Express Backend for SOHA ENTERPRISE ERP with SQLite Relational Persistence & RBAC
const express = require('express');
const cors = require('cors');
const path = require('node:path');
const db = require('./db/database');
const { generateSalt, hashPassword, verifyPassword, generateSessionToken } = require('./db/auth');

const app = express();
const PORT = process.env.PORT || 8441;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper for Indian/Bangladeshi Lakh/Crore comma formatting
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

// --------------------------------------------------------------------------
// AUTHENTICATION MIDDLEWARE
// --------------------------------------------------------------------------
function getAuthUser(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return null;
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;

    const session = db.prepare(`
        SELECT s.token, s.expires_at, u.id, u.username, u.full_name, u.role, u.phone, u.employee_id, u.is_active,
               e.code AS employee_code, e.designation AS employee_desig
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN employees e ON u.employee_id = e.id
        WHERE s.token = ? AND datetime('now') < s.expires_at AND u.is_active = 1
    `).get(token);

    return session || null;
}

// --------------------------------------------------------------------------
// 1. AUTHENTICATION & SESSION ENDPOINTS
// --------------------------------------------------------------------------

// Login
app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ status: 'error', message: 'Username and password are required' });
        }

        const user = db.prepare(`
            SELECT u.id, u.username, u.password_hash, u.salt, u.full_name, u.role, u.phone, u.employee_id, u.is_active,
                   e.code AS employee_code, e.designation AS employee_desig
            FROM users u
            LEFT JOIN employees e ON u.employee_id = e.id
            WHERE u.username = ?
        `).get(username.trim());

        if (!user) {
            return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
        }

        if (!user.is_active) {
            return res.status(403).json({ status: 'error', message: 'This account has been deactivated by the Main Admin' });
        }

        const isValid = verifyPassword(password, user.salt, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
        }

        // Generate session token (valid for 7 days)
        const token = generateSessionToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

        db.prepare(`
            INSERT INTO user_sessions (token, user_id, expires_at)
            VALUES (?, ?, ?)
        `).run(token, user.id, expiresAt);

        res.json({
            status: 'success',
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                role: user.role,
                phone: user.phone || '',
                employeeId: user.employee_id,
                employeeCode: user.employee_code || (user.role === 'main_admin' ? 'ADMIN' : user.username),
                employeeDesig: user.employee_desig || (user.role === 'main_admin' ? 'Master Admin' : 'TSO Officer')
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Current User Profile
app.get('/api/auth/me', (req, res) => {
    try {
        const user = getAuthUser(req);
        if (!user) {
            return res.status(401).json({ status: 'error', message: 'Not authenticated or session expired' });
        }

        res.json({
            status: 'success',
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                role: user.role,
                phone: user.phone || '',
                employeeId: user.employee_id,
                employeeCode: user.employee_code || (user.role === 'main_admin' ? 'ADMIN' : user.username),
                employeeDesig: user.employee_desig || (user.role === 'main_admin' ? 'Master Admin' : 'TSO Officer')
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            const token = authHeader.replace(/^Bearer\s+/i, '').trim();
            db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token);
        }
        res.json({ status: 'success', message: 'Logged out successfully' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// --------------------------------------------------------------------------
// 2. SUB-ACCOUNT MANAGEMENT (MAIN ADMIN ONLY)
// --------------------------------------------------------------------------

// List all users
app.get('/api/users', (req, res) => {
    try {
        const sql = `
            SELECT u.id, u.username, u.full_name, u.role, u.phone, u.employee_id, u.is_active, u.created_at,
                   e.code AS employee_code, e.name AS employee_name, e.designation AS employee_desig
            FROM users u
            LEFT JOIN employees e ON u.employee_id = e.id
            ORDER BY u.id ASC
        `;
        const users = db.prepare(sql).all();
        res.json({ status: 'success', data: users });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Create New Sub-Account
app.post('/api/users', (req, res) => {
    try {
        const { username, password, full_name, role, phone, employee_id } = req.body;

        if (!username || !password || !full_name) {
            return res.status(400).json({ status: 'error', message: 'Username, password, and full name are required' });
        }

        const validRoles = ['sub_admin', 'tso_officer'];
        const chosenRole = validRoles.includes(role) ? role : 'tso_officer';

        // Check if username already exists
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
        if (existing) {
            return res.status(409).json({ status: 'error', message: 'Username already taken. Please choose another username.' });
        }

        const salt = generateSalt();
        const hash = hashPassword(password, salt);

        let linkedEmpId = employee_id ? Number(employee_id) : null;
        if (!linkedEmpId && chosenRole === 'tso_officer') {
            let emp = db.prepare('SELECT id FROM employees WHERE code = ?').get(username.trim());
            if (!emp) {
                const empStmt = db.prepare(`
                    INSERT INTO employees (code, name, designation, phone, territory)
                    VALUES (?, ?, 'TSO', ?, 'Official Territory')
                `);
                const empRes = empStmt.run(username.trim(), full_name.trim(), phone ? phone.trim() : '');
                linkedEmpId = empRes.lastInsertRowid;
            } else {
                linkedEmpId = emp.id;
            }
        }

        const stmt = db.prepare(`
            INSERT INTO users (username, password_hash, salt, full_name, role, phone, employee_id, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `);

        const result = stmt.run(
            username.trim(),
            hash,
            salt,
            full_name.trim(),
            chosenRole,
            phone ? phone.trim() : null,
            linkedEmpId
        );

        res.status(201).json({
            status: 'success',
            message: `Sub-Account '${username}' created successfully in SQLite!`,
            userId: result.lastInsertRowid
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Toggle Sub-Account Active / Inactive
app.patch('/api/users/:id/toggle', (req, res) => {
    try {
        const { id } = req.params;
        const user = db.prepare('SELECT id, role, is_active FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        if (user.role === 'main_admin') {
            return res.status(403).json({ status: 'error', message: 'Cannot deactivate the Main Admin account' });
        }

        const newStatus = user.is_active ? 0 : 1;
        db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, id);

        res.json({
            status: 'success',
            message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
            newStatus
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// --------------------------------------------------------------------------
// 3. HOME EXECUTIVE KPI DASHBOARD
// --------------------------------------------------------------------------
app.get('/api/dashboard/kpi', (req, res) => {
    try {
        const empCode = req.query.code || null;

        let ytdSql = `
            SELECT 
                COALESCE(SUM(s.total_price), 0) AS ytd_sales,
                COALESCE(SUM(s.qty), 0) AS ytd_qty,
                COALESCE(SUM(s.coll_cash), 0) AS total_collected,
                COALESCE(SUM(s.dues), 0) AS total_dues
            FROM sales_transactions s
        `;
        let mtdSql = `
            SELECT 
                COALESCE(SUM(s.total_price), 0) AS mtd_sales,
                COALESCE(SUM(s.qty), 0) AS mtd_qty,
                COALESCE(SUM(s.coll_cash), 0) AS mtd_collected
            FROM sales_transactions s
            WHERE s.date >= '2026-08-01' AND s.date <= '2026-08-31'
        `;

        if (empCode && empCode !== 'ADMIN') {
            ytdSql += ` JOIN employees e ON s.employee_id = e.id WHERE e.code = '${empCode}' `;
            mtdSql += ` AND s.employee_id = (SELECT id FROM employees WHERE code = '${empCode}') `;
        }

        const ytd = db.prepare(ytdSql).get();
        const mtd = db.prepare(mtdSql).get();
        const custCount = db.prepare(`SELECT COUNT(*) AS total FROM customers`).get();

        const topProduct = db.prepare(`
            SELECT p.name, SUM(s.total_price) AS revenue, SUM(s.qty) AS qty
            FROM sales_transactions s
            JOIN products p ON s.product_id = p.id
            GROUP BY p.id
            ORDER BY revenue DESC
            LIMIT 1
        `).get() || { name: 'N/A', revenue: 0, qty: 0 };

        const recentOrders = db.prepare(`
            SELECT s.invoice_no, s.date, c.name AS customer_name, p.name AS product_name, s.qty, s.total_price, s.dues
            FROM sales_transactions s
            LEFT JOIN customers c ON s.customer_id = c.id
            LEFT JOIN products p ON s.product_id = p.id
            ORDER BY s.date DESC
            LIMIT 5
        `).all();

        res.json({
            status: 'success',
            kpis: {
                ytdSales: formatSouthAsianNumber(ytd.ytd_sales),
                ytdSalesRaw: ytd.ytd_sales,
                ytdQty: ytd.ytd_qty.toLocaleString(),
                totalCollected: formatSouthAsianNumber(ytd.total_collected),
                totalDues: formatSouthAsianNumber(ytd.total_dues),
                mtdSales: formatSouthAsianNumber(mtd.mtd_sales),
                totalCustomers: custCount.total,
                topProduct: {
                    name: topProduct.name,
                    revenue: formatSouthAsianNumber(topProduct.revenue)
                }
            },
            recentOrders: recentOrders.map(o => ({
                ...o,
                total_price_formatted: formatSouthAsianNumber(o.total_price),
                dues_formatted: formatSouthAsianNumber(o.dues)
            }))
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// --------------------------------------------------------------------------
// 4. MY BUSINESS REPORT (Core APEX Grid)
// --------------------------------------------------------------------------
app.get('/api/reports/my-business', (req, res) => {
    try {
        const fromDate = req.query.from || '1900-01-01';
        const toDate = req.query.to || '2099-12-31';
        const empCode = req.query.code || null;

        let sql = `
            SELECT 
                e.id AS employee_id,
                e.code,
                e.name,
                e.designation AS desig,
                e.phone,
                e.territory,
                COALESCE(SUM(s.qty), 0) AS qty,
                COALESCE(SUM(s.total_price), 0) AS price,
                COALESCE(SUM(s.bonus_qty), 0) AS bonus_qty,
                COALESCE(SUM(s.discount_amt), 0) AS disc_amt,
                COALESCE(SUM(s.dues), 0) AS dues,
                COALESCE(SUM(s.coll_cash), 0) AS coll_cash,
                COALESCE(SUM(s.coll_comm), 0) AS coll_comm,
                COUNT(s.id) AS tx_count
            FROM employees e
            LEFT JOIN sales_transactions s 
                ON e.id = s.employee_id 
                AND s.date >= ?
                AND s.date <= ?
        `;

        const params = [fromDate, toDate];

        if (empCode && empCode !== 'ADMIN') {
            sql += ` WHERE e.code = ? `;
            params.push(empCode);
        }

        sql += ` GROUP BY e.id, e.code, e.name, e.designation, e.phone, e.territory ORDER BY e.code ASC `;

        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);

        const formattedRows = rows.map(r => ({
            ...r,
            formatted: {
                qty: Number(r.qty).toLocaleString('en-US'),
                price: formatSouthAsianNumber(r.price),
                bonus_qty: Number(r.bonus_qty).toLocaleString('en-US'),
                disc_amt: formatSouthAsianNumber(r.disc_amt),
                dues: formatSouthAsianNumber(r.dues),
                coll_cash: formatSouthAsianNumber(r.coll_cash),
                coll_comm: formatSouthAsianNumber(r.coll_comm)
            }
        }));

        res.json({
            status: 'success',
            meta: { fromDate, toDate, totalEmployees: rows.length },
            data: formattedRows
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/reports/detail/:code', (req, res) => {
    try {
        const { code } = req.params;
        const fromDate = req.query.from || '1900-01-01';
        const toDate = req.query.to || '2099-12-31';

        const sql = `
            SELECT 
                s.id, s.invoice_no, s.date,
                c.name AS customer_name, c.code AS customer_code,
                p.name AS product_name, p.code AS product_code,
                s.qty, s.unit_price, s.total_price, s.bonus_qty,
                s.discount_amt, s.dues, s.coll_cash, s.coll_comm, s.notes
            FROM sales_transactions s
            JOIN employees e ON s.employee_id = e.id
            LEFT JOIN customers c ON s.customer_id = c.id
            LEFT JOIN products p ON s.product_id = p.id
            WHERE e.code = ?
              AND s.date >= ?
              AND s.date <= ?
            ORDER BY s.date DESC
        `;

        const rows = db.prepare(sql).all(code, fromDate, toDate);
        res.json({ status: 'success', code, count: rows.length, data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// --------------------------------------------------------------------------
// 5. FORECAST MODULES (Review, Entry, Report)
// --------------------------------------------------------------------------
app.get('/api/forecasts/review', (req, res) => {
    try {
        const month = req.query.month || '2026-08';
        const empCode = req.query.code || null;

        let sql = `
            SELECT 
                f.id,
                p.code AS product_code,
                p.name AS product_name,
                f.target_qty,
                f.target_amount,
                COALESCE(SUM(s.qty), 0) AS actual_qty,
                COALESCE(SUM(s.total_price), 0) AS actual_amount
            FROM forecasts f
            JOIN employees e ON f.employee_id = e.id
            JOIN products p ON f.product_id = p.id
            LEFT JOIN sales_transactions s 
                ON s.employee_id = e.id 
                AND s.product_id = p.id 
                AND strftime('%Y-%m', s.date) = f.year_month
            WHERE f.year_month = ?
        `;

        const params = [month];
        if (empCode && empCode !== 'ADMIN') {
            sql += ` AND e.code = ? `;
            params.push(empCode);
        }

        sql += ` GROUP BY f.id, p.code, p.name, f.target_qty, f.target_amount ORDER BY p.name ASC `;

        const rows = db.prepare(sql).all(...params);

        const data = rows.map(r => {
            const achievementPct = r.target_qty > 0 ? ((r.actual_qty / r.target_qty) * 100).toFixed(1) : '0.0';
            return {
                ...r,
                achievement_pct: Number(achievementPct),
                formatted: {
                    target_qty: r.target_qty.toLocaleString(),
                    actual_qty: r.actual_qty.toLocaleString(),
                    target_amount: formatSouthAsianNumber(r.target_amount),
                    actual_amount: formatSouthAsianNumber(r.actual_amount)
                }
            };
        });

        res.json({ status: 'success', month, data });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/forecasts', (req, res) => {
    try {
        const { employee_id, product_id, year_month, target_qty, target_amount, notes } = req.body;
        if (!employee_id || !product_id || !year_month || !target_qty) {
            return res.status(400).json({ status: 'error', message: 'Missing required forecast fields' });
        }

        const stmt = db.prepare(`
            INSERT INTO forecasts (employee_id, product_id, year_month, target_qty, target_amount, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(employee_id, product_id, year_month, target_qty, target_amount || 0, notes || '');
        res.status(201).json({ status: 'success', message: 'Forecast target recorded in SQLite', id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/forecasts/report', (req, res) => {
    try {
        const sql = `
            SELECT 
                f.year_month,
                e.name AS employee_name,
                COUNT(f.product_id) AS total_products_targeted,
                SUM(f.target_qty) AS total_target_qty,
                SUM(f.target_amount) AS total_target_amount,
                (SELECT COALESCE(SUM(qty),0) FROM sales_transactions WHERE strftime('%Y-%m', date) = f.year_month) AS total_actual_qty,
                (SELECT COALESCE(SUM(total_price),0) FROM sales_transactions WHERE strftime('%Y-%m', date) = f.year_month) AS total_actual_amount
            FROM forecasts f
            JOIN employees e ON f.employee_id = e.id
            GROUP BY f.year_month, e.name
            ORDER BY f.year_month DESC
        `;
        const rows = db.prepare(sql).all();
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// --------------------------------------------------------------------------
// 6. CUSTOMERS & OUTSTANDING MODULES
// --------------------------------------------------------------------------
app.get('/api/reports/my-customers', (req, res) => {
    try {
        const sql = `
            SELECT 
                c.id, c.code, c.name, c.phone, c.address, c.territory, c.credit_limit,
                COALESCE(SUM(s.total_price), 0) AS total_billed,
                COALESCE(SUM(s.coll_cash), 0) AS total_paid,
                COALESCE(SUM(s.dues), 0) AS balance_dues,
                MAX(s.date) AS last_order_date
            FROM customers c
            LEFT JOIN sales_transactions s ON c.id = s.customer_id
            GROUP BY c.id, c.code, c.name, c.phone, c.address, c.territory, c.credit_limit
            ORDER BY balance_dues DESC
        `;
        const rows = db.prepare(sql).all();
        const formatted = rows.map(c => ({
            ...c,
            formatted: {
                total_billed: formatSouthAsianNumber(c.total_billed),
                total_paid: formatSouthAsianNumber(c.total_paid),
                balance_dues: formatSouthAsianNumber(c.balance_dues),
                credit_limit: formatSouthAsianNumber(c.credit_limit)
            }
        }));
        res.json({ status: 'success', data: formatted });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/customers', (req, res) => {
    try {
        const { code, name, phone, address, territory, credit_limit } = req.body;
        if (!code || !name) return res.status(400).json({ status: 'error', message: 'Code and Name are required' });

        const stmt = db.prepare(`
            INSERT INTO customers (code, name, phone, address, territory, credit_limit)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(code, name, phone || '', address || '', territory || 'Dhaka Region', credit_limit || 1000000);
        res.status(201).json({ status: 'success', message: 'Customer added to SQLite', id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// --------------------------------------------------------------------------
// 7. COMPARISON & ANALYTICS REPORTS
// --------------------------------------------------------------------------
app.get('/api/reports/comparison', (req, res) => {
    try {
        const currentMonth = db.prepare(`
            SELECT 
                'August 2026 (Current)' AS period,
                COALESCE(SUM(qty), 0) AS total_qty,
                COALESCE(SUM(total_price), 0) AS total_sales,
                COALESCE(SUM(coll_cash), 0) AS total_coll,
                COALESCE(SUM(dues), 0) AS total_dues
            FROM sales_transactions
            WHERE date >= '2026-08-01' AND date <= '2026-08-31'
        `).get();

        const priorMonth = db.prepare(`
            SELECT 
                'July 2026 (Prior)' AS period,
                COALESCE(SUM(qty), 0) AS total_qty,
                COALESCE(SUM(total_price), 0) AS total_sales,
                COALESCE(SUM(coll_cash), 0) AS total_coll,
                COALESCE(SUM(dues), 0) AS total_dues
            FROM sales_transactions
            WHERE date >= '2026-07-01' AND date <= '2026-07-31'
        `).get();

        res.json({
            status: 'success',
            periods: [
                {
                    ...currentMonth,
                    formatted: {
                        total_qty: currentMonth.total_qty.toLocaleString(),
                        total_sales: formatSouthAsianNumber(currentMonth.total_sales),
                        total_coll: formatSouthAsianNumber(currentMonth.total_coll),
                        total_dues: formatSouthAsianNumber(currentMonth.total_dues)
                    }
                },
                {
                    ...priorMonth,
                    formatted: {
                        total_qty: priorMonth.total_qty.toLocaleString(),
                        total_sales: formatSouthAsianNumber(priorMonth.total_sales),
                        total_coll: formatSouthAsianNumber(priorMonth.total_coll),
                        total_dues: formatSouthAsianNumber(priorMonth.total_dues)
                    }
                }
            ]
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/reports/customer-wise-products', (req, res) => {
    try {
        const sql = `
            SELECT 
                c.name AS customer_name,
                c.territory,
                p.name AS product_name,
                SUM(s.qty) AS total_qty,
                SUM(s.total_price) AS total_amount,
                SUM(s.bonus_qty) AS bonus_qty,
                MAX(s.date) AS last_order
            FROM sales_transactions s
            JOIN customers c ON s.customer_id = c.id
            JOIN products p ON s.product_id = p.id
            GROUP BY c.id, p.id
            ORDER BY total_amount DESC
        `;
        const rows = db.prepare(sql).all();
        const formatted = rows.map(r => ({
            ...r,
            formatted: {
                total_qty: r.total_qty.toLocaleString(),
                total_amount: formatSouthAsianNumber(r.total_amount)
            }
        }));
        res.json({ status: 'success', data: formatted });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/reports/top-products', (req, res) => {
    try {
        const sql = `
            SELECT 
                p.code,
                p.name,
                p.category,
                p.pack_size,
                SUM(s.qty) AS total_sold_qty,
                SUM(s.total_price) AS total_revenue
            FROM sales_transactions s
            JOIN products p ON s.product_id = p.id
            GROUP BY p.id, p.code, p.name, p.category, p.pack_size
            ORDER BY total_revenue DESC
            LIMIT 10
        `;
        const rows = db.prepare(sql).all();
        res.json({
            status: 'success',
            data: rows.map((r, idx) => ({
                rank: idx + 1,
                ...r,
                formatted: {
                    total_sold_qty: r.total_sold_qty.toLocaleString(),
                    total_revenue: formatSouthAsianNumber(r.total_revenue)
                }
            }))
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/reports/ageing', (req, res) => {
    try {
        const sql = `
            SELECT 
                c.id, c.code, c.name AS customer_name,
                COALESCE(SUM(CASE WHEN julianday('2026-08-29') - julianday(s.date) <= 30 THEN s.dues ELSE 0 END), 0) AS age_0_30,
                COALESCE(SUM(CASE WHEN julianday('2026-08-29') - julianday(s.date) BETWEEN 31 AND 60 THEN s.dues ELSE 0 END), 0) AS age_31_60,
                COALESCE(SUM(CASE WHEN julianday('2026-08-29') - julianday(s.date) BETWEEN 61 AND 90 THEN s.dues ELSE 0 END), 0) AS age_61_90,
                COALESCE(SUM(CASE WHEN julianday('2026-08-29') - julianday(s.date) > 90 THEN s.dues ELSE 0 END), 0) AS age_above_90,
                COALESCE(SUM(s.dues), 0) AS total_outstanding
            FROM customers c
            JOIN sales_transactions s ON c.id = s.customer_id
            GROUP BY c.id, c.code, c.name
            HAVING total_outstanding > 0
            ORDER BY total_outstanding DESC
        `;
        const rows = db.prepare(sql).all();
        const formatted = rows.map(r => ({
            ...r,
            formatted: {
                age_0_30: formatSouthAsianNumber(r.age_0_30),
                age_31_60: formatSouthAsianNumber(r.age_31_60),
                age_61_90: formatSouthAsianNumber(r.age_61_90),
                age_above_90: formatSouthAsianNumber(r.age_above_90),
                total_outstanding: formatSouthAsianNumber(r.total_outstanding)
            }
        }));
        res.json({ status: 'success', data: formatted });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/reports/outstanding', (req, res) => {
    try {
        const sql = `
            SELECT 
                c.id, c.code, c.name, c.phone, c.territory, c.credit_limit,
                COALESCE(SUM(s.total_price), 0) AS total_bill,
                COALESCE(SUM(s.coll_cash), 0) AS total_recovered,
                COALESCE(SUM(s.dues), 0) AS current_dues,
                MAX(s.date) AS last_activity
            FROM customers c
            JOIN sales_transactions s ON c.id = s.customer_id
            GROUP BY c.id, c.code, c.name, c.phone, c.territory, c.credit_limit
            ORDER BY current_dues DESC
        `;
        const rows = db.prepare(sql).all();
        res.json({
            status: 'success',
            data: rows.map(r => ({
                ...r,
                formatted: {
                    total_bill: formatSouthAsianNumber(r.total_bill),
                    total_recovered: formatSouthAsianNumber(r.total_recovered),
                    current_dues: formatSouthAsianNumber(r.current_dues),
                    credit_limit: formatSouthAsianNumber(r.credit_limit)
                }
            }))
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/reports/product-wise-customers', (req, res) => {
    try {
        const sql = `
            SELECT 
                p.id AS product_id, p.name AS product_name, p.pack_size, p.trade_price,
                c.name AS customer_name, c.territory,
                SUM(s.qty) AS qty_bought,
                SUM(s.total_price) AS amount
            FROM sales_transactions s
            JOIN products p ON s.product_id = p.id
            JOIN customers c ON s.customer_id = c.id
            GROUP BY p.id, c.id
            ORDER BY p.name ASC, amount DESC
        `;
        const rows = db.prepare(sql).all();
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/reports/outstanding-confirmation', (req, res) => {
    try {
        const sql = `
            SELECT 
                oc.id, oc.confirmed_amount, oc.confirmed_date, oc.confirmed_by, oc.status, oc.remarks,
                c.name AS customer_name, c.code AS customer_code,
                (SELECT COALESCE(SUM(dues),0) FROM sales_transactions WHERE customer_id = c.id) AS system_dues
            FROM outstanding_confirmations oc
            JOIN customers c ON oc.customer_id = c.id
            ORDER BY oc.confirmed_date DESC
        `;
        const rows = db.prepare(sql).all();
        res.json({
            status: 'success',
            data: rows.map(r => ({
                ...r,
                formatted: {
                    confirmed_amount: formatSouthAsianNumber(r.confirmed_amount),
                    system_dues: formatSouthAsianNumber(r.system_dues)
                }
            }))
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// --------------------------------------------------------------------------
// 8. COLLECTION & BILLS MODULES
// --------------------------------------------------------------------------
app.get('/api/collections', (req, res) => {
    try {
        const sql = `
            SELECT col.id, col.receipt_no, col.date, col.amount, col.payment_method, col.bank_name, col.notes,
                   c.name AS customer_name, e.name AS employee_name
            FROM collections col
            JOIN customers c ON col.customer_id = c.id
            JOIN employees e ON col.employee_id = e.id
            ORDER BY col.date DESC
        `;
        const rows = db.prepare(sql).all();
        res.json({
            status: 'success',
            data: rows.map(r => ({
                ...r,
                amount_formatted: formatSouthAsianNumber(r.amount)
            }))
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/collections', (req, res) => {
    try {
        const { customer_id, employee_id, date, amount, payment_method, bank_name, notes } = req.body;
        const receiptNo = 'COL-' + Date.now().toString().slice(-6);

        const stmt = db.prepare(`
            INSERT INTO collections (receipt_no, date, customer_id, employee_id, amount, payment_method, bank_name, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(receiptNo, date, customer_id, employee_id, amount, payment_method || 'Cash', bank_name || '', notes || '');
        res.status(201).json({ status: 'success', receiptNo, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/products', (req, res) => {
    try {
        const rows = db.prepare('SELECT id, code, name, pack_size, trade_price, category, stock_qty FROM products ORDER BY name').all();
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/products', (req, res) => {
    try {
        const { code, name, pack_size, trade_price, category, stock_qty } = req.body;
        const stmt = db.prepare(`
            INSERT INTO products (code, name, pack_size, trade_price, category, stock_qty)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(code, name, pack_size, trade_price, category || 'Agrovet', stock_qty || 500);
        res.status(201).json({ status: 'success', id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/employees', (req, res) => {
    try {
        const rows = db.prepare('SELECT id, code, name, designation, phone, territory FROM employees ORDER BY code').all();
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/employees', (req, res) => {
    try {
        const { code, name, designation, phone, territory } = req.body;
        if (!code || !name) return res.status(400).json({ status: 'error', message: 'Code and Name are required' });
        const stmt = db.prepare(`
            INSERT INTO employees (code, name, designation, phone, territory)
            VALUES (?, ?, ?, ?, ?)
        `);
        const result = stmt.run(code.trim(), name.trim(), designation ? designation.trim() : 'TSO', phone ? phone.trim() : '', territory ? territory.trim() : 'Territory');
        res.status(201).json({ status: 'success', message: 'Employee added to SQLite', id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/customers', (req, res) => {
    try {
        const rows = db.prepare('SELECT id, code, name, phone, address, territory FROM customers ORDER BY name').all();
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/bills', (req, res) => {
    try {
        const sql = `
            SELECT s.id, s.invoice_no, s.date, s.qty, s.unit_price, s.total_price, s.dues, s.coll_cash, s.notes,
                   c.name AS customer_name, c.address, p.name AS product_name, e.name AS employee_name
            FROM sales_transactions s
            JOIN customers c ON s.customer_id = c.id
            JOIN products p ON s.product_id = p.id
            JOIN employees e ON s.employee_id = e.id
            ORDER BY s.date DESC
        `;
        const rows = db.prepare(sql).all();
        res.json({
            status: 'success',
            data: rows.map(b => ({
                ...b,
                total_price_formatted: formatSouthAsianNumber(b.total_price),
                dues_formatted: formatSouthAsianNumber(b.dues)
            }))
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/transactions', (req, res) => {
    try {
        const {
            employee_id, customer_id, product_id, date, qty, unit_price,
            bonus_qty, discount_amt, dues, coll_cash, coll_comm, notes
        } = req.body;

        if (!employee_id || !date || !qty) {
            return res.status(400).json({ status: 'error', message: 'Missing required fields' });
        }

        const calculatedTotal = Number(qty) * Number(unit_price || 0);
        const invoiceNo = 'INV-' + Date.now().toString().slice(-6);

        const insertStmt = db.prepare(`
            INSERT INTO sales_transactions (
                invoice_no, date, employee_id, customer_id, product_id,
                qty, unit_price, total_price, bonus_qty, discount_amt,
                dues, coll_cash, coll_comm, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = insertStmt.run(
            invoiceNo, date, Number(employee_id),
            customer_id ? Number(customer_id) : null,
            product_id ? Number(product_id) : null,
            Number(qty), Number(unit_price || 0), calculatedTotal,
            Number(bonus_qty || 0), Number(discount_amt || 0),
            Number(dues || 0), Number(coll_cash || 0), Number(coll_comm || 0),
            notes || ''
        );

        res.status(201).json({
            status: 'success',
            message: 'Transaction saved to SQLite database successfully',
            insertedId: result.lastInsertRowid,
            invoiceNo
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` SOHA ENTERPRISE ERP Server running on:`);
    console.log(` Local:   http://localhost:${PORT}`);
    console.log(` SQLite Database: Connected with RBAC & Sessions`);
    console.log(`=======================================================`);
});
