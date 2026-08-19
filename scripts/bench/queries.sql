-- Phase 4A benchmark query plans (real PostgreSQL 16, isolated bench cluster).
-- Run with: psql -p 5433 -U bench -d thawab_bench -f scripts/bench/queries.sql
-- Captures EXPLAIN (ANALYZE, BUFFERS) for the critical financial read paths at
-- production scale (500k journal lines / 100k entries / 5k suppliers / 250k audit).
\pset pager off
\timing on

\echo '===== Q1 Trial Balance (full GL GROUP BY over journal_lines x entries x accounts) ====='
EXPLAIN (ANALYZE, BUFFERS)
SELECT a.id, a.code, a.classification,
       COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
JOIN accounts a ON a.id = jl.account_id
WHERE je.status IN ('posted','reversed')
GROUP BY a.id, a.code, a.classification;

\echo '===== Q2 Single account GL balance (AP control account) ====='
EXPLAIN (ANALYZE, BUFFERS)
SELECT COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE jl.account_id = (SELECT id FROM accounts WHERE code='900101')
  AND je.status IN ('posted','reversed');

\echo '===== Q3 Supplier payable subledger total (AP subledger sum, GL-derived) ====='
EXPLAIN (ANALYZE, BUFFERS)
SELECT sjl.supplier_id,
       COALESCE(SUM(jl.credit),0) - COALESCE(SUM(jl.debit),0) AS payable
FROM supplier_journal_links sjl
JOIN journal_lines jl ON jl.id = sjl.journal_line_id
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE je.status IN ('posted','reversed')
GROUP BY sjl.supplier_id;

\echo '===== Q4 Batched payable for one page of suppliers (listSuppliers page) ====='
EXPLAIN (ANALYZE, BUFFERS)
SELECT sjl.supplier_id,
       COALESCE(SUM(jl.credit),0) - COALESCE(SUM(jl.debit),0) AS payable
FROM supplier_journal_links sjl
JOIN journal_lines jl ON jl.id = sjl.journal_line_id
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE je.status IN ('posted','reversed')
  AND sjl.supplier_id IN (SELECT id FROM suppliers ORDER BY created_at DESC LIMIT 25)
GROUP BY sjl.supplier_id;

\echo '===== Q5 One supplier ledger (single supplier movements) ====='
EXPLAIN (ANALYZE, BUFFERS)
SELECT jl.id, je.number, je.date, jl.debit, jl.credit
FROM supplier_journal_links sjl
JOIN journal_lines jl ON jl.id = sjl.journal_line_id
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE sjl.supplier_id = (SELECT supplier_id FROM supplier_journal_links
                         GROUP BY supplier_id ORDER BY COUNT(*) DESC LIMIT 1)
  AND je.status IN ('posted','reversed')
ORDER BY je.date;

\echo '===== Q6 Supplier-invoice list page (bounded, status-filtered) ====='
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM supplier_invoices
WHERE status = 'posted'
ORDER BY created_at DESC
LIMIT 25 OFFSET 0;

\echo '===== Q7 Supplier-invoice list summary aggregate (FILTER over full set) ====='
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status='posted') AS posted,
       COALESCE(SUM(total_amount) FILTER (WHERE status='posted'),0) AS outstanding
FROM supplier_invoices;

\echo '===== Q8 GRNI line matching lookup (index target: goods_receipt_line_id) ====='
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM grni_journal_links
WHERE goods_receipt_line_id = (SELECT goods_receipt_line_id FROM grni_journal_links
                               WHERE goods_receipt_line_id IS NOT NULL LIMIT 1);

\echo '===== Q9 Audit log timeline (entity drill-down) ====='
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM audit_log
WHERE entity_type = (SELECT entity_type FROM audit_log LIMIT 1)
ORDER BY timestamp DESC
LIMIT 50;

\echo '===== Q10 Finance workflow timeline (one document) ====='
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM finance_workflow_events
WHERE entity_id = (SELECT entity_id FROM finance_workflow_events LIMIT 1)
ORDER BY created_at DESC;

\echo '===== Q11 AP reconciliation: unallocated AP lines (GL vs subledger) ====='
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*) AS unlinked
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
LEFT JOIN supplier_journal_links sjl ON sjl.journal_line_id = jl.id
WHERE jl.account_id = (SELECT id FROM accounts WHERE code='900101')
  AND je.status IN ('posted','reversed')
  AND sjl.id IS NULL;
