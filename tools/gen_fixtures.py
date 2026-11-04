"""Generates deterministic synthetic fixtures for the Trans Haul demo.
Output: src/fixtures.js. Re-run to regenerate; totals are asserted."""
import json, random
random.seed(20261105)

DIST = {  # approximate round-trip miles from Dunstable (illustrative)
 'Leeds':330,'Bristol':250,'Manchester':320,'Southampton':210,'Birmingham':150,'Leicester':120,
 'Northampton':60,'Coventry':120,'Milton Keynes':40,'Reading':110,'Swindon':170,'Oxford':100,
 'Luton':16,'Cambridge':110,'Peterborough':140,'Nottingham':190,'Sheffield':280,'Gloucester':220,
 'Bedford':40,'Slough':80,'Doncaster':290,'Ipswich':210,'Kettering':90,'Wolverhampton':180,
 'Stevenage':50,'Norwich':250,'Derby':190,'Watford':50,'Banbury':120,'Colchester':180,
 'Basildon':110,'Corby':100,'Daventry':80,'Rugby':100,'Wellingborough':70,'Chelmsford':140,
 'Aylesbury':50,'High Wycombe':70,'Hatfield':40,'Lincoln':240,'Worcester':200,'Crawley':130}
RATE = {'A':1.65,'R26':1.30,'R18':1.05}
VEH = {**{f'V{n:03d}':'A' for n in range(1,11)}, **{f'V{n:03d}':'R26' for n in range(11,16)}, **{f'V{n:03d}':'R18' for n in range(16,19)}}
DRATE = lambda d: 28 if d.startswith('A') else (23 if d in ('D21','D22','D23','D24') else 19)
CUST = {'food':'C01','building':'C02','pallet':'C03','retail':'C04'}

def r2(x): return round(x+1e-9,2)

def build_lines(cost, miles, vtype, hours, drate, max_pal):
    mileage = r2(miles*RATE[vtype]); driver = r2(hours*drate)
    target_oh = r2(cost*0.067)
    pal = int(round((cost-mileage-driver-target_oh)/5.5))
    pal = max(1, min(max_pal, pal))
    oh = r2(cost-mileage-driver-pal*5.5)
    while oh < cost*0.03 and hours > 2:
        hours -= 0.5; driver = r2(hours*drate); oh = r2(cost-mileage-driver-pal*5.5)
    while oh < cost*0.03 and pal > 1:
        pal -= 1; oh = r2(cost-mileage-driver-pal*5.5)
    assert oh > 0, (cost, miles, vtype)
    return hours, pal, oh

MAXPAL = {'A':26,'R26':18,'R18':14}

# ---------- 4 Nov canonical batch (vehicle/driver/hours/pallets are synthetic detail) ----------
WED = [
 # id, dest, type, price, planned, actual, vehicle, driver, slot, delivered, late
 ('TH-001','Leeds','food',1450,920,1190,'V001','D03','09:30','11:05',True),
 ('TH-002','Bristol','building',1200,780,945,'V002','D05','10:00','09:42',False),
 ('TH-003','Manchester','pallet',1650,1180,1380,'V003','A01','10:30','12:20',True),
 ('TH-004','Southampton','building',1100,750,750,None,None,'11:00','10:41',False),
 ('TH-005','Birmingham','retail',920,600,600,'V004','D08','09:00','08:47',False),
 ('TH-006','Leicester','food',650,380,380,'V011','D10','08:30','08:12',False),
 ('TH-007','Northampton','retail',460,280,280,'V017','D04','07:30','07:21',False),
 ('TH-008','Coventry','building',720,450,450,'V005','D11','09:30','09:18',False),
 ('TH-009','Milton Keynes','retail',390,230,230,'V017','D04','10:30','10:14',False),
 ('TH-010','Reading','pallet',720,445,445,'V007','D13','10:00','09:51',False),
 ('TH-011','Swindon','food',850,520,520,'V008','D14','10:30','10:20',False),
 ('TH-012','Oxford','retail',590,355,355,'V018','D16','13:00','12:44',False),
 ('TH-013','Luton','retail',320,180,180,'V016','D17','07:00','06:52',False),
 ('TH-014','Cambridge','food',710,450,450,'V012','D18','09:00','08:49',False),
 ('TH-015','Peterborough','pallet',770,480,480,'V009','D19','09:30','09:22',False),
 ('TH-016','Nottingham','building',880,560,560,'V010','D20','10:00','09:55',False),
 ('TH-017','Sheffield','pallet',1190,745,745,'V013','D21','11:00','10:46',False),
 ('TH-018','Gloucester','building',900,570,570,'V015','D23','11:30','11:17',False),
 ('TH-019','Bedford','food',380,210,210,'V016','D17','10:00','09:40',False),
 ('TH-020','Slough','retail',640,390,390,'V018','D16','09:00','08:53',False),
]
jobs = []
def mk(id_, date, dest, ctype, price, planned, actual, veh, drv, slot, delivered, late, miles=None, amiles=None, variance=None, src='synthetic', extra=None):
    j = dict(id=id_, date=date, dest=dest, customerId=CUST[ctype], price=price, plannedCost=planned, actualCost=actual,
             vehicleId=veh, driverId=drv, slot=slot, deliveredAt=delivered, late=late, src=src)
    if veh:
        vt = VEH[veh]; m = miles if miles is not None else DIST[dest]
        drate = DRATE(drv if drv and not drv.startswith('A') else 'D01')
        hours = round((m/42 + 3.5)*2)/2
        h, pal, oh = build_lines(planned, m, vt, hours, drate, MAXPAL[vt])
        j.update(miles=m, actualMiles=amiles if amiles else m, hours=h, pallets=pal, overhead=oh)
        if drv and drv.startswith('A'):
            j['plannedDriverId'] = 'D06'
    else:
        j.update(subcontract=True, miles=DIST[dest], actualMiles=DIST[dest], pallets=24, hours=0, overhead=0)
    j['variance'] = variance or []
    if extra: j.update(extra)
    jobs.append(j)

