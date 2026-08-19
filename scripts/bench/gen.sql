-- Phase 4A — deterministic structural benchmark data generator (Dataset A).
-- Invariant-preserving: every journal entry is balanced (100 debit = 100 credit);
-- AP/GRNI credit lines are linked to their subledgers; dates are text 'YYYY-MM-DD'
-- (lexicographic, matching the app). Set-based generate_series for speed.
SET work_mem = '256MB';
SET synchronous_commit = off;

-- Re-runnable: clear the tables this generator populates (CASCADE clears dependents).
TRUNCATE accounts, fiscal_periods, suppliers, journal_entries, journal_lines,
 supplier_journal_links, purchase_orders, purchase_order_lines, goods_receipts,
 goods_receipt_lines, grni_journal_links, supplier_invoices, supplier_invoice_lines,
 supplier_invoice_grn_allocations, payment_vouchers, receipt_vouchers, supplier_payments,
 finance_workflow_events, audit_log RESTART IDENTITY CASCADE;

INSERT INTO users (id,name,email,password) VALUES ('u1','Bench User','bench@example.com','x')
 ON CONFLICT (id) DO NOTHING;

-- ---------------- Chart of accounts (~57) ----------------
-- Benchmark chart uses a private 9xxxxx code range so it never collides with
-- codes seeded by migrations (e.g. 0026's 210105). system_key stamped only if the
-- migrations did not already seed one.
INSERT INTO accounts (id,code,name,classification,postable,status,currency) VALUES
 ('a-ap','900101','Bench AP','liability',true,'active','SAR'),
 ('a-grni','900105','Bench GRNI','liability',true,'active','SAR'),
 ('a-inv','900503','Bench Inventory','asset',true,'active','SAR'),
 ('a-vat','900306','Bench Input VAT','asset',true,'active','SAR'),
 ('a-cash','900201','Bench Cash','asset',true,'active','SAR'),
 ('a-bank','900202','Bench Bank','asset',true,'active','SAR'),
 ('a-heavy','920000','Heavy Expense','expense',true,'active','SAR');
INSERT INTO accounts (id,code,name,classification,postable,status,currency)
 SELECT 'a-exp-'||g, (930000+g)::text, 'Expense '||g, 'expense', true, 'active','SAR'
 FROM generate_series(1,50) g;

INSERT INTO fiscal_periods (id,name,start_date,end_date,status)
 VALUES ('p2026','FY2026','2026-01-01','2026-12-31','open');
INSERT INTO cashboxes (id,code,name,linked_account_id,currency,status)
 VALUES ('cb1','CB1','Bench Cashbox','a-cash','SAR','active');
INSERT INTO bank_accounts (id,code,bank_name,linked_account_id,currency,status)
 VALUES ('ba1','BA1','Bench Bank','a-bank','SAR','active');

-- ---------------- Suppliers (5,000) ----------------
INSERT INTO suppliers (id,name,supplier_code,status,currency,created_at,updated_at)
 SELECT 'SUP-'||g, 'Supplier '||g, 'SUP-'||lpad(g::text,5,'0'), 'active','SAR',
        to_char(timestamp '2026-01-01' + (g % 300) * interval '1 day','YYYY-MM-DD"T"HH24:MI:SS'),
        '2026-01-01T00:00:00'
 FROM generate_series(1,5000) g;

-- ---------------- Journal entries (100,000) ----------------
-- source_type cycles so the partial source indexes and source lookups are exercised.
INSERT INTO journal_entries (id,number,date,description,amount,fund,currency,period_id,source,source_type,source_id,status,posted_by,posted_at,created_by,created_at,updated_at)
 SELECT 'JE-'||g,
        'JV-2026-'||lpad(g::text,6,'0'),
        to_char(timestamp '2026-01-01' + (g % 365) * interval '1 day','YYYY-MM-DD'),
        'entry '||g, 100, 'unrestricted','SAR','p2026','manual',
        (ARRAY['supplier_invoice','payment_voucher','receipt_voucher','goods_receipt','manual'])[1 + (g % 5)],
        (ARRAY['SINV-','PV-','RV-','GRN-','MAN-'])[1 + (g % 5)] || g,
        'posted','u1', to_char(timestamp '2026-01-01' + (g % 365) * interval '1 day','YYYY-MM-DD"T"HH24:MI:SS'),
        'u1', to_char(timestamp '2026-01-01' + (g % 365) * interval '1 day','YYYY-MM-DD"T"HH24:MI:SS'),
        '2026-01-01T00:00:00'
 FROM generate_series(1,100000) g;

-- ---------------- Journal lines (500,000 = 5 per entry) ----------------
-- Lines 1..4 debit 25 each; line 5 credits 100. Balanced per entry.
-- line1 account: goods_receipt entries -> inventory; every 8th -> heavy account; else expense.
-- line5 account: goods_receipt entries -> GRNI; else AP. (subledger targets)
INSERT INTO journal_lines (id,journal_entry_id,line_number,account_id,description,debit,credit,fund,created_at)
 SELECT 'JL-'||g||'-1','JE-'||g,1,
        CASE WHEN g % 5 = 4 THEN 'a-inv'
             WHEN g % 8 = 0 THEN 'a-heavy'
             ELSE 'a-exp-'||(1 + (g % 50)) END,
        '', 25, 0, 'unrestricted','2026-01-01T00:00:00'
 FROM generate_series(1,100000) g
UNION ALL SELECT 'JL-'||g||'-2','JE-'||g,2,'a-exp-'||(1+((g+1)%50)),'',25,0,'unrestricted','2026-01-01T00:00:00' FROM generate_series(1,100000) g
UNION ALL SELECT 'JL-'||g||'-3','JE-'||g,3,'a-exp-'||(1+((g+2)%50)),'',25,0,'unrestricted','2026-01-01T00:00:00' FROM generate_series(1,100000) g
UNION ALL SELECT 'JL-'||g||'-4','JE-'||g,4,'a-exp-'||(1+((g+3)%50)),'',25,0,'unrestricted','2026-01-01T00:00:00' FROM generate_series(1,100000) g
UNION ALL SELECT 'JL-'||g||'-5','JE-'||g,5,
        CASE WHEN g % 5 = 4 THEN 'a-grni' ELSE 'a-ap' END,
        '', 0, 100, 'unrestricted','2026-01-01T00:00:00' FROM generate_series(1,100000) g;

-- ---------------- Supplier AP subledger links (~60,000) ----------------
-- Link the AP credit line (JL-g-5) of AP-sourced entries to suppliers. Heavy supplier
-- SUP-1 gets ~6,000 of them (the large-statement test). journal_line_id is UNIQUE.
INSERT INTO supplier_journal_links (id,supplier_id,journal_line_id,source_type,created_at)
 SELECT 'SJL-'||g,
        CASE WHEN g <= 6000 THEN 'SUP-1' ELSE 'SUP-'||(2 + (g % 4998)) END,
        'JL-'||g||'-5','supplier_invoice','2026-01-01T00:00:00'
 FROM generate_series(1,60000) g
 WHERE (g % 5) <> 4;  -- AP lines only (goods_receipt entries credit GRNI, not AP)

-- ---------------- GRNI subledger receipt links (~20,000) ----------------
-- Link the GRNI credit line of each goods_receipt entry to a goods receipt.
-- (goods_receipts are generated below; ids align: GR entry JE-g -> GRN-g for g%5=4.)
-- purchase orders / receipts / invoices below.

-- ---------------- Purchase orders (25,000) + lines (100,000) ----------------
INSERT INTO purchase_orders (id,po_number,subject,supplier_id,date,status,governance_mode,currency,total_amount,total,created_at,updated_at)
 SELECT 'PO-'||g,'PO-2026-'||lpad(g::text,6,'0'),'PO '||g,'SUP-'||(1+(g%5000)),
        to_char(timestamp '2026-01-01' + (g % 365) * interval '1 day','YYYY-MM-DD'),
        (ARRAY['draft','submitted','approved','issued','cancelled'])[1+(g%5)],
        'governed','SAR',400,400,
        to_char(timestamp '2026-01-01' + (g % 365) * interval '1 day','YYYY-MM-DD"T"HH24:MI:SS'),
        '2026-01-01T00:00:00'
 FROM generate_series(1,25000) g;
INSERT INTO purchase_order_lines (id,order_id,line_number,item_id,description,quantity,unit_price,line_type,created_at)
 SELECT 'POL-'||g||'-'||k,'PO-'||g,k,NULL,'line',10,10,'SERVICE','2026-01-01T00:00:00'
 FROM generate_series(1,25000) g, generate_series(1,4) k;

-- ---------------- Goods receipts (20,000) + lines (80,000) ----------------
-- Align GRN-g to the goods_receipt-sourced entry JE-((g*5)-1) so journal_entry_id is valid.
INSERT INTO goods_receipts (id,grn_number,purchase_order_id,supplier_id,receipt_date,status,currency,total_value,journal_entry_id,created_at,updated_at)
 SELECT 'GRN-'||g,'GRN-2026-'||lpad(g::text,6,'0'),'PO-'||(1+(g%25000)),'SUP-'||(1+(g%5000)),
        to_char(timestamp '2026-01-01' + (g % 365) * interval '1 day','YYYY-MM-DD'),
        'posted','SAR',100,'JE-'||(g*5-1),
        to_char(timestamp '2026-01-01' + (g % 365) * interval '1 day','YYYY-MM-DD"T"HH24:MI:SS'),
        '2026-01-01T00:00:00'
 FROM generate_series(1,20000) g;
INSERT INTO goods_receipt_lines (id,goods_receipt_id,po_line_id,line_number,line_type,quantity_received,unit_price,line_value,created_at)
 SELECT 'GRL-'||g||'-'||k,'GRN-'||g,'POL-'||(1+(g%25000))||'-'||k,k,'SERVICE',10,10,100,'2026-01-01T00:00:00'
 FROM generate_series(1,20000) g, generate_series(1,4) k;
-- receipt GRNI links: JE-(g*5-1) has its GRNI credit at JL-(g*5-1)-5.
INSERT INTO grni_journal_links (id,goods_receipt_id,goods_receipt_line_id,journal_line_id,link_type,created_at)
 SELECT 'GNL-'||g,'GRN-'||g,NULL,'JL-'||(g*5-1)||'-5','receipt','2026-01-01T00:00:00'
 FROM generate_series(1,20000) g;

-- ---------------- Supplier invoices (25,000) + lines (100,000) ----------------
INSERT INTO supplier_invoices (id,invoice_number,supplier_invoice_number,supplier_invoice_number_normalized,supplier_id,invoice_date,status,currency,subtotal,tax_amount,total_amount,created_at,updated_at)
 SELECT 'SINV-'||g,'SI-2026-'||lpad(g::text,6,'0'),'DOC-'||g,'DOC-'||g,'SUP-'||(1+(g%5000)),
        to_char(timestamp '2026-01-01' + (g % 365) * interval '1 day','YYYY-MM-DD'),
        (ARRAY['draft','submitted','approved','posted','reversed'])[1+(g%5)],
        'SAR',100,15,115,
        to_char(timestamp '2026-01-01' + (g % 365) * interval '1 day','YYYY-MM-DD"T"HH24:MI:SS'),
        '2026-01-01T00:00:00'
 FROM generate_series(1,25000) g;
INSERT INTO supplier_invoice_lines (id,supplier_invoice_id,line_number,accounting_mode,account_id,quantity,unit_price,line_subtotal,tax_rate,tax_amount,line_total,created_at)
 SELECT 'SIL-'||g||'-'||k,'SINV-'||g,k,'direct','a-exp-'||(1+(g%50)),1,25,25,15,3.75,28.75,'2026-01-01T00:00:00'
 FROM generate_series(1,25000) g, generate_series(1,4) k;

-- ---------------- Invoice↔GRN allocations (50,000) ----------------
INSERT INTO supplier_invoice_grn_allocations (id,supplier_invoice_id,supplier_invoice_line_id,goods_receipt_id,goods_receipt_line_id,purchase_order_id,purchase_order_line_id,matched_quantity,created_at)
 SELECT 'SIGA-'||g,'SINV-'||(1+(g%25000)),'SIL-'||(1+(g%25000))||'-1','GRN-'||(1+(g%20000)),'GRL-'||(1+(g%20000))||'-1',NULL,NULL,10,'2026-01-01T00:00:00'
 FROM generate_series(1,50000) g;

-- ---------------- Vouchers + payments (20,000 each) ----------------
INSERT INTO payment_vouchers (id,voucher_number,voucher_date,cashbox_id,status,currency,total_amount,created_at,updated_at)
 SELECT 'PV-'||g,'PV-2026-'||lpad(g::text,6,'0'),to_char(timestamp '2026-01-01'+(g%365)*interval '1 day','YYYY-MM-DD'),'cb1',
        (ARRAY['draft','approved','posted','reversed'])[1+(g%4)],'SAR',100,
        to_char(timestamp '2026-01-01'+(g%365)*interval '1 day','YYYY-MM-DD"T"HH24:MI:SS'),'2026-01-01T00:00:00'
 FROM generate_series(1,20000) g;
INSERT INTO receipt_vouchers (id,voucher_number,voucher_date,cashbox_id,status,currency,total_amount,created_at,updated_at)
 SELECT 'RV-'||g,'RV-2026-'||lpad(g::text,6,'0'),to_char(timestamp '2026-01-01'+(g%365)*interval '1 day','YYYY-MM-DD'),'cb1',
        (ARRAY['draft','approved','posted','reversed'])[1+(g%4)],'SAR',100,
        to_char(timestamp '2026-01-01'+(g%365)*interval '1 day','YYYY-MM-DD"T"HH24:MI:SS'),'2026-01-01T00:00:00'
 FROM generate_series(1,20000) g;
INSERT INTO supplier_payments (id,supplier_id,amount,payment_method,payment_date,status,created_at,updated_at)
 SELECT 'SPY-'||g,'SUP-'||(1+(g%5000)),100,'bank',to_char(timestamp '2026-01-01'+(g%365)*interval '1 day','YYYY-MM-DD'),
        'posted','2026-01-01T00:00:00','2026-01-01T00:00:00'
 FROM generate_series(1,20000) g;

-- ---------------- Workflow events (250,000) + audit log (250,000) ----------------
INSERT INTO finance_workflow_events (id,entity_type,entity_id,action,from_status,to_status,user_id,user_name,created_at)
 SELECT 'WF-'||g,
        (ARRAY['supplier_invoice','purchase_order','goods_receipt','payment_voucher','receipt_voucher'])[1+(g%5)],
        (ARRAY['SINV-','PO-','GRN-','PV-','RV-'])[1+(g%5)] || (1+(g%20000)),
        (ARRAY['create','submit','approve','post','reverse'])[1+(g%5)],'','','u1','User',
        to_char(timestamp '2026-01-01'+(g%365)*interval '1 day' + (g%86400)*interval '1 second','YYYY-MM-DD"T"HH24:MI:SS')
 FROM generate_series(1,250000) g;
INSERT INTO audit_log (id,action,entity_type,entity_id,description,"timestamp")
 SELECT 'AUD-'||g,
        (ARRAY['CREATED','POSTED','APPROVED','REVERSED','UPDATED'])[1+(g%5)],
        (ARRAY['supplier_invoice','purchase_order','goods_receipt','payment_voucher','supplier'])[1+(g%5)],
        (ARRAY['SINV-','PO-','GRN-','PV-','SUP-'])[1+(g%5)] || (1+(g%20000)),
        'audit '||g,
        to_char(timestamp '2026-01-01'+(g%365)*interval '1 day' + (g%86400)*interval '1 second','YYYY-MM-DD"T"HH24:MI:SS')
 FROM generate_series(1,250000) g;

ANALYZE;
