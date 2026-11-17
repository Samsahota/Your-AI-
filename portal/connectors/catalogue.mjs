// The connection catalogue: every system we connect to, how, and what it fills.
//
// verified: false means the details are our best information from public sources and have NOT
// been confirmed against a real sample or the supplier's documentation. Nothing marked
// unverified goes live until a real sample has been mapped and checked (build pack, step 7).

export const CATALOGUE = {
  vigo: {
    name: 'Vigo (transport management)', supplier: 'Vigo Software (Kerridge / Klipboard)',
    methods: ['api', 'email_report', 'file'], preferred: 'api', fallback: 'email_report',
    feeds: ['customers', 'jobs', 'job_costs'],
    verified: false,
    notes: 'No public API documentation. Ask Vigo for read-only API docs and a key; until then a scheduled daily jobs export (CSV) emailed to the report inbox.',
    // Template only: column names to be replaced with the real export's headers once a sample arrives.
    mappingTemplate: {
      target: 'jobs', key: 'job_ref',
      fields: {
        job_ref: { from: '[Job number column]', type: 'text', required: true },
        customer: { from: '[Customer column]', type: 'text', required: true },
        job_date: { from: '[Job date column]', type: 'date', format: 'DD/MM/YYYY', required: true },
        due_at: { from: ['[Due date column]', '[Due time column]'], type: 'datetime', format: 'DD/MM/YYYY' },
        delivered_at: { from: ['[Delivered date column]', '[Delivered time column]'], type: 'datetime', format: 'DD/MM/YYYY' },
        pod_received: { from: '[POD column]', type: 'bool' },
        revenue: { from: '[Price column]', type: 'money' },
      },
    },
  },
  tachomaster: {
    name: 'Tachomaster (drivers\' hours)', supplier: 'Road Tech Computer Systems',
    methods: ['api', 'email_report'], preferred: 'api', fallback: 'email_report',
    feeds: ['infringements', 'people_events'],
    verified: false,
    notes: 'No public API found. Road Tech runs integrations for partners; ask once for Tachomaster, Falcon and PreDrive together. Tachomaster can email scheduled reports.',
  },
  falcon: {
    name: 'Falcon Tracking (DOT Tracking)', supplier: 'Road Tech Computer Systems',
    methods: ['api', 'email_report'], preferred: 'api', fallback: 'email_report',
    feeds: ['jobs'],
    verified: false,
    notes: 'Mileage, arrival times, idling. Scheduled daily reports by email are supported; API on request.',
  },
  predrive: {
    name: 'PreDrive (walkaround checks and defects)', supplier: 'Road Tech Computer Systems',
    methods: ['api', 'email_report', 'file'], preferred: 'api', fallback: 'file',
    feeds: ['defects', 'compliance_items'],
    verified: false,
    notes: 'Described by Road Tech as DVSA compliant. We read results; we do not rebuild walkaround checks.',
  },
  xero: {
    name: 'Xero (accounts)', supplier: 'Xero',
    methods: ['oauth'], preferred: 'oauth', fallback: 'file',
    feeds: ['pnl_lines', 'cost_daily'],
    verified: true,
    notes: 'Public API. Trans Haul\'s Xero admin approves read-only access once. Developer pricing tiers since March 2026: check cost per connected company.',
  },
  sharepoint: {
    name: 'SharePoint (Microsoft 365)', supplier: 'Microsoft',
    methods: ['oauth'], preferred: 'oauth', fallback: 'file',
    feeds: ['staff', 'people_events', 'incidents', 'compliance_items', 'hr_cases'],
    verified: true,
    notes: 'Microsoft Graph with Sites.Selected: access to named sites only, approved by their Microsoft admin. Spreadsheet layouts must stay the same.',
  },
  brightpay: {
    name: 'BrightPay (payroll)', supplier: 'BrightPay',
    methods: ['file'], preferred: 'file', fallback: 'file',
    feeds: ['payroll_periods', 'people_events'],
    verified: false,
    notes: 'No general API found. Payroll cost reaches Xero as a journal; hours, overtime and absence from a monthly CSV export.',
  },
  bibby: {
    name: 'Bibby (invoice finance)', supplier: 'Bibby Financial Services',
    methods: ['file', 'email_report'], preferred: 'file', fallback: 'file',
    feeds: [],
    verified: false,
    notes: 'No API found. Monthly statement export. Feeds the cash view add-on.',
  },
  warehouse: {
    name: 'Warehouse figures', supplier: 'To confirm with the Warehouse Manager',
    methods: ['file', 'email_report', 'api'], preferred: 'file', fallback: 'file',
    feeds: ['warehouse_daily', 'cost_daily'],
    verified: false,
    notes: 'Source not yet known: a warehouse system, the TMS, or spreadsheets.',
  },
};

// Spreadsheet templates we can give a haulier when the data lives in Excel today.
// These are ours, so they are verified: the platform reads them exactly as laid out here.
export const TEMPLATES = {
  incidents: {
    target: 'incidents', key: 'external_ref',
    fields: {
      external_ref: { from: 'Reference', type: 'text', required: true },
      kind: { from: 'Type', type: 'text', required: true },          // Accident, Personal accident, Near miss
      occurred_at: { from: ['Date', 'Time'], type: 'datetime', format: 'DD/MM/YYYY', required: true },
      division: { from: 'Area', type: 'text' },                      // Transport, Warehouse
      description: { from: 'What happened', type: 'text', required: true },
      status: { from: 'Status', type: 'text', required: true },      // Open, Closed
      actions_open: { from: 'Open actions', type: 'int' },
    },
  },
  absence: {
    target: 'people_events', key: 'external_ref',
    fields: {
      external_ref: { from: 'Reference', type: 'text', required: true },
      employee_no: { from: 'Employee number', type: 'text', required: true },
      kind: { from: 'Type', type: 'text', required: true },          // Holiday, Absence, Overtime
      day: { from: 'Date', type: 'date', format: 'DD/MM/YYYY', required: true },
      hours: { from: 'Hours', type: 'number' },
    },
  },
};