for (i,d,t,p,pl,a,v,dr,s,dl,late) in WED:
    var=None; miles=None; am=None; ex={}
    if i=='TH-001':
        miles, am = 330, 369
        var=[{'reason':'Waiting time at customer','cat':'waiting','amount':150},
             {'reason':'Additional mileage and fuel adjustment (39 extra miles)','cat':'mileage','amount':65},
             {'reason':'Driver overtime','cat':'overtime','amount':55}]
        ex={'recharge':{'amount':180,'basis':'3h waiting beyond the 1h free period agreed in the rate schedule, at the customer detention rate of £60/h (illustrative).'}}
    if i=='TH-002':
        var=[{'reason':'Fuel price adjustment','cat':'fuel','amount':65},{'reason':'Driver overtime','cat':'overtime','amount':50},
             {'reason':'Waiting time at customer','cat':'waiting','amount':30},{'reason':'Tolls (M5 diversion route)','cat':'tolls','amount':20}]
        ex={'recharge':{'amount':75,'basis':'Waiting time beyond free period (£30) plus tolls incurred at customer request (£20) and handling surcharge (£25), per rate schedule (illustrative).'}}
    if i=='TH-003':
        am = 360
        var=[{'reason':'Diversion — M6 closure (40 extra miles plus time)','cat':'diversion','amount':110},
             {'reason':'Agency driver cover (planned driver unavailable)','cat':'agency','amount':90}]
    mk(i,'2026-11-04',d,t,p,pl,a,v,dr,s,dl,late,miles=miles,amiles=am,variance=var,src='supplied',extra=ex)

# TH-001 exact build (overrides generic)
th1 = jobs[0]; th1.update(hours=9, pallets=26, overhead=61.5)

wed_own_miles = sum(j['actualMiles'] for j in jobs if not j.get('subcontract'))

# ---------- earlier period ----------
DESTS = [d for d in DIST if d not in ('Doncaster','Ipswich')]
TYPES = ['food','building','pallet','retail']

def day_jobs(date, code, n, fixed=None, vehicles_worked=16, avail=None):
    fixed = fixed or []
    out=[]
    for k in range(n):
        if k < len(fixed): out.append(fixed[k]); continue
        dest = random.choice(DESTS); t = random.choice(TYPES)
        out.append({'id':f'TH-{code}-{k+1:02d}','dest':dest,'type':t})
    return out

earlier = {
 '2026-10-28': [{'id':'OLD-101','dest':'Northampton','type':'retail','price':780}],
 '2026-10-29': day_jobs('2026-10-29','1029',19),
 '2026-10-30': day_jobs('2026-10-30','1030',20,[{'id':'OLD-102','dest':'Wolverhampton','type':'building','price':1040}]),
 '2026-11-02': day_jobs('2026-11-02','1102',20,[{'id':'OLD-103','dest':'Stevenage','type':'pallet','price':560}]),
 '2026-11-03': day_jobs('2026-11-03','1103',21),
}
# Vehicle allocation targets: (date -> vehicles worked)
WORKED = {'2026-10-28':1,'2026-10-29':16,'2026-10-30':17,'2026-11-02':16,'2026-11-03':17}
AVAIL = {d:[v for v in VEH if not (v=='V014' and d>='2026-11-03')] for d in WORKED}
DRIVERS = [f'D{n:02d}' for n in range(1,27)]

