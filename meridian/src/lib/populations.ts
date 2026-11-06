export const POPULATIONS = {
  invoices: `invoice_id,vendor,amount,currency,approver_1,approver_2,payment_date
AP-2401,Apex Alloys,82000,MYR,S.Rahman,L.Teoh,2026-01-14
AP-2402,Klang Power,64000,MYR,S.Rahman,,2026-01-18
AP-2403,Northline Freight,51000,MYR,A.Lim,M.Yusof,2026-01-22
AP-2404,Jaya Metals,73000,MYR,L.Teoh,S.Rahman,2026-01-27
AP-2405,Apex Alloys,88000,MYR,M.Yusof,,2026-02-03
AP-2406,Plant Canteen,45500,MYR,A.Lim,G.Chen,2026-02-04
AP-2407,Die Steel Co,125000,MYR,S.Rahman,S.Rahman,2026-02-09
AP-2408,Klang Power,99000,MYR,M.Yusof,A.Lim,2026-02-12
AP-2409,Harbour Gases,53000,MYR,L.Teoh,,2026-02-16
AP-2410,Northline Freight,61000,MYR,G.Chen,S.Rahman,2026-02-19
AP-2411,Apex Alloys,71000,MYR,A.Lim,,2026-02-24
AP-2412,Staff welfare,38000,MYR,G.Chen,L.Teoh,2026-02-25
AP-2413,Die Steel Co,96000,MYR,M.Yusof,M.Yusof,2026-03-02
AP-2414,Harbour Gases,84000,MYR,A.Lim,G.Chen,2026-03-05
AP-2415,Jaya Metals,57000,MYR,L.Teoh,M.Yusof,2026-03-09
AP-2416,Apex Alloys,142000,MYR,S.Rahman,,2026-03-12
AP-2417,Klang Power,105000,MYR,S.Rahman,A.Lim,2026-03-17
AP-2418,Die Steel Co,,MYR,L.Teoh,M.Yusof,2026-03-19`,
  inventory: `item,location,book_qty,physical_qty,unit_cost
ADC12 aluminium alloy,WH-A,12000,10450,22.50
Zinc alloy ZL3,WH-A,8000,7100,41.00
Copper inserts,WH-B,2400,1980,86.00
Steel shot,WH-C,5000,4960,4.20
Release agent,WH-C,300,298,18.00
Hydraulic oil,WH-C,800,790,12.50`,
  access: `user_id,name,system,role,hr_status,account_status,privileged,approved
U-14,A.Rahman,SAP B1,Finance admin,Active,Enabled,Y,N
U-22,J.Kumar,SAP B1,Warehouse clerk,Left,Enabled,N,Y
U-09,M.Teoh,SAP B1,IT superuser,Active,Enabled,Y,Y
U-31,S.Ong,SAP B1,Buyer,Active,Enabled,N,Y
U-44,R.Devi,Active Directory,Domain admin,Active,Enabled,Y,N
U-18,L.Hassan,SAP B1,AP clerk,Active,Enabled,N,Y
U-51,P.Wong,SAP B1,Plant controller,Active,Enabled,N,
U-60,C.Lim,SAP B1,Viewer,Left,Disabled,N,Y
U-71,H.Nasir,SAP B1,Cost accountant,Active,Enabled,N,Y`,
  duplicates: `payment_id,vendor,invoice_number,amount,currency,payment_date
PAY-100,Apex Alloys,INV-7781,42000,MYR,2026-02-02
PAY-101,Apex Alloys,INV-7781,42000,MYR,2026-02-04
PAY-110,Jaya Metals,SCR-19,15500,MYR,2026-02-08
PAY-111,Klang Power,KP-220,88000,MYR,2026-02-09
PAY-112,Klang Power,KP-221,88000,MYR,2026-02-10
PAY-120,Northline Freight,NF-90,23000,MYR,2026-03-01`,
  match: `invoice_id,vendor,po_qty,po_price,receipt_qty,invoice_qty,invoice_price
POI-11,Apex Alloys,1000,22.50,1000,1000,22.50
POI-12,Die Steel Co,40,860,40,48,860
POI-13,Harbour Gases,12,410,12,12,455
POI-14,Northline Freight,6,1800,,6,1800
POI-15,Jaya Metals,200,15,200,190,15`,
  journals: `je_id,posted_on,preparer,approver,amount,currency,description
JE-501,2026-03-02,A.Lim,G.Chen,18500,MYR,Month-end freight accrual
JE-502,2026-03-14,A.Lim,A.Lim,25000,MYR,Inventory reclass to WIP
JE-503,2026-03-15,S.Rahman,L.Teoh,50000,MYR,Adj
JE-504,2026-03-16,M.Yusof,G.Chen,12000,MYR,Payroll clearing entry
JE-505,2026-03-04,L.Teoh,M.Yusof,20000,MYR,Adj`,
} as const;
