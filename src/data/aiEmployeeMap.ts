/**
 * Which NDI AI Employees cover each of the 65 sub-functions (the l2Code values in model-data.json),
 * best fit first. Curated by hand from the AI Employees catalogue — names, taglines and features.
 *
 * At runtime, codes the catalogue doesn't list (or lists as "Concept", i.e. not built yet) are
 * skipped and the next candidate moves up, so a few spare candidates per row are deliberate.
 * Keep codes in sync with the catalogue when AI Employees are added or renamed.
 */
export const AI_EMPLOYEE_MAP: Record<string, string[]> = {
  // 1. Management & Corporate Strategy
  '1.1': ['DO-18', 'DR-08', 'DR-06'], // Corporate Strategy & Business Planning
  '1.2': ['PA-08', 'PA-01', 'PA-02'], // Executive & General Management
  '1.3': ['PA-06', 'DO-06', 'GP-17'], // Corporate Governance & Board Support
  '1.4': ['DR-19', 'DO-12', 'DO-17', 'UO-15'], // Mergers, Acquisitions & Corporate Development
  '1.5': ['GP-17', 'UO-12', 'DR-24'], // Enterprise Risk Management
  '1.6': ['DO-08', 'DO-26', 'GP-17', 'DO-10'], // Legal & Compliance
  '1.7': ['FO-13', 'DO-05', 'DR-20'], // Corporate Communications & Public Relations
  '1.8': ['DR-14', 'GP-17', 'DR-06'], // Sustainability & ESG

  // 2. Sales
  '2.1': ['DR-01', 'DR-02', 'DR-09'], // Sales Strategy & Planning
  '2.2': ['UO-01', 'DR-21', 'DR-22'], // Business Development & New Client Acquisition
  '2.3': ['UO-13', 'DR-11', 'PA-08'], // Account Management & Key Accounts
  '2.4': ['GP-11', 'DR-02', 'KT-05'], // Sales Operations & Enablement
  '2.5': ['UO-13', 'KT-02', 'FO-14'], // Channel & Partner Sales
  '2.6': ['GP-18', 'DO-02', 'GP-20', 'DO-14'], // Pricing & Quoting
  '2.7': ['FO-17', 'GP-11', 'GP-14'], // Sales Support & Order Administration

  // 3. Marketing
  '3.1': ['DR-20', 'DR-08', 'UO-10'], // Marketing Strategy & Brand Management
  '3.2': ['DO-18', 'DR-08', 'DR-06'], // Market Research & Insights
  '3.3': ['DO-04', 'DR-08', 'FO-10'], // Product & Portfolio Marketing
  '3.4': ['DO-05', 'UO-11', 'DR-20'], // Digital Marketing & E-Commerce
  '3.5': ['FO-13', 'DO-04', 'DO-07'], // Content, Creative & Communications
  '3.6': ['DR-15', 'UO-09', 'UO-06'], // Events, Sponsorships & Trade Marketing
  '3.7': ['UO-07', 'GP-03', 'DR-20'], // Marketing Analytics & Performance

  // 4. Customer Management & Service
  '4.1': ['FO-01', 'FO-03', 'FO-02'], // Customer Service & Support (Contact Center)
  '4.2': ['GP-14', 'UO-13', 'FO-03'], // Customer Success & Retention
  '4.3': ['FO-18', 'FO-03'], // Complaints & Case Management
  '4.4': ['DR-13', 'KT-03'], // Customer Experience (CX) Design
  '4.5': ['UO-02', 'UO-11'], // Loyalty & Relationship Programs
  '4.6': ['GP-15', 'GP-16', 'FO-09'], // Field Service & Technical Support

  // 5. Product Management & Development
  '5.1': ['SD-01', 'DR-08'], // Product Strategy & Roadmap
  '5.2': ['SD-01', 'SD-07'], // Product Management
  '5.3': ['KT-01', 'DO-13', 'DR-06'], // Research & Development (R&D)
  '5.4': ['SD-05', 'GP-20', 'SD-04'], // Engineering & Technical Design
  '5.5': ['DO-18', 'DR-08', 'UO-10'], // Innovation & New Product Ideation
  '5.6': ['SD-03', 'GP-17'], // Quality Assurance & Testing
  '5.7': ['GP-17', 'DO-06', 'DO-10'], // Regulatory Affairs & Product Compliance

  // 6. Operations & Supply Chain
  '6.1': ['KT-01', 'GP-16', 'KT-02'], // Manufacturing & Production
  '6.2': ['SD-02', 'GP-12', 'GP-15'], // Service Delivery & Project Execution
  '6.3': ['UO-11', 'DO-04', 'GP-09'], // Retail & Commerce Operations
  '6.4': ['GP-04', 'GP-05', 'GP-08'], // Procurement & Sourcing
  '6.5': ['GP-09', 'DR-02', 'FO-09'], // Supply Chain Planning & Logistics
  '6.6': ['GP-09', 'GP-08'], // Warehousing & Inventory Management
  '6.7': ['DO-10', 'GP-08', 'GP-15'], // Facilities & Real Estate Management
  '6.8': ['GP-17', 'KT-02', 'DO-10'], // Health, Safety & Environment (HSE)
  '6.9': ['SD-07', 'GP-03', 'KT-03'], // Operations Quality & Continuous Improvement

  // 7. Finance & Accounting
  '7.1': ['GP-03', 'DO-17', 'DR-02'], // Financial Planning & Analysis (FP&A)
  '7.2': ['DO-21', 'DO-20', 'GP-02'], // Accounting & Financial Reporting
  '7.3': ['DO-25', 'GP-06'], // Treasury & Cash Management
  '7.4': ['DO-09', 'GP-02'], // Tax
  '7.5': ['GP-17', 'DO-22', 'DR-17'], // Internal Audit
  '7.6': ['DO-24', 'GP-02', 'GP-06'], // Accounts Payable / Procure-to-Pay
  '7.7': ['GP-06', 'GP-02'], // Accounts Receivable, Billing & Order-to-Cash

  // 8. Human Resources
  '8.1': ['FO-11', 'KT-04'], // HR Strategy & Business Partnering
  '8.2': ['UO-03', 'UO-04'], // Talent Acquisition & Recruiting
  '8.3': ['KT-02', 'KT-06', 'KT-05'], // Learning & Development
  '8.4': ['FO-11', 'DR-06', 'GP-23'], // Compensation & Benefits
  '8.5': ['KT-04', 'FO-11'], // Employee Relations & Engagement
  '8.6': ['GP-03', 'GP-23', 'KT-04'], // Workforce Planning & HR Analytics
  '8.7': ['GP-01', 'GP-23', 'FO-11'], // Payroll & HR Operations (HRIS)

  // 9. Information Technology & Digital
  '9.1': ['GP-07', 'GP-19', 'GP-05'], // IT Strategy & Governance
  '9.2': ['GP-19', 'GP-11', 'SD-07'], // Enterprise Applications & Business Systems
  '9.3': ['GP-21', 'GP-07'], // Infrastructure & Cloud Operations
  '9.4': ['GP-19', 'GP-17', 'GP-01'], // Cybersecurity & Data Protection
  '9.5': ['FO-12', 'GP-19'], // IT Service Management & Support (Help Desk)
  '9.6': ['SD-04', 'SD-03', 'SD-05'], // Software Engineering & Digital Development
  '9.7': ['GP-03', 'DR-17'], // Data & Analytics / Business Intelligence
};

/** How many AI Employees a report shows per sub-function. */
export const MAX_AI_EMPLOYEES_PER_FUNCTION = 3;