def allocate(date, rows):
    n = len(rows); vw = WORKED[date]
    avail = AVAIL[date][:]
    # long jobs get artics; pair the shortest jobs on rigids when n > vw
    order = sorted(range(n), key=lambda i: -DIST[rows[i]['dest']])
    doubles = n - vw
    short = order[-2*doubles:] if doubles>0 else []
    single = [i for i in order if i not in short]
    artics=[v for v in avail if VEH[v]=='A']; rig=[v for v in avail if VEH[v]!='A']
    pool = artics+rig
    # assign singles
    used=[]
    for i in single:
        v = pool.pop(0); rows[i]['veh']=v; used.append(v)
    for k in range(doubles):
        v = pool.pop(-1) if pool else used[-1]
        a,b = short[2*k], short[2*k+1]
        rows[a]['veh']=v; rows[b]['veh']=v
    # drivers: one per vehicle
    vlist = sorted(set(r['veh'] for r in rows))
    drs = DRIVERS[:]; random.shuffle(drs)
    vd = {v:drs[i] for i,v in enumerate(vlist)}
    for r in rows: r['drv']=vd[r['veh']]
    assert len(vlist)==vw, (date, len(vlist), vw)

for d,rows in earlier.items(): allocate(d, rows)

# miles: Mon+Tue must make Mon-Wed total 9,860
montue = earlier['2026-11-02']+earlier['2026-11-03']
need = 9860 - wed_own_miles
base = sum(DIST[r['dest']] for r in montue)
diff = need - base
# spread the difference as route variation across jobs
per = diff / len(montue)
acc=0
for k,r in enumerate(montue):
    add = int(round(per*(k+1))) - int(round(per*k))
    r['miles'] = max(12, DIST[r['dest']] + add)
assert sum(r['miles'] for r in montue) == need, (sum(r['miles'] for r in montue), need)
for d in ('2026-10-28','2026-10-29','2026-10-30'):
    for r in earlier[d]: r['miles'] = DIST[r['dest']] + random.randint(-6,6)

# prices & planned cost
def price_for(m): return int(round((m*3.1 + 260 + random.randint(-40,60))/10)*10)
for d,rows in earlier.items():
    for r in rows:
        if 'price' not in r: r['price'] = price_for(r['miles'])
        r['planned'] = int(round(r['price']*random.uniform(0.6,0.66)/5)*5)

# force Mon+Tue planned to 20,750
tot = sum(r['planned'] for r in montue)
scale = 20750/tot
for r in montue: r['planned'] = int(round(r['planned']*scale/5)*5)
gap = 20750 - sum(r['planned'] for r in montue)
montue[-1]['planned'] += gap
assert sum(r['planned'] for r in montue)==20750
# variance +260 across Mon/Tue, each well under 10% of planned
VAR_SET = [(45,'Waiting time at customer','waiting'),(30,'Fuel price adjustment','fuel'),(60,'Additional mileage (access restriction)','mileage'),
           (25,'Driver overtime','overtime'),(40,'Waiting time at customer','waiting'),(35,'Tolls','tolls'),(50,'Driver overtime','overtime'),(-25,'Shorter route than planned','mileage')]
idxs = sorted(range(len(montue)), key=lambda i: -montue[i]['planned'])[:8]
for (amt,why,cat),ix in zip(VAR_SET, idxs):
    r = montue[ix]; assert abs(amt)/r['planned'] < 0.09; r['var']=[{'reason':why,'cat':cat,'amount':amt}]
for d in ('2026-10-29','2026-10-30'):
    for ix in random.sample(range(len(earlier[d])),4):
        r = earlier[d][ix]; amt = random.choice([20,25,30,35,-15])
        amt = int(amt) if abs(amt) < r['planned']*0.08 else (10 if amt>0 else -10)
        r['var']=[{'reason':'Waiting time at customer' if amt>0 else 'Shorter route than planned','cat':'waiting' if amt>0 else 'mileage','amount':amt}]
for d,rows in earlier.items():
    for r in rows:
        v = r.get('var',[]); r['actual'] = r['planned'] + sum(x['amount'] for x in v)
