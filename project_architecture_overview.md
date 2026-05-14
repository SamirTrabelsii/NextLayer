# Print Dashboard - Project Architecture & Learning Guide

Welcome to the deep dive into your **Print Dashboard** project! Since you're building this from scratch and want to master the core concepts, this document breaks down *how* the application works, *why* it's structured this way, and the core development techniques you're using.

> [!TIP]
> Keep this document handy as a reference. As you continue vibe coding, understanding these foundational patterns will make adding new features much easier and prevent technical debt.

## 1. The Technology Stack

You are using a modern, fast, and highly effective React stack. Here is the breakdown:

*   **Vite**: Your build tool. It replaces older tools like Create React App (Webpack) and offers lightning-fast Hot Module Replacement (HMR).
*   **React 19**: The core UI library using modern functional components and hooks.
*   **React Router v7 (`react-router-dom`)**: Handles navigating between different pages (Dashboard, Orders, Products, etc.) without reloading the browser window.
*   **Tailwind CSS**: A utility-first CSS framework. Instead of writing separate `.css` files, you apply classes directly in JSX (e.g., `flex`, `text-slate-400`, `px-4`). This is perfect for rapid "vibe coding."
*   **Supabase (`@supabase/supabase-js`)**: Your Backend-as-a-Service (BaaS). It provides a PostgreSQL database, real-time subscriptions, and authentication out of the box.
*   **Lucide React**: Your icon library, providing clean, consistent SVG icons.
*   **Recharts**: A charting library built on React components, used in your Dashboard for visual analytics.
*   **React Query (`@tanstack/react-query`)**: (Installed in your `package.json`) A powerful library for fetching, caching, and updating asynchronous data from Supabase.

## 2. Project Structure & Architecture

A clean folder structure is the hallmark of a maintainable app. Here is how your `src` directory is organized:

```text
src/
├── App.jsx             # The root router configuration
├── main.jsx            # The entry point that mounts React to the DOM
├── index.css           # Global CSS and Tailwind directives
├── assets/             # Static files like your logo.png
├── components/         # Reusable UI components
│   └── Layout.jsx      # The shell of the app (Sidebar + Main Content Area)
├── lib/                # Non-UI utilities and configurations
│   ├── supabase.js     # Supabase client initialization
│   ├── costUtils.js    # Pure functions for financial calculations
│   └── SettingsContext.jsx # Global state management
└── pages/              # The main views corresponding to routes (Orders, Products, etc.)
```

> [!NOTE]
> **Component vs. Page**: A *Page* (like `Orders.jsx`) is a "smart" component that fetches data and represents a whole screen. A *Component* (like `Layout.jsx`) is usually a "dumb" or generic UI piece that can be reused anywhere.

## 3. Core Development Techniques in this Project

### A. Nested Routing & Layouts
Look at `App.jsx` and `Layout.jsx`. You are using a pattern called **Nested Routes**. 
*   `App.jsx` defines `<Route path="/" element={<Layout />}>`. 
*   Inside `Layout.jsx`, there is an `<Outlet />` component.
*   **How it works**: The `Layout` component renders the sidebar (on desktop) and the bottom navigation bar (on mobile). The `<Outlet />` is a placeholder where the specific page content (like `Orders` or `Settings`) gets injected depending on the URL. This ensures your navigation UI is written exactly once.

### B. Global State with React Context
In `lib/SettingsContext.jsx`, you are using React's Context API.
*   **The Problem**: Some data, like `filament_price_per_kg`, needs to be accessed by almost every page to calculate costs. Passing this data down via props from `App` to every single component is tedious ("prop drilling").
*   **The Solution**: `SettingsContext` wraps your app. Any component deep in the tree can simply call `const { settings } = useSettings()` to grab the latest prices without needing them passed via props.

### C. Extracting Business Logic
Look at `lib/costUtils.js`. 
*   **Why it's great**: You extracted functions like `calcProductionCost` and `calcMargin` out of your UI components. 
*   **The Benefit**: Now, if you change how margins are calculated, you change it in *one single file*. Both `Products.jsx` and `Orders.jsx` can import this pure function, ensuring your financial numbers always match across the whole app.

### D. Responsive Design (Mobile First)
Your `Layout.jsx` demonstrates excellent responsive design using Tailwind:
*   `hidden md:flex`: The sidebar is hidden on small screens and becomes a flex container on medium screens (`md:`) and up.
*   `md:hidden fixed bottom-0`: The bottom navigation bar is visible on mobile but hidden on medium screens. 
*   This creates an app-like experience on phones and a traditional dashboard layout on desktops using the same codebase.

### E. Backend Integration
`lib/supabase.js` initializes your database connection using environment variables (`import.meta.env`). 
*   In your pages, you interact with your database using queries like `supabase.from('orders').select('*')`. This acts as your ORM (Object-Relational Mapping), communicating directly with PostgreSQL.

## 4. The Domain Model (What the app manages)

To truly understand the architecture, you have to understand the "Domain"—the real-world concepts your code represents. Your `pages/` directory reveals a comprehensive ERP (Enterprise Resource Planning) system for 3D printing:

1.  **Products & Materials**: What you can sell and the raw items (BOM - Bill of Materials) required to build them.
2.  **Clients & Resellers**: Who you sell to, categorized by B2C (Clients) and B2B (Resellers).
3.  **Orders & Productions**: The core workflow. An Order comes in, triggering a Production cycle (printing, tracking time/filament), and finally delivery.
4.  **Stock & Expenses**: Tracking inventory levels and outbound cash flow to calculate true profitability.
5.  **Dashboard**: The aggregation layer that reads from all the above to show KPIs and charts.

> [!IMPORTANT]
> **Next Steps for Learning**: As you continue, try to identify places where you copy-paste the same UI code (like a Modal or a Button) in multiple pages. Your next architectural step should be extracting those into reusable files inside the `src/components/` folder!
