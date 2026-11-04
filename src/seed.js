/* ==========================================================================
   SEED DATA — all people, companies, addresses and records are fictional.
   Shapes mirror the intended Supabase tables (one array per table).
   ========================================================================== */
const DEMO_START = '2026-11-05T07:00:00Z';   // Thursday 5 November 2026, 07:00 GMT
const YESTERDAY = '2026-11-04';
const TODAY = '2026-11-05';
const WEEK_START = '2026-11-02';

const REF_PREFIX = { C01:'NFF', C02:'BBS', C03:'CPN', C04:'HLR' };
function buildSeed() {
  const customers = [
    { id:'C01', name:'Northfield Fresh Foods Ltd', type:'Food distribution', terms:30, accountRef:'NFF01', city:'Kettering' },
    { id:'C02', name:'Brookline Building Supplies Ltd', type:'Building materials', terms:45, accountRef:'BBS02', city:'Bedford' },
    { id:'C03', name:'Crossway Pallet Network Ltd', type:'Pallet distribution', terms:30, accountRef:'CPN03', city:'Milton Keynes' },
    { id:'C04', name:'Harbour Lane Retail Ltd', type:'Retail goods', terms:30, accountRef:'HLR04', city:'Luton' },
  ];
  const contacts = [
    { id:'CT01', customerId:'C01', name:'Customer Contact', title:'Goods-in Coordinator', email:'deliveries@northfield-fresh.example', notify:true, demo:true },
    { id:'CT02', customerId:'C01', name:'Accounts Payable', title:'Finance', email:'accounts@northfield-fresh.example', notify:true },
    { id:'CT03', customerId:'C02', name:'Site Office', title:'Logistics', email:'siteoffice@brookline-building.example', notify:true },
    { id:'CT04', customerId:'C03', name:'Traffic Desk', title:'Network Planning', email:'traffic@crossway-pallets.example', notify:true },
    { id:'CT05', customerId:'C04', name:'Goods-in Team', title:'Store Operations', email:'goodsin@harbourlane-retail.example', notify:true },
  ];

  const users = [
    { id:'U01', name:'Paul Dyer', role:'director', title:'Managing Director', email:'paul.dyer@transhaul.example', status:'active', demo:true },
    { id:'U02', name:'Lisa Grant', role:'operations', title:'Operations Manager', email:'lisa.grant@transhaul.example', status:'active', demo:true },
    { id:'U03', name:'Transport Manager', role:'transport', title:'Transport & Compliance', email:'transport@transhaul.example', status:'active', demo:true },
    { id:'U04', name:'Driver D04', role:'driver', title:'Driver', driverId:'D04', email:'d04@transhaul.example', status:'active', demo:true },
  ];

  const vtypes = { A:'44t artic', R26:'26t rigid', R18:'18t rigid' };
  const vehicles = [];
  for (let n = 1; n <= 18; n++) {
    const id = 'V' + String(n).padStart(3, '0');
    const t = n <= 10 ? 'A' : n <= 15 ? 'R26' : 'R18';
    vehicles.push({ id, type:vtypes[t], typeKey:t, status:'available', depot: n % 2 ? 'Yard 1' : 'Yard 2', motDue: null, notes:'' });
  }
  const v14 = vehicles.find(v => v.id === 'V014');
  Object.assign(v14, { status:'vor', vorSince:'2026-11-03', vorReason:'Air leak — rear suspension. Awaiting parts from workshop.' });
  vehicles.find(v => v.id === 'V009').motDue = '2026-11-28';

  const names = ['Alan Brooks','Kevin Doyle','Gary Marsh','Kieran Walsh','Steve Hollis','Dean Carter','Mo Rahman','Neil Ashby','Rob Stannard','Tony Pearce','Lee Garner','Jas Sandhu','Phil Cooke','Dan Ryder','Craig Lowe','Martin Hale','Wes Fielding','Andy Prior','Simon Kerr','Ian Bellamy','Rich Dunmore','Paul Ostrowski','Gav Nolan','Terry Vance','Sean Whitlock','Matt Aldridge'];
  const drivers = names.map((nm, i) => {
    const id = 'D' + String(i + 1).padStart(2, '0');
    const ltd = ['D21','D22','D23','D24'].includes(id);
    return { id, name:nm, engagement: ltd ? 'Limited company' : 'Employed', rate: ltd ? 23 : 19, status:'active',
      licenceReviewDue: '2027-0' + (1 + (i % 8)) + '-15', licenceStatus:'ok', tachoStatus:'ok', cpcDue: '2027-' + String(1 + (i % 12)).padStart(2,'0') + '-20',
      hoursAvailMin: null, todayState: null };
  });
  drivers.push({ id:'A01', name:'Agency driver A01', agency:'Pinnacle Driver Staffing (fictional)', engagement:'Agency', rate:28, status:'active', licenceStatus:'agency', tachoStatus:'ok' });
  drivers.push({ id:'A02', name:'Agency driver A02', agency:'Pinnacle Driver Staffing (fictional)', engagement:'Agency', rate:28, status:'active', licenceStatus:'agency', tachoStatus:'ok' });
  const D = id => drivers.find(d => d.id === id);
  Object.assign(D('D22'), { licenceReviewDue:'2026-10-20', licenceStatus:'overdue' });
  Object.assign(D('D09'), { tachoStatus:'unsigned' });

  // ---------- jobs: historical fixtures (generated) ----------
  const jobs = JOB_ROWS.map(r => {
    const j = {}; JOB_KEYS.forEach((k, i) => j[k] = r[i]);
    const ex = JOB_EXTRAS[j.id] || {};
    j.variance = ex.variance || [];
    j.recharge = ex.recharge || null;
    j.subcontract = !!ex.subcontract;
    j.plannedDriverId = ex.plannedDriverId || null;
    j.status = 'delivered';
    j.checkins = [];
    const missing = ['TH-001','OLD-101','OLD-102','OLD-103'].includes(j.id);
    j.pod = missing ? { status:'missing' } : { status:'received', at: j.date + 'T' + j.deliveredAt + ':00Z', source:'Vigo (illustrative)' };
    const pending = ['TH-001','TH-005','TH-016','TH-018','OLD-101','OLD-102','OLD-103'].includes(j.id);
    if (pending) j.invoice = { status:'pending' };
    else if (j.date === YESTERDAY) j.invoice = { status:'invoiced', invoiceId: { C01:'INV-264101', C02:'INV-264102', C03:'INV-264103', C04:'INV-264104' }[j.customerId] };
    else j.invoice = { status:'unmodelled' };
    if (j.subcontract) j.subcontractor = 'Solent Freight Partners (fictional)';
    j.customerRef = REF_PREFIX[j.customerId] + '-' + (40000 + (parseInt(j.id.replace(/\D/g, ''), 10) % 9973));
    return j;
  });

  // ---------- today's plan: 21 booked jobs ----------
  const T = (n, dest, cust, slot, veh, drv, status, price, planned, opts = {}) => Object.assign({
    id:'TODAY-' + String(n).padStart(2, '0'), date:TODAY, dest, customerId:cust, slot, vehicleId:veh, driverId:drv, status,
    price, plannedCost:planned, actualCost:null, late:null, deliveredAt:null, src:'synthetic', variance:[], recharge:null,
    pod:{ status:'n/a' }, invoice:{ status:'not_due' }, checkins:[], subcontract:false, requiredMin: 300,
    customerRef: REF_PREFIX[cust] + '-' + (88200 + n),
  }, opts);
  const todayJobs = [
    T(1,'Doncaster','C03','10:30','V006',null,'not_started',1280,820,{ requiredMin:300, note:'No driver assigned in Vigo extract.' }),
    T(2,'Ipswich','C02','11:15','V014','D15','not_started',860,560,{ requiredMin:270, note:'Booked vehicle V014 is VOR.' }),
    T(3,'Leeds','C01','09:00','V001','D03','en_route',1450,925),
    T(4,'Bristol','C02','09:30','V002','D05','en_route',1200,780),
    T(5,'Kettering','C01','09:00','V011','D04','not_started',640,395,{
      address:['Northfield Fresh Foods — Kettering Chilled DC','Unit 7, Meadowgate Industrial Estate','Kettering','ZZ4 7KT'],
      instructions:'Report to Gatehouse 2 and quote booking ref NFF-88213. Chilled bays 4–6. Hi-vis and safety boots required on site. Reverse onto bay only when the banksman signals.',
      customerRef:'NFF-88213', pallets:16 }),
    T(6,'Sheffield','C03','10:00','V003','D06','en_route',1190,745),
    T(7,'Luton','C04','07:30','V016','D17','on_site',320,180),
    T(8,'Birmingham','C04','09:00','V004','D08','en_route',920,600),
    T(9,'Cambridge','C01','10:30','V012','D18','not_started',710,450),
    T(10,'Nottingham','C02','09:30','V005','D11','en_route',880,560),
    T(11,'Reading','C03','11:00','V007','D13','not_started',720,445),
    T(12,'Oxford','C04','12:00','V018','D16','not_started',590,355),
    T(13,'Peterborough','C03','11:30','V009','D19','not_started',770,480),
    T(14,'Coventry','C02','12:30','V008','D14','not_started',720,450),
    T(15,'Swindon','C01','13:00','V010','D20','not_started',850,520),
    T(16,'Gloucester','C02','13:30','V013','D21','not_started',900,570),
    T(17,'Milton Keynes','C04','10:00','V017','D09','not_started',390,230),
    T(18,'Leicester','C01','11:00','V015','D23','not_started',650,380),
    T(19,'Wellingborough','C01','14:30','V011','D04','not_started',520,320,{ address:null, instructions:null, addressNote:'Delivery address awaiting confirmation from Northfield Fresh Foods. Traffic office will update before departure.' }),
    T(20,'Slough','C04','15:00','V018','D16','not_started',640,390),
    T(21,'Southampton','C02','11:00',null,null,'not_started',1100,750,{ subcontract:true, subcontractor:'Solent Freight Partners (fictional)' }),
  ];
  jobs.push(...todayJobs);

  // today's driver availability (illustrative planning estimates)
  const avail = { D12:375, D07:130 };
  drivers.forEach(d => {
    const tj = todayJobs.find(j => j.driverId === d.id);
    if (tj) { d.todayState = 'allocated'; d.hoursAvailMin = 420 + ((d.id.charCodeAt(2) * 17) % 120); }
    else if (avail[d.id] != null) { d.todayState = 'available'; d.hoursAvailMin = avail[d.id]; }
    else if (d.id.startsWith('A')) { d.todayState = 'not_booked'; }
    else { d.todayState = ['D01','D02','D10','D24','D25','D26'].includes(d.id) ? 'rest' : 'leave'; }
  });
  D('D22').todayState = 'rest';

  // ---------- open invoices (additional synthetic demo data) ----------
  const inv = (id, customerId, date, amount, opts = {}) => Object.assign({ id, customerId, date, amount, status:'outstanding', eligible:true, synthetic:true }, opts);
  const invoices = [
    inv('INV-264101','C01','2026-11-04',2590,{ jobIds:['TH-006','TH-011','TH-014','TH-019'] }),
    inv('INV-264102','C02','2026-11-04',3020,{ jobIds:['TH-002','TH-004','TH-008'] }),
    inv('INV-264103','C03','2026-11-04',4330,{ jobIds:['TH-003','TH-010','TH-015','TH-017'] }),
    inv('INV-264104','C04','2026-11-04',2400,{ jobIds:['TH-007','TH-009','TH-012','TH-013','TH-020'] }),
    inv('INV-263988','C01','2026-10-26',4200), inv('INV-263901','C02','2026-10-21',3860),
    inv('INV-263822','C03','2026-10-14',4150), inv('INV-263760','C04','2026-10-09',3450),
    inv('INV-263611','C01','2026-09-30',9800), inv('INV-263540','C02','2026-09-24',11400),
    inv('INV-263472','C03','2026-09-18',12800),
    inv('INV-263390','C04','2026-09-10',9000,{ eligible:false, ineligibleReason:'Pricing query raised by customer — excluded from eligible receivables (illustrative).' }),
    inv('INV-263215','C02','2026-08-28',7600), inv('INV-263104','C03','2026-08-15',10400),
    inv('INV-262877','C01','2026-07-22',5200), inv('INV-262650','C04','2026-06-30',3800),
  ];
  // paid history used only for days-to-pay (additional synthetic demo data)
  const paid = [
    ['C01','2026-06-02','2026-07-08',6100],['C01','2026-07-01','2026-08-10',5400],['C01','2026-08-04','2026-09-10',7300],
    ['C02','2026-05-28','2026-07-20',8800],['C02','2026-06-25','2026-08-14',6900],['C02','2026-07-23','2026-09-15',9100],
    ['C03','2026-05-20','2026-07-22',10200],['C03','2026-06-18','2026-08-17',9600],['C03','2026-07-16','2026-09-14',11800],
    ['C04','2026-06-05','2026-07-21',4300],['C04','2026-07-03','2026-08-17',5200],['C04','2026-08-06','2026-09-21',4800],
  ].map((p, i) => ({ id:'PAY-' + (5101 + i), customerId:p[0], invoiceDate:p[1], paidDate:p[2], amount:p[3], synthetic:true }));

  const bibby = { advanceRate:0.85, facilityCeiling:250000, drawn:51000, rule:'Invoices over 90 days old and invoices under query are excluded (illustrative rule).' };

  // ---------- compliance, defects, actions ----------
  const compliance = [
    { id:'CMP-01', kind:'licence', driverId:'D22', title:'Licence evidence review overdue', detail:'Annual licence evidence review was due 20 Oct 2026. No review recorded.', due:'2026-10-20', status:'overdue', source:'Tachomaster (proposed) / internal record', history:[] },
    { id:'CMP-02', kind:'tacho', driverId:'D09', title:'Tachograph infringement follow-up unsigned', detail:'Infringement on 28 Oct 2026 — reduced daily rest below 9h (illustrative). Driver debrief not yet signed.', due:'2026-11-04', status:'unsigned', source:'Tachomaster (proposed)', history:[] },
    { id:'CMP-03', kind:'cpc', driverId:'D15', title:'Driver CPC periodic training due', detail:'7 hours of periodic training to complete before 14 Dec 2026.', due:'2026-12-14', status:'upcoming', source:'Tachomaster (proposed)', history:[] },
    { id:'CMP-04', kind:'mot', vehicleId:'V009', title:'MOT due', detail:'Annual test due 28 Nov 2026. Book test slot.', due:'2026-11-28', status:'upcoming', source:'Internal fleet record', history:[] },
  ];
  const defects = [
    { id:'DEF-001', vehicleId:'V014', item:'Brakes & air lines', severity:'safety', note:'Audible air leak at rear suspension. Vehicle taken off road.', reportedBy:'D15', reportedAt:'2026-11-03T06:10:00Z', status:'vor', source:'Paper walkaround (transcribed)', history:[] },
  ];
  const actions = [
    { id:'ACT-001', title:'Chase missing POD for OLD-101 (Northampton)', recordType:'job', recordId:'OLD-101', ownerId:'U02', priority:'high', due:'2026-11-05', status:'open', createdBy:'U02', createdAt:'2026-11-02T09:15:00Z', notes:'Harbour Lane goods-in say paperwork was signed. Ask driver D02 to check cab.', progress:[] },
    { id:'ACT-002', title:'Confirm V014 repair date with workshop', recordType:'vehicle', recordId:'V014', ownerId:'U03', priority:'high', due:'2026-11-05', status:'open', createdBy:'U03', createdAt:'2026-11-03T07:40:00Z', notes:'Parts ordered 3 Nov. Workshop to confirm ETA.', progress:[] },
    { id:'ACT-003', title:'D09 infringement debrief signature', recordType:'driver', recordId:'D09', ownerId:'U03', priority:'medium', due:'2026-11-04', status:'open', createdBy:'U03', createdAt:'2026-10-29T10:05:00Z', notes:'Debrief held verbally. Signature outstanding.', progress:[] },
  ];

  // ---------- documents (illustrative titles; SharePoint is a proposed source) ----------
  const docs = [
    ['DOC-01','Vehicle walkaround check procedure','Fleet','2026-09-12','Sets out the daily walkaround check every driver completes before first use of a vehicle: tyres and wheel security, lights, mirrors and cameras, brakes and air lines, leaks, bodywork and load security, windscreen and wipers, and dashboard warnings. Any safety-critical defect means the vehicle must not be used until assessed by the transport office.',['DEF-001']],
    ['DOC-02','Defect reporting and VOR process','Fleet','2026-08-30','How defects are reported, graded (safety-critical or minor), assessed and rectified. Covers when a vehicle is declared Vehicle Off Road (VOR), who can return it to service, and the record that must be kept.',['ACT-002']],
    ['DOC-03',"Drivers' hours and working time policy",'Compliance','2026-07-18',"Company policy on EU/AETR drivers' hours, Working Time Directive limits, breaks and rest. Planning tools give an estimate only; the tachograph record and the driver's own judgement remain the authority.",[]],
    ['DOC-04','Licence checking policy','Compliance','2026-06-04','Licence evidence is reviewed for every driver at least annually and more often for drivers with endorsements. Reviews are recorded with date, method and reviewer.',['CMP-01']],
    ['DOC-05','Infringement debrief procedure','Compliance','2026-05-21','Each tachograph infringement is discussed with the driver, recorded, and signed by both driver and transport manager within seven days.',['ACT-003','CMP-02']],
    ['DOC-06','POD capture and submission','Operations','2026-09-02','Proof of delivery must be signed and photographed at the customer site and submitted before the driver leaves. Missing PODs block invoicing.',['ACT-001']],
    ['DOC-07','Waiting time and detention charging','Commercial','2026-04-15','Customers receive one hour of free time per drop. Waiting beyond this is chargeable at the detention rate in the customer schedule, subject to timed evidence from the driver app or telematics.',[]],
    ['DOC-08','Fuel card use and reconciliation','Finance','2026-03-10','Rules for fuel card use, receipts and weekly reconciliation. Supplier to be confirmed for the portal integration.',[]],
    ['DOC-09','Customer delivery notifications','Operations','2026-10-01','Which customer contacts receive delivery notifications, how one-time links work, and how contacts can opt out.',[]],
    ['DOC-10','Agency driver induction checklist','HR','2026-02-26','Site induction, licence and CPC evidence, tachograph card check and vehicle familiarisation for agency drivers before their first shift.',[]],
  ];
  const documents = docs.map(d => ({ id:d[0], title:d[1], category:d[2], updated:d[3], summary:d[4], related:d[5], source:'SharePoint — proposed source (not connected)', owner:d[2] === 'Compliance' || d[2] === 'Fleet' ? 'Transport Manager' : 'Operations' }));

  const connections = [
    { id:'vigo', name:'Vigo', purpose:'Transport management — jobs, allocations, PODs', state:'Access agreed', method:'Read-only API (agreed in principle)', owner:'Trans Haul', data:'Jobs, customers, vehicle and driver allocations, POD status' },
    { id:'xero', name:'Xero', purpose:'Accounting — invoices, aged debtors, payments', state:'Proposed', method:'OAuth 2.0 read-only scopes authorised by Trans Haul', owner:'Trans Haul', data:'Invoices, aged receivables, payments' },
    { id:'bibby', name:'Bibby', purpose:'Invoice finance — availability and drawn balance', state:'Proposed', method:'Scheduled statement import (file) — API to be confirmed', owner:'Trans Haul', data:'Eligible receivables, advance rate, drawn balance' },
    { id:'tacho', name:'Tachomaster', purpose:"Drivers' hours, infringements, training records", state:'Proposed', method:'Vendor export / API to be confirmed', owner:'Trans Haul', data:'Driver hours, infringements, licence and CPC records' },
    { id:'paragon', name:'Paragon', purpose:'Route optimisation — planned miles and times', state:'Proposed', method:'Route plan file export', owner:'Trans Haul', data:'Planned routes, miles and drive times' },
    { id:'sharepoint', name:'SharePoint', purpose:'Policies and SOPs', state:'Proposed', method:'Microsoft Graph, read-only, site-scoped', owner:'Trans Haul', data:'Document titles, metadata and previews' },
    { id:'fuel', name:'Fuel cards', purpose:'Fuel transactions by vehicle', state:'Supplier to confirm', method:'To be confirmed with supplier', owner:'Trans Haul', data:'Litres, cost, location, vehicle' },
    { id:'telematics', name:'Telematics', purpose:'Vehicle location, mileage, waiting time evidence', state:'Supplier to confirm', method:'To be confirmed with supplier', owner:'Trans Haul', data:'GPS events, mileage, idle and dwell time' },
  ];

  const rateCards = [{
    version:'RC-2026-10', effective:'2026-10-01T00:00:00Z', createdBy:'U01', note:'Initial illustrative rate card',
    rates:{ artic:1.65, artFuel:0.62, rigid26:1.30, rigid18:1.05, employed:19, ltd:23, agency:28, otMult:1.5, pallet:5.50, overheadStd:61.50 },
  }];

  const shares = [
    { id:'SH-001', jobId:'TH-006', contactId:'CT01', pod:true, invoice:false, by:'U02', at:'2026-11-04T07:50:00Z', active:true },
    { id:'SH-002', jobId:'TODAY-05', contactId:'CT01', pod:true, invoice:false, by:'U02', at:'2026-11-04T16:10:00Z', active:true },
  ];
  const links = [
    { token:'otl-7f3a9c', contactId:'CT01', jobId:'TH-006', issuedAt:'2026-11-04T08:20:00Z', expiresAt:'2026-11-05T08:20:00Z', usedAt:null, expired:false },
  ];
  const emails = [
    { id:'EM-001', to:'CT01', jobId:'TH-006', token:'otl-7f3a9c', at:'2026-11-04T08:20:00Z', subject:'Delivered: TH-006 to Leicester', kind:'delivery' },
  ];

  const activity = [
    { t:'2026-11-04T07:50:00Z', actorId:'U02', action:'Shared job with customer', recordType:'job', recordId:'TH-006', prev:'Not shared', next:'Shared with Customer Contact (Northfield Fresh Foods)' },
    { t:'2026-11-04T08:20:00Z', actorId:'SYSTEM', action:'Delivery notification simulated', recordType:'job', recordId:'TH-006', prev:'—', next:'Email preview + one-time link created (not sent)' },
    { t:'2026-11-04T16:10:00Z', actorId:'U02', action:'Shared job with customer', recordType:'job', recordId:'TODAY-05', prev:'Not shared', next:'Shared with Customer Contact (Northfield Fresh Foods)' },
    { t:'2026-11-04T17:45:00Z', actorId:'U03', action:'Updated VOR note', recordType:'vehicle', recordId:'V014', prev:'Awaiting diagnosis', next:'Awaiting parts' },
  ];

  return {
    version: 3, clock: DEMO_START, seq: 100,
    settings: { varianceThresholdPct: 10, linkHours: 24, revenueTarget: 17000 },
    users, customers, contacts, vehicles, drivers, jobs, invoices, paid, bibby,
    compliance, defects, actions, documents, connections, rateCards,
    recharges: [], shares, links, emails, activity, walkarounds: [],
    trailers: { total: 30, curtainsider: 22, flatbed: 4, fridge: 4 },
  };
}