assert sum(r['actual'] for r in montue)==21010, sum(r['actual'] for r in montue)

# slots
def slot(k): h = 7 + (k*37)%7; m = [0,30][k%2]; return f'{h:02d}:{m:02d}'
def dlv(s,late,k):
    h,m = map(int,s.split(':')); t = h*60+m + (random.randint(25,70) if late else -random.randint(5,25))
    return f'{t//60:02d}:{t%60:02d}'
for d,rows in earlier.items():
    lates = set(random.sample(range(len(rows)), 1 if len(rows)>5 else 0))
    for k,r in enumerate(rows):
        s = slot(k); late = k in lates
        mk(r['id'],d,r['dest'],r['type'],r['price'],r['planned'],r['actual'],r['veh'],r['drv'],s,dlv(s,late,k),late,
           miles=r['miles'],amiles=r['miles'] + (25 if any(x['cat']=='mileage' and x['amount']>0 for x in r.get('var',[])) else 0) - (10 if any(x['amount']<0 for x in r.get('var',[])) else 0),
           variance=r.get('var',[]))
# recompute Mon+Tue miles after mileage adjustments: keep vehicle-day totals exact by using actualMiles
mt = [j for j in jobs if j['date'] in ('2026-11-02','2026-11-03')]
delta = 9860 - wed_own_miles - sum(j['actualMiles'] for j in mt)
mt[0]['actualMiles'] += delta; mt[0]['miles'] += delta
# empty miles: 1,240 across Mon-Wed own jobs
own = [j for j in jobs if j['date']>='2026-11-02' and not j.get('subcontract')]
tm = sum(j['actualMiles'] for j in own); assert tm==9860, tm
acc=0
for j in own:
    j['emptyMiles'] = int(round(j['actualMiles']*1240/9860))
gap = 1240 - sum(j['emptyMiles'] for j in own)
own[-1]['emptyMiles'] += gap
for j in jobs:
    j.setdefault('emptyMiles', int(round(j.get('actualMiles',0)*0.12)) if not j.get('subcontract') else 0)

# rebuild lines after miles change for mt[0]
for j in jobs:
    if j['id']=='TH-001' or j.get('subcontract'): continue
    vt = VEH[j['vehicleId']]; drate = DRATE(j.get('plannedDriverId') or j['driverId'])
    h,pal,oh = build_lines(j['plannedCost'], j['miles'], vt, round((j['miles']/42+3.5)*2)/2, drate, MAXPAL[vt])
    j.update(hours=h, pallets=pal, overhead=oh)

# checks
w = [j for j in jobs if j['date']=='2026-11-04']
assert sum(j['price'] for j in w)==16490 and sum(j['plannedCost'] for j in w)==10475 and sum(j['actualCost'] for j in w)==11110
vd = {(j['date'],j['vehicleId']) for j in jobs if j['date']>='2026-11-02' and j['vehicleId']}
assert len(vd)==49, len(vd)
for j in jobs:
    if j['id'] in ('TH-001','TH-002','TH-003'): continue
    assert abs(j['actualCost']-j['plannedCost'])/j['plannedCost'] < 0.10, j['id']

KEYS = ['id','date','dest','customerId','price','plannedCost','actualCost','vehicleId','driverId','slot','deliveredAt','late','miles','actualMiles','emptyMiles','hours','pallets','overhead','src']
rows = []
extras = {}
for j in jobs:
    rows.append([j.get(k) for k in KEYS])
    e = {k:j[k] for k in ('variance','recharge','subcontract','plannedDriverId') if j.get(k)}
    if e: extras[j['id']] = e
with open('src/fixtures.js','w') as f:
    f.write('/* GENERATED by tools/gen_fixtures.py — synthetic demo fixtures. Do not hand-edit. */\n')
    f.write('const JOB_KEYS = '+json.dumps(KEYS)+';\n')
    f.write('const JOB_ROWS = [\n'+',\n'.join(json.dumps(r) for r in rows)+'\n];\n')
    f.write('const JOB_EXTRAS = '+json.dumps(extras, indent=0)+';\n')
print('jobs', len(jobs), 'wed own miles', wed_own_miles)
for d in sorted(set(j['date'] for j in jobs)):
    dj=[j for j in jobs if j['date']==d]
    print(d, len(dj), sum(j['price'] for j in dj), sum(j['plannedCost'] for j in dj), sum(j['actualCost'] for j in dj), len({j['vehicleId'] for j in dj if j['vehicleId']}))
