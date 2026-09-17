# SOHA ENTERPRISE — Enterprise ERP System & Dashboard

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/Database-SQLite_Native-blue.svg)](https://www.sqlite.org/)
[![Security](https://img.shields.io/badge/Auth-PBKDF2_Crypto-brightgreen.svg)]()
[![Status](https://img.shields.io/badge/Production-Zero_Mock-success.svg)]()

A complete, production-grade Enterprise ERP system and interactive business management dashboard tailored for **SOHA ENTERPRISE** (Bangladesh). Built with high-performance native SQLite relational persistence, cryptographic authentication, and full Role-Based Access Control (RBAC).

---

## 🌟 Key Features

- **Strict Zero-Mock Architecture**: Every single number, transaction, collection, and customer balance is computed on-the-fly via real SQLite SQL queries.
- **Enterprise Authentication & RBAC**:
  - Secure PBKDF2 password hashing (10,000 iterations, 16-byte unique cryptographic salt per user).
  - 64-character session tokens with database persistence.
  - **Main Admin Privileges**: Full system control, dynamic sub-account creation (Sub-Admins and Field TSO Officers), and instant active/inactive status toggling.
  - **Scoped Field Officer Privileges**: Personalized views scoped to territory and officer codes.
- **Oracle APEX Universal Theme UX**:
  - Clean collapsible navigation drawer.
  - Responsive across Mobile, Tablet, and Desktop screens.
  - Native date range filtering and South Asian numbering (`৳ 25,67,353`).
  - CSV export for ledgers and reports.

---

## 📊 17 Operational Modules

1. **Executive Home**: Real-time KPI summaries (YTD Sales, MTD Sales, Total Collected, Dues, Active Customer Count) and live order stream.
2. **Master Setup ➔ Products Catalog**: Comprehensive product inventory management with trade prices, pack sizes, and categories.
3. **Master Setup ➔ Sub-Accounts (RBAC)**: Main Admin control panel to create and manage system user access.
4. **Sales**: Sales order ledger and instant invoice generation modal.
5. **Collection**: Money receipts recording for Cash, Bank Transfer, and Cheque payments.
6. **Bill Management**: Invoice statements, payment audit records, and dues reconciliation.
7. **Business ➔ My Business**: Core Oracle APEX grid with date range filtering and export capabilities.
8. **Business ➔ Forecast Review**: Target vs. actual achievement % calculation.
9. **Business ➔ Forecast Entry**: Quota recording form saving directly to SQLite.
10. **Business ➔ Forecast Report**: Territory-wise monthly performance reporting.
11. **Business ➔ My Customers**: Dealer portfolio with balance dues, credit limits, and new customer registration.
12. **Business ➔ Comparision Business**: Period-over-period comparative analysis.
13. **Business ➔ Customer Wise Product Sell**: Granular product sales breakdown per dealer.
14. **Business ➔ MTD/YTD SALE And Top Ten Products**: Top revenue-generating products ranking.
15. **Business ➔ Ageing Report**: Accounts receivable aging buckets (0–30, 31–60, 61–90, 90+ days).
16. **Business ➔ Outstanding**: Customer-wise outstanding ledger with credit risks.
17. **Business ➔ Outstanding Confirmation**: Balance audit reconciliation tool.

---

## 🚀 Quick Start & Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended, works seamlessly with Node v22 and v25 native SQLite)
- Git

### Installation
```bash
# Clone repository
git clone https://github.com/amirulislamredwan71-a11y/Soha-enterprise.git
cd Soha-enterprise

# Install dependencies
npm install

# Start the ERP server
npm start
```

Open your browser at:
👉 **`http://localhost:8441`**

---

## 🔐 Default Access Credentials

| Role | Username | Password | Privileges |
| :--- | :--- | :--- | :--- |
| **MAIN ADMIN** | `admin` | `admin123` | Full administrative control, create sub-accounts, configure catalog |

*(Additional Sub-Accounts can be created by the Main Admin directly in `Master Setup ➔ Sub-Accounts`)*

---

## 📁 Project Structure

```
Soha-enterprise/
├── db/
│   ├── database.js     # Native SQLite database connection
│   ├── schema.sql      # Relational schema (tables, foreign keys, indexes)
│   ├── auth.js         # PBKDF2 password hashing & session generator
│   ├── clean.js        # Purge mock data / reset to clean production state
│   └── seed.js         # Production database initializer
├── public/
│   ├── css/
│   │   └── style.css   # Oracle APEX responsive theme stylesheet
│   ├── js/
│   │   └── app.js      # Frontend Single Page App (SPA) controller
│   └── index.html      # Main ERP interface with modal forms
├── server.js           # Express REST API backend with SQLite endpoints
├── package.json        # Project metadata and dependencies
└── README.md           # Documentation
```

---

## 📄 License
Licensed under ISC License. Developed for **SOHA ENTERPRISE**.
