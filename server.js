// server.js - Real Express Backend for SOHA ENTERPRISE ERP with Supabase PostgreSQL Persistence & RBAC
const express = require('express');
const cors = require('cors');
const path = require('node:path');
require('dotenv').config();
const db = require('./db/postgres');
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
// AUTHENTICATION HELPER
// --------------------------------------------------------------------------
async function getAuthUser(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return null;
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;

    try {
        const queryText = `
            SELECT s.token, s.expires_at, u.id, u.username, u.full_name, u.role, u.phone, u.employee_id, u.is_active,
                   e.code AS employee_code, e.designation AS employee_desig
            FROM user_sessions s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN employees e ON u.employee_id = e.id
            WHERE s.token = $1 AND NOW() < s.expires_at AND u.is_active = 1
        `;
        const res = await db.query(queryText, [token]);
        return res.rows[0] || null;
    } catch (err) {
        console.error('getAuthUser error:', err);
        return null;
    }
}

// --------------------------------------------------------------------------
// 1. AUTHENTICATION & SESSION ENDPOINTS
// --------------------------------------------------------------------------

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ status: 'error', message: 'Username and password are required' });
        }

        const queryText = `
            SELECT u.id, u.username, u.password_hash, u.salt, u.full_name, u.role, u.phone, u.employee_id, u.is_active,
                   e.code AS employee_code, e.designation AS employee_desig
            FROM users u
            LEFT JOIN employees e ON u.employee_id = e.id
            WHERE u.username = $1
        `;
        const userResult = await db.query(queryText, [username.trim()]);
        const user = userResult.rows[0];

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
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await db.query(
            'INSERT INTO user_sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
            [token, user.id, expiresAt]
        );

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
app.get('/api/auth/me', async (req, res) => {
    try {
        const user = await getAuthUser(req);
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
app.post('/api/auth/logout', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            const token = authHeader.replace(/^Bearer\s+/i, '').trim();
            await db.query('DELETE FROM user_sessions WHERE token = $1', [token]);
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
app.get('/api/users', async (req, res) => {
    try {
        const sql = `
            SELECT u.id, u.username, u.full_name, u.role, u.phone, u.employee_id, u.is_active, u.created_at,
                   e.code AS employee_code, e.name AS employee_name, e.designation AS employee_desig
            FROM users u
            LEFT JOIN employees e ON u.employee_id = e.id
            ORDER BY u.id ASC
        `;
        const result = await db.query(sql);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Create New Sub-Account
app.post('/api/users', async (req, res) => {
    try {
        const { username, password, full_name, role, phone, employee_id } = req.body;

        if (!username || !password || !full_name) {
            return res.status(400).json({ status: 'error', message: 'Username, password, and full name are required' });
        }

        const validRoles = ['sub_admin', 'tso_officer'];
        const chosenRole = validRoles.includes(role) ? role : 'tso_officer';

        // Check if username already exists
        const existingRes = await db.query('SELECT id FROM users WHERE username = $1', [username.trim()]);
        if (existingRes.rows.length > 0) {
            return res.status(409).json({ status: 'error', message: 'Username already taken. Please choose another username.' });
        }

        const salt = generateSalt();
        const hash = hashPassword(password, salt);

        let linkedEmpId = employee_id ? Number(employee_id) : null;
        if (!linkedEmpId && chosenRole === 'tso_officer') {
            const empRes = await db.query('SELECT id FROM employees WHERE code = $1', [username.trim()]);
            if (empRes.rows.length === 0) {
                const newEmp = await db.query(
                    `INSERT INTO employees (code, name, designation, phone, territory)
                     VALUES ($1, $2, 'TSO', $3, 'Official Territory')
                     RETURNING id`,
                    [username.trim(), full_name.trim(), phone ? phone.trim() : '']
                );
                linkedEmpId = newEmp.rows[0].id;
            } else {
                linkedEmpId = empRes.rows[0].id;
            }
        }

        const insertUser = await db.query(
            `INSERT INTO users (username, password_hash, salt, full_name, role, phone, employee_id, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
             RETURNING id`,
            [username.trim(), hash, salt, full_name.trim(), chosenRole, phone ? phone.trim() : null, linkedEmpId]
        );

        res.status(201).json({
            status: 'success',
            message: `Sub-Account '${username}' created successfully in Supabase PostgreSQL!`,
            userId: insertUser.rows[0].id
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Toggle Sub-Account Active / Inactive
app.patch('/api/users/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const userRes = await db.query('SELECT id, role, is_active FROM users WHERE id = $1', [id]);
        const user = userRes.rows[0];

        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        if (user.role === 'main_admin') {
            return res.status(403).json({ status: 'error', message: 'Cannot deactivate the Main Admin account' });
        }

        const newStatus = user.is_active ? 0 : 1;
        await db.query('UPDATE users SET is_active = $1 WHERE id = $2', [newStatus, id]);

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
app.get('/api/dashboard/kpi', async (req, res) => {
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
            WHERE (to_char(s.date, 'YYYY-MM') = to_char(CURRENT_DATE, 'YYYY-MM') OR to_char(s.date, 'YYYY-MM') = '2026-08')
        `;

        const ytdParams = [];
        const mtdParams = [];

        if (empCode && empCode !== 'ADMIN') {
            ytdSql += ` JOIN employees e ON s.employee_id = e.id WHERE e.code = $1 `;
            ytdParams.push(empCode);

            mtdSql += ` AND s.employee_id = (SELECT id FROM employees WHERE code = $1) `;
            mtdParams.push(empCode);
        }

        const ytdRes = await db.query(ytdSql, ytdParams);
        const mtdRes = await db.query(mtdSql, mtdParams);
        const custCountRes = await db.query('SELECT COUNT(*) AS total FROM customers');

        const ytd = ytdRes.rows[0] || { ytd_sales: 0, ytd_qty: 0, total_collected: 0, total_dues: 0 };
        const mtd = mtdRes.rows[0] || { mtd_sales: 0, mtd_qty: 0, mtd_collected: 0 };
        const totalCustomers = Number(custCountRes.rows[0]?.total || 0);

        const topProductRes = await db.query(`
            SELECT p.name, SUM(s.total_price) AS revenue, SUM(s.qty) AS qty
            FROM sales_transactions s
            JOIN products p ON s.product_id = p.id
            GROUP BY p.id, p.name
            ORDER BY revenue DESC
            LIMIT 1
        `);
        const topProduct = topProductRes.rows[0] || { name: 'N/A', revenue: 0, qty: 0 };

        const recentOrdersRes = await db.query(`
            SELECT s.invoice_no, s.date, c.name AS customer_name, p.name AS product_name, s.qty, s.total_price, s.dues
            FROM sales_transactions s
            LEFT JOIN customers c ON s.customer_id = c.id
            LEFT JOIN products p ON s.product_id = p.id
            ORDER BY s.date DESC
            LIMIT 5
        `);

        res.json({
            status: 'success',
            kpis: {
                ytdSales: formatSouthAsianNumber(ytd.ytd_sales),
                ytdSalesRaw: Number(ytd.ytd_sales),
                ytdQty: Number(ytd.ytd_qty).toLocaleString(),
                totalCollected: formatSouthAsianNumber(ytd.total_collected),
                totalDues: formatSouthAsianNumber(ytd.total_dues),
                mtdSales: formatSouthAsianNumber(mtd.mtd_sales),
                totalCustomers: totalCustomers,
                topProduct: {
                    name: topProduct.name,
                    revenue: formatSouthAsianNumber(topProduct.revenue)
                }
            },
            recentOrders: recentOrdersRes.rows.map(o => ({
                ...o,
                total_price_formatted: formatSouthAsianNumber(o.total_price),
                dues_formatted: formatSouthAsianNumber(o.dues)
            }))
        });
    } catch (err) {
        console.error('KPI error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// --------------------------------------------------------------------------
// 4. MY BUSINESS REPORT (Core APEX Grid)
// --------------------------------------------------------------------------
app.get('/api/reports/my-business', async (req, res) => {
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
                AND s.date >= $1
                AND s.date <= $2
        `;

        const params = [fromDate, toDate];

        if (empCode && empCode !== 'ADMIN') {
            sql += ` WHERE e.code = $3 `;
            params.push(empCode);
        }

        sql += ` GROUP BY e.id, e.code, e.name, e.designation, e.phone, e.territory ORDER BY e.code ASC `;

        const result = await db.query(sql, params);
        const rows = result.rows;

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
        console.error('my-business report error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/reports/detail/:code', async (req, res) => {
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
            WHERE e.code = $1
              AND s.date >= $2
              AND s.date <= $3
            ORDER BY s.date DESC
        `;

        const result = await db.query(sql, [code, fromDate, toDate]);
        res.json({ status: 'success', code, count: result.rows.length, data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// --------------------------------------------------------------------------
// 5. FORECAST MODULES (Review, Entry, Report)
// --------------------------------------------------------------------------
app.get('/api/forecasts/review', async (req, res) => {
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
                AND to_char(s.date, 'YYYY-MM') = f.year_month
            WHERE f.year_month = $1
        `;

        const params = [month];
        if (empCode && empCode !== 'ADMIN') {
            sql += ` AND e.code = $2 `;
            params.push(empCode);
        }

        sql += ` GROUP BY f.id, p.code, p.name, f.target_qty, f.target_amount ORDER BY p.name ASC `;

        const result = await db.query(sql, params);
        const rows = result.rows;

        const data = rows.map(r => {
            const targetQty = Number(r.target_qty);
            const actualQty = Number(r.actual_qty);
            const achievementPct = targetQty > 0 ? ((actualQty / targetQty) * 100).toFixed(1) : '0.0';
            return {
                ...r,
                achievement_pct: Number(achievementPct),
                formatted: {
                    target_qty: targetQty.toLocaleString(),
                    actual_qty: actualQty.toLocaleString(),
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

app.post('/api/forecasts', async (req, res) => {
    try {
        const { employee_id, product_id, year_month, target_qty, target_amount, notes } = req.body;
        if (!employee_id || !product_id || !year_month || !target_qty) {
            return res.status(400).json({ status: 'error', message: 'Missing required forecast fields' });
        }

        const sql = `
            INSERT INTO forecasts (employee_id, product_id, year_month, target_qty, target_amount, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (employee_id, product_id, year_month)
            DO UPDATE SET target_qty = EXCLUDED.target_qty, target_amount = EXCLUDED.target_amount, notes = EXCLUDED.notes
            RETURNING id
        `;
        const result = await db.query(sql, [employee_id, product_id, year_month, target_qty, target_amount || 0, notes || '']);
        res.status(201).json({ status: 'success', message: 'Forecast target recorded in Supabase PostgreSQL', id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/forecasts/report', async (req, res) => {
    try {
        const sql = `
            SELECT 
                f.year_month,
                e.name AS employee_name,
                COUNT(f.product_id) AS total_products_targeted,
                SUM(f.target_qty) AS total_target_qty,
                SUM(f.target_amount) AS total_target_amount,
                (SELECT COALESCE(SUM(qty),0) FROM sales_transactions WHERE to_char(date, 'YYYY-MM') = f.year_month AND employee_id = e.id) AS total_actual_qty,
                (SELECT COALESCE(SUM(total_price),0) FROM sales_transactions WHERE to_char(date, 'YYYY-MM') = f.year_month AND employee_id = e.id) AS total_actual_amount
            FROM forecasts f
            JOIN employees e ON f.employee_id = e.id
            GROUP BY f.year_month, e.id, e.name
            ORDER BY f.year_month DESC
        `;
        const result = await db.query(sql);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// --------------------------------------------------------------------------
// 6. CUSTOMERS & OUTSTANDING MODULES
// --------------------------------------------------------------------------
app.get('/api/reports/my-customers', async (req, res) => {
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
        const result = await db.query(sql);
        const formatted = result.rows.map(c => ({
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

app.post('/api/customers', async (req, res) => {
    try {
        const { code, name, phone, address, territory, credit_limit } = req.body;
        if (!code || !name) return res.status(400).json({ status: 'error', message: 'Code and Name are required' });

        const sql = `
            INSERT INTO customers (code, name, phone, address, territory, credit_limit)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `;
        const result = await db.query(sql, [
            code.trim(),
            name.trim(),
            phone ? phone.trim() : '',
            address ? address.trim() : '',
            territory ? territory.trim() : 'Dhaka Region',
            credit_limit ? Number(credit_limit) : 1000000
        ]);
        res.status(201).json({ status: 'success', message: 'Customer added to Supabase PostgreSQL', id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// --------------------------------------------------------------------------
// 7. COMPARISON & ANALYTICS REPORTS
// --------------------------------------------------------------------------
app.get('/api/reports/comparison', async (req, res) => {
    try {
        const currentMonthRes = await db.query(`
            SELECT 
                'August 2026 (Current)' AS period,
                COALESCE(SUM(qty), 0) AS total_qty,
                COALESCE(SUM(total_price), 0) AS total_sales,
                COALESCE(SUM(coll_cash), 0) AS total_coll,
                COALESCE(SUM(dues), 0) AS total_dues
            FROM sales_transactions
            WHERE (to_char(date, 'YYYY-MM') = '2026-08' OR to_char(date, 'YYYY-MM') = to_char(CURRENT_DATE, 'YYYY-MM'))
        `);

        const priorMonthRes = await db.query(`
            SELECT 
                'July 2026 (Prior)' AS period,
                COALESCE(SUM(qty), 0) AS total_qty,
                COALESCE(SUM(total_price), 0) AS total_sales,
                COALESCE(SUM(coll_cash), 0) AS total_coll,
                COALESCE(SUM(dues), 0) AS total_dues
            FROM sales_transactions
            WHERE (to_char(date, 'YYYY-MM') = '2026-07' OR (date >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month') AND date < DATE_TRUNC('month', CURRENT_DATE)))
        `);

        const currentMonth = currentMonthRes.rows[0];
        const priorMonth = priorMonthRes.rows[0];

        res.json({
            status: 'success',
            periods: [
                {
                    ...currentMonth,
                    formatted: {
                        total_qty: Number(currentMonth.total_qty).toLocaleString(),
                        total_sales: formatSouthAsianNumber(currentMonth.total_sales),
                        total_coll: formatSouthAsianNumber(currentMonth.total_coll),
                        total_dues: formatSouthAsianNumber(currentMonth.total_dues)
                    }
                },
                {
                    ...priorMonth,
                    formatted: {
                        total_qty: Number(priorMonth.total_qty).toLocaleString(),
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

app.get('/api/reports/customer-wise-products', async (req, res) => {
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
            GROUP BY c.id, c.name, c.territory, p.id, p.name
            ORDER BY total_amount DESC
        `;
        const result = await db.query(sql);
        const formatted = result.rows.map(r => ({
            ...r,
            formatted: {
                total_qty: Number(r.total_qty).toLocaleString(),
                total_amount: formatSouthAsianNumber(r.total_amount)
            }
        }));
        res.json({ status: 'success', data: formatted });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/reports/top-products', async (req, res) => {
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
        const result = await db.query(sql);
        res.json({
            status: 'success',
            data: result.rows.map((r, idx) => ({
                rank: idx + 1,
                ...r,
                formatted: {
                    total_sold_qty: Number(r.total_sold_qty).toLocaleString(),
                    total_revenue: formatSouthAsianNumber(r.total_revenue)
                }
            }))
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/reports/ageing', async (req, res) => {
    try {
        const sql = `
            SELECT 
                c.id, c.code, c.name AS customer_name,
                COALESCE(SUM(CASE WHEN (CURRENT_DATE - s.date) <= 30 THEN s.dues ELSE 0 END), 0) AS age_0_30,
                COALESCE(SUM(CASE WHEN (CURRENT_DATE - s.date) BETWEEN 31 AND 60 THEN s.dues ELSE 0 END), 0) AS age_31_60,
                COALESCE(SUM(CASE WHEN (CURRENT_DATE - s.date) BETWEEN 61 AND 90 THEN s.dues ELSE 0 END), 0) AS age_61_90,
                COALESCE(SUM(CASE WHEN (CURRENT_DATE - s.date) > 90 THEN s.dues ELSE 0 END), 0) AS age_above_90,
                COALESCE(SUM(s.dues), 0) AS total_outstanding
            FROM customers c
            JOIN sales_transactions s ON c.id = s.customer_id
            GROUP BY c.id, c.code, c.name
            HAVING COALESCE(SUM(s.dues), 0) > 0
            ORDER BY total_outstanding DESC
        `;
        const result = await db.query(sql);
        const formatted = result.rows.map(r => ({
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

app.get('/api/reports/outstanding', async (req, res) => {
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
        const result = await db.query(sql);
        res.json({
            status: 'success',
            data: result.rows.map(r => ({
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

app.get('/api/reports/product-wise-customers', async (req, res) => {
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
            GROUP BY p.id, p.name, p.pack_size, p.trade_price, c.id, c.name, c.territory
            ORDER BY p.name ASC, amount DESC
        `;
        const result = await db.query(sql);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/reports/outstanding-confirmation', async (req, res) => {
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
        const result = await db.query(sql);
        res.json({
            status: 'success',
            data: result.rows.map(r => ({
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
app.get('/api/collections', async (req, res) => {
    try {
        const sql = `
            SELECT col.id, col.receipt_no, col.date, col.amount, col.payment_method, col.bank_name, col.notes,
                   c.name AS customer_name, e.name AS employee_name
            FROM collections col
            JOIN customers c ON col.customer_id = c.id
            JOIN employees e ON col.employee_id = e.id
            ORDER BY col.date DESC
        `;
        const result = await db.query(sql);
        res.json({
            status: 'success',
            data: result.rows.map(r => ({
                ...r,
                amount_formatted: formatSouthAsianNumber(r.amount)
            }))
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/collections', async (req, res) => {
    try {
        const { customer_id, employee_id, date, amount, payment_method, bank_name, notes } = req.body;
        const receiptNo = 'COL-' + Date.now().toString().slice(-6);

        const sql = `
            INSERT INTO collections (receipt_no, date, customer_id, employee_id, amount, payment_method, bank_name, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `;
        const result = await db.query(sql, [
            receiptNo,
            date,
            customer_id ? Number(customer_id) : null,
            employee_id ? Number(employee_id) : null,
            Number(amount || 0),
            payment_method || 'Cash',
            bank_name || '',
            notes || ''
        ]);
        res.status(201).json({ status: 'success', receiptNo, id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const result = await db.query('SELECT id, code, name, pack_size, trade_price, category, stock_qty FROM products ORDER BY name');
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { code, name, pack_size, trade_price, category, stock_qty } = req.body;
        const sql = `
            INSERT INTO products (code, name, pack_size, trade_price, category, stock_qty)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `;
        const result = await db.query(sql, [
            code.trim(),
            name.trim(),
            pack_size ? pack_size.trim() : '',
            Number(trade_price || 0),
            category || 'Agrovet',
            Number(stock_qty || 500)
        ]);
        res.status(201).json({ status: 'success', id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/employees', async (req, res) => {
    try {
        const result = await db.query('SELECT id, code, name, designation, phone, territory FROM employees ORDER BY code');
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/employees', async (req, res) => {
    try {
        const { code, name, designation, phone, territory } = req.body;
        if (!code || !name) return res.status(400).json({ status: 'error', message: 'Code and Name are required' });

        const sql = `
            INSERT INTO employees (code, name, designation, phone, territory)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `;
        const result = await db.query(sql, [
            code.trim(),
            name.trim(),
            designation ? designation.trim() : 'TSO',
            phone ? phone.trim() : '',
            territory ? territory.trim() : 'Territory'
        ]);
        res.status(201).json({ status: 'success', message: 'Employee added to Supabase PostgreSQL', id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/customers', async (req, res) => {
    try {
        const result = await db.query('SELECT id, code, name, phone, address, territory, credit_limit FROM customers ORDER BY name');
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// --------------------------------------------------------------------------
// 8. BILLS & INVOICE MANAGEMENT (MULTI-PRODUCT & EDITABLE INVOICES)
// --------------------------------------------------------------------------

// GET /api/bills - All Invoices with Customer Details & Product Line Items
app.get('/api/bills', async (req, res) => {
    try {
        const sql = `
            SELECT 
                inv.id, inv.invoice_no, inv.date, inv.subtotal, inv.discount_amt, inv.total_price, inv.coll_cash, inv.dues, inv.notes,
                c.id AS customer_id, c.name AS customer_name, c.code AS customer_code, c.phone AS customer_phone, c.address, c.territory,
                e.id AS employee_id, e.name AS employee_name, e.code AS employee_code,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', it.id,
                            'product_id', it.product_id,
                            'product_name', p.name,
                            'product_code', p.code,
                            'pack_size', p.pack_size,
                            'qty', it.qty,
                            'unit_price', it.unit_price,
                            'total_price', it.total_price,
                            'bonus_qty', it.bonus_qty
                        ) ORDER BY it.id ASC
                    ) FILTER (WHERE it.id IS NOT NULL), '[]'::json
                ) AS items
            FROM invoices inv
            LEFT JOIN customers c ON inv.customer_id = c.id
            LEFT JOIN employees e ON inv.employee_id = e.id
            LEFT JOIN invoice_items it ON inv.id = it.invoice_id
            LEFT JOIN products p ON it.product_id = p.id
            GROUP BY inv.id, c.id, e.id
            ORDER BY inv.date DESC, inv.id DESC
        `;
        const result = await db.query(sql);

        // If no invoices exist yet in invoices table, fallback query from sales_transactions
        if (result.rows.length === 0) {
            const legacySql = `
                SELECT s.id, s.invoice_no, s.date, s.qty, s.unit_price, s.total_price, s.dues, s.coll_cash, s.notes,
                       c.id AS customer_id, c.name AS customer_name, c.address, c.phone AS customer_phone,
                       p.id AS product_id, p.name AS product_name, e.id AS employee_id, e.name AS employee_name
                FROM sales_transactions s
                LEFT JOIN customers c ON s.customer_id = c.id
                LEFT JOIN products p ON s.product_id = p.id
                LEFT JOIN employees e ON s.employee_id = e.id
                ORDER BY s.date DESC
            `;
            const legacyRes = await db.query(legacySql);
            return res.json({
                status: 'success',
                data: legacyRes.rows.map(b => ({
                    ...b,
                    subtotal: b.total_price,
                    discount_amt: 0,
                    subtotal_formatted: formatSouthAsianNumber(b.total_price),
                    discount_amt_formatted: '0',
                    total_price_formatted: formatSouthAsianNumber(b.total_price),
                    coll_cash_formatted: formatSouthAsianNumber(b.coll_cash),
                    dues_formatted: formatSouthAsianNumber(b.dues),
                    items_count: 1,
                    products_summary: `${b.product_name || 'Item'} (${b.qty})`,
                    items: [{
                        product_id: b.product_id,
                        product_name: b.product_name,
                        qty: b.qty,
                        unit_price: b.unit_price,
                        total_price: b.total_price,
                        bonus_qty: 0
                    }]
                }))
            });
        }

        res.json({
            status: 'success',
            data: result.rows.map(b => ({
                ...b,
                subtotal_formatted: formatSouthAsianNumber(b.subtotal),
                discount_amt_formatted: formatSouthAsianNumber(b.discount_amt),
                total_price_formatted: formatSouthAsianNumber(b.total_price),
                coll_cash_formatted: formatSouthAsianNumber(b.coll_cash),
                dues_formatted: formatSouthAsianNumber(b.dues),
                items_count: b.items.length,
                products_summary: b.items.map(i => `${i.product_name || 'Product'} (${i.qty})`).join(', ') || 'No items'
            }))
        });
    } catch (err) {
        console.error('Error fetching bills:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// GET /api/invoices/:invoice_no - Single Invoice Detail for View / Edit / Print
app.get('/api/invoices/:invoice_no', async (req, res) => {
    try {
        const { invoice_no } = req.params;
        const sql = `
            SELECT 
                inv.id, inv.invoice_no, inv.date, inv.subtotal, inv.discount_amt, inv.total_price, inv.coll_cash, inv.dues, inv.notes,
                c.id AS customer_id, c.name AS customer_name, c.code AS customer_code, c.phone AS customer_phone, c.address, c.territory,
                e.id AS employee_id, e.name AS employee_name, e.code AS employee_code,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', it.id,
                            'product_id', it.product_id,
                            'product_name', p.name,
                            'product_code', p.code,
                            'pack_size', p.pack_size,
                            'qty', it.qty,
                            'unit_price', it.unit_price,
                            'total_price', it.total_price,
                            'bonus_qty', it.bonus_qty
                        ) ORDER BY it.id ASC
                    ) FILTER (WHERE it.id IS NOT NULL), '[]'::json
                ) AS items
            FROM invoices inv
            LEFT JOIN customers c ON inv.customer_id = c.id
            LEFT JOIN employees e ON inv.employee_id = e.id
            LEFT JOIN invoice_items it ON inv.id = it.invoice_id
            LEFT JOIN products p ON it.product_id = p.id
            WHERE inv.invoice_no = $1
            GROUP BY inv.id, c.id, e.id
        `;
        const result = await db.query(sql, [invoice_no]);
        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Invoice not found' });
        }
        const b = result.rows[0];
        res.json({
            status: 'success',
            invoice: {
                ...b,
                subtotal_formatted: formatSouthAsianNumber(b.subtotal),
                discount_amt_formatted: formatSouthAsianNumber(b.discount_amt),
                total_price_formatted: formatSouthAsianNumber(b.total_price),
                coll_cash_formatted: formatSouthAsianNumber(b.coll_cash),
                dues_formatted: formatSouthAsianNumber(b.dues)
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/invoices - Create OR Update Multi-Product Invoice (Edit customer bill)
app.post('/api/invoices', async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const {
            invoice_no,
            date,
            customer_id,
            employee_id,
            items,
            discount_amt,
            coll_cash,
            notes
        } = req.body;

        if (!customer_id || !employee_id || !date || !items || !Array.isArray(items) || items.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'Customer, Sales Officer, Date, and at least one Product item are required' });
        }

        // Calculate totals across all items
        let subtotal = 0;
        const processedItems = items.map(it => {
            const qty = Number(it.qty) || 1;
            const unit_price = Number(it.unit_price) || 0;
            const line_total = qty * unit_price;
            subtotal += line_total;
            return {
                product_id: Number(it.product_id),
                qty,
                unit_price,
                bonus_qty: Number(it.bonus_qty) || 0,
                total_price: line_total
            };
        });

        const discount = Number(discount_amt) || 0;
        const total_price = Math.max(0, subtotal - discount);
        const paid_cash = Number(coll_cash) || 0;
        const dues = Math.max(0, total_price - paid_cash);

        let finalInvoiceNo = invoice_no ? invoice_no.trim() : '';
        let invoiceId;
        let isEdit = false;

        if (finalInvoiceNo) {
            const checkRes = await client.query('SELECT id FROM invoices WHERE invoice_no = $1', [finalInvoiceNo]);
            if (checkRes.rows.length > 0) {
                isEdit = true;
                invoiceId = checkRes.rows[0].id;
                await client.query(`
                    UPDATE invoices 
                    SET date = $1, customer_id = $2, employee_id = $3, subtotal = $4, discount_amt = $5,
                        total_price = $6, coll_cash = $7, dues = $8, notes = $9, updated_at = NOW()
                    WHERE id = $10
                `, [date, Number(customer_id), Number(employee_id), subtotal, discount, total_price, paid_cash, dues, notes || '', invoiceId]);

                // Delete old items & old sales_transactions for this invoice
                await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
                await client.query('DELETE FROM sales_transactions WHERE invoice_no = $1', [finalInvoiceNo]);
            }
        }

        if (!isEdit) {
            if (!finalInvoiceNo) {
                finalInvoiceNo = 'INV-' + Date.now().toString().slice(-6);
            }
            const insRes = await client.query(`
                INSERT INTO invoices (invoice_no, date, customer_id, employee_id, subtotal, discount_amt, total_price, coll_cash, dues, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
            `, [finalInvoiceNo, date, Number(customer_id), Number(employee_id), subtotal, discount, total_price, paid_cash, dues, notes || '']);
            invoiceId = insRes.rows[0].id;
        }

        // Insert new invoice_items and sync to sales_transactions
        for (let i = 0; i < processedItems.length; i++) {
            const it = processedItems[i];
            await client.query(`
                INSERT INTO invoice_items (invoice_id, invoice_no, product_id, qty, unit_price, total_price, bonus_qty)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [invoiceId, finalInvoiceNo, it.product_id, it.qty, it.unit_price, it.total_price, it.bonus_qty]);

            // Sync with sales_transactions: only the first row carries header discount/cash/dues to prevent double-counting in legacy sums
            const rowDiscount = i === 0 ? discount : 0;
            const rowCollCash = i === 0 ? paid_cash : 0;
            const rowDues = i === 0 ? dues : 0;

            await client.query(`
                INSERT INTO sales_transactions (
                    invoice_no, date, employee_id, customer_id, product_id,
                    qty, unit_price, total_price, bonus_qty, discount_amt,
                    dues, coll_cash, coll_comm, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, $13)
            `, [
                finalInvoiceNo, date, Number(employee_id), Number(customer_id), it.product_id,
                it.qty, it.unit_price, it.total_price, it.bonus_qty, rowDiscount,
                rowDues, rowCollCash, notes || ''
            ]);
        }

        await client.query('COMMIT');

        res.status(200).json({
            status: 'success',
            message: isEdit 
                ? `Invoice ${finalInvoiceNo} updated successfully! Customer bill updated with new items.`
                : `Invoice ${finalInvoiceNo} generated successfully with ${processedItems.length} product(s)!`,
            invoice_no: finalInvoiceNo,
            invoice_id: invoiceId,
            is_edit: isEdit,
            subtotal,
            total_price,
            dues
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Invoice save error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
});

// POST /api/transactions (Legacy single item endpoint - redirects to multi-item logic)
app.post('/api/transactions', async (req, res) => {
    try {
        const {
            invoice_no, employee_id, customer_id, product_id, date, qty, unit_price,
            bonus_qty, discount_amt, dues, coll_cash, notes
        } = req.body;

        if (!employee_id || !date || !qty || !product_id) {
            return res.status(400).json({ status: 'error', message: 'Missing required fields' });
        }

        // Forward to /api/invoices logic
        const items = [{
            product_id: Number(product_id),
            qty: Number(qty),
            unit_price: Number(unit_price || 0),
            bonus_qty: Number(bonus_qty || 0)
        }];

        const forwardReq = {
            body: {
                invoice_no,
                date,
                customer_id,
                employee_id,
                items,
                discount_amt,
                coll_cash,
                notes
            }
        };

        // Reuse /api/invoices logic via direct query
        const calculatedTotal = Number(qty) * Number(unit_price || 0);
        const finalInvoiceNo = invoice_no || ('INV-' + Date.now().toString().slice(-6));

        const insRes = await db.query(`
            INSERT INTO invoices (invoice_no, date, customer_id, employee_id, subtotal, discount_amt, total_price, coll_cash, dues, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (invoice_no) DO UPDATE 
            SET date = EXCLUDED.date, customer_id = EXCLUDED.customer_id, employee_id = EXCLUDED.employee_id,
                subtotal = EXCLUDED.subtotal, discount_amt = EXCLUDED.discount_amt, total_price = EXCLUDED.total_price,
                coll_cash = EXCLUDED.coll_cash, dues = EXCLUDED.dues, notes = EXCLUDED.notes, updated_at = NOW()
            RETURNING id
        `, [finalInvoiceNo, date, Number(customer_id), Number(employee_id), calculatedTotal, Number(discount_amt || 0), Math.max(0, calculatedTotal - Number(discount_amt || 0)), Number(coll_cash || 0), Number(dues || 0), notes || '']);

        const invoiceId = insRes.rows[0].id;

        await db.query(`
            INSERT INTO invoice_items (invoice_id, invoice_no, product_id, qty, unit_price, total_price, bonus_qty)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [invoiceId, finalInvoiceNo, Number(product_id), Number(qty), Number(unit_price || 0), calculatedTotal, Number(bonus_qty || 0)]);

        await db.query(`
            INSERT INTO sales_transactions (
                invoice_no, date, employee_id, customer_id, product_id,
                qty, unit_price, total_price, bonus_qty, discount_amt,
                dues, coll_cash, coll_comm, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, $13)
        `, [
            finalInvoiceNo, date, Number(employee_id), Number(customer_id), Number(product_id),
            Number(qty), Number(unit_price || 0), calculatedTotal, Number(bonus_qty || 0), Number(discount_amt || 0),
            Number(dues || 0), Number(coll_cash || 0), notes || ''
        ]);

        res.status(201).json({
            status: 'success',
            message: 'Transaction saved to Supabase PostgreSQL successfully',
            invoiceNo: finalInvoiceNo,
            invoice_id: invoiceId
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// DELETE /api/invoices/:invoice_no
app.delete('/api/invoices/:invoice_no', async (req, res) => {
    try {
        const { invoice_no } = req.params;
        await db.query('DELETE FROM sales_transactions WHERE invoice_no = $1', [invoice_no]);
        await db.query('DELETE FROM invoices WHERE invoice_no = $1', [invoice_no]);
        res.json({ status: 'success', message: `Invoice ${invoice_no} deleted successfully` });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Export app for Vercel Serverless Function & start listener if standalone
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    const server = app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(` SOHA ENTERPRISE ERP Server running on:`);
        console.log(` Local:   http://localhost:${PORT}`);
        console.log(` Database: Supabase PostgreSQL (Tokyo Region Pooler)`);
        console.log(`=======================================================`);
    });
}

module.exports = app;
