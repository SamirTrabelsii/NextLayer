# Print Dashboard

A comprehensive, full-stack ERP and CRM solution tailored for modern printing businesses. This application provides end-to-end management of orders, productions, materials, inventory, and financials, enabling precise cost tracking and efficient workflow automation.

## 🌟 Key Features

*   **Order Management & Pipeline**: Track orders through a customizable kanban/stepper pipeline. Features robust delivery workflows, including a packaging material consumption modal that triggers before finalizing deliveries.
*   **Deep Financial Analysis**: Real-time margin and profitability analysis per order. Automatically calculates revenue, production costs, material costs (via Bill of Materials), and packaging costs to provide a clear financial breakdown.
*   **Product Catalog & Bill of Materials (BOM)**: Define custom products and their specific material dependencies. The BOM system allows for component-level cost tracking, automatically aggregating the total cost of materials consumed per product.
*   **Production & Workflow Tracking**: Manage production runs, track production costs, and automatically sync these costs with the overall product cost calculations.
*   **Materials & Inventory Management**: Monitor raw material stock levels, track cost per unit, and automate deductions based on order fulfillment and packaging usage.
*   **Client & Reseller Management**: Dedicated modules to manage both B2C clients and B2B resellers.
*   **Dashboard & Analytics**: Visual insights and high-level metrics powered by Recharts, offering a quick overview of business health and operational efficiency.
*   **Expense Tracking**: Monitor day-to-day business expenses directly within the dashboard.

## 🛠 Tech Stack

*   **Frontend**: [React 19](https://react.dev/) powered by [Vite](https://vitejs.dev/) for lightning-fast HMR and building.
*   **Styling**: [Tailwind CSS 3](https://tailwindcss.com/) for rapid, utility-first UI development.
*   **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL backend-as-a-service, Authentication, and real-time capabilities).
*   **State Management & Data Fetching**: [TanStack React Query v5](https://tanstack.com/query/latest) for powerful asynchronous state management and caching.
*   **Routing**: [React Router v7](https://reactrouter.com/) for seamless client-side navigation.
*   **Icons**: [Lucide React](https://lucide.dev/) for clean, consistent iconography.
*   **Charts**: [Recharts](https://recharts.org/) for composable charting components.

## 🚀 Getting Started

### Prerequisites

*   Node.js (v18 or higher recommended)
*   npm or yarn
*   A Supabase account and project

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd print-dashboard
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Variables:**
    Create a `.env` file in the root of the project and add your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=your_supabase_project_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

4.  **Start the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5173`.

## 📂 Project Structure

```text
src/
├── assets/        # Static assets (images, fonts, etc.)
├── components/    # Reusable UI components (e.g., Layout, Modals)
├── lib/           # Utility functions and configurations (e.g., supabase.js, costUtils.js)
├── pages/         # Top-level route components
│   ├── Dashboard.jsx
│   ├── Orders.jsx      # Order pipeline and financial breakdown
│   ├── Productions.jsx # Production tracking
│   ├── Products.jsx    # Product catalog with BOM integration
│   ├── Materials.jsx   # Raw material inventory
│   └── ...
├── App.jsx        # Main application component and routing configuration
├── index.css      # Global Tailwind imports and base styles
└── main.jsx       # React application entry point
```

## 🔄 Recent Workflow Integrations

The system has been heavily optimized for accurate cost analysis:
*   **Order Delivery Workflow**: The transition to "Delivered" intercepts the workflow to prompt a packaging consumption modal, dynamically deducting packaging stock and adding its cost to the final order margin.
*   **BOM Synchronization**: Material costs added to a product's BOM instantly reflect in the product's base cost, which cascades into the order's financial analysis.

## 📜 License

This project is proprietary and confidential.
